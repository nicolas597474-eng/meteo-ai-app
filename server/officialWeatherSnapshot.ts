import { makeLocationKey } from "./db";
import { getParisDate, getParisHour } from "./weatherTime";
import { collect15DayForecast, collectCurrentWeatherSnapshot, type CurrentWeatherSnapshot, type DayForecast, type HourlyPoint } from "./weatherServices";
import { findActiveHourlyForecastIndex, keepCurrentAndFutureHourlyForecasts } from "../shared/hourlyForecastTime";
import { collectOfficialHourlyForecast, type OfficialHourlyWeightingSummary } from "./officialHourlyForecast";
import type { PrecipitationModelConsensus } from "../shared/precipitationConsensus";

export type OfficialWeatherSnapshot = {
  locationKey: string;
  weatherDate: string;
  validAt: string | null;
  computedAt: string;
  hourlyComputedAt: string;
  sourceKind: "official_forecast";
  source: "open-meteo";
  hourlyWeighting: OfficialHourlyWeightingSummary;
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
type ManualHourlyForecast = { expiresAt: number; hours: HourlyPoint[]; computedAt: string; weighting?: OfficialHourlyWeightingSummary };
const snapshotCache = new Map<string, CacheEntry>();
const manualHourlyForecastCache = new Map<string, ManualHourlyForecast>();
const SNAPSHOT_TTL_MS = 2 * 60_000;
const EMPTY_HOURLY_SNAPSHOT_TTL_MS = 12_000;

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
): OfficialWeatherSnapshot {
  return {
    ...snapshot,
    hourly: keepCurrentAndFutureHourlyForecasts(hours, computedAt.getTime()),
    hourlyWeighting: weighting ?? snapshot.hourlyWeighting,
    // The current snapshot has its own capturedAt; this timestamp belongs only to the hourly series.
    hourlyComputedAt: computedAt.toISOString(),
  };
}

function manualForecastCacheKey(locationKey: string, weatherDate: string) {
  return `${locationKey}:${weatherDate}`;
}

function applyManualHourlyForecast(snapshot: OfficialWeatherSnapshot): OfficialWeatherSnapshot {
  const key = manualForecastCacheKey(snapshot.locationKey, snapshot.weatherDate);
  const cached = manualHourlyForecastCache.get(key);
  if (!cached) return snapshot;
  if (cached.expiresAt <= Date.now()) {
    manualHourlyForecastCache.delete(key);
    return snapshot;
  }
  return mergeManualHourlyForecast(snapshot, cached.hours, new Date(cached.computedAt), cached.weighting);
}

/** Cache a completed manual forecast refresh while preserving the official current snapshot. */
export function cacheManualHourlyForecast(
  coords: { lat: number; lon: number },
  weatherDate: string,
  hours: HourlyPoint[],
  computedAt: Date,
  weighting?: OfficialHourlyWeightingSummary,
): void {
  const locationKey = makeLocationKey(coords.lat, coords.lon);
  const manualKey = manualForecastCacheKey(locationKey, weatherDate);
  const expiresAt = Date.now() + getOfficialSnapshotTtlMs(hours);
  manualHourlyForecastCache.set(manualKey, { expiresAt, hours, computedAt: computedAt.toISOString(), weighting });

  const snapshotPrefix = `${locationKey}:${weatherDate}:`;
  snapshotCache.forEach((cached, cacheKey) => {
    if (!cacheKey.startsWith(snapshotPrefix)) return;
    if (cached.expiresAt <= Date.now()) {
      snapshotCache.delete(cacheKey);
      return;
    }
    const value = cached.value.then((snapshot: OfficialWeatherSnapshot) => mergeManualHourlyForecast(snapshot, hours, computedAt, weighting));
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
  const locationKey = makeLocationKey(coords.lat, coords.lon);
  const cacheKey = `${locationKey}:${getParisDate()}:${Math.floor(Date.now() / (60 * 60_000))}`;
  const cached = snapshotCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value.then((snapshot) => refreshOfficialWeatherSnapshotForecastWindow(snapshot, Date.now()));
  }

  const value = (async () => {
    const weatherDate = getParisDate();
    const [hourlyResult, currentSnapshot, dailyResult] = await Promise.all([
      collectOfficialHourlyForecast(weatherDate, coords),
      collectCurrentWeatherSnapshot(coords),
      collect15DayForecast(coords),
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
    }));
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
