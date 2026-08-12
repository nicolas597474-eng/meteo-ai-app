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

type CacheEntry = { expiresAt: number; value: Promise<OfficialWeatherSnapshot> };
const snapshotCache = new Map<string, CacheEntry>();
const SNAPSHOT_TTL_MS = 60_000;

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
  return value;
}
