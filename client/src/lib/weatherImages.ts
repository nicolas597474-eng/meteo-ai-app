/**
 * Weather landscape images - dynamically selected based on the active weather regime.
 * Each image is a realistic oil painting style landscape matching the weather condition.
 * Maps directly to the 20 ExtendedRegime IDs from fusionEngine.ts.
 */

const WEATHER_IMAGES: Record<string, string> = {
  // Cloud-based regimes
  overcast: '/manus-storage/weather-cloudy_8ce5d14c.jpg',
  partly_cloudy: '/manus-storage/weather-partly-cloudy_f78acb3b.jpg',
  few_clouds: '/manus-storage/weather-partly-cloudy_f78acb3b.jpg',
  sunny: '/manus-storage/weather-sunny_b9457972.jpg',

  // Fog
  fog: '/manus-storage/weather-fog_8537592c.jpg',

  // Precipitation
  showers: '/manus-storage/weather-rain_73f27126.jpg',
  rainy: '/manus-storage/weather-rain_73f27126.jpg',
  thunderstorm: '/manus-storage/weather-storm_32351de6.jpg',

  // Wind
  windy: '/manus-storage/weather-wind_056d4f5a.jpg',
  storm: '/manus-storage/weather-storm_32351de6.jpg',

  // Cold
  snow: '/manus-storage/weather-snow_835ed640.jpg',
  frost: '/manus-storage/weather-frost_8d70ce79.jpg',
  freezing_rain: '/manus-storage/weather-snow_835ed640.jpg',
  deep_frost: '/manus-storage/weather-frost_8d70ce79.jpg',
  cold_wave: '/manus-storage/weather-frost_8d70ce79.jpg',

  // Heat
  summer_heat: '/manus-storage/weather-heatwave_ffafe03d.jpg',

  // Seasonal
  variable: '/manus-storage/weather-partly-cloudy_f78acb3b.jpg',
  spring_unstable: '/manus-storage/weather-partly-cloudy_f78acb3b.jpg',
  stable: '/manus-storage/weather-sunny_b9457972.jpg',
  autumn_disturbed: '/manus-storage/weather-rain_73f27126.jpg',
};

// Default fallback image (partly cloudy - neutral)
const DEFAULT_IMAGE = '/manus-storage/weather-partly-cloudy_f78acb3b.jpg';

/**
 * Get the landscape image URL based on the dominant weather regime ID.
 * Matches directly against the 20 ExtendedRegime IDs.
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

  // Direct match against regime IDs
  if (WEATHER_IMAGES[normalized]) {
    return WEATHER_IMAGES[normalized];
  }

  // Keyword-based fallback matching
  const keywords: [string[], string][] = [
    [['soleil', 'sunny', 'clear', 'ensoleill', 'beau'], 'sunny'],
    [['orage', 'thunder', 'foudre', 'eclair'], 'thunderstorm'],
    [['tempete', 'storm'], 'storm'],
    [['neige', 'snow', 'vergla'], 'snow'],
    [['brouillard', 'fog', 'brume', 'mist'], 'fog'],
    [['pluie', 'rain', 'averse', 'precip'], 'rainy'],
    [['vent', 'wind', 'rafale'], 'windy'],
    [['canicule', 'heat', 'chaleur', 'chaud'], 'summer_heat'],
    [['gel', 'frost', 'froid', 'glace', 'givre'], 'frost'],
    [['couvert', 'overcast', 'gris'], 'overcast'],
    [['nuageux', 'cloud', 'nuage'], 'partly_cloudy'],
    [['stable', 'calme', 'ete'], 'stable'],
    [['variable', 'instable', 'perturb', 'automne'], 'variable'],
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
  if (precipitation && precipitation > 10) return WEATHER_IMAGES.rainy;
  if (windSpeed && windSpeed > 60) return WEATHER_IMAGES.storm;
  if (windSpeed && windSpeed > 40) return WEATHER_IMAGES.windy;
  if (visibility !== undefined && visibility < 1000) return WEATHER_IMAGES.fog;
  if (temperature !== undefined && temperature > 33) return WEATHER_IMAGES.summer_heat;
  if (temperature !== undefined && temperature < -5) return WEATHER_IMAGES.deep_frost;
  if (temperature !== undefined && temperature < 0) return WEATHER_IMAGES.frost;
  if (precipitation && precipitation > 5) return WEATHER_IMAGES.rainy;
  if (precipitation && precipitation > 0.5) return WEATHER_IMAGES.showers;
  if (cloudCover !== undefined && cloudCover > 80) return WEATHER_IMAGES.overcast;
  if (cloudCover !== undefined && cloudCover > 50) return WEATHER_IMAGES.partly_cloudy;
  if (cloudCover !== undefined && cloudCover > 20) return WEATHER_IMAGES.few_clouds;
  if (cloudCover !== undefined && cloudCover <= 20) return WEATHER_IMAGES.sunny;

  return DEFAULT_IMAGE;
}
