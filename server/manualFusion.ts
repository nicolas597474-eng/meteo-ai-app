import { applyBiasCorrection, type ServiceBias } from "./fusionEngine";
import { randomUUID } from "node:crypto";
import { getParisDate } from "./weatherTime";
import { computeOfficialDailyForecast } from "./officialForecast";
import { legacyStabilityLabelForStorage } from "./legacyStabilityStorage";
import { collectExpertForecasts } from "./weatherServices";
import { buildForecastRunArchiveRows } from "./dailyForecastPerformance";
import { collectOfficialHourlyForecast, OFFICIAL_HOURLY_MODEL_NAMES } from "./officialHourlyForecast";
import { getParisDateAndHour } from "./parisHourlyTime";
import { cacheManualHourlyForecast } from "./officialWeatherSnapshot";
import { acquireForecastRefreshLock, getDailyFusionPerformanceEvidence, getMeteoAIForecastByDate, getQualifiedCumulativeRankingForLocation, getStoredHourlyForecasts, insertForecastRuns, insertForecasts, insertHourlyForecasts, makeLocationKey, releaseForecastRefreshLock, upsertLocationForecast, upsertMeteoAIForecast } from "./db";
import { getLocationForecastRefreshLockKey } from "./forecastRefreshLock";

type ManualFusionFavorite = {
  id: number;
  userId: number;
  lat: number;
  lon: number;
  name: string;
  customName: string | null;
};

export const MANUAL_FUSION_COOLDOWN_MS = 90_000;

type GranularityStatus = "succeeded" | "partial" | "failed";
type GranularityResult = {
  status: GranularityStatus;
  modelCount: number;
  expectedModelCount: number;
  updatedAt: string | null;
  error?: string;
};

type ManualRefreshResult = {
  status: "refreshed" | "partial" | "failed";
  location: { lat: number; lon: number };
  daily: GranularityResult;
  hourly: GranularityResult;
};

const inFlightRefreshes = new Set<string>();
const OFFICIAL_DAILY_MODEL_NAME_SET = new Set<string>(OFFICIAL_HOURLY_MODEL_NAMES);

export function isManualFusionCoolingDown(computedAt: Date | null | undefined, now = Date.now()) {
  return computedAt != null && now - computedAt.getTime() < MANUAL_FUSION_COOLDOWN_MS;
}

function granularityResult(modelCount: number, expectedModelCount: number, updatedAt: Date | null, error?: string): GranularityResult {
  const status: GranularityStatus = modelCount === 0 ? "failed" : modelCount < expectedModelCount ? "partial" : "succeeded";
  return {
    status,
    modelCount,
    expectedModelCount,
    updatedAt: status === "failed" ? null : updatedAt?.toISOString() ?? null,
    ...(error ? { error } : {}),
  };
}

function timestampValue(value: unknown): number | null {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  const timestamp = date?.getTime();
  return timestamp != null && Number.isFinite(timestamp) ? timestamp : null;
}

function nearlyEqual(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.01;
}

function persistedHourlySeriesMatches(
  expected: Array<Record<string, unknown>>,
  stored: Array<Record<string, unknown>>,
  collectedAt: Date,
): boolean {
  const freshRows = stored
    .filter((row) => timestampValue(row.collectedAt) != null && timestampValue(row.collectedAt)! >= collectedAt.getTime() - 1_000)
    .slice()
    .sort((a, b) => Number(a.hour) - Number(b.hour));
  const expectedRows = expected.slice().sort((a, b) => Number(a.hour) - Number(b.hour));
  if (freshRows.length !== expectedRows.length) return false;

  const fields = [
    "hour", "temperature", "apparentTemperature", "precipitation", "windSpeed", "windGusts",
    "windDirection", "humidity", "pressure", "cloudCover", "weatherCode",
  ];
  return expectedRows.every((expectedRow, index) => fields.every((field) => {
    if (field === "hour") return Number(freshRows[index][field]) === Number(expectedRow[field]);
    return nearlyEqual(freshRows[index][field], expectedRow[field]);
  }));
}

async function refreshDailyForecast(favorite: ManualFusionFavorite, today: string, locationKey: string): Promise<GranularityResult> {
  const expectedModelCount = OFFICIAL_HOURLY_MODEL_NAMES.length;
  try {
    const expertData = await collectExpertForecasts(today, { lat: favorite.lat, lon: favorite.lon });
    const officialDailyForecasts = expertData.filter((forecast) => OFFICIAL_DAILY_MODEL_NAME_SET.has(forecast.serviceName));
    if (officialDailyForecasts.length === 0) {
      return granularityResult(0, expectedModelCount, null, "Aucun des sept modèles quotidiens officiels n’a renvoyé de prévision.");
    }
    const issuedAt = Date.now();

    const ranking = await getQualifiedCumulativeRankingForLocation(locationKey);
    const biases: ServiceBias[] = ranking
      .filter((entry) => entry.avgBiasTemp != null || entry.avgBiasPrecip != null)
      .map((entry) => ({
        serviceName: entry.serviceName,
        biasTemp: entry.avgBiasTemp == null ? null : Number(entry.avgBiasTemp),
        biasPrecip: entry.avgBiasPrecip == null ? null : Number(entry.avgBiasPrecip),
        biasWind: null,
      }));
    const rawForecasts = expertData.map((entry) => ({
      serviceName: entry.serviceName,
      tempMax: entry.tempMax,
      tempMin: entry.tempMin,
      precipitation: entry.precipitation,
      windSpeed: entry.windSpeed,
      windGust: null as number | null,
      humidity: entry.humidity ?? null,
      cloudCover: entry.cloudCover ?? null,
    }));
    const biasCorrectedForecasts = biases.length > 0 ? applyBiasCorrection(rawForecasts, biases) : rawForecasts;
    const fusionEvidence = await getDailyFusionPerformanceEvidence(locationKey, today, issuedAt);
    const meteoAI = computeOfficialDailyForecast(biasCorrectedForecasts, {
      locationKey,
      targetDate: today,
      issuedAt,
      evidenceStoreAvailable: fusionEvidence.available,
      evidence: fusionEvidence.evidence,
    });
    const condition = null;
    const explanation = meteoAI.coreCalibrationComplete
      ? `Prévision quotidienne calibrée relancée pour ${favorite.customName ?? favorite.name}, avec des preuves physiques récentes par modèle, variable et horizon. La météo actuelle observée reste séparée et n’est pas modifiée par cette action.`
      : `${meteoAI.methodNote} Les valeurs officielles restent indisponibles jusqu’à qualification des preuves physiques. La météo actuelle observée reste séparée et n’est pas modifiée par cette action.`;

    await insertForecasts(expertData.map((entry) => ({
      locationKey,
      date: today,
      serviceName: entry.serviceName,
      serviceCategory: entry.serviceCategory,
      tempMax: entry.tempMax,
      tempMin: entry.tempMin,
      precipitation: entry.precipitation,
      windSpeed: entry.windSpeed,
      windGust: entry.windGust,
      humidity: entry.humidity,
      cloudCover: entry.cloudCover,
      condition: entry.condition,
      rawData: entry.rawData as any,
    })));
    await insertForecastRuns(buildForecastRunArchiveRows(expertData, locationKey, today, issuedAt, biases));
    await upsertLocationForecast({
      favoriteLocationId: favorite.id,
      userId: favorite.userId,
      lat: favorite.lat,
      lon: favorite.lon,
      date: today,
      tempMax: meteoAI.tempMax,
      tempMin: meteoAI.tempMin,
      precipitation: meteoAI.precipitation,
      windSpeed: meteoAI.windSpeed,
      condition,
      modelsData: expertData as any,
      explanation,
    });

    // The daily timestamp is committed last, so a failed earlier write does not
    // start the cooldown or announce a completed refresh.
    const updatedAt = new Date();
    await upsertMeteoAIForecast({
      locationKey,
      date: today,
      tempMax: meteoAI.tempMax,
      tempMin: meteoAI.tempMin,
      precipitation: meteoAI.precipitation,
      windSpeed: meteoAI.windSpeed,
      condition,
      stabilityLabel: legacyStabilityLabelForStorage(expertData),
      weights: { version: 2, weightByService: meteoAI.weights, trace: meteoAI.trace, trigger: "manual" } as any,
      explanation,
      computedAt: updatedAt,
    }, { refreshComputedAt: true });

    const persistedSnapshot = await getMeteoAIForecastByDate(today, locationKey);
    const persistedAt = timestampValue(persistedSnapshot?.computedAt);
    const persistedWeights = typeof persistedSnapshot?.weights === "string"
      ? (() => { try { return JSON.parse(persistedSnapshot.weights as string); } catch { return null; } })()
      : persistedSnapshot?.weights;
    if (!persistedSnapshot || persistedAt == null || Math.abs(persistedAt - updatedAt.getTime()) > 2_000 || (persistedWeights as any)?.trigger !== "manual") {
      return granularityResult(0, expectedModelCount, null, "La fusion quotidienne n’a pas pu être confirmée après son enregistrement.");
    }

    const dailyResult = granularityResult(officialDailyForecasts.length, expectedModelCount, new Date(persistedAt));
    if (!meteoAI.coreCalibrationComplete) {
      dailyResult.status = "partial";
      dailyResult.error = meteoAI.methodNote;
    }
    return dailyResult;
  } catch (error) {
    console.error("[ManualFusion] Daily refresh failed:", error);
    return granularityResult(0, expectedModelCount, null, "La collecte ou l’enregistrement quotidien a échoué.");
  }
}

function toHourlyRows(locationKey: string, date: string, modelName: string, hours: Array<Record<string, any>>, collectedAt: Date) {
  return hours.map((hour) => ({
    locationKey,
    date,
    hour: Number(hour.hour),
    modelName,
    temperature: hour.temperature ?? null,
    apparentTemperature: hour.apparentTemperature ?? null,
    precipitation: hour.precipitation ?? null,
    windSpeed: hour.windSpeed ?? null,
    windGusts: hour.windGusts ?? null,
    windDirection: hour.windDirection ?? null,
    humidity: hour.humidity ?? null,
    pressure: hour.pressure ?? null,
    cloudCover: hour.cloudCover ?? null,
    weatherCode: hour.weatherCode ?? null,
    collectedAt,
  }));
}

async function refreshHourlyForecast(favorite: ManualFusionFavorite, today: string, locationKey: string): Promise<GranularityResult> {
  const expectedModelCount = OFFICIAL_HOURLY_MODEL_NAMES.length;
  try {
    const coords = { lat: favorite.lat, lon: favorite.lon };
    const officialHourly = await collectOfficialHourlyForecast(today, coords);
    const hourlyModels = officialHourly.modelForecasts;
    const collectedAt = new Date();
    const candidates = hourlyModels
      .filter((model) => (OFFICIAL_HOURLY_MODEL_NAMES as readonly string[]).includes(model.modelName))
      .map((model) => ({
        modelName: model.modelName,
        rows: toHourlyRows(locationKey, today, model.modelName, model.hours.filter((hour) => {
          if (hour.validAt == null) return true;
          return getParisDateAndHour(hour.validAt)?.date === today;
        }), collectedAt),
      }))
      .filter((candidate) => candidate.rows.length > 0);

    if (candidates.length === 0) {
      return granularityResult(0, expectedModelCount, null, "Aucun modèle horaire n’a renvoyé de prévision exploitable.");
    }

    const writeFailures: string[] = [];
    for (const candidate of candidates) {
      try {
        await insertHourlyForecasts(candidate.rows);
      } catch (error) {
        console.warn(`[ManualFusion] Hourly write failed for ${candidate.modelName}:`, error);
        writeFailures.push(candidate.modelName);
      }
    }

    const storedRows = await getStoredHourlyForecasts(locationKey, today);
    const persistedModels = new Set<string>();
    for (const candidate of candidates) {
      const modelRows = storedRows.filter((row) => row.modelName === candidate.modelName) as Array<Record<string, unknown>>;
      if (persistedHourlySeriesMatches(candidate.rows as Array<Record<string, unknown>>, modelRows, collectedAt)) {
        persistedModels.add(candidate.modelName);
      }
    }

    const updatedAt = persistedModels.size > 0 ? new Date() : null;
    if (persistedModels.size > 0 && updatedAt) {
      cacheManualHourlyForecast(coords, today, officialHourly.hours, updatedAt, officialHourly.weighting);
    }
    const error = persistedModels.size === 0
      ? "Les données horaires n’ont pas pu être confirmées après leur enregistrement."
      : writeFailures.length > 0 || persistedModels.size < expectedModelCount
        ? "Certaines sources horaires n’ont pas répondu ou n’ont pas pu être enregistrées."
        : undefined;
    return granularityResult(persistedModels.size, expectedModelCount, updatedAt, error);
  } catch (error) {
    console.error("[ManualFusion] Hourly refresh failed:", error);
    return granularityResult(0, expectedModelCount, null, "La collecte ou l’enregistrement horaire a échoué.");
  }
}

/**
 * Refreshes the daily fusion and hourly model archive once for an owner-verified
 * favorite. The cooldown, location key and idempotent replacement paths remain
 * shared with the existing data model; the official current-weather snapshot is
 * not written by this operation.
 */
export async function refreshManualFusionForFavorite(favorite: ManualFusionFavorite) {
  const locationKey = makeLocationKey(favorite.lat, favorite.lon);
  if (inFlightRefreshes.has(locationKey)) return { status: "in_progress" as const };

  inFlightRefreshes.add(locationKey);
  const lockKey = getLocationForecastRefreshLockKey(locationKey);
  const lockOwnerToken = randomUUID();
  let lockAcquired = false;
  try {
    lockAcquired = await acquireForecastRefreshLock(lockKey, lockOwnerToken);
    if (!lockAcquired) return { status: "in_progress" as const };
    const today = getParisDate();
    const currentSnapshot = await getMeteoAIForecastByDate(today, locationKey);
    if (isManualFusionCoolingDown(currentSnapshot?.computedAt)) {
      return {
        status: "cooldown" as const,
        retryAfterSeconds: Math.ceil((MANUAL_FUSION_COOLDOWN_MS - (Date.now() - currentSnapshot!.computedAt.getTime())) / 1000),
      };
    }

    const [daily, hourly] = await Promise.all([
      refreshDailyForecast(favorite, today, locationKey),
      refreshHourlyForecast(favorite, today, locationKey),
    ]);
    const status = daily.status === "succeeded" && hourly.status === "succeeded"
      ? "refreshed"
      : daily.status !== "failed" || hourly.status !== "failed"
        ? "partial"
        : "failed";
    const result: ManualRefreshResult = {
      status,
      location: { lat: favorite.lat, lon: favorite.lon },
      daily,
      hourly,
    };
    return result;
  } finally {
    inFlightRefreshes.delete(locationKey);
    if (lockAcquired) {
      try {
        await releaseForecastRefreshLock(lockKey, lockOwnerToken);
      } catch (error) {
        console.warn(`[ManualFusion] Could not release refresh lease for ${locationKey}:`, error);
      }
    }
  }
}
