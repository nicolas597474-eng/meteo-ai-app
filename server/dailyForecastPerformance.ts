import type { ForecastRun, InsertForecastRun, InsertDailyForecastObservationComparison } from "../drizzle/schema";
import { OFFICIAL_HOURLY_MODELS, WEATHER_SERVICES, type ForecastData } from "./weatherServices";
import { applyBiasCorrection, type ServiceBias } from "./fusionEngine";
import { buildQualifiedDailyObservation, type PhysicalSnapshot } from "./physicalObservationAggregation";
import { parisLocalHourToUniqueEpochMs } from "./parisHourlyTime";
import type { DailyFusionHorizon, DailyFusionMetric, ModelPerformanceEvidence } from "./fusionPerformance";

const MODEL_SERVICES = new Map(WEATHER_SERVICES.expert.map((service) => [service.name, service]));
const OFFICIAL_DAILY_MODEL_BY_NAME = new Map<string, (typeof OFFICIAL_HOURLY_MODELS)[number]>(
  OFFICIAL_HOURLY_MODELS.map((model) => [model.name, model]),
);
const DAILY_TEMPERATURE_MINIMUM_HOURS = 18;
const DAILY_WIND_MINIMUM_HOURS = 18;
const DAILY_PRECIPITATION_REQUIRED_HOURS = 24;

function isRecord(value: unknown): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function finiteOrNull(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function isOfficialDailyModel(serviceName: string, modelId: string | null | undefined): boolean {
  return OFFICIAL_DAILY_MODEL_BY_NAME.get(serviceName)?.modelId === modelId;
}

function nextIsoDate(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

/** Derive every target-day row from the already-fetched 16-day provider payload. */
export function buildForecastRunArchiveRows(
  forecasts: ForecastData[],
  locationKey: string,
  requestedDate: string,
  issuedAt: number,
  biases: ServiceBias[] = [],
): InsertForecastRun[] {
  if (!Number.isFinite(issuedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return [];
  const rows: InsertForecastRun[] = [];

  for (const forecast of forecasts) {
    const service = MODEL_SERVICES.get(forecast.serviceName);
    if (!service || forecast.serviceCategory !== "expert") continue;

    const raw = isRecord(forecast.rawData) ? forecast.rawData : null;
    const daily = raw && isRecord(raw.daily) ? raw.daily : null;
    const times = Array.isArray(daily?.time) ? daily.time : [];
    const hasDatedDailyPayload = times.some((value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));

    if (hasDatedDailyPayload && daily) {
      for (let index = 0; index < times.length; index++) {
        const validDate = times[index];
        if (typeof validDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(validDate) || validDate < requestedDate) continue;
        const corrected = applyBiasCorrection([{
          serviceName: forecast.serviceName,
          tempMax: finiteOrNull(daily.temperature_2m_max?.[index]),
          tempMin: finiteOrNull(daily.temperature_2m_min?.[index]),
          precipitation: finiteOrNull(daily.precipitation_sum?.[index]),
          windSpeed: finiteOrNull(daily.wind_speed_10m_max?.[index]),
          windGust: finiteOrNull(daily.wind_gusts_10m_max?.[index]),
        }], biases)[0];
        rows.push({
          locationKey,
          validDate,
          serviceName: forecast.serviceName,
          provider: "open-meteo",
          modelId: service.modelId,
          sourceKind: "model_forecast",
          issuedAt,
          tempMax: corrected.tempMax,
          tempMin: corrected.tempMin,
          precipitation: corrected.precipitation,
          windSpeed: corrected.windSpeed,
          windGust: corrected.windGust ?? null,
          humidity: finiteOrNull(daily.relative_humidity_2m_mean?.[index]),
          cloudCover: finiteOrNull(daily.cloud_cover_mean?.[index]),
          condition: validDate === requestedDate ? forecast.condition : null,
          // Keep the full provider payload once per emission, not once per target date.
          rawData: validDate === requestedDate ? forecast.rawData as any : null,
        });
      }
      continue;
    }

    // Older mocks or provider responses without a dated daily array remain current-day only.
    const corrected = applyBiasCorrection([{
      serviceName: forecast.serviceName,
      tempMax: finiteOrNull(forecast.tempMax),
      tempMin: finiteOrNull(forecast.tempMin),
      precipitation: finiteOrNull(forecast.precipitation),
      windSpeed: finiteOrNull(forecast.windSpeed),
      windGust: finiteOrNull(forecast.windGust),
    }], biases)[0];
    rows.push({
      locationKey,
      validDate: requestedDate,
      serviceName: forecast.serviceName,
      provider: "open-meteo",
      modelId: service.modelId,
      sourceKind: "model_forecast",
      issuedAt,
      tempMax: corrected.tempMax,
      tempMin: corrected.tempMin,
      precipitation: corrected.precipitation,
      windSpeed: corrected.windSpeed,
      windGust: corrected.windGust ?? null,
      humidity: finiteOrNull(forecast.humidity),
      cloudCover: finiteOrNull(forecast.cloudCover),
      condition: forecast.condition,
      rawData: forecast.rawData as any,
    });
  }
  return rows;
}

export function getDailyForecastHorizon(issuedAt: number, validDate: string): { bucket: DailyFusionHorizon; leadTimeMinutes: number } | null {
  const followingDate = nextIsoDate(validDate);
  if (!followingDate) return null;
  const endOfValidDay = parisLocalHourToUniqueEpochMs(followingDate, 0);
  const leadMs = endOfValidDay == null ? NaN : endOfValidDay - issuedAt;
  if (!Number.isFinite(leadMs) || leadMs <= 0) return null;
  const leadHours = leadMs / 3_600_000;
  if (leadHours > 15 * 24) return null;
  const bucket: DailyFusionHorizon = leadHours <= 6 ? "0-6h"
    : leadHours <= 24 ? "6-24h"
      : leadHours <= 3 * 24 ? "1-3d"
        : leadHours <= 7 * 24 ? "4-7d"
          : "8-15d";
  return { bucket, leadTimeMinutes: Math.floor(leadMs / 60_000) };
}

function buildVariableComparison(
  run: ForecastRun,
  validDate: string,
  horizonBucket: DailyFusionHorizon,
  leadTimeMinutes: number,
  variable: DailyFusionMetric,
  forecastValue: unknown,
  observedValue: unknown,
  observationCoverageHours: number,
): InsertDailyForecastObservationComparison | null {
  const forecast = finiteOrNull(forecastValue);
  const observed = finiteOrNull(observedValue);
  const officialModelId = OFFICIAL_DAILY_MODEL_BY_NAME.get(run.serviceName)?.modelId;
  const modelId = run.modelId ?? officialModelId ?? null;
  if (run.id == null || forecast == null || observed == null) return null;
  if (run.sourceKind !== "model_forecast" || officialModelId == null || modelId !== officialModelId) return null;
  const signedError = forecast - observed;
  return {
    comparisonKey: `${run.id}:${variable}`,
    forecastRunId: run.id,
    locationKey: run.locationKey,
    validDate,
    serviceName: run.serviceName,
    provider: run.provider,
    modelId,
    horizonBucket,
    leadTimeMinutes,
    variable,
    forecastValue: forecast,
    observedValue: observed,
    signedError,
    absoluteError: Math.abs(signedError),
    evidenceType: "physical_observation",
    observationIsQualified: 1,
    observationCoverageHours,
  };
}

/**
 * Create production comparisons only from qualified physical snapshots. Daily
 * precipitation is admitted only when all 24 hourly amounts can be summed.
 */
export function buildDailyForecastObservationComparisons(
  locationKey: string,
  validDate: string,
  forecasts: ForecastRun[],
  snapshots: PhysicalSnapshot[],
): InsertDailyForecastObservationComparison[] {
  const observation = buildQualifiedDailyObservation(snapshots);
  if (!observation.isQualified) return [];
  const comparisons: InsertDailyForecastObservationComparison[] = [];

  for (const run of forecasts) {
    if (run.locationKey !== locationKey || run.validDate !== validDate || run.sourceKind !== "model_forecast") continue;
    const horizon = getDailyForecastHorizon(Number(run.issuedAt), validDate);
    if (!horizon) continue;

    const candidates: Array<[DailyFusionMetric, unknown, unknown, number, boolean]> = [
      ["temperature_max", run.tempMax, observation.tempMax, observation.coverageHours, observation.coverageHours >= DAILY_TEMPERATURE_MINIMUM_HOURS],
      ["temperature_min", run.tempMin, observation.tempMin, observation.coverageHours, observation.coverageHours >= DAILY_TEMPERATURE_MINIMUM_HOURS],
      ["precipitation_sum", run.precipitation, observation.precipitationSum, observation.precipitationCoverageHours, observation.precipitationCoverageHours === DAILY_PRECIPITATION_REQUIRED_HOURS],
      ["wind_speed_max", run.windSpeed, observation.windSpeed, observation.windSpeedCoverageHours, observation.windSpeedCoverageHours >= DAILY_WIND_MINIMUM_HOURS],
      ["wind_gust_max", run.windGust, observation.windGust, observation.windGustCoverageHours, observation.windGustCoverageHours >= DAILY_WIND_MINIMUM_HOURS],
    ];

    for (const [variable, forecastValue, observedValue, coverage, covered] of candidates) {
      if (!covered) continue;
      const comparison = buildVariableComparison(run, validDate, horizon.bucket, horizon.leadTimeMinutes, variable, forecastValue, observedValue, coverage);
      if (comparison) comparisons.push(comparison);
    }
  }
  return comparisons;
}

type StoredComparison = InsertDailyForecastObservationComparison;

/** Aggregate by model/location/variable/horizon, with valid dates as independent units. */
export function aggregateDailyForecastPerformance(rows: StoredComparison[]): ModelPerformanceEvidence[] {
  const groups = new Map<string, StoredComparison[]>();
  for (const row of rows) {
    if (row.evidenceType !== "physical_observation" || row.observationIsQualified !== 1
      || !isOfficialDailyModel(row.serviceName, row.modelId)) continue;
    const key = [row.locationKey, row.serviceName, row.modelId, row.variable, row.horizonBucket].join("\u001f");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const evidence: ModelPerformanceEvidence[] = [];
  for (const group of Array.from(groups.values())) {
    const days = new Map<string, Array<{ absoluteError: number; squaredError: number }>>();
    for (const row of group) {
      const forecast = finiteOrNull(row.forecastValue);
      const observed = finiteOrNull(row.observedValue);
      if (forecast == null || observed == null || !/^\d{4}-\d{2}-\d{2}$/.test(row.validDate)) continue;
      const error = forecast - observed;
      const values = days.get(row.validDate) ?? [];
      values.push({ absoluteError: Math.abs(error), squaredError: error * error });
      days.set(row.validDate, values);
    }
    if (days.size === 0) continue;

    const dailyScores = Array.from(days.entries()).map(([date, values]) => ({
      date,
      mae: values.reduce((sum, item) => sum + item.absoluteError, 0) / values.length,
      mse: values.reduce((sum, item) => sum + item.squaredError, 0) / values.length,
    }));
    const mae = dailyScores.reduce((sum, item) => sum + item.mae, 0) / dailyScores.length;
    const rmse = Math.sqrt(dailyScores.reduce((sum, item) => sum + item.mse, 0) / dailyScores.length);
    const variance = dailyScores.length > 1
      ? dailyScores.reduce((sum, item) => sum + (item.mae - mae) ** 2, 0) / (dailyScores.length - 1)
      : 0;
    const sampleSize = dailyScores.length;
    const latestScoreDate = dailyScores.reduce((latest, item) => item.date > latest ? item.date : latest, "");
    const first = group[0];
    evidence.push({
      locationKey: first.locationKey,
      serviceName: first.serviceName,
      modelId: first.modelId,
      variable: first.variable,
      horizonBucket: first.horizonBucket,
      comparisonCount: dailyScores.reduce((sum, item) => sum + (days.get(item.date)?.length ?? 0), 0),
      sampleSize,
      evaluatedDays: sampleSize,
      mae,
      rmse,
      standardError: sampleSize > 1 ? Math.sqrt(variance / sampleSize) : 0,
      latestScoreDate,
    });
  }
  return evidence;
}
