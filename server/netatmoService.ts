import { getNetatmoOAuthToken, upsertNetatmoOAuthToken } from "./db";
import { decryptNetatmoRefreshToken, encryptNetatmoRefreshToken } from "./netatmoOAuth";
import { haversineKm, type StationData } from "./stationService";

type NetatmoModule = {
  type?: string;
  dashboard_data?: Record<string, unknown>;
  measures?: Record<string, unknown>;
};

type NetatmoPublicStation = {
  _id?: string;
  type?: string;
  station_name?: string;
  place?: { location?: [number, number]; altitude?: number; city?: string };
  dashboard_data?: Record<string, unknown>;
  measures?: Record<string, unknown>;
  modules?: NetatmoModule[];
};

const pendingAccessTokenRefreshes = new Map<number, Promise<string | null>>();

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dashboardNumber(module: NetatmoModule | NetatmoPublicStation | undefined, ...keys: string[]) {
  const source = module?.dashboard_data ?? module?.measures;
  if (!source) return null;
  for (const key of keys) {
    const value = numberValue(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function updatedAtFrom(station: NetatmoPublicStation, modules: NetatmoModule[]) {
  const candidates = [station, ...modules];
  for (const candidate of candidates) {
    const raw = dashboardNumber(candidate, "time_utc", "Time_UTC");
    if (raw !== null) return new Date(raw * 1000).toISOString();
  }
  return null;
}

export function mapNetatmoPublicStation(station: NetatmoPublicStation, refLat: number, refLon: number): StationData | null {
  const coordinates = station.place?.location;
  if (!station._id || !coordinates || coordinates.length !== 2) return null;
  const [lon, lat] = coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const modules = station.modules ?? [];
  const outdoor = modules.find((module) => module.type === "NAModule1")
    ?? (station.type === "NAModule1" ? station : undefined);
  const anemometer = modules.find((module) => module.type === "NAModule2");
  const rainGauge = modules.find((module) => module.type === "NAModule3");
  const temperature = dashboardNumber(outdoor, "Temperature", "temperature");
  const humidity = dashboardNumber(outdoor, "Humidity", "humidity");
  const pressure = dashboardNumber(station, "Pressure", "pressure");
  const windSpeed = dashboardNumber(anemometer, "WindStrength", "wind_strength");
  const windGust = dashboardNumber(anemometer, "GustStrength", "gust_strength");
  const windDirection = dashboardNumber(anemometer, "WindAngle", "wind_angle");
  const precipitation = dashboardNumber(rainGauge, "sum_rain_1", "Rain");
  if (temperature === null && windSpeed === null && precipitation === null) return null;
  return {
    stationId: `netatmo-${station._id}`,
    source: "netatmo",
    name: station.station_name?.trim() || station.place?.city || "Station Netatmo publique",
    lat,
    lon,
    altitude: numberValue(station.place?.altitude) ?? null,
    distanceKm: haversineKm(refLat, refLon, lat, lon),
    temperature,
    humidity,
    pressure,
    windSpeed,
    windGust,
    windDirection,
    precipitation,
    updatedAt: updatedAtFrom(station, modules),
    reliabilityScore: 72,
    updateFrequencyMin: 10,
    dataAvailability: 0.75,
    isActive: true,
    qualificationStatus: "validated",
    sourceTier: 1,
  };
}

async function refreshNetatmoAccessToken(userId: number) {
  const stored = await getNetatmoOAuthToken(userId);
  if (!stored) return null;
  try {
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.NETATMO_CLIENT_ID ?? "",
      client_secret: process.env.NETATMO_CLIENT_SECRET ?? "",
      refresh_token: decryptNetatmoRefreshToken(stored.encryptedRefreshToken),
    });
    const response = await fetch("https://api.netatmo.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json() as { access_token?: string; refresh_token?: string };
    if (!response.ok || !body.access_token || !body.refresh_token) {
      console.warn(`[Netatmo] Renouvellement du jeton indisponible (${response.status})`);
      return null;
    }
    await upsertNetatmoOAuthToken(userId, encryptNetatmoRefreshToken(body.refresh_token), stored.scopes);
    return body.access_token;
  } catch {
    console.warn("[Netatmo] Renouvellement du jeton impossible");
    return null;
  }
}

async function getNetatmoAccessToken(userId: number) {
  const pending = pendingAccessTokenRefreshes.get(userId);
  if (pending) return pending;

  const refresh = refreshNetatmoAccessToken(userId);
  pendingAccessTokenRefreshes.set(userId, refresh);
  try {
    return await refresh;
  } finally {
    pendingAccessTokenRefreshes.delete(userId);
  }
}

export async function fetchNetatmoPublicStations(userId: number | undefined, lat: number, lon: number, radiusKm: number) {
  if (!userId) return [];
  const accessToken = await getNetatmoAccessToken(userId);
  if (!accessToken) return [];
  const deltaLat = radiusKm / 111.32;
  const deltaLon = radiusKm / Math.max(111.32 * Math.cos((lat * Math.PI) / 180), 1);
  const query = new URLSearchParams({
    lat_ne: (lat + deltaLat).toFixed(6),
    lon_ne: (lon + deltaLon).toFixed(6),
    lat_sw: (lat - deltaLat).toFixed(6),
    lon_sw: (lon - deltaLon).toFixed(6),
    filter: "true",
  });
  try {
    const response = await fetch(`https://api.netatmo.com/api/getpublicdata?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json() as { body?: NetatmoPublicStation[]; error?: { code?: number; message?: string } | string };
    if (!response.ok) {
      const errorCode = typeof body.error === "object" ? body.error.code : body.error;
      console.warn(`[Netatmo] getpublicdata indisponible (${response.status}${errorCode ? ` · ${errorCode}` : ""})`);
      return [];
    }
    if (!Array.isArray(body.body)) {
      console.warn("[Netatmo] getpublicdata a renvoyé un format inattendu");
      return [];
    }
    const stations = body.body.map((station) => mapNetatmoPublicStation(station, lat, lon)).filter((station): station is StationData => station !== null);
    console.info(`[Netatmo] ${stations.length} station(s) publique(s) authentifiée(s) trouvée(s) dans ${radiusKm} km`);
    return stations;
  } catch {
    console.warn("[Netatmo] getpublicdata est indisponible");
    return [];
  }
}
