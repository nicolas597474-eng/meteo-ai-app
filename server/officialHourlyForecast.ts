import { getPhase3HorizonWindow } from "../shared/weatherDataHub";
import { HOURLY_FORECAST_VARIABLES } from "./hourlyForecastRunScoring";
import { getHourlyForecastEvaluationHistory, makeLocationKey } from "./db";
import type { HourlyForecastRunValue } from "../drizzle/schema";
import { conditionFromWeatherValues } from "./weatherConditionLabels";
import { getParisDateAndHour } from "./parisHourlyTime";
import { getParisDateDaysAgo } from "./weatherTime";
import {
  HONDEGHEM,
  OFFICIAL_HOURLY_MODELS,
  collectHourlyForecastAllModels,
  type HourlyModelForecast,
  type HourlyPoint,
  type HourlyPointWeighting,
  type HourlyVariableWeighting,
  type HourlyWeightingUnavailableReason,
} from "./weatherServices";
import { PUBLIC_RANKING_EVIDENCE_THRESHOLDS } from "./weatherReliabilityConfig";

export type OfficialHourlyModelName = (typeof OFFICIAL_HOURLY_MODELS)[number]["name"];
export const OFFICIAL_HOURLY_MODEL_NAMES: readonly OfficialHourlyModelName[] = OFFICIAL_HOURLY_MODELS.map((model) => model.name);
export const OFFICIAL_HOURLY_HISTORY_DAYS = 365;

const MODEL_NAME_SET = new Set<string>(OFFICIAL_HOURLY_MODEL_NAMES);
const MODEL_ID_BY_NAME = new Map<string, string>(OFFICIAL_HOURLY_MODELS.map((model) => [model.name, model.modelId] as const));
const HISTORY_VARIABLES = HOURLY_FORECAST_VARIABLES;
type OfficialHourlyVariable = (typeof HISTORY_VARIABLES)[number];

const FORECAST_FIELD_BY_VARIABLE: Record<OfficialHourlyVariable, keyof HourlyModelForecast["hours"][number]> = {
  temperature: "temperature",
  precipitation: "precipitation",
  wind_speed: "windSpeed",
  wind_gust: "windGusts",
  humidity: "humidity",
  pressure: "pressure",
};

const ARCHIVED_VARIABLE_FIELD: Readonly<Record<string, keyof HourlyModelForecast["hours"][number]>> = {
  temperature: "temperature",
  precipitation: "precipitation",
  wind_speed: "windSpeed",
  wind_gust: "windGusts",
  humidity: "humidity",
  pressure: "pressure",
};

/** Rebuild the latest archived run for each official model without consulting Best Match. */
export function reconstructOfficialHourlyModelsFromArchive(
  rows: readonly HourlyForecastRunValue[],
  targetDate: string,
): HourlyModelForecast[] {
  type Capture = {
    captureRunId: string;
    modelName: OfficialHourlyModelName;
    modelId: string;
    sourceName: string;
    requestStartedAt: number;
    availableAt: number;
    maxId: number;
    rows: HourlyForecastRunValue[];
  };

  const capturesByModel = new Map<OfficialHourlyModelName, Map<string, Capture>>();
  for (const row of rows) {
    if (row.targetDate !== targetDate || !MODEL_NAME_SET.has(row.modelName)) continue;
    const modelName = row.modelName as OfficialHourlyModelName;
    const expectedModelId = MODEL_ID_BY_NAME.get(modelName);
    if (row.sourceName !== "open-meteo" || row.modelId !== expectedModelId) continue;
    if (!Number.isFinite(row.requestStartedAt) || !Number.isFinite(row.availableAt) || !Number.isFinite(row.validTime)) continue;

    const captures = capturesByModel.get(modelName) ?? new Map<string, Capture>();
    const capture = captures.get(row.captureRunId) ?? {
      captureRunId: row.captureRunId,
      modelName,
      modelId: expectedModelId,
      sourceName: row.sourceName,
      requestStartedAt: row.requestStartedAt,
      availableAt: row.availableAt,
      maxId: row.id,
      rows: [],
    };
    capture.maxId = Math.max(capture.maxId, row.id);
    capture.rows.push(row);
    captures.set(row.captureRunId, capture);
    capturesByModel.set(modelName, captures);
  }

  const forecasts: HourlyModelForecast[] = [];
  for (const modelName of OFFICIAL_HOURLY_MODEL_NAMES) {
    const captures = Array.from(capturesByModel.get(modelName)?.values() ?? []);
    captures.sort((left, right) => left.availableAt - right.availableAt
      || left.requestStartedAt - right.requestStartedAt
      || left.maxId - right.maxId);
    const latest = captures.at(-1);
    if (!latest) continue;

    const hoursByValidAt = new Map<number, HourlyModelForecast["hours"][number]>();
    for (const row of latest.rows) {
      const field = ARCHIVED_VARIABLE_FIELD[row.variable];
      if (!field) continue;
      const parisTime = getParisDateAndHour(row.validTime);
      if (!parisTime || parisTime.date !== targetDate) continue;
      const hour = hoursByValidAt.get(row.validTime) ?? {
        validAt: row.validTime,
        hour: parisTime.hour,
        temperature: null,
        apparentTemperature: null,
        precipitation: null,
        windSpeed: null,
        windGusts: null,
        windDirection: null,
        humidity: null,
        pressure: null,
        cloudCover: null,
        weatherCode: null,
        uvIndex: null,
        dewPoint: null,
        visibility: null,
        solarRadiation: null,
        cloudLow: null,
        cloudMid: null,
        cloudHigh: null,
        snowfall: null,
      };
      (hour as unknown as Record<string, number | null | undefined>)[field] = row.value != null && Number.isFinite(row.value) ? row.value : null;
      hoursByValidAt.set(row.validTime, hour);
    }

    forecasts.push({
      modelName,
      modelId: latest.modelId,
      sourceName: latest.sourceName,
      captureRunId: latest.captureRunId,
      requestStartedAt: latest.requestStartedAt,
      availableAt: latest.availableAt,
      hours: Array.from(hoursByValidAt.values()).sort((left, right) => (left.validAt ?? 0) - (right.validAt ?? 0)),
    });
  }
  return forecasts;
}

export type OfficialHourlyEvaluationHistoryScore = {
  date: string;
  sourceName: string;
  modelName: string;
  modelId: string | null;
  variable: string;
  horizonBucket: string;
  sampleSize: number;
  mae: number | null;
};

export type OfficialHourlyWeightingSummary = {
  status: "historical_skill" | "mixed" | "unavailable";
  historyStatus: "available" | "unavailable";
  historyWindowDays: number;
  minimumComparisons: number;
  minimumComparableDays: number;
  bestMatchIncluded: false;
  modelsConsidered: readonly OfficialHourlyModelName[];
  modelsWithData: readonly OfficialHourlyModelName[];
  horizons: Array<{
    variable: string;
    horizonBucket: string | null;
    method: "historical_skill" | "unavailable";
    unavailableReason: HourlyWeightingUnavailableReason | null;
    hourCount: number;
    modelNamesWithData: readonly OfficialHourlyModelName[];
  }>;
};

export type OfficialHourlyForecastResult = {
  hours: HourlyPoint[];
  weighting: OfficialHourlyWeightingSummary;
};

export type CollectedOfficialHourlyForecast = OfficialHourlyForecastResult & {
  modelForecasts: HourlyModelForecast[];
};

type HistoryAggregate = {
  weightedAbsoluteError: number;
  sampleSize: number;
  dates: Set<string>;
};

type QualifiedHistory = {
  mae: number;
  sampleSize: number;
  evaluatedDays: number;
};

type HourlyModelValue = {
  modelName: OfficialHourlyModelName;
  availableAt: number | null;
  hour: HourlyModelForecast["hours"][number];
};

type HorizonWeights = {
  method: "historical_skill" | "unavailable";
  unavailableReason: HourlyWeightingUnavailableReason | null;
  weights: Map<OfficialHourlyModelName, number>;
  minimumComparisons: number | null;
  minimumComparableDays: number | null;
};

type VariableForecastValue = {
  value: number | null;
  weighting: HourlyVariableWeighting;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

/** Returns null on invalid or empty evidence; never manufactures equal weights. */
function normalizeWeights(values: Map<OfficialHourlyModelName, number>): Map<OfficialHourlyModelName, number> | null {
  const positive = Array.from(values).filter(([, value]) => isFiniteNumber(value) && value > 0);
  const total = positive.reduce((sum, [, value]) => sum + value, 0);
  if (positive.length === 0 || total <= 0 || !Number.isFinite(total)) return null;
  return new Map(positive.map(([name, value]) => [name, value / total] as const));
}

function collectHistoryAggregates(
  history: readonly OfficialHourlyEvaluationHistoryScore[],
  beforeDate: string | null,
): Map<string, HistoryAggregate> {
  const aggregates = new Map<string, HistoryAggregate>();
  for (const score of history) {
    if (!MODEL_NAME_SET.has(score.modelName)) continue;
    if (score.sourceName !== "open-meteo") continue;
    if (score.modelId !== MODEL_ID_BY_NAME.get(score.modelName)) continue;
    if (beforeDate && score.date >= beforeDate) continue;
    if (!(HISTORY_VARIABLES as readonly string[]).includes(score.variable)) continue;
    if (!Number.isInteger(score.sampleSize) || score.sampleSize <= 0 || !isFiniteNumber(score.mae) || score.mae < 0) continue;

    const weightedError = score.mae * score.sampleSize;
    if (!Number.isFinite(weightedError)) continue;
    const key = [score.modelName, score.variable, score.horizonBucket].join("|");
    const aggregate = aggregates.get(key) ?? { weightedAbsoluteError: 0, sampleSize: 0, dates: new Set<string>() };
    aggregate.weightedAbsoluteError += weightedError;
    aggregate.sampleSize += score.sampleSize;
    aggregate.dates.add(score.date);
    aggregates.set(key, aggregate);
  }
  return aggregates;
}

function getQualifiedHistory(
  aggregates: Map<string, HistoryAggregate>,
  modelName: OfficialHourlyModelName,
  variable: string,
  horizonBucket: string,
): QualifiedHistory | null {
  const aggregate = aggregates.get([modelName, variable, horizonBucket].join("|"));
  if (!aggregate || aggregate.sampleSize < PUBLIC_RANKING_EVIDENCE_THRESHOLDS.minimumComparisons
    || aggregate.dates.size < PUBLIC_RANKING_EVIDENCE_THRESHOLDS.minimumComparableDays) return null;
  const mae = aggregate.weightedAbsoluteError / aggregate.sampleSize;
  if (!Number.isFinite(mae) || mae < 0) return null;
  return {
    mae,
    sampleSize: aggregate.sampleSize,
    evaluatedDays: aggregate.dates.size,
  };
}

function unavailableWeights(unavailableReason: HourlyWeightingUnavailableReason): HorizonWeights {
  return {
    method: "unavailable",
    unavailableReason,
    weights: new Map(),
    minimumComparisons: null,
    minimumComparableDays: null,
  };
}

/** Uses only one variable's comparable, location-filtered, matching-horizon MAE evidence. */
function historicalWeights(
  aggregates: Map<string, HistoryAggregate>,
  variable: OfficialHourlyVariable,
  horizonBucket: string,
): HorizonWeights {
  const scores = OFFICIAL_HOURLY_MODEL_NAMES.map((modelName) => getQualifiedHistory(aggregates, modelName, variable, horizonBucket));
  if (scores.some((score) => score == null)) return unavailableWeights("insufficient_historical_evidence");

  const qualified = scores as QualifiedHistory[];
  const baseline = median(qualified.map((score) => score.mae));
  // A zero median cannot provide a meaningful relative scale; do not tune an artificial epsilon.
  if (baseline == null || baseline <= 0) return unavailableWeights("insufficient_historical_evidence");

  const rawWeights = new Map<OfficialHourlyModelName, number>();
  for (let index = 0; index < qualified.length; index++) {
    const score = qualified[index];
    const relativeError = score.mae / baseline;
    if (!Number.isFinite(relativeError) || relativeError < 0) return unavailableWeights("insufficient_historical_evidence");
    // The +1 regularizes relative MAE so a small evidence set cannot dominate the result.
    rawWeights.set(OFFICIAL_HOURLY_MODEL_NAMES[index], 1 / (1 + relativeError));
  }
  const weights = normalizeWeights(rawWeights);
  if (!weights) return unavailableWeights("insufficient_historical_evidence");

  return {
    method: "historical_skill",
    unavailableReason: null,
    weights,
    minimumComparisons: Math.min(...qualified.map((item) => item.sampleSize)),
    minimumComparableDays: Math.min(...qualified.map((item) => item.evaluatedDays)),
  };
}

function findCommonHorizon(modelValues: HourlyModelValue[], validAt: number): { bucket: string | null; unavailableReason: HourlyWeightingUnavailableReason | null } {
  const buckets = modelValues.map(({ availableAt }) => {
    if (!isFiniteNumber(availableAt)) return null;
    const minutes = Math.round((validAt - availableAt) / 60_000);
    return getPhase3HorizonWindow(minutes)?.key ?? null;
  });
  if (buckets.some((bucket) => bucket == null)) return { bucket: null, unavailableReason: "horizon_not_scored" };
  const uniqueBuckets = new Set(buckets as string[]);
  if (uniqueBuckets.size !== 1) return { bucket: null, unavailableReason: "incomparable_horizons" };
  return { bucket: buckets[0]!, unavailableReason: null };
}

function weightedMean(values: Array<{ value: unknown; weight: number }>): number | null {
  let weightedTotal = 0;
  let availableWeight = 0;
  for (const entry of values) {
    if (!isFiniteNumber(entry.value) || !isFiniteNumber(entry.weight) || entry.weight <= 0) continue;
    weightedTotal += entry.value * entry.weight;
    availableWeight += entry.weight;
  }
  return availableWeight > 0 ? weightedTotal / availableWeight : null;
}

function numericRange(values: unknown[]): number | null {
  const finite = values.filter(isFiniteNumber);
  return finite.length > 1 ? Math.max(...finite) - Math.min(...finite) : null;
}

function circularDifference(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}

function maximumCircularSpread(values: unknown[]): number | null {
  const finite = values.filter(isFiniteNumber);
  if (finite.length < 2) return null;
  let maximum = 0;
  for (let left = 0; left < finite.length; left++) {
    for (let right = left + 1; right < finite.length; right++) {
      maximum = Math.max(maximum, circularDifference(finite[left], finite[right]));
    }
  }
  return maximum;
}

function hasForecastValue(hour: HourlyModelForecast["hours"][number]): boolean {
  return [
    hour.temperature, hour.apparentTemperature, hour.precipitation, hour.windSpeed,
    hour.windGusts, hour.windDirection, hour.humidity, hour.pressure, hour.cloudCover,
    hour.weatherCode, hour.uvIndex, hour.dewPoint, hour.visibility, hour.solarRadiation,
    hour.cloudLow, hour.cloudMid, hour.cloudHigh, hour.snowfall,
  ].some(isFiniteNumber);
}

function computeVariableForecastValue(
  variable: OfficialHourlyVariable,
  modelValues: HourlyModelValue[],
  horizonWeights: HorizonWeights,
): VariableForecastValue {
  const field = FORECAST_FIELD_BY_VARIABLE[variable];
  const modelValuesWithData = modelValues.filter(({ hour }) => isFiniteNumber(hour[field]));
  const modelsWithData = modelValuesWithData.map(({ modelName }) => modelName);
  if (horizonWeights.method !== "historical_skill") {
    return {
      value: null,
      weighting: {
        variable,
        method: "unavailable",
        unavailableReason: horizonWeights.unavailableReason,
        modelsWithData,
        modelWeights: [],
        minimumComparisons: null,
        minimumComparableDays: null,
      },
    };
  }
  if (modelValuesWithData.length === 0) {
    return {
      value: null,
      weighting: {
        variable,
        method: "unavailable",
        unavailableReason: "no_model_data",
        modelsWithData,
        modelWeights: [],
        minimumComparisons: horizonWeights.minimumComparisons,
        minimumComparableDays: horizonWeights.minimumComparableDays,
      },
    };
  }

  const availableWeights = normalizeWeights(new Map(modelValuesWithData.flatMap(({ modelName }) => {
    const weight = horizonWeights.weights.get(modelName);
    return weight == null ? [] : [[modelName, weight] as const];
  })));
  if (!availableWeights) {
    return {
      value: null,
      weighting: {
        variable,
        method: "unavailable",
        unavailableReason: "insufficient_historical_evidence",
        modelsWithData,
        modelWeights: [],
        minimumComparisons: null,
        minimumComparableDays: null,
      },
    };
  }

  const value = weightedMean(modelValuesWithData.map(({ modelName, hour }) => ({
    value: hour[field],
    weight: availableWeights.get(modelName) ?? 0,
  })));
  if (value == null) {
    return {
      value: null,
      weighting: {
        variable,
        method: "unavailable",
        unavailableReason: "no_model_data",
        modelsWithData,
        modelWeights: [],
        minimumComparisons: horizonWeights.minimumComparisons,
        minimumComparableDays: horizonWeights.minimumComparableDays,
      },
    };
  }

  return {
    value,
    weighting: {
      variable,
      method: "historical_skill",
      unavailableReason: null,
      modelsWithData,
      modelWeights: modelValuesWithData.flatMap(({ modelName }) => {
        const weight = availableWeights.get(modelName);
        return weight == null ? [] : [{ modelName, weight }];
      }),
      minimumComparisons: horizonWeights.minimumComparisons,
      minimumComparableDays: horizonWeights.minimumComparableDays,
    },
  };
}

function makePoint(
  validAt: number,
  modelValues: HourlyModelValue[],
  variableValues: Map<OfficialHourlyVariable, VariableForecastValue>,
  horizonBucket: string | null,
  now: number,
): HourlyPoint | null {
  const parisTime = getParisDateAndHour(validAt);
  if (!parisTime) return null;
  const available = modelValues.filter(({ hour }) => hasForecastValue(hour));
  if (available.length === 0) return null;

  const valueFor = (variable: OfficialHourlyVariable) => variableValues.get(variable)?.value ?? null;
  const temperature = valueFor("temperature");
  const precipitation = valueFor("precipitation");
  const windSpeed = valueFor("wind_speed");
  const windGust = valueFor("wind_gust");
  const humidity = valueFor("humidity");
  const pressure = valueFor("pressure");
  const rawTemperatures = modelValues.flatMap(({ modelName, hour }) => isFiniteNumber(hour.temperature)
    ? [{ name: modelName, temperature: hour.temperature }]
    : []);
  const temperatureValues = rawTemperatures.map((model) => model.temperature);
  const temperatureExtremes = [...rawTemperatures].sort((left, right) => left.temperature - right.temperature || left.name.localeCompare(right.name));
  const temperatureComparison = temperatureExtremes.length > 1
    ? {
        lower: temperatureExtremes[0],
        higher: temperatureExtremes[temperatureExtremes.length - 1],
        rationale: "Écart entre les modèles horaires indépendants; ce n’est pas un classement de fiabilité.",
      }
    : null;

  const variableWeightings = HISTORY_VARIABLES.map((variable) => variableValues.get(variable)!.weighting);
  const scoredVariables = variableWeightings.filter((item) => item.method === "historical_skill").map((item) => item.variable);
  const unavailableVariables = variableWeightings.filter((item) => item.method === "unavailable").map((item) => item.variable);
  const hasScoredVariable = scoredVariables.length > 0;
  const pointMethod: HourlyPointWeighting["method"] = !hasScoredVariable
    ? "unavailable"
    : unavailableVariables.length > 0 ? "mixed" : "historical_skill";
  const unavailableReason = hasScoredVariable
    ? null
    : variableWeightings.find((item) => item.unavailableReason != null)?.unavailableReason ?? "insufficient_historical_evidence";
  const comparisonCounts = variableWeightings.flatMap((item) => item.method === "historical_skill" && item.minimumComparisons != null ? [item.minimumComparisons] : []);
  const comparableDayCounts = variableWeightings.flatMap((item) => item.method === "historical_skill" && item.minimumComparableDays != null ? [item.minimumComparableDays] : []);
  const modelsWithData = Array.from(new Set(available.map(({ modelName }) => modelName)));
  const precipValues = modelValues.map(({ hour }) => hour.precipitation).filter(isFiniteNumber);
  const precipAgreement = precipValues.length > 0
    ? (precipValues.filter((value) => value >= 0.1).length / precipValues.length) * 100
    : null;
  const condition = precipitation == null ? null : conditionFromWeatherValues(precipitation, null);
  const precipIntensity = precipitation == null || precipitation <= 0
    ? null
    : precipitation > 5 ? "heavy" : precipitation > 1 ? "moderate" : "light";

  return {
    date: parisTime.date,
    hour: `${String(parisTime.hour).padStart(2, "0")}:00`,
    validAt,
    temp: temperature,
    // No historical run scores exist for these fields, so they are not published as official values.
    apparentTemp: null,
    precipitation,
    windSpeed,
    windGust,
    windDirection: null,
    cloudCover: null,
    humidity,
    uvIndex: null,
    condition,
    weatherCode: null,
    pressure,
    dewPoint: null,
    visibility: null,
    solarRadiation: null,
    cloudLow: null,
    cloudMid: null,
    cloudHigh: null,
    precipType: null,
    precipIntensity,
    tempSpread: numericRange(temperatureValues),
    windSpeedSpread: numericRange(modelValues.map(({ hour }) => hour.windSpeed)),
    windGustSpread: numericRange(modelValues.map(({ hour }) => hour.windGusts)),
    windDirectionDifference: maximumCircularSpread(modelValues.map(({ hour }) => hour.windDirection)),
    humiditySpread: numericRange(modelValues.map(({ hour }) => hour.humidity)),
    cloudCoverSpread: numericRange(modelValues.map(({ hour }) => hour.cloudCover)),
    precipAgreement,
    modelCount: temperatureValues.length,
    temperatureComparison,
    isCurrent: validAt <= now && now < validAt + 60 * 60_000,
    forecastWeighting: {
      method: pointMethod,
      horizonBucket,
      unavailableReason,
      scoredVariables,
      unavailableVariables,
      minimumComparisons: comparisonCounts.length > 0 ? Math.min(...comparisonCounts) : null,
      minimumComparableDays: comparableDayCounts.length > 0 ? Math.min(...comparableDayCounts) : null,
      variableWeightings,
      modelsWithData,
    },
  };
}

/**
 * Builds a single series from the seven named forecast models. Each published
 * metric must have its own qualified historical MAE weights for the same lead
 * bucket. Unsupported or under-calibrated metrics remain null; Best Match is
 * always excluded and no equal-weight fallback is ever emitted.
 */
export function computeOfficialHourlyForecast(
  modelForecasts: readonly HourlyModelForecast[],
  historyScores: readonly OfficialHourlyEvaluationHistoryScore[],
  options: { now?: number; historyAvailable?: boolean } = {},
): OfficialHourlyForecastResult {
  const now = options.now ?? Date.now();
  const historyAvailable = options.historyAvailable !== false;
  const byValidTime = new Map<number, Map<OfficialHourlyModelName, HourlyModelValue>>();

  for (const forecast of modelForecasts) {
    if (!MODEL_NAME_SET.has(forecast.modelName)) continue;
    const modelName = forecast.modelName as OfficialHourlyModelName;
    if (forecast.modelId !== MODEL_ID_BY_NAME.get(modelName)) continue;
    if (forecast.sourceName !== "open-meteo") continue;
    for (const hour of forecast.hours) {
      if (!isFiniteNumber(hour.validAt) || !hasForecastValue(hour)) continue;
      const current = byValidTime.get(hour.validAt) ?? new Map<OfficialHourlyModelName, HourlyModelValue>();
      const next: HourlyModelValue = {
        modelName,
        availableAt: isFiniteNumber(forecast.availableAt) ? forecast.availableAt : null,
        hour,
      };
      const previous = current.get(modelName);
      if (!previous || (next.availableAt ?? Number.NEGATIVE_INFINITY) > (previous.availableAt ?? Number.NEGATIVE_INFINITY)) {
        current.set(modelName, next);
      }
      byValidTime.set(hour.validAt, current);
    }
  }

  const forecastDates = Array.from(byValidTime.keys())
    .map((validAt) => getParisDateAndHour(validAt)?.date)
    .filter((date): date is string => date != null)
    .sort();
  const beforeDate = forecastDates[0] ?? null;
  const historyAggregates = collectHistoryAggregates(historyAvailable ? historyScores : [], beforeDate);
  const hours: HourlyPoint[] = [];
  const summaryRows = new Map<string, {
    variable: string;
    horizonBucket: string | null;
    method: "historical_skill" | "unavailable";
    unavailableReason: HourlyWeightingUnavailableReason | null;
    hourCount: number;
    modelNamesWithData: Set<OfficialHourlyModelName>;
  }>();
  const allModelsWithData = new Set<OfficialHourlyModelName>();

  for (const [validAt, modelMap] of Array.from(byValidTime.entries()).sort((left, right) => left[0] - right[0])) {
    const modelValues = Array.from(modelMap.values());
    if (modelValues.length === 0) continue;
    const horizon = findCommonHorizon(modelValues, validAt);
    const variableValues = new Map<OfficialHourlyVariable, VariableForecastValue>();

    for (const variable of HISTORY_VARIABLES) {
      const horizonWeights = !historyAvailable
        ? unavailableWeights("history_unavailable")
        : horizon.bucket == null
          ? unavailableWeights(horizon.unavailableReason ?? "horizon_not_scored")
          : historicalWeights(historyAggregates, variable, horizon.bucket);
      const result = computeVariableForecastValue(variable, modelValues, horizonWeights);
      variableValues.set(variable, result);
    }
    modelValues.filter(({ hour }) => hasForecastValue(hour)).forEach(({ modelName }) => allModelsWithData.add(modelName));

    const point = makePoint(validAt, modelValues, variableValues, horizon.bucket, now);
    if (!point) continue;
    hours.push(point);

    for (const variable of HISTORY_VARIABLES) {
      const variableWeighting = variableValues.get(variable)!.weighting;
      const key = `${variable}|${horizon.bucket ?? "unknown"}|${variableWeighting.method}|${variableWeighting.unavailableReason ?? ""}`;
      const row = summaryRows.get(key) ?? {
        variable,
        horizonBucket: horizon.bucket,
        method: variableWeighting.method,
        unavailableReason: variableWeighting.unavailableReason,
        hourCount: 0,
        modelNamesWithData: new Set<OfficialHourlyModelName>(),
      };
      row.hourCount++;
      variableWeighting.modelsWithData.forEach((name) => row.modelNamesWithData.add(name as OfficialHourlyModelName));
      summaryRows.set(key, row);
    }
  }

  const summaryMethods = Array.from(summaryRows.values()).map((row) => row.method);
  const hasHistoricalSkill = summaryMethods.includes("historical_skill");
  const hasUnavailableMetrics = summaryMethods.includes("unavailable");
  const status: OfficialHourlyWeightingSummary["status"] = !hasHistoricalSkill
    ? "unavailable"
    : hasUnavailableMetrics ? "mixed" : "historical_skill";
  return {
    hours,
    weighting: {
      status,
      historyStatus: historyAvailable ? "available" : "unavailable",
      historyWindowDays: OFFICIAL_HOURLY_HISTORY_DAYS,
      minimumComparisons: PUBLIC_RANKING_EVIDENCE_THRESHOLDS.minimumComparisons,
      minimumComparableDays: PUBLIC_RANKING_EVIDENCE_THRESHOLDS.minimumComparableDays,
      bestMatchIncluded: false,
      modelsConsidered: OFFICIAL_HOURLY_MODEL_NAMES,
      modelsWithData: Array.from(allModelsWithData),
      horizons: Array.from(summaryRows.values()).map((row) => ({
        ...row,
        modelNamesWithData: Array.from(row.modelNamesWithData),
      })),
    },
  };
}

/** Collects one shared 48-hour, seven-model series and its read-only historical score window. */
export async function collectOfficialHourlyForecast(
  targetDate: string,
  coords?: { lat: number; lon: number },
): Promise<CollectedOfficialHourlyForecast> {
  const location = coords ?? HONDEGHEM;
  const modelForecasts = await collectHourlyForecastAllModels(targetDate, location, {
    includeBestMatch: false,
    includeNextDay: true,
  });
  let historyAvailable = false;
  let historyScores: OfficialHourlyEvaluationHistoryScore[] = [];
  try {
    const history = await getHourlyForecastEvaluationHistory(
      makeLocationKey(location.lat, location.lon),
      getParisDateDaysAgo(OFFICIAL_HOURLY_HISTORY_DAYS),
      getParisDateDaysAgo(1),
    );
    historyAvailable = history.available;
    historyScores = history.rows;
  } catch (error) {
    console.warn("[OfficialHourly] Historical scores unavailable; official metrics will remain unavailable:", error);
  }
  return {
    ...computeOfficialHourlyForecast(modelForecasts, historyScores, { historyAvailable }),
    modelForecasts,
  };
}
