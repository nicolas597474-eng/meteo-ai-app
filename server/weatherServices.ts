/**
 * Weather Services Configuration & Open-Meteo Collector
 * Location: Hondeghem (lat: 50.7567, lon: 2.5204)
 */

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

/**
 * Collect forecasts from Open-Meteo API for expert models.
 * Returns forecast data for today's date.
 */
export async function collectExpertForecasts(targetDate: string): Promise<ForecastData[]> {
  const results: ForecastData[] = [];

  for (const service of WEATHER_SERVICES.expert) {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", HONDEGHEM.lat.toString());
      url.searchParams.set("longitude", HONDEGHEM.lon.toString());
      url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,relative_humidity_2m_mean,cloud_cover_mean");
      url.searchParams.set("timezone", "Europe/Paris");
      url.searchParams.set("forecast_days", "7");

      if (service.modelId !== "best_match") {
        url.searchParams.set("models", service.modelId);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        console.error(`[Collector] ${service.name} HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const daily = data.daily;
      if (!daily || !daily.time) continue;

      // Find the target date index
      const dateIndex = daily.time.indexOf(targetDate);
      if (dateIndex === -1) continue;

      results.push({
        serviceName: service.name,
        serviceCategory: service.category,
        tempMax: daily.temperature_2m_max?.[dateIndex] ?? null,
        tempMin: daily.temperature_2m_min?.[dateIndex] ?? null,
        precipitation: daily.precipitation_sum?.[dateIndex] ?? null,
        windSpeed: daily.wind_speed_10m_max?.[dateIndex] ?? null,
        windGust: daily.wind_gusts_10m_max?.[dateIndex] ?? null,
        humidity: daily.relative_humidity_2m_mean?.[dateIndex] ?? null,
        cloudCover: daily.cloud_cover_mean?.[dateIndex] ?? null,
        condition: null, // Open-Meteo doesn't provide text conditions
        rawData: data,
      });

      // Rate limit: small delay between requests
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`[Collector] Error fetching ${service.name}:`, err);
    }
  }

  return results;
}

/**
 * Collect real observations from Open-Meteo historical API.
 */
export async function collectObservations(targetDate: string) {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", HONDEGHEM.lat.toString());
    url.searchParams.set("longitude", HONDEGHEM.lon.toString());
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,relative_humidity_2m_mean,cloud_cover_mean");
    url.searchParams.set("timezone", "Europe/Paris");
    url.searchParams.set("past_days", "7");
    url.searchParams.set("forecast_days", "0");

    const response = await fetch(url.toString());
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
      source: "Open-Meteo Historical (Steenvoorde/Hazebrouck)",
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
  humidity: number | null;
  cloudCover: number | null;
  condition: string | null;
  stabilityIndex: number;
  stabilityLabel: string;
};

export type HourlyPoint = {
  hour: string;      // "HH:00"
  temp: number | null;
  apparentTemp: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windDirection: number | null;  // degrees 0-360
  cloudCover: number | null;
  humidity: number | null;
  uvIndex: number | null;
  condition: string | null;
};

function deriveCondition(precip: number | null, cloud: number | null): string {
  const p = precip ?? 0;
  const c = cloud ?? 0;
  if (p > 5) return "Pluie forte";
  if (p > 1) return "Averses";
  if (p > 0.2) return "Pluie légère";
  if (c > 80) return "Couvert";
  if (c > 50) return "Nuageux";
  if (c > 25) return "Partiellement nuageux";
  return "Ensoleillé";
}

/**
 * Fetch 15-day forecast from multiple Open-Meteo models and return averaged daily data.
 */
export async function collect15DayForecast(): Promise<{ days: DayForecast[]; modelsUsed: string[] }> {
  const models = [
    { name: "ECMWF", modelId: "ecmwf_ifs025" },
    { name: "GFS", modelId: "gfs_seamless" },
    { name: "ICON", modelId: "dwd_icon_eu" },
    { name: "Open-Meteo", modelId: null },
  ];

  const allModelData: Record<string, { tempMax: number[]; tempMin: number[]; precip: number[]; wind: number[]; windGust: number[]; humidity: number[]; cloud: number[] }> = {};
  const modelsUsed: string[] = [];
  let dates: string[] = [];

  for (const model of models) {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", HONDEGHEM.lat.toString());
      url.searchParams.set("longitude", HONDEGHEM.lon.toString());
      url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,relative_humidity_2m_mean,cloud_cover_mean");
      url.searchParams.set("timezone", "Europe/Paris");
      url.searchParams.set("forecast_days", "16");
      if (model.modelId) url.searchParams.set("models", model.modelId);

      const response = await fetch(url.toString());
      if (!response.ok) continue;

      const data = await response.json();
      const daily = data.daily;
      if (!daily?.time) continue;

      if (dates.length === 0) dates = daily.time.slice(0, 15);
      modelsUsed.push(model.name);

      for (let i = 0; i < Math.min(15, daily.time.length); i++) {
        const d = daily.time[i];
        if (!allModelData[d]) {
          allModelData[d] = { tempMax: [], tempMin: [], precip: [], wind: [], windGust: [], humidity: [], cloud: [] };
        }
        if (daily.temperature_2m_max?.[i] != null) allModelData[d].tempMax.push(daily.temperature_2m_max[i]);
        if (daily.temperature_2m_min?.[i] != null) allModelData[d].tempMin.push(daily.temperature_2m_min[i]);
        if (daily.precipitation_sum?.[i] != null) allModelData[d].precip.push(daily.precipitation_sum[i]);
        if (daily.wind_speed_10m_max?.[i] != null) allModelData[d].wind.push(daily.wind_speed_10m_max[i]);
        if (daily.wind_gusts_10m_max?.[i] != null) allModelData[d].windGust.push(daily.wind_gusts_10m_max[i]);
        if (daily.relative_humidity_2m_mean?.[i] != null) allModelData[d].humidity.push(daily.relative_humidity_2m_mean[i]);
        if (daily.cloud_cover_mean?.[i] != null) allModelData[d].cloud.push(daily.cloud_cover_mean[i]);
      }

      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`[15Day] Error fetching ${model.name}:`, err);
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
      humidity: avg(d.humidity),
      cloudCover: avgCloud,
      condition: deriveCondition(avgPrecip, avgCloud),
      stabilityIndex,
      stabilityLabel,
    };
  }).filter(Boolean) as DayForecast[];

  return { days, modelsUsed };
}

/**
 * Fetch hourly forecast for today from Open-Meteo best_match model.
 */
export async function collectHourlyForecast(targetDate: string): Promise<HourlyPoint[]> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", HONDEGHEM.lat.toString());
    url.searchParams.set("longitude", HONDEGHEM.lon.toString());
    url.searchParams.set("hourly", "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,cloud_cover,relative_humidity_2m,uv_index");
    url.searchParams.set("timezone", "Europe/Paris");
    url.searchParams.set("forecast_days", "2");

    const response = await fetch(url.toString());
    if (!response.ok) return [];

    const data = await response.json();
    const hourly = data.hourly;
    if (!hourly?.time) return [];

    const points: HourlyPoint[] = [];
    for (let i = 0; i < hourly.time.length; i++) {
      const dt = hourly.time[i]; // "2026-07-05T14:00"
      if (!dt.startsWith(targetDate)) continue;
      const hour = dt.slice(11, 16); // "14:00"
      const precip = hourly.precipitation?.[i] ?? null;
      const cloud = hourly.cloud_cover?.[i] ?? null;
      points.push({
        hour,
        temp: hourly.temperature_2m?.[i] ?? null,
        apparentTemp: hourly.apparent_temperature?.[i] ?? null,
        precipitation: precip,
        windSpeed: hourly.wind_speed_10m?.[i] ?? null,
        windDirection: hourly.wind_direction_10m?.[i] ?? null,
        cloudCover: cloud,
        humidity: hourly.relative_humidity_2m?.[i] ?? null,
        uvIndex: hourly.uv_index?.[i] ?? null,
        condition: deriveCondition(precip, cloud),
      });
    }
    return points;
  } catch (err) {
    console.error("[Hourly] Error fetching hourly forecast:", err);
    return [];
  }
}
