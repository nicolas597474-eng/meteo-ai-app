/**
 * realWeatherAPIs.ts
 * Adaptateurs pour les vraies APIs météo publiques.
 *
 * Chaque adaptateur retourne null si la clé API est absente ou si l'appel échoue.
 * L'appelant doit gérer le fallback vers la simulation.
 *
 * APIs intégrées :
 *  - OpenWeatherMap  : /data/2.5/forecast (5j/3h, tier gratuit)
 *  - Météo-France    : portail-api.meteofrance.fr /v1/forecast (15j)
 */

import { ENV } from "./_core/env";
import { fetchWeather } from "./weatherFetch";

const PUBLIC_API_TIMEOUT_MS = 8000;

export interface RealForecastResult {
  serviceName: string;
  serviceCategory: "public";
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust: number | null;
  humidity: number | null;
  cloudCover: number | null;
  condition: string | null;
  rawData: unknown;
}

export type MeteoFranceProvenanceStatus = "official" | "fallback" | "unavailable";

export type MeteoFranceProvenance = {
  status: MeteoFranceProvenanceStatus;
  provider: "meteofrance-authenticated" | "open-meteo-meteofrance" | null;
  upstreamModels: string[];
  fallbackReason: string | null;
  officialConfigured: boolean;
  shadowMode: true;
  appliedToProduction: false;
  checkedAt: string;
};

export function resolveMeteoFranceProvenance(
  officialConfigured: boolean,
  officialForecast: RealForecastResult | null,
  fallbackForecast: RealForecastResult | null,
  checkedAt = new Date().toISOString(),
): { forecast: RealForecastResult | null; provenance: MeteoFranceProvenance } {
  if (officialForecast) {
    return {
      forecast: officialForecast,
      provenance: {
        status: "official",
        provider: "meteofrance-authenticated",
        upstreamModels: [],
        fallbackReason: null,
        officialConfigured,
        shadowMode: true,
        appliedToProduction: false,
        checkedAt,
      },
    };
  }

  if (fallbackForecast) {
    return {
      forecast: fallbackForecast,
      provenance: {
        status: "fallback",
        provider: "open-meteo-meteofrance",
        upstreamModels: ["AROME", "ARPEGE"],
        fallbackReason: officialConfigured ? "Flux Météo-France authentifié indisponible" : "Clé du flux Météo-France authentifié absente",
        officialConfigured,
        shadowMode: true,
        appliedToProduction: false,
        checkedAt,
      },
    };
  }

  return {
    forecast: null,
    provenance: {
      status: "unavailable",
      provider: null,
      upstreamModels: [],
      fallbackReason: officialConfigured
        ? "Flux Météo-France authentifié et repli Open-Meteo indisponibles"
        : "Clé Météo-France absente et repli Open-Meteo indisponible",
      officialConfigured,
      shadowMode: true,
      appliedToProduction: false,
      checkedAt,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// OpenWeatherMap — /data/2.5/forecast (5 jours, pas de 3h)
// Endpoint : https://api.openweathermap.org/data/2.5/forecast
// Agrège les tranches 3h d'un jour cible pour obtenir les valeurs journalières.
// ─────────────────────────────────────────────────────────────
export async function fetchOpenWeatherMap(
  targetDate: string,
  lat: number,
  lon: number
): Promise<RealForecastResult | null> {
  const apiKey = ENV.openWeatherMapApiKey;
  if (!apiKey) return null;

  try {
    const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
    url.searchParams.set("lat", lat.toString());
    url.searchParams.set("lon", lon.toString());
    url.searchParams.set("appid", apiKey);
    url.searchParams.set("units", "metric");
    url.searchParams.set("lang", "fr");
    url.searchParams.set("cnt", "40"); // 5 jours × 8 tranches/jour

    const response = await fetchWeather(url.toString(), {}, { timeoutMs: PUBLIC_API_TIMEOUT_MS, attempts: 2 });
    if (!response.ok) {
      console.warn(`[OWM] HTTP ${response.status} for ${lat},${lon}`);
      return null;
    }

    const data = await response.json();
    const list: any[] = data.list ?? [];

    // Filtrer les tranches du jour cible (format "YYYY-MM-DD HH:mm:ss")
    const daySlices = list.filter((item: any) =>
      (item.dt_txt as string).startsWith(targetDate)
    );

    if (daySlices.length === 0) return null;

    // Agréger les tranches journalières
    const temps = daySlices.map((s: any) => s.main?.temp ?? null).filter((t: any) => t !== null) as number[];
    const precips = daySlices.map((s: any) => (s.rain?.["3h"] ?? 0) + (s.snow?.["3h"] ?? 0)) as number[];
    const winds = daySlices.map((s: any) => (s.wind?.speed ?? 0) * 3.6) as number[]; // m/s → km/h
    const gusts = daySlices.map((s: any) => (s.wind?.gust ?? 0) * 3.6) as number[];
    const humidities = daySlices.map((s: any) => s.main?.humidity ?? null).filter((h: any) => h !== null) as number[];
    const clouds = daySlices.map((s: any) => s.clouds?.all ?? null).filter((c: any) => c !== null) as number[];

    const tempMax = temps.length > 0 ? Math.max(...temps) : null;
    const tempMin = temps.length > 0 ? Math.min(...temps) : null;
    const precipitation = precips.reduce((a, b) => a + b, 0);
    const windSpeed = winds.length > 0 ? Math.max(...winds) : null;
    const windGust = gusts.length > 0 ? Math.max(...gusts) : null;
    const humidity = humidities.length > 0 ? humidities.reduce((a, b) => a + b, 0) / humidities.length : null;
    const cloudCover = clouds.length > 0 ? clouds.reduce((a, b) => a + b, 0) / clouds.length : null;

    // Condition dominante (icône de la tranche de midi ou première disponible)
    const midday = daySlices.find((s: any) => s.dt_txt?.includes("12:00:00")) ?? daySlices[0];
    const condition = midday?.weather?.[0]?.description ?? null;

    return {
      serviceName: "OpenWeatherMap",
      serviceCategory: "public",
      tempMax: tempMax !== null ? Math.round(tempMax * 10) / 10 : null,
      tempMin: tempMin !== null ? Math.round(tempMin * 10) / 10 : null,
      precipitation: Math.round(precipitation * 10) / 10,
      windSpeed: windSpeed !== null ? Math.round(windSpeed * 10) / 10 : null,
      windGust: windGust !== null ? Math.round(windGust * 10) / 10 : null,
      humidity: humidity !== null ? Math.round(humidity) : null,
      cloudCover: cloudCover !== null ? Math.round(cloudCover) : null,
      condition,
      rawData: data,
    };
  } catch (err: any) {
    console.error(`[OWM] Error: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Météo-France Portail — OAuth2 client_credentials + DPPrevision
// Le portail utilise OAuth2 : la clé est une clé Base64 (client_id:client_secret)
// Flux : POST /token → Bearer token → GET /forecast
// ─────────────────────────────────────────────────────────────

// Cache du token MF pour éviter un échange à chaque appel (expire en 3600s)
let mfTokenCache: { token: string; expiresAt: number } | null = null;

async function getMFBearerToken(oauthKey: string): Promise<string | null> {
  const now = Date.now();
  if (mfTokenCache && mfTokenCache.expiresAt > now + 60_000) {
    return mfTokenCache.token;
  }
  try {
    const res = await fetchWeather("https://portail-api.meteofrance.fr/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${oauthKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }, { timeoutMs: PUBLIC_API_TIMEOUT_MS, attempts: 2 });
    if (!res.ok) {
      console.warn(`[MF] Token exchange failed: HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    const token = json.access_token;
    const expiresIn = json.expires_in ?? 3600;
    if (!token) return null;
    mfTokenCache = { token, expiresAt: now + expiresIn * 1000 };
    return token;
  } catch (err: any) {
    console.warn(`[MF] Token exchange error: ${err.message}`);
    return null;
  }
}

export async function fetchMeteoFrance(
  targetDate: string,
  lat: number,
  lon: number
): Promise<RealForecastResult | null> {
  const oauthKey = ENV.meteoFranceApiKey;
  if (!oauthKey) return null;

  try {
    const bearerToken = await getMFBearerToken(oauthKey);
    if (!bearerToken) return null;

    // Endpoint prévisions journalières Météo-France (API communautaire hacf-fr)
    const url = new URL("https://rpcache-aa.meteofrance.com/internet2018client/2.0/forecast");
    url.searchParams.set("lat", lat.toString());
    url.searchParams.set("lon", lon.toString());
    url.searchParams.set("lang", "fr");

    const response = await fetchWeather(url.toString(), {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: "application/json",
      },
    }, { timeoutMs: PUBLIC_API_TIMEOUT_MS, attempts: 2 });

    if (!response.ok) {
      console.warn(`[MF] Forecast HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    return parseMeteofFranceDailyForecast(data, targetDate);
  } catch (err: any) {
    console.error(`[MF] Error: ${err.message}`);
    return null;
  }
}

function parseMeteofFrancePackage(data: any, targetDate: string): RealForecastResult | null {
  // Format paquet Météo-France — structure variable selon le produit
  // Chercher les données du jour cible dans la réponse
  const daily = data?.daily_forecast ?? data?.forecast ?? [];
  const dayData = daily.find((d: any) =>
    (d.dt ? new Date(d.dt * 1000).toISOString().slice(0, 10) : d.date ?? "") === targetDate
  );

  if (!dayData) return null;

  return {
    serviceName: "Météo-France",
    serviceCategory: "public",
    tempMax: dayData.T_max ?? dayData.tmax ?? null,
    tempMin: dayData.T_min ?? dayData.tmin ?? null,
    precipitation: dayData.precipitation?.["24h"] ?? dayData.rain24h ?? null,
    windSpeed: dayData.wind?.speed ?? dayData.wind_speed ?? null,
    windGust: dayData.wind?.gust ?? dayData.wind_gust ?? null,
    humidity: dayData.humidity ?? null,
    cloudCover: dayData.cloud_cover ?? null,
    condition: dayData.weather?.desc ?? dayData.condition ?? null,
    rawData: data,
  };
}

function parseMeteofFranceDailyForecast(data: any, targetDate: string): RealForecastResult | null {
  // Format API communautaire meteofrance-api (hacf-fr)
  const dailyForecasts: any[] = data?.daily_forecast ?? [];
  const dayData = dailyForecasts.find((d: any) => {
    if (!d.dt) return false;
    const date = new Date(d.dt * 1000).toISOString().slice(0, 10);
    return date === targetDate;
  });

  if (!dayData) return null;

  return {
    serviceName: "Météo-France",
    serviceCategory: "public",
    tempMax: dayData.T?.max ?? null,
    tempMin: dayData.T?.min ?? null,
    precipitation: dayData.precipitation?.["24h"] ?? null,
    windSpeed: dayData.wind?.speed != null ? dayData.wind.speed * 3.6 : null, // m/s → km/h
    windGust: dayData.wind?.gust != null ? dayData.wind.gust * 3.6 : null,
    humidity: dayData.humidity?.max ?? null,
    cloudCover: null, // non fourni dans ce format
    condition: dayData.weather?.desc ?? null,
    rawData: data,
  };
}

// ─────────────────────────────────────────────────────────────
// Météo-France via Open-Meteo (fallback sans authentification)
// Open-Meteo intègre les modèles ARPEGE/AROME de Météo-France nativement.
// Endpoint : https://api.open-meteo.com/v1/meteofrance
// ─────────────────────────────────────────────────────────────
export async function fetchMeteoFranceViaOpenMeteo(
  targetDate: string,
  lat: number,
  lon: number
): Promise<RealForecastResult | null> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/meteofrance");
    url.searchParams.set("latitude", lat.toString());
    url.searchParams.set("longitude", lon.toString());
    url.searchParams.set("daily", [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "windspeed_10m_max",
      "windgusts_10m_max",
      "weathercode",
      "cloudcover_mean",
    ].join(","));
    url.searchParams.set("timezone", "Europe/Paris");
    url.searchParams.set("forecast_days", "15");

    const response = await fetchWeather(url.toString(), {}, { timeoutMs: PUBLIC_API_TIMEOUT_MS, attempts: 2 });
    if (!response.ok) {
      console.warn(`[MF-OM] HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const daily = data.daily;
    if (!daily?.time) return null;

    const idx = daily.time.indexOf(targetDate);
    if (idx === -1) return null;

    // WMO weather code → description française
    const wmoCode = daily.weathercode?.[idx] ?? 0;
    const condition = wmoToConditionFr(wmoCode);

    return {
      serviceName: "Météo-France",
      serviceCategory: "public",
      tempMax: daily.temperature_2m_max?.[idx] ?? null,
      tempMin: daily.temperature_2m_min?.[idx] ?? null,
      precipitation: daily.precipitation_sum?.[idx] ?? null,
      windSpeed: daily.windspeed_10m_max?.[idx] ?? null,
      windGust: daily.windgusts_10m_max?.[idx] ?? null,
      humidity: null, // non fourni par cet endpoint
      cloudCover: daily.cloudcover_mean?.[idx] ?? null,
      condition,
      rawData: null,
    };
  } catch (err: any) {
    console.error(`[MF-OM] Error: ${err.message}`);
    return null;
  }
}

/** Convertit un code WMO en description française alignée sur les régimes. */
export function wmoToConditionFr(code: number): string {
  if (code === 0) return "Ensoleillé";
  if (code === 1) return "Peu nuageux";
  if (code === 2) return "Partiellement nuageux";
  if (code === 3) return "Ciel couvert";
  if (code <= 49) return "Brouillard";
  if (code <= 59) return "Bruine";
  if (code <= 69) return "Pluie";
  if (code <= 79) return "Neige";
  if (code <= 84) return "Averses";
  if (code <= 94) return "Orages";
  return "Orage violent";
}

// ─────────────────────────────────────────────────────────────
// Collecte groupée : tente les vraies APIs, retourne null si indisponibles
// MF : essaie d'abord l'OAuth2 Portail, puis fallback Open-Meteo ARPEGE/AROME
// ─────────────────────────────────────────────────────────────
export async function fetchRealPublicForecasts(
  targetDate: string,
  lat: number,
  lon: number
): Promise<{ owm: RealForecastResult | null; mf: RealForecastResult | null; mfProvenance: MeteoFranceProvenance }> {
  const officialConfigured = Boolean(ENV.meteoFranceApiKey);
  const checkedAt = new Date().toISOString();
  const [owmResult, mfPortailResult, mfOpenMeteoResult] = await Promise.allSettled([
    fetchOpenWeatherMap(targetDate, lat, lon),
    fetchMeteoFrance(targetDate, lat, lon),
    fetchMeteoFranceViaOpenMeteo(targetDate, lat, lon),
  ]);

  const owm = owmResult.status === "fulfilled" ? owmResult.value : null;

  // Préférer le portail officiel, sinon utiliser Open-Meteo ARPEGE/AROME.
  const officialForecast = mfPortailResult.status === "fulfilled" ? mfPortailResult.value : null;
  const fallbackForecast = mfOpenMeteoResult.status === "fulfilled" ? mfOpenMeteoResult.value : null;
  const resolvedMeteoFrance = resolveMeteoFranceProvenance(officialConfigured, officialForecast, fallbackForecast, checkedAt);
  const mf = resolvedMeteoFrance.forecast;
  const mfProvenance = resolvedMeteoFrance.provenance;
  if (mfProvenance.status === "fallback") {
    console.log(`[MeteoAI] Météo-France via Open-Meteo (fallback ARPEGE/AROME)`);
  }

  return { owm, mf, mfProvenance };
}
