/**
 * Weather Services Configuration & Open-Meteo Collector
 * Location: Hondeghem (lat: 50.7567, lon: 2.5204)
 */

import { conditionFromWeatherValues } from "./weatherConditionLabels";
import { fetchWeather } from "./weatherFetch";

// Hondeghem coordinates
export const HONDEGHEM = { lat: 50.7567, lon: 2.5204 };

// All weather services/models tracked
export const WEATHER_SERVICES = {
  expert: [
    { name: "AROME", modelId: "meteofrance_arome_france_hd", category: "expert" as const },
    { name: "ARPEGE", modelId: "meteofrance_arpege_europe", category: "expert" as const },
    { name: "ICON", modelId: "dwd_icon_eu", category: "expert" as const },
    { name: "ECMWF", modelId: "ecmwf_ifs025", category: "expert" as const },
    { name: "GFS", modelId: "gfs_seamless", category: "expert" as const },
    { name: "GEM", modelId: "gem_seamless", category: "expert" as const },
    { name: "UKMET", modelId: "ukmo_seamless", category: "expert" as const },
    { name: "Open-Meteo", modelId: "best_match", category: "expert" as const },
  ],
  public: [
    { name: "Météo-France", category: "public" as const },
    { name: "Meteoblue", category: "public" as const },
    { name: "AccuWeather", category: "public" as const },
    { name: "Apple Weather", category: "public" as const },
    { name: "OpenWeatherMap", category: "public" as const },
    { name: "Weather.com", category: "public" as const },
    { name: "Ventusky", category: "public" as const },
    { name: "Weatherbit", category: "public" as const },
    { name: "World Weather Online", category: "public" as const },
    { name: "La Chaîne Météo", category: "public" as const },
  ],
};

/** Modèles observés séparément avant toute éventuelle qualification. */
export const VALIDATION_WEATHER_MODELS = [
  { name: "DMI HARMONIE-DINI", modelId: "dmi_seamless", family: "harmonie" as const },
  { name: "ICON-D2", modelId: "dwd_icon_d2", family: "icon" as const },
  { name: "ECMWF AIFS", modelId: "ecmwf_aifs025", family: "aifs" as const },
  { name: "ECMWF ENS", modelId: "ecmwf_ifs025_ensemble", family: "ensemble" as const },
  { name: "AIFS ENS", modelId: "ecmwf_aifs025_ensemble", family: "ensemble" as const },
] as const;

export type ForecastData = {
  serviceName: string;
  serviceCategory: "public" | "expert";
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust: number | null;
  humidity: number | null;
  cloudCover: number | null;
  condition: string | null;
  rawData?: unknown;
};

export type ValidationForecastData = ForecastData & {
  modelId: string;
  validationStatus: "candidate";
};

/**
 * Collect forecasts from Open-Meteo API for expert models.
 * Returns forecast data for today's date.
 */
export async function collectExpertForecasts(
  targetDate: string,
  coords?: { lat: number; lon: number }
): Promise<ForecastData[]> {
  const location = coords ?? HONDEGHEM;
  const responses = await Promise.all(
    WEATHER_SERVICES.expert.map(async (service): Promise<ForecastData | null> => {
      try {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", location.lat.toString());
        url.searchParams.set("longitude", location.lon.toString());
        url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,relative_humidity_2m_mean,cloud_cover_mean");
        url.searchParams.set("timezone", "Europe/Paris");
        url.searchParams.set("forecast_days", "16");

        if (service.modelId !== "best_match") {
          url.searchParams.set("models", service.modelId);
        }

        const response = await fetchWeather(url.toString(), {}, { timeoutMs: 12_000, attempts: 2 });
        if (!response.ok) {
          console.warn(`[Collector] ${service.name} HTTP ${response.status}`);
          return null;
        }

        const data = await response.json();
        const daily = data.daily;
        if (!daily?.time) return null;

        const dateIndex = daily.time.indexOf(targetDate);
        if (dateIndex === -1) return null;

        return {
          serviceName: service.name,
          serviceCategory: service.category,
          tempMax: daily.temperature_2m_max?.[dateIndex] ?? null,
          tempMin: daily.temperature_2m_min?.[dateIndex] ?? null,
          precipitation: daily.precipitation_sum?.[dateIndex] ?? null,
          windSpeed: daily.wind_speed_10m_max?.[dateIndex] ?? null,
          windGust: daily.wind_gusts_10m_max?.[dateIndex] ?? null,
          humidity: daily.relative_humidity_2m_mean?.[dateIndex] ?? null,
          cloudCover: daily.cloud_cover_mean?.[dateIndex] ?? null,
          condition: null,
          rawData: data,
        };
      } catch (err) {
        console.warn(`[Collector] Error fetching ${service.name}:`, err);
        return null;
      }
    })
  );

  return responses.filter((forecast): forecast is ForecastData => forecast !== null);
}

/**
 * Collect validation models separately from the active expert catalogue.
 * Empty provider responses remain unavailable; no other model substitutes them.
 */
export async function collectValidationForecasts(
  targetDate: string,
  coords?: { lat: number; lon: number }
): Promise<ValidationForecastData[]> {
  const location = coords ?? HONDEGHEM;
  const responses = await Promise.all(
    VALIDATION_WEATHER_MODELS.map(async (model): Promise<ValidationForecastData | null> => {
      try {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", location.lat.toString());
        url.searchParams.set("longitude", location.lon.toString());
        url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,relative_humidity_2m_mean,cloud_cover_mean");
        url.searchParams.set("timezone", "Europe/Paris");
        url.searchParams.set("forecast_days", "16");
        url.searchParams.set("models", model.modelId);

        const response = await fetchWeather(url.toString(), {}, { timeoutMs: 12_000, attempts: 2 });
        if (!response.ok) return null;
        const data = await response.json();
        const daily = data.daily;
        const dateIndex = daily?.time?.indexOf(targetDate) ?? -1;
        if (dateIndex < 0 || daily.temperature_2m_max?.[dateIndex] == null) return null;
        return {
          serviceName: model.name,
          serviceCategory: "expert",
          modelId: model.modelId,
          validationStatus: "candidate",
          tempMax: daily.temperature_2m_max?.[dateIndex] ?? null,
          tempMin: daily.temperature_2m_min?.[dateIndex] ?? null,
          precipitation: daily.precipitation_sum?.[dateIndex] ?? null,
          windSpeed: daily.wind_speed_10m_max?.[dateIndex] ?? null,
          windGust: daily.wind_gusts_10m_max?.[dateIndex] ?? null,
          humidity: daily.relative_humidity_2m_mean?.[dateIndex] ?? null,
          cloudCover: daily.cloud_cover_mean?.[dateIndex] ?? null,
          condition: null,
          rawData: data,
        };
      } catch (err) {
        console.warn(`[Validation] Error fetching ${model.name}:`, err);
        return null;
      }
    })
  );
  return responses.filter((forecast): forecast is ValidationForecastData => forecast !== null);
}

/**
 * Collect a retrospective model reference from Open-Meteo's forecast endpoint.
 * This is deliberately not represented as a physical observation.
 */
export async function collectObservations(
  targetDate: string,
  coords?: { lat: number; lon: number; name?: string }
) {
  const lat = coords?.lat ?? HONDEGHEM.lat;
  const lon = coords?.lon ?? HONDEGHEM.lon;
  const locationName = coords?.name ?? "Steenvoorde/Hazebrouck";
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lat.toString());
    url.searchParams.set("longitude", lon.toString());
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,relative_humidity_2m_mean,cloud_cover_mean");
    url.searchParams.set("timezone", "Europe/Paris");
    url.searchParams.set("past_days", "7");
    url.searchParams.set("forecast_days", "0");

    const response = await fetchWeather(url.toString(), {}, { timeoutMs: 10_000, attempts: 2 });
    if (!response.ok) return null;

    const data = await response.json();
    const daily = data.daily;
    if (!daily || !daily.time) return null;

    const dateIndex = daily.time.indexOf(targetDate);
    if (dateIndex === -1) return null;

    return {
      date: targetDate,
      tempMax: daily.temperature_2m_max?.[dateIndex] ?? null,
      tempMin: daily.temperature_2m_min?.[dateIndex] ?? null,
      precipitation: daily.precipitation_sum?.[dateIndex] ?? null,
      windSpeed: daily.wind_speed_10m_max?.[dateIndex] ?? null,
      windGust: daily.wind_gusts_10m_max?.[dateIndex] ?? null,
      humidity: daily.relative_humidity_2m_mean?.[dateIndex] ?? null,
      cloudCover: daily.cloud_cover_mean?.[dateIndex] ?? null,
      condition: null,
      source: `Open-Meteo forecast reference (${locationName})`,
      provenanceType: "model_reference" as const,
      isQualified: 0 as const,
      rawData: data,
    };
  } catch (err) {
    console.error("[Collector] Error fetching observations:", err);
    return null;
  }
}

export type DayForecast = {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDirection?: number | null;
  humidity: number | null;
  cloudCover: number | null;
  condition: string | null;
  stabilityIndex: number;
  stabilityLabel: string;
  uvIndex?: number | null;
  feelsLikeMax?: number | null;
  feelsLikeMin?: number | null;
  sunrise?: string | null;
  sunset?: string | null;
};

export type HourlyPoint = {
  hour: string;      // "HH:00"
  temp: number | null;
  apparentTemp: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDirection: number | null;  // degrees 0-360
  cloudCover: number | null;
  humidity: number | null;
  uvIndex: number | null;
  condition: string | null;
  // Extended fields for details page
  pressure?: number | null;        // hPa
  dewPoint?: number | null;        // °C
  visibility?: number | null;      // km
  solarRadiation?: number | null;  // W/m²
  cloudLow?: number | null;        // %
  cloudMid?: number | null;        // %
  cloudHigh?: number | null;       // %
  precipType?: string | null;      // rain, snow, freezing_rain, etc.
  precipIntensity?: string | null; // light, moderate, heavy
  // Multi-model spread (optional, populated when available)
  tempSpread?: number | null;    // Max - Min across models (°C)
  precipProb?: number | null;    // % of models predicting rain
  modelCount?: number;           // Number of models contributing
};

function deriveCondition(precip: number | null, cloud: number | null): string {
  return conditionFromWeatherValues(precip, cloud);
}

/**
 * Fetch 15-day forecast from multiple Open-Meteo models and return averaged daily data.
 */
export async function collect15DayForecast(
  coords?: { lat: number; lon: number }
): Promise<{ days: DayForecast[]; modelsUsed: string[] }> {
  const location = coords ?? HONDEGHEM;
  const models = [
    { name: "ECMWF", modelId: "ecmwf_ifs025" },
    { name: "GFS", modelId: "gfs_seamless" },
    { name: "ICON", modelId: "dwd_icon_eu" },
    { name: "Open-Meteo", modelId: null },
  ];

  const allModelData: Record<string, { tempMax: number[]; tempMin: number[]; precip: number[]; wind: number[]; windGust: number[]; windDir: number[]; humidity: number[]; cloud: number[]; uv: number[]; feelsMax: number[]; feelsMin: number[] }> = {};
  const sunData: Record<string, { sunrise: string | null; sunset: string | null }> = {};
  const modelsUsed: string[] = [];
  let dates: string[] = [];

  const modelResults = await Promise.all(models.map(async (model) => {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", location.lat.toString());
      url.searchParams.set("longitude", location.lon.toString());
      url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,relative_humidity_2m_mean,cloud_cover_mean,uv_index_max,apparent_temperature_max,apparent_temperature_min,sunrise,sunset");
      url.searchParams.set("timezone", "Europe/Paris");
      url.searchParams.set("forecast_days", "16");
      if (model.modelId) url.searchParams.set("models", model.modelId);

      const response = await fetchWeather(url.toString(), {}, { timeoutMs: 6_000, attempts: 1 });
      if (!response.ok) return null;

      const data = await response.json();
      const daily = data.daily;
      if (!daily?.time) return null;
      return { name: model.name, daily };
    } catch (err) {
      console.error(`[15Day] Error fetching ${model.name}:`, err);
      return null;
    }
  }));

  for (const result of modelResults) {
    if (!result) continue;
    const { name, daily } = result;
    if (dates.length === 0) dates = daily.time.slice(0, 16);
    modelsUsed.push(name);

    for (let i = 0; i < Math.min(16, daily.time.length); i++) {
      const d = daily.time[i];
      if (!allModelData[d]) {
        allModelData[d] = { tempMax: [], tempMin: [], precip: [], wind: [], windGust: [], windDir: [], humidity: [], cloud: [], uv: [], feelsMax: [], feelsMin: [] };
      }
      if (daily.temperature_2m_max?.[i] != null) allModelData[d].tempMax.push(daily.temperature_2m_max[i]);
      if (daily.temperature_2m_min?.[i] != null) allModelData[d].tempMin.push(daily.temperature_2m_min[i]);
      if (daily.precipitation_sum?.[i] != null) allModelData[d].precip.push(daily.precipitation_sum[i]);
      if (daily.wind_speed_10m_max?.[i] != null) allModelData[d].wind.push(daily.wind_speed_10m_max[i]);
      if (daily.wind_gusts_10m_max?.[i] != null) allModelData[d].windGust.push(daily.wind_gusts_10m_max[i]);
      if (daily.wind_direction_10m_dominant?.[i] != null) allModelData[d].windDir.push(daily.wind_direction_10m_dominant[i]);
      if (daily.relative_humidity_2m_mean?.[i] != null) allModelData[d].humidity.push(daily.relative_humidity_2m_mean[i]);
      if (daily.cloud_cover_mean?.[i] != null) allModelData[d].cloud.push(daily.cloud_cover_mean[i]);
      if (daily.uv_index_max?.[i] != null) allModelData[d].uv.push(daily.uv_index_max[i]);
      if (daily.apparent_temperature_max?.[i] != null) allModelData[d].feelsMax.push(daily.apparent_temperature_max[i]);
      if (daily.apparent_temperature_min?.[i] != null) allModelData[d].feelsMin.push(daily.apparent_temperature_min[i]);
      if (!sunData[d] && daily.sunrise?.[i] && daily.sunset?.[i]) {
        const sr = daily.sunrise[i] as string;
        const ss = daily.sunset[i] as string;
        sunData[d] = { sunrise: sr.slice(11, 16), sunset: ss.slice(11, 16) };
      }
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;

  const days: DayForecast[] = dates.map((date, i) => {
    const d = allModelData[date];
    if (!d) return null;
    const avgPrecip = avg(d.precip);
    const avgCloud = avg(d.cloud);
    // Stability: higher for near-term, lower for far future + model agreement
    const spread = d.tempMax.length > 1
      ? Math.max(...d.tempMax) - Math.min(...d.tempMax)
      : 0;
    const baseStability = Math.max(20, 100 - i * 4);
    const stabilityIndex = Math.round(Math.max(20, Math.min(100, baseStability - spread * 3)));
    const stabilityLabel = stabilityIndex >= 70 ? "stable" : stabilityIndex >= 45 ? "unstable" : "very-unstable";

    return {
      date,
      tempMax: avg(d.tempMax),
      tempMin: avg(d.tempMin),
      precipitation: avgPrecip,
      windSpeed: avg(d.wind),
      windGust: avg(d.windGust),
      windDirection: avg(d.windDir),
      humidity: avg(d.humidity),
      cloudCover: avgCloud,
      condition: deriveCondition(avgPrecip, avgCloud),
      stabilityIndex,
      stabilityLabel,
      uvIndex: avg(d.uv),
      feelsLikeMax: avg(d.feelsMax),
      feelsLikeMin: avg(d.feelsMin),
      sunrise: sunData[date]?.sunrise ?? null,
      sunset: sunData[date]?.sunset ?? null,
    };
  }).filter(Boolean) as DayForecast[];

  return { days, modelsUsed };
}

/**
 * Fetch hourly forecast for today from Open-Meteo best_match model.
 */
export async function collectHourlyForecast(
  targetDate: string,
  coords?: { lat: number; lon: number }
): Promise<HourlyPoint[]> {
  const location = coords ?? HONDEGHEM;
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", location.lat.toString());
    url.searchParams.set("longitude", location.lon.toString());
    url.searchParams.set("hourly", "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,relative_humidity_2m,uv_index,surface_pressure,dew_point_2m,visibility,shortwave_radiation,cloud_cover_low,cloud_cover_mid,cloud_cover_high,snowfall");
    url.searchParams.set("timezone", "Europe/Paris");
    url.searchParams.set("forecast_days", "2");

    const aromeUrl = new URL("https://api.open-meteo.com/v1/forecast");
    aromeUrl.searchParams.set("latitude", location.lat.toString());
    aromeUrl.searchParams.set("longitude", location.lon.toString());
    aromeUrl.searchParams.set("hourly", "temperature_2m,precipitation");
    aromeUrl.searchParams.set("timezone", "Europe/Paris");
    aromeUrl.searchParams.set("forecast_days", "2");
    aromeUrl.searchParams.set("models", "meteofrance_arome_france_hd");
    const aromeResponse = fetchWeather(aromeUrl.toString(), {}, { timeoutMs: 5_000, attempts: 1 }).catch(() => null);

    const response = await fetchWeather(url.toString(), {}, { timeoutMs: 8_000, attempts: 1 });
    if (!response.ok) return [];

    const data = await response.json();
    const hourly = data.hourly;
    if (!hourly?.time) return [];

    // Fetch a second model (AROME) for spread estimation
    let aromeTemps: (number | null)[] = [];
    let aromePrecips: (number | null)[] = [];
    try {
      const aromeResp = await aromeResponse;
      if (aromeResp?.ok) {
        const aromeData = await aromeResp.json();
        if (aromeData.hourly?.time) {
          for (let j = 0; j < aromeData.hourly.time.length; j++) {
            if (aromeData.hourly.time[j].startsWith(targetDate)) {
              aromeTemps.push(aromeData.hourly.temperature_2m?.[j] ?? null);
              aromePrecips.push(aromeData.hourly.precipitation?.[j] ?? null);
            }
          }
        }
      }
    } catch { /* AROME optional */ }

    const points: HourlyPoint[] = [];
    let aromeIdx = 0;
    for (let i = 0; i < hourly.time.length; i++) {
      const dt = hourly.time[i]; // "2026-07-05T14:00"
      if (!dt.startsWith(targetDate)) continue;
      const hour = dt.slice(11, 16); // "14:00"
      const precip = hourly.precipitation?.[i] ?? null;
      const cloud = hourly.cloud_cover?.[i] ?? null;
      const bestTemp = hourly.temperature_2m?.[i] ?? null;
      const aromeTemp = aromeTemps[aromeIdx] ?? null;
      const aromePrecip = aromePrecips[aromeIdx] ?? null;
      aromeIdx++;

      // Spread: difference between best_match and AROME
      const tempSpread = (bestTemp != null && aromeTemp != null)
        ? Math.abs(bestTemp - aromeTemp)
        : null;
      // Precip probability: 100% if both models predict rain, 50% if only one
      const bestRain = (precip ?? 0) >= 0.1;
      const aromeRain = (aromePrecip ?? 0) >= 0.1;
      const precipProb = (bestRain && aromeRain) ? 100 : (bestRain || aromeRain) ? 50 : 0;

      // Derive precipitation type and intensity
      const snowfall = hourly.snowfall?.[i] ?? 0;
      let precipType: string | null = null;
      let precipIntensity: string | null = null;
      if ((precip ?? 0) > 0 || snowfall > 0) {
        precipType = snowfall > 0 ? "snow" : (bestTemp != null && bestTemp <= 0) ? "freezing_rain" : "rain";
        const total = (precip ?? 0) + snowfall;
        precipIntensity = total > 5 ? "heavy" : total > 1 ? "moderate" : "light";
      }

      points.push({
        hour,
        temp: bestTemp,
        apparentTemp: hourly.apparent_temperature?.[i] ?? null,
        precipitation: precip,
        windSpeed: hourly.wind_speed_10m?.[i] ?? null,
        windGust: hourly.wind_gusts_10m?.[i] ?? null,
        windDirection: hourly.wind_direction_10m?.[i] ?? null,
        cloudCover: cloud,
        humidity: hourly.relative_humidity_2m?.[i] ?? null,
        uvIndex: hourly.uv_index?.[i] ?? null,
        condition: deriveCondition(precip, cloud),
        // Extended fields
        pressure: hourly.surface_pressure?.[i] ?? null,
        dewPoint: hourly.dew_point_2m?.[i] ?? null,
        visibility: hourly.visibility?.[i] != null ? Math.round((hourly.visibility[i] as number) / 1000 * 10) / 10 : null,
        solarRadiation: hourly.shortwave_radiation?.[i] ?? null,
        cloudLow: hourly.cloud_cover_low?.[i] ?? null,
        cloudMid: hourly.cloud_cover_mid?.[i] ?? null,
        cloudHigh: hourly.cloud_cover_high?.[i] ?? null,
        precipType,
        precipIntensity,
        // Multi-model
        tempSpread,
        precipProb,
        modelCount: aromeTemp != null ? 2 : 1,
      });
    }
    return points;
  } catch (err) {
    console.error("[Hourly] Error fetching hourly forecast:", err);
    return [];
  }
}

/**
 * Collect hourly forecasts for ALL expert models for a given date and location.
 * Returns an array of { modelName, hours } for storage in hourly_forecasts table.
 * Called daily at 05h00 by the heartbeat cron.
 */
export async function collectHourlyForecastAllModels(
  targetDate: string,
  coords?: { lat: number; lon: number }
): Promise<Array<{
  modelName: string;
  hours: Array<{
    hour: number;
    temperature: number | null;
    apparentTemperature: number | null;
    precipitation: number | null;
    windSpeed: number | null;
    windGusts: number | null;
    windDirection: number | null;
    humidity: number | null;
    pressure: number | null;
    cloudCover: number | null;
    weatherCode: number | null;
  }>;
}>> {
  const location = coords ?? HONDEGHEM;
  const modelsToCollect = [
    { name: "AROME", modelId: "meteofrance_arome_france_hd" },
    { name: "ARPEGE", modelId: "meteofrance_arpege_europe" },
    { name: "ICON", modelId: "dwd_icon_eu" },
    { name: "ECMWF", modelId: "ecmwf_ifs025" },
    { name: "GFS", modelId: "gfs_seamless" },
    { name: "GEM", modelId: "gem_seamless" },
    { name: "UKMET", modelId: "ukmo_seamless" },
    { name: "best_match", modelId: null }, // Open-Meteo best match
  ];

  const results = await Promise.all(modelsToCollect.map(async (model): Promise<{
    modelName: string;
    hours: Array<{
      hour: number;
      temperature: number | null;
      apparentTemperature: number | null;
      precipitation: number | null;
      windSpeed: number | null;
      windGusts: number | null;
      windDirection: number | null;
      humidity: number | null;
      pressure: number | null;
      cloudCover: number | null;
      weatherCode: number | null;
    }>;
  } | null> => {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", location.lat.toString());
      url.searchParams.set("longitude", location.lon.toString());
      url.searchParams.set("hourly", "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,relative_humidity_2m,surface_pressure,cloud_cover,weather_code");
      url.searchParams.set("timezone", "Europe/Paris");
      url.searchParams.set("forecast_days", "2");
      if (model.modelId) {
        url.searchParams.set("models", model.modelId);
      }

      const response = await fetchWeather(url.toString(), {}, { timeoutMs: 12_000, attempts: 2 });
      if (!response.ok) {
        console.warn(`[HourlyAll] ${model.name} HTTP ${response.status}`);
        return null;
      }

      const data = await response.json();
      const hourly = data.hourly;
      if (!hourly?.time) return null;

      const hours: Array<{
        hour: number;
        temperature: number | null;
        apparentTemperature: number | null;
        precipitation: number | null;
        windSpeed: number | null;
        windGusts: number | null;
        windDirection: number | null;
        humidity: number | null;
        pressure: number | null;
        cloudCover: number | null;
        weatherCode: number | null;
      }> = [];

      for (let i = 0; i < hourly.time.length; i++) {
        const dt: string = hourly.time[i]; // "2026-07-05T14:00"
        if (!dt.startsWith(targetDate)) continue;
        const hourNum = parseInt(dt.slice(11, 13), 10);
        hours.push({
          hour: hourNum,
          temperature: hourly.temperature_2m?.[i] ?? null,
          apparentTemperature: hourly.apparent_temperature?.[i] ?? null,
          precipitation: hourly.precipitation?.[i] ?? null,
          windSpeed: hourly.wind_speed_10m?.[i] ?? null,
          windGusts: hourly.wind_gusts_10m?.[i] ?? null,
          windDirection: hourly.wind_direction_10m?.[i] ?? null,
          humidity: hourly.relative_humidity_2m?.[i] ?? null,
          pressure: hourly.surface_pressure?.[i] ?? null,
          cloudCover: hourly.cloud_cover?.[i] ?? null,
          weatherCode: hourly.weather_code?.[i] ?? null,
        });
      }

      if (hours.length > 0) {
        return { modelName: model.name, hours };
      }
      return null;
    } catch (err) {
      console.warn(`[HourlyAll] Error fetching ${model.name}:`, err);
      return null;
    }
  }));

  return results.filter((forecast): forecast is NonNullable<typeof forecast> => forecast !== null);
}

/** Collect hourly candidate series without affecting active model coverage. */
export async function collectValidationHourlyForecasts(
  targetDate: string,
  coords?: { lat: number; lon: number }
): Promise<Array<{
  modelName: string;
  modelId: string;
  hours: Array<{
    hour: number;
    temperature: number | null;
    apparentTemperature: number | null;
    precipitation: number | null;
    windSpeed: number | null;
    windGusts: number | null;
    windDirection: number | null;
    humidity: number | null;
    cloudCover: number | null;
    weatherCode: number | null;
  }>;
}>> {
  const location = coords ?? HONDEGHEM;
  const results = await Promise.all(VALIDATION_WEATHER_MODELS.map(async (model) => {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", location.lat.toString());
      url.searchParams.set("longitude", location.lon.toString());
      url.searchParams.set("hourly", "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,relative_humidity_2m,cloud_cover,weather_code");
      url.searchParams.set("timezone", "Europe/Paris");
      url.searchParams.set("forecast_days", "2");
      url.searchParams.set("models", model.modelId);
      const response = await fetchWeather(url.toString(), {}, { timeoutMs: 12_000, attempts: 2 });
      if (!response.ok) return null;
      const hourly = (await response.json()).hourly;
      if (!hourly?.time) return null;
      const hours = hourly.time.flatMap((dt: string, index: number) => {
        if (!dt.startsWith(targetDate) || hourly.temperature_2m?.[index] == null) return [];
        return [{
          hour: Number.parseInt(dt.slice(11, 13), 10),
          temperature: hourly.temperature_2m[index] ?? null,
          apparentTemperature: hourly.apparent_temperature?.[index] ?? null,
          precipitation: hourly.precipitation?.[index] ?? null,
          windSpeed: hourly.wind_speed_10m?.[index] ?? null,
          windGusts: hourly.wind_gusts_10m?.[index] ?? null,
          windDirection: hourly.wind_direction_10m?.[index] ?? null,
          humidity: hourly.relative_humidity_2m?.[index] ?? null,
          cloudCover: hourly.cloud_cover?.[index] ?? null,
          weatherCode: hourly.weather_code?.[index] ?? null,
        }];
      });
      return hours.length > 0 ? { modelName: model.name, modelId: model.modelId, hours } : null;
    } catch (err) {
      console.warn(`[ValidationHourly] Error fetching ${model.name}:`, err);
      return null;
    }
  }));
  return results.filter((forecast): forecast is NonNullable<typeof forecast> => forecast !== null);
}
