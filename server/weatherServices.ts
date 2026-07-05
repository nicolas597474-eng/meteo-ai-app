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
