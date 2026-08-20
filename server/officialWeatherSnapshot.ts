import { makeLocationKey } from "./db";
import { getParisDate, getParisHour } from "./weatherTime";
import { collect15DayForecast, collectHourlyForecast, type DayForecast, type HourlyPoint } from "./weatherServices";

export type OfficialWeatherSnapshot = {
  locationKey: string;
  weatherDate: string;
  validAt: string | null;
  computedAt: string;
  sourceKind: "official_forecast";
  source: "open-meteo_best_match";
  current: HourlyPoint | null;
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
  windSpeed: number | null;
  condition: string | null;
  confidenceScore: number | null;
};

type DailyFusionSource = {
  date: string;
  computedAt: Date | string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  condition: string | null;
  confidenceScore: number | null;
};

/**
 * Keeps a persisted daily fusion distinct from the live hourly forecast. The
 * caller must expose this object only when no hourly point is available.
 */
export function buildDatedDailyFusionFallback(source: DailyFusionSource | null | undefined): DatedDailyFusionFallback | null {
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
    windSpeed: source.windSpeed,
    condition: source.condition,
    confidenceScore: source.confidenceScore,
  };
}

type CacheEntry = { expiresAt: number; value: Promise<OfficialWeatherSnapshot> };
const snapshotCache = new Map<string, CacheEntry>();
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
  daily: DayForecast[];
  modelsUsed: string[];
  parisHour: string;
}): OfficialWeatherSnapshot {
  const current = input.hourly.find((hour) => hour.hour === `${input.parisHour}:00`) ?? input.hourly[0] ?? null;
  return {
    locationKey: makeLocationKey(input.lat, input.lon),
    weatherDate: input.weatherDate,
    validAt: current ? `${input.weatherDate}T${current.hour}` : null,
    computedAt: input.computedAt.toISOString(),
    sourceKind: "official_forecast",
    source: "open-meteo_best_match",
    current,
    hourly: input.hourly,
    daily: input.daily,
    modelsUsed: input.modelsUsed,
  };
}

/**
 * Returns the authoritative live forecast snapshot for a location. Calls made
 * within one minute share one payload, preventing presentation-level drift.
 */
export function resolveOfficialWeatherSnapshot(coords: { lat: number; lon: number }): Promise<OfficialWeatherSnapshot> {
  const locationKey = makeLocationKey(coords.lat, coords.lon);
  const cacheKey = `${locationKey}:${getParisDate()}:${getParisHour()}`;
  const cached = snapshotCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = (async () => {
    const weatherDate = getParisDate();
    const [hourly, dailyResult] = await Promise.all([
      collectHourlyForecast(weatherDate, coords),
      collect15DayForecast(coords),
    ]);
    return buildOfficialWeatherSnapshot({
      lat: coords.lat,
      lon: coords.lon,
      weatherDate,
      computedAt: new Date(),
      hourly,
      daily: dailyResult.days,
      modelsUsed: dailyResult.modelsUsed,
      parisHour: String(getParisHour()).padStart(2, "0"),
    });
  })();
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
