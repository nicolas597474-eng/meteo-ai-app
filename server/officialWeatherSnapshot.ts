import { getMeteoAIForecastByDate, makeLocationKey } from "./db";
import { getParisDate, getParisHour } from "./weatherTime";
import { collect15DayForecast, collectHourlyForecast, type DayForecast, type HourlyPoint } from "./weatherServices";

export type OfficialWeatherSnapshot = {
  locationKey: string;
  weatherDate: string;
  validAt: string | null;
  computedAt: string;
  sourceKind: "official_forecast" | "persisted_fallback" | "unavailable";
  source: "open-meteo_best_match" | "stored_meteoai" | "no_live_data";
  current: HourlyPoint | null;
  hourly: HourlyPoint[];
  daily: DayForecast[];
  modelsUsed: string[];
};

type CacheEntry = { expiresAt: number; value: Promise<OfficialWeatherSnapshot> };
const snapshotCache = new Map<string, CacheEntry>();
const SNAPSHOT_TTL_MS = 2 * 60_000;
const EMPTY_HOURLY_SNAPSHOT_TTL_MS = 12_000;
const SNAPSHOT_DEADLINE_MS = 12_000;

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
const withDeadline = async <T>(work: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`Délai de collecte dépassé après ${timeoutMs} ms`)), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const buildPersistentFallback = async (coords: { lat: number; lon: number }, weatherDate: string): Promise<OfficialWeatherSnapshot> => {
  const locationKey = makeLocationKey(coords.lat, coords.lon);
  const stored = await getMeteoAIForecastByDate(weatherDate, locationKey);
  if (!stored) return { locationKey, weatherDate, validAt: null, computedAt: new Date().toISOString(), sourceKind: "unavailable", source: "no_live_data", current: null, hourly: [], daily: [], modelsUsed: [] };
  return { locationKey, weatherDate, validAt: null, computedAt: stored.computedAt.toISOString(), sourceKind: "persisted_fallback", source: "stored_meteoai", current: null, hourly: [], daily: [{ date: stored.date, tempMax: stored.tempMax, tempMin: stored.tempMin, precipitation: stored.precipitation, windSpeed: stored.windSpeed, windGust: null, humidity: null, cloudCover: null, condition: stored.condition, stabilityIndex: stored.stabilityIndex ?? 0, stabilityLabel: stored.stabilityIndex == null ? "données insuffisantes" : stored.stabilityLabel }], modelsUsed: [] };
};

export function resolveOfficialWeatherSnapshot(coords: { lat: number; lon: number }): Promise<OfficialWeatherSnapshot> {
  const locationKey = makeLocationKey(coords.lat, coords.lon);
  const cacheKey = `${locationKey}:${getParisDate()}:${getParisHour()}`;
  const cached = snapshotCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = (async () => {
    const weatherDate = getParisDate();
    try {
      const [hourly, dailyResult] = await withDeadline(Promise.all([
        collectHourlyForecast(weatherDate, coords),
        collect15DayForecast(coords),
      ]), SNAPSHOT_DEADLINE_MS);
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
    } catch (error) {
      console.warn("[OfficialSnapshot] Collecte live indisponible, repli persistant activé:", error);
      return buildPersistentFallback(coords, weatherDate);
    }
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
