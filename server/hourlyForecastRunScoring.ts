import { getPhase3HorizonWindow, PHASE3_HORIZON_WINDOWS } from "../shared/weatherDataHub";
import { scoreQualifiedHourlyModels, type QualifiedHourlyModelScore } from "./qualifiedHourlyScoring";
import { parisLocalHourToUniqueEpochMs } from "./parisHourlyTime";

export const HOURLY_FORECAST_VARIABLES = [
  "temperature",
  "precipitation",
  "wind_speed",
  "wind_gust",
  "humidity",
  "pressure",
] as const;
export type HourlyForecastVariable = (typeof HOURLY_FORECAST_VARIABLES)[number];

export function isHourlyForecastVariable(value: string): value is HourlyForecastVariable {
  return (HOURLY_FORECAST_VARIABLES as readonly string[]).includes(value);
}

export type HourlyForecastRunValue = {
  captureRunId: string;
  locationKey: string;
  targetDate: string;
  sourceName: string;
  modelName: string;
  modelId: string | null;
  requestStartedAt: number;
  availableAt: number;
  validTime: number;
  variable: HourlyForecastVariable;
  value: number | null;
  unit: string | null;
};

export type HourlyPhysicalSnapshot = {
  locationKey: string;
  date: string;
  hour: number;
  stationCount: number;
  temperature: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust?: number | null;
  humidity?: number | null;
  pressure?: number | null;
};

export type HourlyForecastRunScore = {
  locationKey: string;
  date: string;
  sourceName: string;
  modelName: string;
  modelId: string | null;
  variable: HourlyForecastVariable;
  horizonBucket: string;
  observationCount: number;
  evaluableObservationCount: number;
  sampleSize: number;
  coverageRatio: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
};

export type HourlyForecastRunEvaluation = {
  scores: HourlyForecastRunScore[];
  compatibilityScores: QualifiedHourlyModelScore[];
};

type ModelDescriptor = Pick<HourlyForecastRunValue, "locationKey" | "targetDate" | "sourceName" | "modelName" | "modelId">;
type ObservationOpportunity = {
  snapshot: HourlyPhysicalSnapshot;
  validTime: number | null;
  observedValue: number;
};

type ForecastRunGroup = {
  captureRunId: string;
  requestStartedAt: number;
  availableAt: number;
  byVariable: Map<HourlyForecastVariable, HourlyForecastRunValue>;
};

function modelKey(value: ModelDescriptor): string {
  return [value.locationKey, value.targetDate, value.sourceName, value.modelName, value.modelId ?? ""].join("|");
}

function forecastSeriesKey(value: Pick<HourlyForecastRunValue, "locationKey" | "targetDate" | "sourceName" | "modelName" | "modelId" | "validTime" | "variable">): string {
  return [modelKey(value), value.validTime, value.variable].join("|");
}

function observationValue(snapshot: HourlyPhysicalSnapshot, variable: HourlyForecastVariable): number | null {
  const values: Record<HourlyForecastVariable, number | null | undefined> = {
    temperature: snapshot.temperature,
    precipitation: snapshot.precipitation,
    wind_speed: snapshot.windSpeed,
    wind_gust: snapshot.windGust,
    humidity: snapshot.humidity,
    pressure: snapshot.pressure,
  };
  const value = values[variable];
  return value != null && Number.isFinite(value) ? value : null;
}

function equalNullableNumber(left: number | null | undefined, right: number | null | undefined): boolean {
  return (left == null && right == null) || (left != null && right != null && Object.is(left, right));
}

/** Deduplicates exact replays and excludes conflicting duplicates for the same immutable run value. */
function deduplicateRunValues(values: HourlyForecastRunValue[]): HourlyForecastRunValue[] {
  const groups = new Map<string, HourlyForecastRunValue[]>();
  for (const value of values) {
    if (!Number.isFinite(value.validTime) || !Number.isFinite(value.availableAt) || !Number.isFinite(value.requestStartedAt)) continue;
    const key = `${forecastSeriesKey(value)}|${value.captureRunId}`;
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  const result: HourlyForecastRunValue[] = [];
  for (const duplicates of Array.from(groups.values())) {
    const first = duplicates[0];
    const identical = duplicates.every((item) => item.availableAt === first.availableAt
      && item.requestStartedAt === first.requestStartedAt
      && item.unit === first.unit
      && equalNullableNumber(item.value, first.value));
    if (identical) result.push(first);
  }
  return result;
}

function uniqueSnapshots(snapshots: HourlyPhysicalSnapshot[]): HourlyPhysicalSnapshot[] {
  const groups = new Map<string, HourlyPhysicalSnapshot[]>();
  for (const snapshot of snapshots) {
    if (!Number.isInteger(snapshot.hour) || snapshot.hour < 0 || snapshot.hour > 23 || snapshot.stationCount <= 0) continue;
    const key = `${snapshot.locationKey}|${snapshot.date}|${snapshot.hour}`;
    groups.set(key, [...(groups.get(key) ?? []), snapshot]);
  }
  const result: HourlyPhysicalSnapshot[] = [];
  for (const duplicates of Array.from(groups.values())) {
    const first = duplicates[0];
    const identical = duplicates.every((item) => item.stationCount === first.stationCount
      && (HOURLY_FORECAST_VARIABLES.every((variable) => equalNullableNumber(observationValue(item, variable), observationValue(first, variable)))));
    if (identical) result.push(first);
  }
  return result;
}

function descriptorOf(value: HourlyForecastRunValue): ModelDescriptor {
  return {
    locationKey: value.locationKey,
    targetDate: value.targetDate,
    sourceName: value.sourceName,
    modelName: value.modelName,
    modelId: value.modelId,
  };
}

function latestAdmissibleValue(
  candidates: HourlyForecastRunValue[],
  observationAt: number,
): HourlyForecastRunValue | null {
  const admissible = candidates.filter((candidate) => candidate.availableAt < observationAt
    && candidate.value != null && Number.isFinite(candidate.value));
  if (admissible.length === 0) return null;
  admissible.sort((left, right) => right.availableAt - left.availableAt
    || right.requestStartedAt - left.requestStartedAt
    || left.captureRunId.localeCompare(right.captureRunId));
  const latest = admissible[0];
  const tied = admissible.filter((candidate) => candidate.availableAt === latest.availableAt
    && candidate.requestStartedAt === latest.requestStartedAt);
  if (tied.some((candidate) => !equalNullableNumber(candidate.value, latest.value))) return null;
  return latest;
}

function latestAdmissibleRun(
  candidates: HourlyForecastRunValue[],
  observationAt: number,
): HourlyForecastRunValue | null {
  const admissible = candidates.filter((candidate) => candidate.availableAt < observationAt);
  if (admissible.length === 0) return null;
  admissible.sort((left, right) => right.availableAt - left.availableAt
    || right.requestStartedAt - left.requestStartedAt
    || left.captureRunId.localeCompare(right.captureRunId));
  const latest = admissible[0];
  const tied = admissible.filter((candidate) => candidate.availableAt === latest.availableAt
    && candidate.requestStartedAt === latest.requestStartedAt);
  if (tied.some((candidate) => !equalNullableNumber(candidate.value, latest.value))) return null;
  return latest;
}

function latestCompatibleRun(
  rows: HourlyForecastRunValue[],
  observationAt: number,
): ForecastRunGroup | null {
  const byRun = new Map<string, ForecastRunGroup>();
  for (const row of rows) {
    if (row.availableAt >= observationAt) continue;
    let run = byRun.get(row.captureRunId);
    if (!run) {
      run = { captureRunId: row.captureRunId, requestStartedAt: row.requestStartedAt, availableAt: row.availableAt, byVariable: new Map() };
      byRun.set(row.captureRunId, run);
    }
    if (row.availableAt !== run.availableAt || row.requestStartedAt !== run.requestStartedAt) continue;
    run.byVariable.set(row.variable, row);
  }
  const candidates = Array.from(byRun.values()).filter((run) => {
    const temperature = run.byVariable.get("temperature");
    return temperature?.value != null && Number.isFinite(temperature.value);
  });
  candidates.sort((left, right) => right.availableAt - left.availableAt
    || right.requestStartedAt - left.requestStartedAt
    || left.captureRunId.localeCompare(right.captureRunId));
  if (candidates.length === 0) return null;
  const latest = candidates[0];
  const tied = candidates.filter((run) => run.availableAt === latest.availableAt && run.requestStartedAt === latest.requestStartedAt);
  if (tied.length > 1) {
    const signature = (run: ForecastRunGroup) => HOURLY_FORECAST_VARIABLES
      .map((variable) => run.byVariable.get(variable)?.value ?? null)
      .join("|");
    if (tied.some((run) => signature(run) !== signature(latest))) return null;
  }
  return latest;
}

function calculateErrors(errors: number[]) {
  if (errors.length === 0) return { mae: null, rmse: null, bias: null };
  return {
    mae: errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length,
    rmse: Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length),
    bias: errors.reduce((sum, error) => sum + error, 0) / errors.length,
  };
}

/**
 * Evaluates immutable hourly forecast snapshots against qualified physical observations.
 * A forecast is admissible only when availableAt is strictly before the observation;
 * among admissible values, the most recently received non-missing value is selected.
 */
export function evaluateHourlyForecastRuns(
  snapshotsInput: HourlyPhysicalSnapshot[],
  forecastValuesInput: HourlyForecastRunValue[],
): HourlyForecastRunEvaluation {
  const snapshots = uniqueSnapshots(snapshotsInput);
  const forecastValues = deduplicateRunValues(forecastValuesInput);
  const valuesBySeries = new Map<string, HourlyForecastRunValue[]>();
  const models = new Map<string, ModelDescriptor>();
  for (const value of forecastValues) {
    const descriptor = descriptorOf(value);
    models.set(modelKey(descriptor), descriptor);
    const key = forecastSeriesKey(value);
    valuesBySeries.set(key, [...(valuesBySeries.get(key) ?? []), value]);
  }

  const scores: HourlyForecastRunScore[] = [];
  const compatibilityForecasts: Array<{
    modelName: string;
    hour: number;
    temperature: number | null;
    precipitation: number | null;
    windSpeed: number | null;
    windGusts: number | null;
    humidity: number | null;
    pressure: number | null;
  }> = [];
  const compatibilitySnapshots: HourlyPhysicalSnapshot[] = [];

  for (const snapshot of snapshots) {
    const observationAt = parisLocalHourToUniqueEpochMs(snapshot.date, snapshot.hour);
    if (observationAt == null) continue;
    const matchingModels = Array.from(models.values()).filter((model) => model.locationKey === snapshot.locationKey && model.targetDate === snapshot.date);
    for (const model of matchingModels) {
      const validRows = forecastValues.filter((row) => modelKey(descriptorOf(row)) === modelKey(model) && row.validTime === observationAt);
      const compatibleRun = latestCompatibleRun(validRows, observationAt);
      if (!compatibleRun) continue;
      const get = (variable: HourlyForecastVariable) => compatibleRun.byVariable.get(variable)?.value ?? null;
      compatibilityForecasts.push({
        modelName: model.modelName,
        hour: snapshot.hour,
        temperature: get("temperature"),
        precipitation: get("precipitation"),
        windSpeed: get("wind_speed"),
        windGusts: get("wind_gust"),
        humidity: get("humidity"),
        pressure: get("pressure"),
      });
      if (snapshot.temperature != null && Number.isFinite(snapshot.temperature)) compatibilitySnapshots.push(snapshot);
    }
  }

  for (const model of Array.from(models.values())) {
    const modelSnapshots = snapshots.filter((snapshot) => snapshot.locationKey === model.locationKey && snapshot.date === model.targetDate);
    for (const variable of HOURLY_FORECAST_VARIABLES) {
      const opportunities: ObservationOpportunity[] = modelSnapshots.flatMap((snapshot) => {
        const observedValue = observationValue(snapshot, variable);
        if (observedValue == null) return [];
        return [{ snapshot, validTime: parisLocalHourToUniqueEpochMs(snapshot.date, snapshot.hour), observedValue }];
      });
      const observedOpportunities = opportunities.filter((opportunity) => opportunity.validTime != null);
      const errorsByHorizon = new Map<string, number[]>();
      const evaluableObservationCountsByHorizon = new Map<string, number>();
      for (const opportunity of observedOpportunities) {
        const validTime = opportunity.validTime!;
        const key = forecastSeriesKey({ ...model, validTime, variable });
        const candidates = valuesBySeries.get(key) ?? [];
        const selected = latestAdmissibleValue(candidates, validTime);
        // A recorded exact-time run with a missing variable is an availability
        // opportunity, but no run at this validTime (e.g. outside model scope)
        // is excluded from both this ratio and every error-score denominator.
        const opportunityRun = selected ?? latestAdmissibleRun(candidates, validTime);
        if (!opportunityRun) continue;
        const horizonMinutes = Math.round((validTime - opportunityRun.availableAt) / 60_000);
        const horizon = getPhase3HorizonWindow(horizonMinutes);
        if (!horizon) continue;
        evaluableObservationCountsByHorizon.set(horizon.key, (evaluableObservationCountsByHorizon.get(horizon.key) ?? 0) + 1);
        if (!selected) continue;
        const errors = errorsByHorizon.get(horizon.key) ?? [];
        errors.push(selected.value! - opportunity.observedValue);
        errorsByHorizon.set(horizon.key, errors);
      }
      for (const horizon of PHASE3_HORIZON_WINDOWS) {
        const errors = errorsByHorizon.get(horizon.key) ?? [];
        const evaluableObservationCount = evaluableObservationCountsByHorizon.get(horizon.key) ?? 0;
        scores.push({
          locationKey: model.locationKey,
          date: model.targetDate,
          sourceName: model.sourceName,
          modelName: model.modelName,
          modelId: model.modelId,
          variable,
          horizonBucket: horizon.key,
          observationCount: opportunities.length,
          // The denominator contains only immutable forecast values from runs that
          // existed before this exact validTime. Missing/out-of-scope runs never count.
          evaluableObservationCount,
          sampleSize: errors.length,
          coverageRatio: evaluableObservationCount > 0 ? errors.length / evaluableObservationCount : 0,
          ...calculateErrors(errors),
        });
      }
    }
  }

  const serviceNameCounts = new Map<string, number>();
  for (const model of Array.from(models.values())) serviceNameCounts.set(model.modelName, (serviceNameCounts.get(model.modelName) ?? 0) + 1);
  const legacyForecasts = compatibilityForecasts.map((forecast) => ({
    ...forecast,
    modelName: (serviceNameCounts.get(forecast.modelName) ?? 0) > 1 ? `${forecast.modelName} (${forecast.modelName})` : forecast.modelName,
  }));
  const compatibilityScores = scoreQualifiedHourlyModels(compatibilitySnapshots, legacyForecasts);
  return { scores, compatibilityScores };
}
