import { getDailyFusionPerformanceEvidence, makeLocationKey } from "./db";
import { getParisDate, getParisHour } from "./weatherTime";
import { collect15DayForecast, collectCurrentWeatherSnapshot, type CurrentWeatherSnapshot, type DayForecast, type HourlyPoint } from "./weatherServices";
import { findActiveHourlyForecastIndex, keepCurrentAndFutureHourlyForecasts } from "../shared/hourlyForecastTime";
import { collectOfficialHourlyForecast, type OfficialHourlyWeightingSummary } from "./officialHourlyForecast";
import { computeOfficialDailyForecastWithDiagnostics } from "./officialForecast";
import type { PrecipitationModelConsensus } from "../shared/precipitationConsensus";
import type { ManualHourlyOverride } from "../shared/hourlyModelMetrics";

export type OfficialWeatherSnapshot = {
  locationKey: string;
  weatherDate: string;
  validAt: string | null;
  computedAt: string;
  hourlyComputedAt: string;
  sourceKind: "official_forecast";
  source: "open-meteo";
  hourlyWeighting: OfficialHourlyWeightingSummary;
  hourlyOverride: ManualHourlyOverride | null;
  officialHourlyOriginal: HourlyPoint[] | null;
  currentSnapshot: CurrentWeatherSnapshot | null;
  hourly: HourlyPoint[];
  daily: DayForecast[];
  modelsUsed: string[];
};

export type DatedDailyFusionFallback = {
  kind: "daily_fusion";
  date: string;
  computedAt: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  precipitationConsensus: PrecipitationModelConsensus | null;
  windSpeed: number | null;
  condition: string | null;
};

type DailyFusionSource = {
  date: string;
  computedAt: Date | string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  condition: string | null;
};

/**
 * Keeps a persisted daily fusion distinct from the live hourly forecast. The
 * caller must expose this object only when no hourly point is available.
 */
export function buildDatedDailyFusionFallback(
  source: DailyFusionSource | null | undefined,
  precipitationConsensus?: PrecipitationModelConsensus | null,
): DatedDailyFusionFallback | null {
  if (!source) return null;
  const computedAt = source.computedAt instanceof Date ? source.computedAt : new Date(source.computedAt);
  if (!Number.isFinite(computedAt.getTime())) return null;
  return {
    kind: "daily_fusion",
    date: source.date,
    computedAt: computedAt.toISOString(),
    tempMax: source.tempMax,
    tempMin: source.tempMin,
    precipitation: source.precipitation,
    precipitationConsensus: precipitationConsensus ?? null,
    windSpeed: source.windSpeed,
    condition: source.condition,
  };
}

type CacheEntry = { expiresAt: number; value: Promise<OfficialWeatherSnapshot> };
type ManualHourlyForecast = { expiresAt: number; hours: HourlyPoint[]; computedAt: string; weighting?: OfficialHourlyWeightingSummary; reason: string };
const snapshotCache = new Map<string, CacheEntry>();
const manualHourlyForecastCache = new Map<string, ManualHourlyForecast>();
const SNAPSHOT_TTL_MS = 2 * 60_000;
const EMPTY_HOURLY_SNAPSHOT_TTL_MS = 12_000;
const HOURLY_NUMERIC_COVERAGE_FIELDS = [
  "temp", "apparentTemp", "precipitation", "windSpeed", "windGust", "windDirection",
  "cloudCover", "humidity", "uvIndex", "weatherCode", "pressure", "dewPoint", "visibility",
  "solarRadiation", "cloudLow", "cloudMid", "cloudHigh",
] as const;

function hasHourlyValue(point: HourlyPoint): boolean {
  return HOURLY_NUMERIC_COVERAGE_FIELDS.some((field) => typeof point[field] === "number" && Number.isFinite(point[field]))
    || [point.condition, point.precipType, point.precipIntensity].some((value) => typeof value === "string" && value.trim() !== "");
}

/** A manual cache may update values, but must not erase a known exact-time field. */
export function isHourlyCoverageNonDecreasing(previous: readonly HourlyPoint[], next: readonly HourlyPoint[]): boolean {
  if (next.length === 0) return previous.length === 0;
  if (previous.length === 0) return next.some(hasHourlyValue);

  const nextByValidAt = new Map<number, HourlyPoint>();
  for (const point of next) {
    if (typeof point.validAt !== "number" || !Number.isFinite(point.validAt) || nextByValidAt.has(point.validAt)) return false;
    nextByValidAt.set(point.validAt, point);
  }
  for (const point of previous) {
    if (!hasHourlyValue(point)) continue;
    if (typeof point.validAt !== "number" || !Number.isFinite(point.validAt)) return false;
    const replacement = nextByValidAt.get(point.validAt);
    if (!replacement) return false;
    for (const field of HOURLY_NUMERIC_COVERAGE_FIELDS) {
      const previousValue = point[field];
      if (typeof previousValue === "number" && Number.isFinite(previousValue)
        && !(typeof replacement[field] === "number" && Number.isFinite(replacement[field]))) return false;
    }
    for (const field of ["condition", "precipType", "precipIntensity"] as const) {
      const previousValue = point[field];
      if (typeof previousValue === "string" && previousValue.trim() !== ""
        && !(typeof replacement[field] === "string" && replacement[field]!.trim() !== "")) return false;
    }
  }
  return true;
}

export function getOfficialSnapshotTtlMs(hourly: HourlyPoint[]): number {
  return hourly.length > 0 ? SNAPSHOT_TTL_MS : EMPTY_HOURLY_SNAPSHOT_TTL_MS;
}

export function buildOfficialWeatherSnapshot(input: {
  lat: number;
  lon: number;
  weatherDate: string;
  computedAt: Date;
  hourly: HourlyPoint[];
  currentSnapshot: CurrentWeatherSnapshot | null;
  hourlyWeighting: OfficialHourlyWeightingSummary;
  daily: DayForecast[];
  modelsUsed: string[];
  parisHour: string;
}): OfficialWeatherSnapshot {
  const hourly = keepCurrentAndFutureHourlyForecasts(input.hourly, input.computedAt.getTime());
  const currentForecast = hourly[findActiveHourlyForecastIndex(hourly, input.computedAt.getTime())]
    ?? hourly.find((hour) => hour.hour === `${input.parisHour}:00`)
    ?? hourly[0]
    ?? null;
  return {
    locationKey: makeLocationKey(input.lat, input.lon),
    weatherDate: input.weatherDate,
    validAt: currentForecast ? `${currentForecast.date ?? input.weatherDate}T${currentForecast.hour}` : null,
    computedAt: input.computedAt.toISOString(),
    hourlyComputedAt: input.computedAt.toISOString(),
    sourceKind: "official_forecast",
    source: "open-meteo",
    hourlyWeighting: input.hourlyWeighting,
    hourlyOverride: null,
    officialHourlyOriginal: null,
    currentSnapshot: input.currentSnapshot,
    hourly,
    daily: input.daily,
    modelsUsed: input.modelsUsed,
  };
}

export function refreshOfficialWeatherSnapshotForecastWindow(
  snapshot: OfficialWeatherSnapshot,
  nowMs = Date.now(),
): OfficialWeatherSnapshot {
  const hourly = keepCurrentAndFutureHourlyForecasts(snapshot.hourly, nowMs);
  const currentForecast = hourly[findActiveHourlyForecastIndex(hourly, nowMs)] ?? hourly[0] ?? null;
  return {
    ...snapshot,
    validAt: currentForecast ? `${currentForecast.date ?? snapshot.weatherDate}T${currentForecast.hour}` : null,
    hourly,
  };
}

/** Replace only forecast hours; the model current snapshot remains a separate object. */
export function mergeManualHourlyForecast(
  snapshot: OfficialWeatherSnapshot,
  hours: HourlyPoint[],
  computedAt: Date,
  weighting?: OfficialHourlyWeightingSummary,
  reason = "Relance manuelle explicite du moteur horaire officiel multi-modèles.",
): OfficialWeatherSnapshot {
  const currentHours = keepCurrentAndFutureHourlyForecasts(hours, computedAt.getTime());
  if (!isHourlyCoverageNonDecreasing(snapshot.hourly, currentHours)) return snapshot;
  const officialHourlyOriginal = snapshot.hourlyOverride
    ? snapshot.officialHourlyOriginal ?? snapshot.hourly
    : snapshot.hourly;
  const manualOverride: ManualHourlyOverride = {
    source: "manual_refresh",
    reason,
    computedAt: computedAt.toISOString(),
    officialOriginalComputedAt: snapshot.hourlyOverride?.officialOriginalComputedAt ?? snapshot.hourlyComputedAt,
    officialOriginalPreserved: true,
    officialOriginalPointCount: officialHourlyOriginal.length,
  };
  return {
    ...snapshot,
    hourly: currentHours,
    hourlyWeighting: { ...(weighting ?? snapshot.hourlyWeighting), manualOverride },
    hourlyOverride: manualOverride,
    officialHourlyOriginal,
    // The current snapshot has its own capturedAt; this timestamp belongs only to the hourly series.
    hourlyComputedAt: computedAt.toISOString(),
  };
}

function preciseCacheLocationKey(coords: { lat: number; lon: number }) {
  return `${makeLocationKey(coords.lat, coords.lon)}:${coords.lat.toString()}:${coords.lon.toString()}`;
}

export function getOfficialWeatherSnapshotCacheKey(
  coords: { lat: number; lon: number },
  weatherDate: string,
  hourBucket: number,
): string {
  return `${preciseCacheLocationKey(coords)}:${weatherDate}:${hourBucket}`;
}

function manualForecastCacheKey(cacheLocationKey: string, weatherDate: string) {
  return `${cacheLocationKey}:${weatherDate}`;
}

function applyManualHourlyForecast(snapshot: OfficialWeatherSnapshot, coords: { lat: number; lon: number }): OfficialWeatherSnapshot {
  const key = manualForecastCacheKey(preciseCacheLocationKey(coords), snapshot.weatherDate);
  const cached = manualHourlyForecastCache.get(key);
  if (!cached) return snapshot;
  if (cached.expiresAt <= Date.now()) {
    manualHourlyForecastCache.delete(key);
    return snapshot;
  }
  return mergeManualHourlyForecast(snapshot, cached.hours, new Date(cached.computedAt), cached.weighting, cached.reason);
}

/** Cache a completed manual forecast refresh while preserving the official current snapshot. */
export function cacheManualHourlyForecast(
  coords: { lat: number; lon: number },
  weatherDate: string,
  hours: HourlyPoint[],
  computedAt: Date,
  weighting?: OfficialHourlyWeightingSummary,
  reason = "Relance manuelle explicite du moteur horaire officiel multi-modèles.",
): void {
  if (hours.length === 0 || hours.some((hour) => typeof hour.validAt !== "number" || !Number.isFinite(hour.validAt))) return;
  const cacheLocationKey = preciseCacheLocationKey(coords);
  const manualKey = manualForecastCacheKey(cacheLocationKey, weatherDate);
  const expiresAt = Date.now() + getOfficialSnapshotTtlMs(hours);
  manualHourlyForecastCache.set(manualKey, { expiresAt, hours, computedAt: computedAt.toISOString(), weighting, reason });

  const snapshotPrefix = `${cacheLocationKey}:${weatherDate}:`;
  snapshotCache.forEach((cached, cacheKey) => {
    if (!cacheKey.startsWith(snapshotPrefix)) return;
    if (cached.expiresAt <= Date.now()) {
      snapshotCache.delete(cacheKey);
      return;
    }
    const value = cached.value.then((snapshot: OfficialWeatherSnapshot) => mergeManualHourlyForecast(snapshot, hours, computedAt, weighting, reason));
    snapshotCache.set(cacheKey, { expiresAt, value });
    void value.catch(() => {
      if (snapshotCache.get(cacheKey)?.value === value) snapshotCache.delete(cacheKey);
    });
  });
  manualHourlyForecastCache.forEach((value, key) => {
    if (value.expiresAt <= Date.now()) manualHourlyForecastCache.delete(key);
  });
}

/**
 * Returns the authoritative live forecast snapshot for a location. Calls made
 * within one minute share one payload, preventing presentation-level drift.
 */
export function resolveOfficialWeatherSnapshot(coords: { lat: number; lon: number }): Promise<OfficialWeatherSnapshot> {
  const weatherDate = getParisDate();
  const cacheKey = getOfficialWeatherSnapshotCacheKey(coords, weatherDate, Math.floor(Date.now() / (60 * 60_000)));
  const cached = snapshotCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value.then((snapshot) => refreshOfficialWeatherSnapshotForecastWindow(snapshot, Date.now()));
  }

  const value = (async () => {
    const dailyIssuedAt = Date.now();
    const dailyLocationKey = makeLocationKey(coords.lat, coords.lon);
    const [hourlyResult, currentSnapshot, dailyResult] = await Promise.all([
      collectOfficialHourlyForecast(weatherDate, coords),
      collectCurrentWeatherSnapshot(coords),
      collect15DayForecast(coords, {
        issuedAt: dailyIssuedAt,
        resolveOfficialFusion: async (targetDate, forecasts, referenceAt, availabilityReasonByModel) => {
          const fusionEvidence = await getDailyFusionPerformanceEvidence(
            dailyLocationKey,
            targetDate,
            forecasts.flatMap((forecast) => forecast.availableAt == null ? [] : [forecast.availableAt]),
          );
          return computeOfficialDailyForecastWithDiagnostics(forecasts, {
            locationKey: dailyLocationKey,
            targetDate,
            issuedAt: referenceAt,
            referenceAt,
            evidenceStoreAvailable: fusionEvidence.available,
            evidence: fusionEvidence.evidence,
            availabilityReasonByModel,
          });
        },
      }),
    ]);
    return applyManualHourlyForecast(buildOfficialWeatherSnapshot({
      lat: coords.lat,
      lon: coords.lon,
      weatherDate,
      computedAt: new Date(),
      hourly: hourlyResult.hours,
      currentSnapshot,
      hourlyWeighting: hourlyResult.weighting,
      daily: dailyResult.days,
      modelsUsed: dailyResult.modelsUsed,
      parisHour: String(getParisHour()).padStart(2, "0"),
    }), coords);
  })().then((snapshot) => refreshOfficialWeatherSnapshotForecastWindow(snapshot, Date.now()));
  snapshotCache.set(cacheKey, { expiresAt: Date.now() + SNAPSHOT_TTL_MS, value });
  void value.then((snapshot) => {
    const current = snapshotCache.get(cacheKey);
    if (current?.value === value) {
      current.expiresAt = Date.now() + getOfficialSnapshotTtlMs(snapshot.hourly);
    }
  });
  void value.catch(() => {
    const current = snapshotCache.get(cacheKey);
    if (current?.value === value) snapshotCache.delete(cacheKey);
  });
  return value;
}
