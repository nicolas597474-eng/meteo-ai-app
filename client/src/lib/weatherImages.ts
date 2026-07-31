/**
 * Weather landscape images - dynamically selected based on the active weather regime.
 * Each image is a realistic oil painting style landscape matching the weather condition.
 */

const WEATHER_IMAGES: Record<string, string> = {
  // Clear / sunny conditions
  sunny: '/manus-storage/weather-sunny_b9457972.jpg',
  clear: '/manus-storage/weather-sunny_b9457972.jpg',
  ensoleille: '/manus-storage/weather-sunny_b9457972.jpg',
  
  // Cloudy conditions
  cloudy: '/manus-storage/weather-cloudy_8ce5d14c.jpg',
  overcast: '/manus-storage/weather-cloudy_8ce5d14c.jpg',
  couvert: '/manus-storage/weather-cloudy_8ce5d14c.jpg',
  ciel_couvert: '/manus-storage/weather-cloudy_8ce5d14c.jpg',
  
  // Partly cloudy
  partly_cloudy: '/manus-storage/weather-partly-cloudy_f78acb3b.jpg',
  partiellement_nuageux: '/manus-storage/weather-partly-cloudy_f78acb3b.jpg',
  peu_nuageux: '/manus-storage/weather-partly-cloudy_f78acb3b.jpg',
  
  // Rain
  rain: '/manus-storage/weather-rain_73f27126.jpg',
  pluie: '/manus-storage/weather-rain_73f27126.jpg',
  averses: '/manus-storage/weather-rain_73f27126.jpg',
  pluie_moderee: '/manus-storage/weather-rain_73f27126.jpg',
  pluie_forte: '/manus-storage/weather-rain_73f27126.jpg',
  
  // Storm / thunderstorm
  storm: '/manus-storage/weather-storm_32351de6.jpg',
  orage: '/manus-storage/weather-storm_32351de6.jpg',
  tempete: '/manus-storage/weather-storm_32351de6.jpg',
  thunderstorm: '/manus-storage/weather-storm_32351de6.jpg',
  
  // Snow
  snow: '/manus-storage/weather-snow_835ed640.jpg',
  neige: '/manus-storage/weather-snow_835ed640.jpg',
  verglas: '/manus-storage/weather-snow_835ed640.jpg',
  pluie_verglacante: '/manus-storage/weather-snow_835ed640.jpg',
  
  // Fog
  fog: '/manus-storage/weather-fog_8537592c.jpg',
  brouillard: '/manus-storage/weather-fog_8537592c.jpg',
  mist: '/manus-storage/weather-fog_8537592c.jpg',
  
  // Strong wind
  wind: '/manus-storage/weather-wind_056d4f5a.jpg',
  vent_fort: '/manus-storage/weather-wind_056d4f5a.jpg',
  windy: '/manus-storage/weather-wind_056d4f5a.jpg',
  
  // Heatwave
  heatwave: '/manus-storage/weather-heatwave_ffafe03d.jpg',
  canicule: '/manus-storage/weather-heatwave_ffafe03d.jpg',
  chaleur: '/manus-storage/weather-heatwave_ffafe03d.jpg',
  
  // Frost / cold
  frost: '/manus-storage/weather-frost_8d70ce79.jpg',
  gel: '/manus-storage/weather-frost_8d70ce79.jpg',
  froid: '/manus-storage/weather-frost_8d70ce79.jpg',
  vague_de_froid: '/manus-storage/weather-frost_8d70ce79.jpg',
  
  // Default / standard / stable
  standard: '/manus-storage/weather-partly-cloudy_f78acb3b.jpg',
  stable: '/manus-storage/weather-sunny_b9457972.jpg',
  ete_stable: '/manus-storage/weather-sunny_b9457972.jpg',
  temps_variable: '/manus-storage/weather-partly-cloudy_f78acb3b.jpg',
  printemps_instable: '/manus-storage/weather-partly-cloudy_f78acb3b.jpg',
  automne_perturbe: '/manus-storage/weather-rain_73f27126.jpg',
};

// Default fallback image (partly cloudy - neutral)
const DEFAULT_IMAGE = '/manus-storage/weather-partly-cloudy_f78acb3b.jpg';

/**
 * Get the landscape image URL based on the dominant weather regime.
 * Tries multiple matching strategies: exact key, normalized key, keyword search.
 */
export function getWeatherLandscapeImage(regime: string | undefined | null): string {
  if (!regime) return DEFAULT_IMAGE;
  
  // Normalize: lowercase, replace spaces/hyphens with underscores, remove accents
  const normalized = regime
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')
    .trim();
  
  // Direct match
  if (WEATHER_IMAGES[normalized]) {
    return WEATHER_IMAGES[normalized];
  }
  
  // Keyword-based matching
  const keywords: [string[], string][] = [
    [['soleil', 'sunny', 'clear', 'ensoleill', 'beau'], 'sunny'],
    [['orage', 'storm', 'thunder', 'foudre', 'eclair'], 'storm'],
    [['tempete', 'tempête'], 'storm'],
    [['neige', 'snow', 'vergla'], 'snow'],
    [['brouillard', 'fog', 'brume', 'mist'], 'fog'],
    [['pluie', 'rain', 'averse', 'precip'], 'rain'],
    [['vent_fort', 'wind', 'rafale'], 'wind'],
    [['canicule', 'heat', 'chaleur', 'chaud'], 'heatwave'],
    [['gel', 'frost', 'froid', 'glace', 'givre'], 'frost'],
    [['couvert', 'overcast', 'gris'], 'cloudy'],
    [['nuageux', 'cloud', 'nuage'], 'partly_cloudy'],
    [['stable', 'calme', 'ete'], 'stable'],
    [['variable', 'instable', 'perturb'], 'partly_cloudy'],
  ];
  
  for (const [kws, key] of keywords) {
    if (kws.some(kw => normalized.includes(kw))) {
      return WEATHER_IMAGES[key] || DEFAULT_IMAGE;
    }
  }
  
  return DEFAULT_IMAGE;
}

/**
 * Get image based on weather data (temperature, cloud cover, precipitation, wind).
 * Used when no regime string is available but raw data is.
 */
export function getWeatherImageFromData(params: {
  temperature?: number;
  cloudCover?: number;
  precipitation?: number;
  windSpeed?: number;
  visibility?: number;
}): string {
  const { temperature, cloudCover, precipitation, windSpeed, visibility } = params;
  
  // Priority-based selection (most impactful condition first)
  if (precipitation && precipitation > 10) return WEATHER_IMAGES.pluie_forte;
  if (windSpeed && windSpeed > 60) return WEATHER_IMAGES.storm;
  if (windSpeed && windSpeed > 40) return WEATHER_IMAGES.wind;
  if (visibility !== undefined && visibility < 1000) return WEATHER_IMAGES.fog;
  if (temperature !== undefined && temperature > 35) return WEATHER_IMAGES.heatwave;
  if (temperature !== undefined && temperature < -2) return WEATHER_IMAGES.frost;
  if (precipitation && precipitation > 2) return WEATHER_IMAGES.rain;
  if (precipitation && precipitation > 0) return WEATHER_IMAGES.averses;
  if (cloudCover !== undefined && cloudCover > 80) return WEATHER_IMAGES.cloudy;
  if (cloudCover !== undefined && cloudCover > 40) return WEATHER_IMAGES.partly_cloudy;
  if (cloudCover !== undefined && cloudCover <= 20) return WEATHER_IMAGES.sunny;
  
  return DEFAULT_IMAGE;
}
