/**
 * Statistical Engine for MeteoAI
 * Calculates MAE, RMSE, Bias and weighted reliability scores.
 *
 * ─── Contextual Weighting ────────────────────────────────────────────────────
 * The scoring weights adapt dynamically to the detected weather regime:
 *
 * 🌧️ Jour pluvieux   → Précip 50% | Temp 20% | Vent 15% | Cond 15%
 * 🌞 Été stable      → Temp 40%   | Précip 20% | Vent 10% | Cond 30%
 * 🌬️ Tempête         → Vent 40%   | Précip 30% | Temp 15% | Cond 15%
 * ❄️  Hiver froid     → Temp 45%   | Précip 25% | Vent 20% | Cond 10%
 * ⛅ Standard        → Temp 30%   | Précip 30% | Vent 20% | Cond 20%
 */

// ─── Regime definitions ───────────────────────────────────────────────────────

export type WeatherRegime =
  | "rainy"       // 🌧️ Jour pluvieux
  | "summer"      // 🌞 Été stable
  | "storm"       // 🌬️ Tempête
  | "cold_winter" // ❄️  Hiver froid
  | "standard";   // ⛅ Standard

export type RegimeWeights = {
  temp: number;
  precip: number;
  wind: number;
  condition: number;
};

export type RegimeInfo = {
  regime: WeatherRegime;
  label: string;
  emoji: string;
  description: string;
  weights: RegimeWeights;
};

/** All regime definitions with their contextual weights */
export const REGIME_DEFINITIONS: Record<WeatherRegime, Omit<RegimeInfo, "regime">> = {
  rainy: {
    label: "Jour pluvieux",
    emoji: "🌧️",
    description: "Précipitations significatives détectées — la précision des pluies est prioritaire.",
    weights: { temp: 0.20, precip: 0.50, wind: 0.15, condition: 0.15 },
  },
  summer: {
    label: "Été stable",
    emoji: "🌞",
    description: "Temps chaud et stable — la température et les conditions dominent le scoring.",
    weights: { temp: 0.40, precip: 0.20, wind: 0.10, condition: 0.30 },
  },
  storm: {
    label: "Tempête",
    emoji: "🌬️",
    description: "Vents forts et/ou fortes pluies — le vent et les précipitations sont critiques.",
    weights: { temp: 0.15, precip: 0.30, wind: 0.40, condition: 0.15 },
  },
  cold_winter: {
    label: "Hiver froid",
    emoji: "❄️",
    description: "Températures basses — la précision thermique est primordiale.",
    weights: { temp: 0.45, precip: 0.25, wind: 0.20, condition: 0.10 },
  },
  standard: {
    label: "Standard",
    emoji: "⛅",
    description: "Conditions normales — pondération équilibrée entre tous les paramètres.",
    weights: { temp: 0.30, precip: 0.30, wind: 0.20, condition: 0.20 },
  },
};

/**
 * Detect the current weather regime from observed/forecast conditions.
 * Uses precipitation, wind speed, and temperature to classify the situation.
 */
export function detectWeatherRegime(params: {
  precipitation: number | null;  // mm/day
  windSpeed: number | null;       // km/h
  tempMax: number | null;         // °C
  tempMin: number | null;         // °C
}): RegimeInfo {
  const precip = params.precipitation ?? 0;
  const wind = params.windSpeed ?? 0;
  const tempMax = params.tempMax ?? 15;
  const tempMin = params.tempMin ?? 5;
  const avgTemp = (tempMax + tempMin) / 2;

  // 🌬️ Tempête: vent fort (> 50 km/h) OU pluie forte + vent modéré
  if (wind > 50 || (wind > 35 && precip > 5)) {
    return { regime: "storm", ...REGIME_DEFINITIONS.storm };
  }

  // 🌧️ Jour pluvieux: précipitations significatives (> 3 mm)
  if (precip > 3) {
    return { regime: "rainy", ...REGIME_DEFINITIONS.rainy };
  }

  // ❄️ Hiver froid: température moyenne < 5°C
  if (avgTemp < 5) {
    return { regime: "cold_winter", ...REGIME_DEFINITIONS.cold_winter };
  }

  // 🌞 Été stable: temp élevée (> 22°C) et peu de pluie (< 1 mm) et vent faible (< 25 km/h)
  if (avgTemp > 22 && precip < 1 && wind < 25) {
    return { regime: "summer", ...REGIME_DEFINITIONS.summer };
  }

  // ⛅ Standard: toutes les autres situations
  return { regime: "standard", ...REGIME_DEFINITIONS.standard };
}

// ─── Score types ──────────────────────────────────────────────────────────────

export type ScoreResult = {
  serviceName: string;
  maeTemp: number;
  maePrecip: number;
  maeWind: number;
  rmseTemp: number;
  rmsePrecip: number;
  rmseWind: number;
  biasTemp: number;
  biasPrecip: number;
  biasWind: number;
  conditionAccuracy: number;
  weightedScore: number;
  regime: WeatherRegime;
  regimeLabel: string;
  regimeEmoji: string;
  weights: RegimeWeights;
};

type ForecastRow = {
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
};

type ObservationRow = {
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
};

// ─── Math helpers ─────────────────────────────────────────────────────────────

function mae(predicted: number[], actual: number[]): number {
  if (predicted.length === 0) return 0;
  return predicted.reduce((acc, val, i) => acc + Math.abs(val - actual[i]), 0) / predicted.length;
}

function rmse(predicted: number[], actual: number[]): number {
  if (predicted.length === 0) return 0;
  return Math.sqrt(predicted.reduce((acc, val, i) => acc + Math.pow(val - actual[i], 2), 0) / predicted.length);
}

function bias(predicted: number[], actual: number[]): number {
  if (predicted.length === 0) return 0;
  return predicted.reduce((acc, val, i) => acc + (val - actual[i]), 0) / predicted.length;
}

/**
 * Convert MAE to a 0-100 score (lower MAE = higher score).
 * Uses exponential decay: score = 100 * exp(-k * mae)
 */
function maeToScore(maeValue: number, maxExpectedError: number): number {
  const k = 3 / maxExpectedError;
  return Math.max(0, Math.min(100, 100 * Math.exp(-k * maeValue)));
}

// ─── Main scoring function ────────────────────────────────────────────────────

/**
 * Calculate contextually-weighted reliability score for a single service.
 *
 * The regime is detected from the observation data (actual weather that occurred),
 * ensuring the weights reflect what truly mattered on those days.
 *
 * @param forecasts   Array of forecast rows for the service
 * @param observations Array of actual observation rows (same dates)
 * @param forcedRegime Optional: override auto-detection with a specific regime
 */
export function calculateReliabilityScore(
  forecasts: ForecastRow[],
  observations: ObservationRow[],
  forcedRegime?: WeatherRegime
): ScoreResult {
  const tempPredicted: number[] = [];
  const tempActual: number[] = [];
  const precipPredicted: number[] = [];
  const precipActual: number[] = [];
  const windPredicted: number[] = [];
  const windActual: number[] = [];

  for (let i = 0; i < forecasts.length; i++) {
    const f = forecasts[i];
    const o = observations[i];
    if (!f || !o) continue;

    if (f.tempMax != null && o.tempMax != null) { tempPredicted.push(f.tempMax); tempActual.push(o.tempMax); }
    if (f.tempMin != null && o.tempMin != null) { tempPredicted.push(f.tempMin); tempActual.push(o.tempMin); }
    if (f.precipitation != null && o.precipitation != null) { precipPredicted.push(f.precipitation); precipActual.push(o.precipitation); }
    if (f.windSpeed != null && o.windSpeed != null) { windPredicted.push(f.windSpeed); windActual.push(o.windSpeed); }
  }

  // Detect regime from actual observations (average across all days)
  let regimeInfo: RegimeInfo;
  if (forcedRegime) {
    regimeInfo = { regime: forcedRegime, ...REGIME_DEFINITIONS[forcedRegime] };
  } else {
    const avgPrecip = precipActual.length > 0 ? precipActual.reduce((a, b) => a + b, 0) / precipActual.length : null;
    const avgWind = windActual.length > 0 ? windActual.reduce((a, b) => a + b, 0) / windActual.length : null;
    // Use tempActual pairs for max/min (even indices = max, odd = min)
    const tempMaxActual = tempActual.filter((_, i) => i % 2 === 0);
    const tempMinActual = tempActual.filter((_, i) => i % 2 === 1);
    const avgTempMax = tempMaxActual.length > 0 ? tempMaxActual.reduce((a, b) => a + b, 0) / tempMaxActual.length : null;
    const avgTempMin = tempMinActual.length > 0 ? tempMinActual.reduce((a, b) => a + b, 0) / tempMinActual.length : null;
    regimeInfo = detectWeatherRegime({ precipitation: avgPrecip, windSpeed: avgWind, tempMax: avgTempMax, tempMin: avgTempMin });
  }

  const { weights } = regimeInfo;

  const maeT = mae(tempPredicted, tempActual);
  const maeP = mae(precipPredicted, precipActual);
  const maeW = mae(windPredicted, windActual);

  const rmseT = rmse(tempPredicted, tempActual);
  const rmseP = rmse(precipPredicted, precipActual);
  const rmseW = rmse(windPredicted, windActual);

  const biasT = bias(tempPredicted, tempActual);
  const biasP = bias(precipPredicted, precipActual);
  const biasW = bias(windPredicted, windActual);

  const tempScore = maeToScore(maeT, 10);
  const precipScore = maeToScore(maeP, 20);
  const windScore = maeToScore(maeW, 30);
  const conditionScore = 70; // Default when no text comparison available

  // Contextually-weighted score
  const weightedScore =
    (tempScore * weights.temp) +
    (precipScore * weights.precip) +
    (windScore * weights.wind) +
    (conditionScore * weights.condition);

  return {
    serviceName: "",
    maeTemp: Math.round(maeT * 100) / 100,
    maePrecip: Math.round(maeP * 100) / 100,
    maeWind: Math.round(maeW * 100) / 100,
    rmseTemp: Math.round(rmseT * 100) / 100,
    rmsePrecip: Math.round(rmseP * 100) / 100,
    rmseWind: Math.round(rmseW * 100) / 100,
    biasTemp: Math.round(biasT * 100) / 100,
    biasPrecip: Math.round(biasP * 100) / 100,
    biasWind: Math.round(biasW * 100) / 100,
    conditionAccuracy: conditionScore / 100,
    weightedScore: Math.round(weightedScore * 100) / 100,
    regime: regimeInfo.regime,
    regimeLabel: regimeInfo.label,
    regimeEmoji: regimeInfo.emoji,
    weights,
  };
}

// ─── Stability Index ──────────────────────────────────────────────────────────

export function calculateStabilityIndex(forecasts: ForecastRow[]): {
  index: number;
  label: "stable" | "unstable";
} {
  if (forecasts.length < 2) return { index: 100, label: "stable" };

  const temps = forecasts.filter(f => f.tempMax != null).map(f => f.tempMax!);
  const precips = forecasts.filter(f => f.precipitation != null).map(f => f.precipitation!);

  const tempMean = temps.reduce((a, b) => a + b, 0) / temps.length;
  const tempStd = Math.sqrt(temps.reduce((acc, t) => acc + Math.pow(t - tempMean, 2), 0) / temps.length);

  const precipMean = precips.length > 0 ? precips.reduce((a, b) => a + b, 0) / precips.length : 0;
  const precipStd = precips.length > 0
    ? Math.sqrt(precips.reduce((acc, p) => acc + Math.pow(p - precipMean, 2), 0) / precips.length)
    : 0;

  const tempStability = Math.max(0, 100 - (tempStd * 20));
  const precipStability = Math.max(0, 100 - (precipStd * 10));

  const index = Math.round((tempStability * 0.6) + (precipStability * 0.4));
  return { index, label: index >= 60 ? "stable" : "unstable" };
}

// ─── MeteoAI Forecast Generator ──────────────────────────────────────────────

export function generateMeteoAIForecast(
  forecasts: ForecastRow[],
  serviceNames: string[],
  reliabilityScores: Record<string, number>
): {
  tempMax: number;
  tempMin: number;
  precipitation: number;
  windSpeed: number;
  weights: Record<string, number>;
} {
  const totalScore = serviceNames.reduce((acc, name) => acc + (reliabilityScores[name] || 50), 0);
  const weights: Record<string, number> = {};
  serviceNames.forEach(name => {
    weights[name] = Math.round(((reliabilityScores[name] || 50) / totalScore) * 100);
  });

  let tempMaxSum = 0, tempMinSum = 0, precipSum = 0, windSum = 0;
  let tempMaxWeight = 0, tempMinWeight = 0, precipWeight = 0, windWeight = 0;

  forecasts.forEach((f, i) => {
    const w = (reliabilityScores[serviceNames[i]] || 50) / totalScore;
    if (f.tempMax != null) { tempMaxSum += f.tempMax * w; tempMaxWeight += w; }
    if (f.tempMin != null) { tempMinSum += f.tempMin * w; tempMinWeight += w; }
    if (f.precipitation != null) { precipSum += f.precipitation * w; precipWeight += w; }
    if (f.windSpeed != null) { windSum += f.windSpeed * w; windWeight += w; }
  });

  return {
    tempMax: Math.round((tempMaxWeight > 0 ? tempMaxSum / tempMaxWeight : 0) * 10) / 10,
    tempMin: Math.round((tempMinWeight > 0 ? tempMinSum / tempMinWeight : 0) * 10) / 10,
    precipitation: Math.round((precipWeight > 0 ? precipSum / precipWeight : 0) * 10) / 10,
    windSpeed: Math.round((windWeight > 0 ? windSum / windWeight : 0) * 10) / 10,
    weights,
  };
}
