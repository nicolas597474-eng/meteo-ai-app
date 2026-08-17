import { fetchWeather } from "./weatherFetch";
import { getMoonPosition, getPosition } from "suncalc";

export type AqiDescriptor = {
  label: string;
  tone: "emerald" | "lime" | "amber" | "orange" | "rose" | "slate";
};

export function getEuropeanAqiDescriptor(value: number | null): AqiDescriptor {
  if (value == null || !Number.isFinite(value)) return { label: "Indisponible", tone: "slate" };
  if (value <= 20) return { label: "Bon", tone: "emerald" };
  if (value <= 40) return { label: "Acceptable", tone: "lime" };
  if (value <= 60) return { label: "Moyen", tone: "amber" };
  if (value <= 80) return { label: "Mauvais", tone: "orange" };
  if (value <= 100) return { label: "Très mauvais", tone: "rose" };
  return { label: "Extrêmement mauvais", tone: "rose" };
}

export function getMoonPhaseDescriptor(value: number | null) {
  if (value == null || !Number.isFinite(value)) return { label: "Phase indisponible", symbol: "○" };
  const phase = ((value % 1) + 1) % 1;
  if (phase < 0.03 || phase >= 0.97) return { label: "Nouvelle lune", symbol: "●" };
  if (phase < 0.22) return { label: "Premier croissant", symbol: "◔" };
  if (phase < 0.28) return { label: "Premier quartier", symbol: "◐" };
  if (phase < 0.47) return { label: "Gibbeuse croissante", symbol: "◕" };
  if (phase < 0.53) return { label: "Pleine lune", symbol: "●" };
  if (phase < 0.72) return { label: "Gibbeuse décroissante", symbol: "◕" };
  if (phase < 0.78) return { label: "Dernier quartier", symbol: "◐" };
  return { label: "Dernier croissant", symbol: "◔" };
}

export function getMoonIllumination(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(50 * (1 - Math.cos(Math.PI * 2 * value)));
}

export function roundAltitudeDegrees(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toMinutes(time: string | null | undefined) {
  const match = time?.match(/T(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function getMinutesInTimeZone(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function resolveTimeZone(value: unknown) {
  if (typeof value !== "string") return "UTC";
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

function calculateDayProgress(sunrise: string | null, sunset: string | null, timeZone: string) {
  const start = toMinutes(sunrise);
  const end = toMinutes(sunset);
  if (start == null || end == null || end <= start) return null;
  return Math.max(0, Math.min(1, (getMinutesInTimeZone(timeZone) - start) / (end - start)));
}

async function fetchJson(url: URL) {
  const response = await fetchWeather(url, {}, { timeoutMs: 5_000, attempts: 2 });
  if (!response.ok) throw new Error(`Source environnementale indisponible (HTTP ${response.status}).`);
  return response.json() as Promise<Record<string, any>>;
}

export type EnvironmentalSnapshot = {
  air: {
    aqi: number | null;
    descriptor: AqiDescriptor;
    pm25: number | null;
    pm10: number | null;
    nitrogenDioxide: number | null;
    ozone: number | null;
    observedAt: string | null;
    hourly: Array<{ time: string; value: number }>;
  } | null;
  astronomy: {
    sunrise: string | null;
    sunset: string | null;
    daylightDurationSeconds: number | null;
    moonrise: string | null;
    moonset: string | null;
    moonPhase: number | null;
    moon: ReturnType<typeof getMoonPhaseDescriptor>;
    moonIllumination: number | null;
    dayProgress: number | null;
    sunAltitudeDeg: number | null;
    moonAltitudeDeg: number | null;
    altitudeCalculatedAt: string;
    timezone: string;
  } | null;
  source: "Open-Meteo / CAMS";
  timezone: string;
};

const snapshotCache = new Map<string, { expiresAt: number; value: EnvironmentalSnapshot }>();

export async function getEnvironmentalSnapshot(coords: { lat: number; lon: number }): Promise<EnvironmentalSnapshot> {
  const key = `${coords.lat.toFixed(3)},${coords.lon.toFixed(3)}`;
  const cached = snapshotCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.search = new URLSearchParams({
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    daily: "sunrise,sunset,daylight_duration,moonrise,moonset,moon_phase",
    forecast_days: "1",
    timezone: "auto",
  }).toString();

  const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  airUrl.search = new URLSearchParams({
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    current: "european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone",
    hourly: "european_aqi",
    forecast_hours: "24",
    timezone: "auto",
  }).toString();

  const [weatherResult, airResult] = await Promise.allSettled([fetchJson(weatherUrl), fetchJson(airUrl)]);
  const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
  const airResponse = airResult.status === "fulfilled" ? airResult.value : null;
  const timezone = resolveTimeZone(weather?.timezone ?? airResponse?.timezone);

  const daily = weather?.daily ?? null;
  const sunrise = typeof daily?.sunrise?.[0] === "string" ? daily.sunrise[0] : null;
  const sunset = typeof daily?.sunset?.[0] === "string" ? daily.sunset[0] : null;
  const moonPhase = asNumber(daily?.moon_phase?.[0]);
  const currentAir = airResponse?.current ?? null;
  const hourlyTimes = Array.isArray(airResponse?.hourly?.time) ? airResponse.hourly.time : [];
  const hourlyValues = Array.isArray(airResponse?.hourly?.european_aqi) ? airResponse.hourly.european_aqi : [];
  const hourly = hourlyTimes
    .map((time: unknown, index: number) => ({ time: typeof time === "string" ? time : "", value: asNumber(hourlyValues[index]) }))
    .filter((point: { time: string; value: number | null }): point is { time: string; value: number } => point.time.length > 0 && point.value != null)
    .slice(0, 24);
  const aqi = asNumber(currentAir?.european_aqi);
  const altitudeCalculatedAt = new Date();
  const sunAltitudeDeg = roundAltitudeDegrees(getPosition(altitudeCalculatedAt, coords.lat, coords.lon).altitude);
  const moonAltitudeDeg = roundAltitudeDegrees(getMoonPosition(altitudeCalculatedAt, coords.lat, coords.lon).altitude);

  const value: EnvironmentalSnapshot = {
    air: airResponse ? {
      aqi,
      descriptor: getEuropeanAqiDescriptor(aqi),
      pm25: asNumber(currentAir?.pm2_5),
      pm10: asNumber(currentAir?.pm10),
      nitrogenDioxide: asNumber(currentAir?.nitrogen_dioxide),
      ozone: asNumber(currentAir?.ozone),
      observedAt: typeof currentAir?.time === "string" ? currentAir.time : null,
      hourly,
    } : null,
    astronomy: weather ? {
      sunrise,
      sunset,
      daylightDurationSeconds: asNumber(daily?.daylight_duration?.[0]),
      moonrise: typeof daily?.moonrise?.[0] === "string" ? daily.moonrise[0] : null,
      moonset: typeof daily?.moonset?.[0] === "string" ? daily.moonset[0] : null,
      moonPhase,
      moon: getMoonPhaseDescriptor(moonPhase),
      moonIllumination: getMoonIllumination(moonPhase),
      dayProgress: calculateDayProgress(sunrise, sunset, timezone),
      sunAltitudeDeg,
      moonAltitudeDeg,
      altitudeCalculatedAt: altitudeCalculatedAt.toISOString(),
      timezone,
    } : null,
    source: "Open-Meteo / CAMS",
    timezone,
  };

  snapshotCache.set(key, { value, expiresAt: Date.now() + 10 * 60 * 1_000 });
  return value;
}
