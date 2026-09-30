import { applyBiasCorrection, computeConfidenceScore, getLeadTimeWeights, isEligibleGlobalReliabilityScore, type LeadTimeBucket, type LeadTimePerf, type ServiceBias } from "./fusionEngine";
import { conditionFromWeatherValues } from "./weatherConditionLabels";
import { getParisDate } from "./weatherTime";
import { calculateStabilityIndex } from "./statsEngine";
import { computeOfficialDailyForecast } from "./officialForecast";
import { WEATHER_SERVICES, collectExpertForecasts, collectHourlyForecast, collectHourlyForecastAllModels, type HourlyPoint } from "./weatherServices";
import { cacheManualHourlyForecast } from "./officialWeatherSnapshot";
import { getMeteoAIForecastByDate, getQualifiedCumulativeRankingForLocation, getQualifiedLeadTimeScoresForLocation, getStoredHourlyForecasts, insertForecastRuns, insertForecasts, insertHourlyForecasts, makeLocationKey, upsertLocationForecast, upsertMeteoAIForecast } from "./db";

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
  const expectedModelCount = WEATHER_SERVICES.expert.length;
  try {
    const expertData = await collectExpertForecasts(today, { lat: favorite.lat, lon: favorite.lon });
    if (expertData.length === 0) {
      return granularityResult(0, expectedModelCount, null, "Aucun modèle quotidien n’a renvoyé de prévision.");
    }

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
      cloudCover: entry.cloudCover ?? null,
    }));
    const biasCorrectedForecasts = biases.length > 0 ? applyBiasCorrection(rawForecasts, biases) : rawForecasts;
    const leadTimeRows = await getQualifiedLeadTimeScoresForLocation(locationKey, 14);
    const leadTimePerfs: LeadTimePerf[] = leadTimeRows.map((entry) => ({
      serviceName: entry.serviceName,
      bucket: entry.bucket as LeadTimeBucket,
      avgMaeTemp: entry.avgMaeTemp == null ? null : Number(entry.avgMaeTemp),
      avgMaePrecip: entry.avgMaePrecip == null ? null : Number(entry.avgMaePrecip),
      avgMaeWind: entry.avgMaeWind == null ? null : Number(entry.avgMaeWind),
      sampleSize: entry.totalSamples == null ? 0 : Number(entry.totalSamples),
      latestScoreDate: entry.latestScoreDate ?? null,
    }));
    const leadTimeWeights = getLeadTimeWeights(leadTimePerfs, "6-24h");
    const performanceByModel: Record<string, { maeTemp?: number; maePrecip?: number; maeWind?: number; maeCloud?: number; weightedScore?: number }> = {};
    ranking.filter((entry) => isEligibleGlobalReliabilityScore(Number(entry.daysTracked ?? 0), entry.latestScoreDate ?? null)).forEach((entry) => {
      const leadTime = leadTimeWeights[entry.serviceName];
      performanceByModel[entry.serviceName] = {
        maeTemp: leadTime?.maeTemp ?? (entry.avgMaeTemp == null ? undefined : Number(entry.avgMaeTemp)),
        maePrecip: leadTime?.maePrecip ?? (entry.avgMaePrecip == null ? undefined : Number(entry.avgMaePrecip)),
        maeWind: leadTime?.maeWind ?? (entry.avgMaeWind == null ? undefined : Number(entry.avgMaeWind)),
        maeCloud: entry.avgCondMaeCloud == null ? undefined : Number(entry.avgCondMaeCloud),
        weightedScore: entry.avgScore == null ? 50 : Number(entry.avgScore),
      };
    });

    const meteoAI = computeOfficialDailyForecast(biasCorrectedForecasts, performanceByModel);
    const stability = calculateStabilityIndex(expertData.map((entry) => ({ tempMax: entry.tempMax, tempMin: entry.tempMin, precipitation: entry.precipitation, windSpeed: entry.windSpeed })));
    const averagePrecipitation = expertData.reduce((sum, entry) => sum + (entry.precipitation ?? 0), 0) / expertData.length;
    const averageCloudCover = expertData.reduce((sum, entry) => sum + (entry.cloudCover ?? 50), 0) / expertData.length;
    const condition = conditionFromWeatherValues(averagePrecipitation, averageCloudCover);
    const bestModelScore = ranking.length > 0 ? Number(ranking[0].avgScore ?? 60) : 60;
    const confidenceScore = computeConfidenceScore({ forecasts: biasCorrectedForecasts, bestModelScore, leadTimeBucket: "6-24h" });
    const explanation = `Prévision quotidienne relancée manuellement pour ${favorite.customName ?? favorite.name} à partir de ${expertData.length}/${expectedModelCount} modèles experts disponibles. La météo actuelle observée reste séparée et n’est pas modifiée par cette action.`;

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
    const issuedAt = Date.now();
    await insertForecastRuns(expertData.map((entry) => ({
      locationKey,
      validDate: today,
      serviceName: entry.serviceName,
      provider: "open-meteo",
      modelId: WEATHER_SERVICES.expert.find((service) => service.name === entry.serviceName)?.modelId ?? null,
      sourceKind: "model_forecast" as const,
      issuedAt,
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
    await upsertLocationForecast({
      favoriteLocationId: favorite.id,
      userId: favorite.userId,
      lat: favorite.lat,
      lon: favorite.lon,
      date: today,
      tempMax: meteoAI.tempMax,
      tempMin: meteoAI.tempMin,
      tempCurrent: null,
      precipitation: meteoAI.precipitation,
      windSpeed: meteoAI.windSpeed,
      condition,
      aiScore: confidenceScore,
      confidenceScore,
      stabilityIndex: stability.index,
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
      stabilityIndex: stability.index,
      stabilityLabel: stability.label,
      confidenceScore,
      weights: { version: 1, weightByService: meteoAI.weights, trace: meteoAI.trace, trigger: "manual" } as any,
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

    return granularityResult(expertData.length, expectedModelCount, new Date(persistedAt));
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
  const expectedModelCount = WEATHER_SERVICES.expert.length;
  try {
    const coords = { lat: favorite.lat, lon: favorite.lon };
    const [displayHours, hourlyModels] = await Promise.all([
      // This collector omits Open-Meteo's separate current snapshot; only forecast
      // hours are refreshed, and the cached current-hour value is preserved below.
      collectHourlyForecast(today, coords, 2, { includeCurrentSnapshot: false }),
      collectHourlyForecastAllModels(today, coords, { includeBestMatch: false }),
    ]);
    const bestMatchHours: HourlyPoint[] = displayHours.filter((hour) => hour.date === today);
    const collectedAt = new Date();
    const candidates = hourlyModels
      .filter((model) => model.modelName !== "best_match")
      .map((model) => ({ modelName: model.modelName, rows: toHourlyRows(locationKey, today, model.modelName, model.hours, collectedAt) }))
      .filter((candidate) => candidate.rows.length > 0);

    if (bestMatchHours.length > 0) {
      candidates.push({
        modelName: "best_match",
        rows: toHourlyRows(locationKey, today, "best_match", bestMatchHours.map((hour) => ({
          hour: Number(hour.hour.slice(0, 2)),
          temperature: hour.temp,
          apparentTemperature: hour.apparentTemp,
          precipitation: hour.precipitation,
          windSpeed: hour.windSpeed,
          windGusts: hour.windGust,
          windDirection: hour.windDirection,
          humidity: hour.humidity,
          pressure: hour.pressure,
          cloudCover: hour.cloudCover,
          weatherCode: hour.weatherCode,
        })), collectedAt),
      });
    }

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
    if (persistedModels.has("best_match") && updatedAt) {
      cacheManualHourlyForecast(coords, today, displayHours, updatedAt);
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
  try {
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
  }
}
