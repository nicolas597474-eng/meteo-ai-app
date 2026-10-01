import { getPhase3HorizonWindow } from "../shared/weatherDataHub";
import { HOURLY_FORECAST_VARIABLES } from "./hourlyForecastRunScoring";
import { getHourlyForecastEvaluationHistory, makeLocationKey } from "./db";
import { conditionFromWeatherValues, conditionFromWmoWeatherCode } from "./weatherConditionLabels";
import { getParisDateAndHour } from "./parisHourlyTime";
import { getParisDateDaysAgo } from "./weatherTime";
import {
  HONDEGHEM,
  OFFICIAL_HOURLY_MODELS,
  collectHourlyForecastAllModels,
  type HourlyModelForecast,
  type HourlyPoint,
  type HourlyPointWeighting,
} from "./weatherServices";
import { PUBLIC_RANKING_EVIDENCE_THRESHOLDS } from "./weatherReliabilityConfig";

export type OfficialHourlyModelName = (typeof OFFICIAL_HOURLY_MODELS)[number]["name"];
export const OFFICIAL_HOURLY_MODEL_NAMES: readonly OfficialHourlyModelName[] = OFFICIAL_HOURLY_MODELS.map((model) => model.name);
export const OFFICIAL_HOURLY_HISTORY_DAYS = 365;

const MODEL_NAME_SET = new Set<string>(OFFICIAL_HOURLY_MODEL_NAMES);
const MODEL_ID_BY_NAME = new Map<string, string>(OFFICIAL_HOURLY_MODELS.map((model) => [model.name, model.modelId] as const));
const HISTORY_VARIABLES = HOURLY_FORECAST_VARIABLES;

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
  status: "historical_skill" | "equal_fallback" | "mixed" | "unavailable";
  historyStatus: "available" | "unavailable";
  historyWindowDays: number;
  minimumComparisons: number;
  minimumComparableDays: number;
  bestMatchIncluded: false;
  modelsConsidered: readonly OfficialHourlyModelName[];
  horizons: Array<{
    horizonBucket: string | null;
    method: HourlyPointWeighting["method"];
    fallbackReason: HourlyPointWeighting["fallbackReason"];
    hourCount: number;
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
  method: HourlyPointWeighting["method"];
  fallbackReason: HourlyPointWeighting["fallbackReason"];
  weights: Map<OfficialHourlyModelName, number>;
  scoredVariables: string[];
  minimumComparisons: number | null;
  minimumComparableDays: number | null;
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

function normalizeWeights(values: Map<OfficialHourlyModelName, number>): Map<OfficialHourlyModelName, number> {
  const total = Array.from(values.values()).reduce((sum, value) => sum + value, 0);
  if (total <= 0 || !Number.isFinite(total)) {
    const equal = 1 / Math.max(1, values.size);
    return new Map(Array.from(values.keys(), (name) => [name, equal] as const));
  }
  return new Map(Array.from(values, ([name, value]) => [name, value / total] as const));
}

function equalWeights(names: OfficialHourlyModelName[]): Map<OfficialHourlyModelName, number> {
  const uniqueNames = Array.from(new Set(names));
  const weight = uniqueNames.length > 0 ? 1 / uniqueNames.length : 0;
  return new Map(uniqueNames.map((name) => [name, weight] as const));
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

    const key = [score.modelName, score.variable, score.horizonBucket].join("|");
    const aggregate = aggregates.get(key) ?? { weightedAbsoluteError: 0, sampleSize: 0, dates: new Set<string>() };
    aggregate.weightedAbsoluteError += score.mae * score.sampleSize;
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
  return {
    mae: aggregate.weightedAbsoluteError / aggregate.sampleSize,
    sampleSize: aggregate.sampleSize,
    evaluatedDays: aggregate.dates.size,
  };
}

function historicalWeights(
  aggregates: Map<string, HistoryAggregate>,
  horizonBucket: string,
): HorizonWeights {
  const modelErrors = new Map<OfficialHourlyModelName, number[]>();
  for (const modelName of OFFICIAL_HOURLY_MODEL_NAMES) modelErrors.set(modelName, []);
  const scoredVariables: string[] = [];
  const evidence: QualifiedHistory[] = [];

  for (const variable of HISTORY_VARIABLES) {
    const scores = OFFICIAL_HOURLY_MODEL_NAMES.map((modelName) => getQualifiedHistory(aggregates, modelName, variable, horizonBucket));
    if (scores.some((score) => score == null)) continue;
    const qualified = scores as QualifiedHistory[];
    const baseline = median(qualified.map((score) => score.mae));
    // A zero median cannot be used as a relative scale without creating an
    // artificial advantage; that variable is omitted instead of epsilon-tuned.
    if (baseline == null || baseline <= 0) continue;

    scoredVariables.push(variable);
    evidence.push(...qualified);
    qualified.forEach((score, index) => {
      const modelName = OFFICIAL_HOURLY_MODEL_NAMES[index];
      modelErrors.get(modelName)!.push(score.mae / baseline);
    });
  }

  if (scoredVariables.length === 0) {
    return {
      method: "equal_fallback",
      fallbackReason: "insufficient_historical_evidence",
      weights: new Map(),
      scoredVariables,
      minimumComparisons: null,
      minimumComparableDays: null,
    };
  }

  const rawWeights = new Map<OfficialHourlyModelName, number>();
  for (const modelName of OFFICIAL_HOURLY_MODEL_NAMES) {
    const relativeErrors = modelErrors.get(modelName)!;
    const meanRelativeError = relativeErrors.reduce((sum, error) => sum + error, 0) / relativeErrors.length;
    // Inverse normalized MAE: one unit equals the seven-model median error.
    // The +1 regularizes the ratio and prevents one model dominating the line.
    rawWeights.set(modelName, 1 / (1 + meanRelativeError));
  }

  return {
    method: "historical_skill",
    fallbackReason: null,
    weights: normalizeWeights(rawWeights),
    scoredVariables,
    minimumComparisons: Math.min(...evidence.map((item) => item.sampleSize)),
    minimumComparableDays: Math.min(...evidence.map((item) => item.evaluatedDays)),
  };
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

function weightedCircularMean(values: Array<{ value: unknown; weight: number }>): number | null {
  let sine = 0;
  let cosine = 0;
  let totalWeight = 0;
  for (const entry of values) {
    if (!isFiniteNumber(entry.value) || !isFiniteNumber(entry.weight) || entry.weight <= 0) continue;
    const radians = (entry.value * Math.PI) / 180;
    sine += Math.sin(radians) * entry.weight;
    cosine += Math.cos(radians) * entry.weight;
    totalWeight += entry.weight;
  }
  if (totalWeight === 0 || Math.hypot(sine, cosine) < 1e-8) return null;
  return (((Math.atan2(sine, cosine) * 180) / Math.PI + 360) % 360 + 360) % 360;
}

function weightedWeatherCode(values: Array<{ value: unknown; weight: number }>): number | null {
  const totals = new Map<number, number>();
  for (const entry of values) {
    if (!isFiniteNumber(entry.value) || !isFiniteNumber(entry.weight) || entry.weight <= 0) continue;
    const code = Math.round(entry.value);
    totals.set(code, (totals.get(code) ?? 0) + entry.weight);
  }
  const winner = Array.from(totals.entries()).sort((left, right) => right[1] - left[1] || left[0] - right[0])[0];
  return winner?.[0] ?? null;
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

function makePoint(
  validAt: number,
  modelValues: HourlyModelValue[],
  weights: Map<OfficialHourlyModelName, number>,
  pointWeighting: HourlyPointWeighting,
  now: number,
): HourlyPoint | null {
  const parisTime = getParisDateAndHour(validAt);
  if (!parisTime) return null;
  const available = modelValues.filter(({ hour }) => hasForecastValue(hour));
  if (available.length === 0) return null;
  const entriesFor = (field: keyof HourlyModelForecast["hours"][number]) => available.map((model) => ({
    value: model.hour[field],
    weight: weights.get(model.modelName) ?? 0,
  }));
  const temperatureValues = available.map((model) => model.hour.temperature).filter(isFiniteNumber);
  const precipitation = weightedMean(entriesFor("precipitation"));
  const snowfall = weightedMean(entriesFor("snowfall"));
  const cloudCover = weightedMean(entriesFor("cloudCover"));
  const temperature = weightedMean(entriesFor("temperature"));
  const weatherCode = weightedWeatherCode(entriesFor("weatherCode"));
  const hasPrecipitation = (precipitation ?? 0) > 0 || (snowfall ?? 0) > 0;
  const validPrecipitation = available.map((model) => model.hour.precipitation).filter(isFiniteNumber);
  const precipAgreement = validPrecipitation.length > 0
    ? (validPrecipitation.filter((value) => value >= 0.1).length / validPrecipitation.length) * 100
    : null;
  const precipitationType = !hasPrecipitation
    ? null
    : (snowfall ?? 0) > 0
      ? "snow"
      : (temperature ?? 0) <= 0 ? "freezing_rain" : "rain";
  const precipitationIntensity = !hasPrecipitation
    ? null
    : (precipitation ?? 0) > 5 ? "heavy" : (precipitation ?? 0) > 1 ? "moderate" : "light";
  const condition = weatherCode != null
    ? conditionFromWmoWeatherCode(weatherCode, precipitation, cloudCover)
    : conditionFromWeatherValues(precipitation, cloudCover);
  const temperatureExtremes = available.flatMap((model) => isFiniteNumber(model.hour.temperature)
    ? [{ name: model.modelName, temperature: model.hour.temperature }]
    : []).sort((left, right) => left.temperature - right.temperature || left.name.localeCompare(right.name));
  const temperatureComparison = temperatureExtremes.length > 1
    ? {
        lower: temperatureExtremes[0],
        higher: temperatureExtremes[temperatureExtremes.length - 1],
        rationale: "Écart entre les modèles horaires indépendants; ce n’est pas un classement de fiabilité.",
      }
    : null;

  return {
    date: parisTime.date,
    hour: `${String(parisTime.hour).padStart(2, "0")}:00`,
    validAt,
    temp: temperature,
    apparentTemp: weightedMean(entriesFor("apparentTemperature")),
    precipitation,
    windSpeed: weightedMean(entriesFor("windSpeed")),
    windGust: weightedMean(entriesFor("windGusts")),
    windDirection: weightedCircularMean(entriesFor("windDirection")),
    cloudCover,
    humidity: weightedMean(entriesFor("humidity")),
    uvIndex: weightedMean(entriesFor("uvIndex")),
    condition,
    weatherCode,
    pressure: weightedMean(entriesFor("pressure")),
    dewPoint: weightedMean(entriesFor("dewPoint")),
    visibility: weightedMean(entriesFor("visibility")),
    solarRadiation: weightedMean(entriesFor("solarRadiation")),
    cloudLow: weightedMean(entriesFor("cloudLow")),
    cloudMid: weightedMean(entriesFor("cloudMid")),
    cloudHigh: weightedMean(entriesFor("cloudHigh")),
    precipType: precipitationType,
    precipIntensity: precipitationIntensity,
    tempSpread: numericRange(temperatureValues),
    windSpeedSpread: numericRange(available.map((model) => model.hour.windSpeed)),
    windGustSpread: numericRange(available.map((model) => model.hour.windGusts)),
    windDirectionDifference: maximumCircularSpread(available.map((model) => model.hour.windDirection)),
    humiditySpread: numericRange(available.map((model) => model.hour.humidity)),
    cloudCoverSpread: numericRange(available.map((model) => model.hour.cloudCover)),
    precipAgreement,
    modelCount: available.length,
    temperatureComparison,
    isCurrent: validAt <= now && now < validAt + 60 * 60_000,
    forecastWeighting: {
      ...pointWeighting,
      modelWeights: available.flatMap(({ modelName }) => {
        const weight = weights.get(modelName);
        return weight == null ? [] : [{ modelName, weight }];
      }),
    },
  };
}

/**
 * Produces one hourly point per absolute valid time from the seven named models.
 * For each existing horizon bucket it uses relative MAE only when every named
 * model meets the existing 30-comparison / 7-day evidence threshold. Otherwise
 * it marks and returns an equal-weight mean; Best Match is always excluded.
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
    const expectedModelId = MODEL_ID_BY_NAME.get(modelName);
    if (forecast.modelId !== expectedModelId) continue;
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
  const horizonStats = new Map<string, { horizonBucket: string | null; method: HourlyPointWeighting["method"]; fallbackReason: HourlyPointWeighting["fallbackReason"]; hourCount: number }>();

  for (const [validAt, modelMap] of Array.from(byValidTime.entries()).sort((left, right) => left[0] - right[0])) {
    const modelValues = Array.from(modelMap.values());
    if (modelValues.length === 0) continue;
    const availabilityTimes = modelValues.map((model) => model.availableAt).filter(isFiniteNumber);
    const officialAvailableAt = availabilityTimes.length > 0 ? Math.max(...availabilityTimes) : null;
    const horizonMinutes = officialAvailableAt == null ? null : Math.round((validAt - officialAvailableAt) / 60_000);
    const horizon = getPhase3HorizonWindow(horizonMinutes);
    const historyWeight = historyAvailable && horizon
      ? historicalWeights(historyAggregates, horizon.key)
      : {
          method: "equal_fallback" as const,
          fallbackReason: historyAvailable ? "horizon_not_scored" as const : "history_unavailable" as const,
          weights: new Map<OfficialHourlyModelName, number>(),
          scoredVariables: [] as string[],
          minimumComparisons: null,
          minimumComparableDays: null,
        };
    const availableModelNames = modelValues.map((model) => model.modelName);
    const weights = historyWeight.method === "historical_skill"
      ? normalizeWeights(new Map(availableModelNames.map((name) => [name, historyWeight.weights.get(name) ?? 0] as const)))
      : equalWeights(availableModelNames);
    const fallbackReason = historyWeight.fallbackReason
      ?? (historyWeight.method === "equal_fallback" ? "insufficient_historical_evidence" : null);
    const pointWeighting: HourlyPointWeighting = {
      method: historyWeight.method,
      horizonBucket: horizon?.key ?? null,
      fallbackReason,
      scoredVariables: historyWeight.scoredVariables,
      minimumComparisons: historyWeight.minimumComparisons,
      minimumComparableDays: historyWeight.minimumComparableDays,
      modelWeights: [],
    };
    const point = makePoint(validAt, modelValues, weights, pointWeighting, now);
    if (!point) continue;
    hours.push(point);

    const horizonKey = horizon?.key ?? "unsupported";
    const key = `${horizonKey}|${historyWeight.method}|${fallbackReason ?? ""}`;
    const statistic = horizonStats.get(key) ?? {
      horizonBucket: horizon?.key ?? null,
      method: historyWeight.method,
      fallbackReason,
      hourCount: 0,
    };
    statistic.hourCount++;
    horizonStats.set(key, statistic);
  }

  const methods = new Set(hours.map((hour) => hour.forecastWeighting?.method).filter(Boolean));
  const status: OfficialHourlyWeightingSummary["status"] = hours.length === 0
    ? "unavailable"
    : methods.size > 1
      ? "mixed"
      : methods.has("historical_skill") ? "historical_skill" : "equal_fallback";
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
      horizons: Array.from(horizonStats.values()),
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
    console.warn("[OfficialHourly] Historical scores unavailable; using equal weights:", error);
  }
  return {
    ...computeOfficialHourlyForecast(modelForecasts, historyScores, { historyAvailable }),
    modelForecasts,
  };
}
