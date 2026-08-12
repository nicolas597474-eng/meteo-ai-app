/** Fonds photographiques de la grande carte de conditions actuelles du Dashboard. */
const WEATHER_IMAGES: Record<string, string> = {
  sunny: "/manus-storage/meteoai-weather-sunny-master_e597fa3a.jpg",
  few_clouds: "/manus-storage/meteoai-weather-few-clouds_ff8a0419.jpg",
  cloudy: "/manus-storage/meteoai-weather-cloudy_0c7e1be9.jpg",
  overcast: "/manus-storage/meteoai-weather-overcast_d7af5581.jpg",
  fog: "/manus-storage/meteoai-weather-fog_413e0cc3.jpg",
  showers: "/manus-storage/meteoai-weather-showers_4efd169c.jpg",
  drizzle: "/manus-storage/meteoai-weather-drizzle_23214653.jpg",
  rainy: "/manus-storage/meteoai-weather-rain_6ed21a21.jpg",
  heavy_rain: "/manus-storage/meteoai-weather-heavy-rain_08d62cb0.jpg",
  thunderstorm: "/manus-storage/meteoai-weather-thunderstorm_851b62da.jpg",
  violent_storm: "/manus-storage/meteoai-weather-violent-storm_f79f94a5.jpg",
  snow: "/manus-storage/meteoai-weather-snow_7b345883.jpg",
  heavy_snow: "/manus-storage/meteoai-weather-heavy-snow_c321957c.jpg",
  freezing_rain: "/manus-storage/meteoai-weather-freezing-rain_b20385ef.jpg",
  frost: "/manus-storage/meteoai-weather-frost_910ff338.jpg",
  cold_sun: "/manus-storage/meteoai-weather-cold-sun_7cb7d792.jpg",
  windy: "/manus-storage/meteoai-weather-windy_e1c61512.jpg",
  heat: "/manus-storage/meteoai-weather-heat_c9ae1fc3.jpg",
  dust_haze: "/manus-storage/meteoai-weather-dust-haze_9044262d.jpg",
};

const DEFAULT_IMAGE = WEATHER_IMAGES.few_clouds;

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_").trim();
}

const CONDITION_RULES: Array<[string[], keyof typeof WEATHER_IMAGES]> = [
  [["pluie_verglacante", "verglas", "freezing"], "freezing_rain"],
  [["neige_forte", "forte_neige", "heavy_snow"], "heavy_snow"],
  [["neige", "snow"], "snow"],
  [["orage_violent", "violent_storm"], "violent_storm"],
  [["fort_orage", "thunderstorm", "orage"], "thunderstorm"],
  [["pluie_forte", "heavy_rain", "forte_pluie"], "heavy_rain"],
  [["bruine", "drizzle"], "drizzle"],
  [["averse", "showers"], "showers"],
  [["pluie", "rain", "rainy"], "rainy"],
  [["brouillard", "brume", "fog", "mist"], "fog"],
  [["poussiere", "brume_seche", "dust", "haze"], "dust_haze"],
  [["vent_fort", "windy", "rafale", "wind"], "windy"],
  [["givre", "gel", "frost"], "frost"],
  [["grand_soleil", "cold_sun"], "cold_sun"],
  [["canicule", "chaleur", "heat"], "heat"],
  [["couvert", "tres_nuageux", "overcast"], "overcast"],
  [["nuageux", "cloudy"], "cloudy"],
  [["eclaircies", "peu_nuageux", "partiellement_nuageux", "few_clouds", "partly_cloudy"], "few_clouds"],
  [["ensoleille", "sunny", "clear", "soleil"], "sunny"],
];

export function getWeatherLandscapeImage(regime: string | undefined | null): string {
  const normalized = normalize(regime);
  for (const [keywords, key] of CONDITION_RULES) if (keywords.some((keyword) => normalized.includes(keyword))) return WEATHER_IMAGES[key];
  return DEFAULT_IMAGE;
}

export function getWeatherImageFromData(params: { temperature?: number; cloudCover?: number; precipitation?: number; windSpeed?: number; visibility?: number }): string {
  const { temperature, cloudCover, precipitation, windSpeed, visibility } = params;
  if ((precipitation ?? 0) > 10) return WEATHER_IMAGES.heavy_rain;
  if ((windSpeed ?? 0) > 60) return WEATHER_IMAGES.violent_storm;
  if ((visibility ?? Infinity) < 1000) return WEATHER_IMAGES.fog;
  if ((temperature ?? -Infinity) > 33) return WEATHER_IMAGES.heat;
  if ((temperature ?? Infinity) < -5) return WEATHER_IMAGES.cold_sun;
  if ((temperature ?? Infinity) < 0) return WEATHER_IMAGES.frost;
  if ((precipitation ?? 0) > 0.5) return WEATHER_IMAGES.rainy;
  if ((windSpeed ?? 0) > 40) return WEATHER_IMAGES.windy;
  if (cloudCover !== undefined && cloudCover > 80) return WEATHER_IMAGES.overcast;
  if (cloudCover !== undefined && cloudCover > 50) return WEATHER_IMAGES.cloudy;
  if (cloudCover !== undefined && cloudCover > 20) return WEATHER_IMAGES.few_clouds;
  return cloudCover !== undefined ? WEATHER_IMAGES.sunny : DEFAULT_IMAGE;
}

/** La condition de l’heure courante est toujours prioritaire sur le régime journalier. */
export function getDashboardWeatherImage(params: { condition?: string | null; temperature?: number; cloudCover?: number; precipitation?: number; windSpeed?: number; visibility?: number; regime?: string | null }): string {
  if (normalize(params.condition)) return getWeatherLandscapeImage(params.condition);
  if (params.regime) return getWeatherLandscapeImage(params.regime);
  return getWeatherImageFromData(params);
}
