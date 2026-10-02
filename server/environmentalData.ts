import { fetchWeather } from "./weatherFetch";
import { buildAstronomyOutlook, type AstronomyOutlook } from "./astronomyEvents";
import type { Body as AstronomyBody, Observer as AstronomyObserver } from "astronomy-engine";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Astronomy = require("astronomy-engine") as typeof import("astronomy-engine");

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

export type AstronomicalMoonPhase = {
  angleDeg: number;
  label: string;
  symbol: string;
  waxing: boolean;
  illuminationPct: number;
  brightLimbAngleDeg: number;
};

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function roundNormalizedDegrees(value: number) {
  const rounded = Math.round(normalizeDegrees(value) * 10) / 10;
  return rounded >= 360 ? 0 : rounded;
}

export function getAstronomicalMoonPhase(instant: Date, observer: AstronomyObserver): AstronomicalMoonPhase {
  const angleDeg = normalizeDegrees(Astronomy.MoonPhase(instant));
  const roundedAngleDeg = roundNormalizedDegrees(angleDeg);
  const illuminationPct = Math.round(Astronomy.Illumination(Astronomy.Body.Moon, instant).phase_fraction * 100);
  const waxing = roundedAngleDeg > 0 && roundedAngleDeg < 180;
  const label = angleDeg < 5 || angleDeg >= 355 ? "Nouvelle lune"
    : angleDeg < 85 ? "Premier croissant"
      : angleDeg <= 95 ? "Premier quartier"
        : angleDeg < 175 ? "Gibbeuse croissante"
          : angleDeg <= 185 ? "Pleine lune"
            : angleDeg < 265 ? "Gibbeuse décroissante"
              : angleDeg <= 275 ? "Dernier quartier"
                : "Dernier croissant";
  const symbol = label === "Pleine lune" ? "●" : label.includes("quartier") ? "◐" : label.includes("Gibbeuse") ? "◕" : label === "Nouvelle lune" ? "●" : "◔";
  const moon = Astronomy.Equator(Astronomy.Body.Moon, instant, observer, true, true);
  const sun = Astronomy.Equator(Astronomy.Body.Sun, instant, observer, true, true);
  const raDelta = (sun.ra - moon.ra) * 15 * Math.PI / 180;
  const moonDec = moon.dec * Math.PI / 180;
  const sunDec = sun.dec * Math.PI / 180;
  const brightLimbPositionAngle = Math.atan2(Math.cos(sunDec) * Math.sin(raDelta), Math.sin(sunDec) * Math.cos(moonDec) - Math.cos(sunDec) * Math.sin(moonDec) * Math.cos(raDelta));
  const hourAngle = Astronomy.HourAngle(Astronomy.Body.Moon, instant, observer) * 15 * Math.PI / 180;
  const latitude = observer.latitude * Math.PI / 180;
  const parallacticAngle = Math.atan2(Math.sin(hourAngle), Math.tan(latitude) * Math.cos(moonDec) - Math.sin(moonDec) * Math.cos(hourAngle));
  return { angleDeg: roundedAngleDeg, label, symbol, waxing, illuminationPct, brightLimbAngleDeg: roundNormalizedDegrees((brightLimbPositionAngle - parallacticAngle) * 180 / Math.PI) };
}

export function roundAltitudeDegrees(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;
}

export type ApparentBodyPosition = {
  altitudeDeg: number | null;
  azimuthDeg: number | null;
  distanceKm: number | null;
  aboveHorizon: boolean;
};

export type ApparentTrajectoryPoint = ApparentBodyPosition & {
  at: string;
};

export type ApparentAstronomyPosition = {
  sun: ApparentBodyPosition;
  moon: ApparentBodyPosition;
  lunar: AstronomicalMoonPhase;
  events: {
    sun: { rise: string | null; culmination: string | null; set: string | null };
    moon: { rise: string | null; culmination: string | null; set: string | null };
  };
  trajectory: {
    sun: ApparentTrajectoryPoint[];
    moon: ApparentTrajectoryPoint[];
  };
  calculatedAt: string;
};

function getApparentBodyPosition(body: AstronomyBody, instant: Date, observer: AstronomyObserver): ApparentBodyPosition {
  const equator = Astronomy.Equator(body, instant, observer, true, true);
  const horizon = Astronomy.Horizon(instant, observer, equator.ra, equator.dec, "normal");
  const altitudeDeg = roundAltitudeDegrees(horizon.altitude);
  const azimuthDeg = roundAltitudeDegrees(horizon.azimuth);
  const distanceKm = Number.isFinite(equator.dist) ? Math.round(equator.dist * 149_597_870.7) : null;
  return {
    altitudeDeg,
    azimuthDeg,
    distanceKm,
    aboveHorizon: Number.isFinite(horizon.altitude) && horizon.altitude > 0,
  };
}

function getApparentTrajectory(body: AstronomyBody, observer: AstronomyObserver, instant: Date): ApparentTrajectoryPoint[] {
  const startOfUtcDay = Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate());
  return Array.from({ length: 49 }, (_, index) => {
    const sampledAt = new Date(startOfUtcDay + index * 30 * 60_000);
    return { ...getApparentBodyPosition(body, sampledAt, observer), at: sampledAt.toISOString() };
  });
}

function getAstronomicalEvents(body: AstronomyBody, observer: AstronomyObserver, instant: Date) {
  const start = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
  const rise = Astronomy.SearchRiseSet(body, observer, 1, start, 1);
  const set = Astronomy.SearchRiseSet(body, observer, -1, start, 1);
  const culmination = Astronomy.SearchHourAngle(body, observer, 0, start, 1);
  return { rise: rise?.date.toISOString() ?? null, culmination: culmination?.time.date.toISOString() ?? null, set: set?.date.toISOString() ?? null };
}

/** Coordonnées horizontales topocentriques apparentes au lieu et à l'instant fournis. */
export function getApparentAstronomyPosition(coords: { lat: number; lon: number }, instant = new Date()): ApparentAstronomyPosition {
  const observer = new Astronomy.Observer(coords.lat, coords.lon, 0);
  return {
    sun: getApparentBodyPosition(Astronomy.Body.Sun, instant, observer),
    moon: getApparentBodyPosition(Astronomy.Body.Moon, instant, observer),
    lunar: getAstronomicalMoonPhase(instant, observer),
    events: {
      sun: getAstronomicalEvents(Astronomy.Body.Sun, observer, instant),
      moon: getAstronomicalEvents(Astronomy.Body.Moon, observer, instant),
    },
    trajectory: {
      sun: getApparentTrajectory(Astronomy.Body.Sun, observer, instant),
      moon: getApparentTrajectory(Astronomy.Body.Moon, observer, instant),
    },
    calculatedAt: instant.toISOString(),
  };
}

/* ─── Profil de relief local ─── */

export type TerrainHorizonPoint = {
  azimuthDeg: number;
  elevationDeg: number;
};

export type TerrainHorizonProfile = {
  points: TerrainHorizonPoint[];
  observerElevationM: number;
  resolutionM: number;
  source: string;
};

const terrainCache = new Map<string, { expiresAt: number; value: TerrainHorizonProfile }>();

/**
 * Échantillonne l'altitude du terrain autour du lieu actif et calcule
 * l'angle d'élévation apparent de l'horizon dans chaque direction.
 * Utilise l'API Open-Meteo Elevation (Copernicus GLO-90, résolution 90 m).
 */
export async function getTerrainHorizonProfile(coords: { lat: number; lon: number }): Promise<TerrainHorizonProfile> {
  const key = `${coords.lat.toFixed(3)},${coords.lon.toFixed(3)}`;
  const cached = terrainCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const SAMPLE_AZIMUTHS = 36;
  const SAMPLE_DISTANCE_KM = 5;
  const EARTH_RADIUS_KM = 6371;

  const latRad = coords.lat * Math.PI / 180;
  const lonRad = coords.lon * Math.PI / 180;

  const sampleCoords: { lat: number; lon: number; azimuth: number }[] = [];
  for (let i = 0; i < SAMPLE_AZIMUTHS; i++) {
    const azimuth = (i * 360) / SAMPLE_AZIMUTHS;
    const bearing = azimuth * Math.PI / 180;
    const angularDist = SAMPLE_DISTANCE_KM / EARTH_RADIUS_KM;
    const sampleLat = Math.asin(Math.sin(latRad) * Math.cos(angularDist) + Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearing));
    const sampleLon = lonRad + Math.atan2(Math.sin(bearing) * Math.sin(angularDist) * Math.cos(latRad), Math.cos(angularDist) - Math.sin(latRad) * Math.sin(sampleLat));
    sampleCoords.push({ lat: sampleLat * 180 / Math.PI, lon: sampleLon * 180 / Math.PI, azimuth });
  }

  const allLats = [coords.lat, ...sampleCoords.map((s) => s.lat)];
  const allLons = [coords.lon, ...sampleCoords.map((s) => s.lon)];

  const url = new URL("https://api.open-meteo.com/v1/elevation");
  url.searchParams.set("latitude", allLats.map((v) => v.toFixed(5)).join(","));
  url.searchParams.set("longitude", allLons.map((v) => v.toFixed(5)).join(","));

  let elevations: number[];
  try {
    const response = await fetchWeather(url, {}, { timeoutMs: 5_000, attempts: 2 });
    if (!response.ok) throw new Error(`Elevation API HTTP ${response.status}`);
    const json = await response.json() as { elevation?: number[] };
    elevations = Array.isArray(json.elevation) ? json.elevation.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0)) : [];
  } catch {
    elevations = new Array(allLats.length).fill(0);
  }

  const observerElevation = elevations[0] ?? 0;
  const points: TerrainHorizonPoint[] = sampleCoords.map((sample, index) => {
    const terrainElevation = (elevations[index + 1] ?? 0) - observerElevation;
    const distanceM = SAMPLE_DISTANCE_KM * 1000;
    const elevationAngle = Math.atan2(terrainElevation, distanceM) * 180 / Math.PI;
    return { azimuthDeg: sample.azimuth, elevationDeg: Math.round(Math.max(0, elevationAngle) * 10) / 10 };
  });

  const profile: TerrainHorizonProfile = { points, observerElevationM: Math.round(observerElevation), resolutionM: 90, source: "Copernicus GLO-90 via Open-Meteo" };
  terrainCache.set(key, { value: profile, expiresAt: Date.now() + 60 * 60 * 1_000 });
  return profile;
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
    sunCulmination: string | null;
    moonCulmination: string | null;
    moonPhase: number | null;
    moon: ReturnType<typeof getMoonPhaseDescriptor>;
    moonIllumination: number | null;
    lunar: AstronomicalMoonPhase;
    dayProgress: number | null;
    sunAltitudeDeg: number | null;
    moonAltitudeDeg: number | null;
    sunAzimuthDeg: number | null;
    moonAzimuthDeg: number | null;
    sunAboveHorizon: boolean;
    moonAboveHorizon: boolean;
    altitudeCalculatedAt: string;
    timezone: string;
    cloudCover: number | null;
    outlook: AstronomyOutlook;
    coordinates: { lat: number; lon: number };
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
    daily: "sunrise,sunset,daylight_duration,moonrise,moonset,moon_phase,cloud_cover_mean",
    current: "cloud_cover",
    forecast_days: "16",
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
  const dailyDates = Array.isArray(daily?.time) ? daily.time.filter((value: unknown): value is string => typeof value === "string") : [];
  const dailyMoonPhases = Array.isArray(daily?.moon_phase) ? daily.moon_phase.map(asNumber) : [];
  const dailyDaylightDurations = Array.isArray(daily?.daylight_duration) ? daily.daylight_duration.map(asNumber) : [];
  const dailyCloudCoverMeans = Array.isArray(daily?.cloud_cover_mean) ? daily.cloud_cover_mean.map(asNumber) : [];
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
  const apparentPosition = getApparentAstronomyPosition(coords, altitudeCalculatedAt);

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
      sunrise: apparentPosition.events.sun.rise ?? sunrise,
      sunset: apparentPosition.events.sun.set ?? sunset,
      daylightDurationSeconds: asNumber(daily?.daylight_duration?.[0]),
      moonrise: apparentPosition.events.moon.rise ?? (typeof daily?.moonrise?.[0] === "string" ? daily.moonrise[0] : null),
      moonset: apparentPosition.events.moon.set ?? (typeof daily?.moonset?.[0] === "string" ? daily.moonset[0] : null),
      sunCulmination: apparentPosition.events.sun.culmination,
      moonCulmination: apparentPosition.events.moon.culmination,
      moonPhase: apparentPosition.lunar.angleDeg,
      moon: { label: apparentPosition.lunar.label, symbol: apparentPosition.lunar.symbol },
      moonIllumination: apparentPosition.lunar.illuminationPct,
      lunar: apparentPosition.lunar,
      dayProgress: calculateDayProgress(sunrise, sunset, timezone),
      sunAltitudeDeg: apparentPosition.sun.altitudeDeg,
      moonAltitudeDeg: apparentPosition.moon.altitudeDeg,
      sunAzimuthDeg: apparentPosition.sun.azimuthDeg,
      moonAzimuthDeg: apparentPosition.moon.azimuthDeg,
      sunAboveHorizon: apparentPosition.sun.aboveHorizon,
      moonAboveHorizon: apparentPosition.moon.aboveHorizon,
      altitudeCalculatedAt: altitudeCalculatedAt.toISOString(),
      timezone,
      cloudCover: asNumber(weather?.current?.cloud_cover),
      outlook: buildAstronomyOutlook({
        dates: dailyDates,
        moonPhases: dailyMoonPhases,
        daylightDurations: dailyDaylightDurations,
        cloudCoverMeans: dailyCloudCoverMeans,
        today: dailyDates[0] ?? altitudeCalculatedAt.toISOString().slice(0, 10),
        referenceInstant: altitudeCalculatedAt,
        timeZone: timezone,
      }),
      coordinates: { lat: coords.lat, lon: coords.lon },
    } : null,
    source: "Open-Meteo / CAMS",
    timezone,
  };

  snapshotCache.set(key, { value, expiresAt: Date.now() + 10 * 60 * 1_000 });
  return value;
}
