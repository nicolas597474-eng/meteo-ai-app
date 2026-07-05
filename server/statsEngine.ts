/**
 * Statistical Engine for MeteoAI
 * Calculates MAE, RMSE, Bias and weighted reliability scores.
 * Weighting: 30% Temperature, 30% Precipitation, 20% Wind, 20% Conditions
 */

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

/**
 * Calculate Mean Absolute Error
 */
function mae(predicted: number[], actual: number[]): number {
  if (predicted.length === 0) return 0;
  const sum = predicted.reduce((acc, val, i) => acc + Math.abs(val - actual[i]), 0);
  return sum / predicted.length;
}

/**
 * Calculate Root Mean Square Error
 */
function rmse(predicted: number[], actual: number[]): number {
  if (predicted.length === 0) return 0;
  const sum = predicted.reduce((acc, val, i) => acc + Math.pow(val - actual[i], 2), 0);
  return Math.sqrt(sum / predicted.length);
}

/**
 * Calculate Bias (mean error, positive = overestimation)
 */
function bias(predicted: number[], actual: number[]): number {
  if (predicted.length === 0) return 0;
  const sum = predicted.reduce((acc, val, i) => acc + (val - actual[i]), 0);
  return sum / predicted.length;
}

/**
 * Convert MAE to a 0-100 score (lower MAE = higher score)
 * Uses exponential decay: score = 100 * exp(-k * mae)
 */
function maeToScore(maeValue: number, maxExpectedError: number): number {
  const k = 3 / maxExpectedError; // At maxExpectedError, score ≈ 5%
  return Math.max(0, Math.min(100, 100 * Math.exp(-k * maeValue)));
}

/**
 * Calculate weighted reliability score for a single service over multiple days.
 * Weighting: 30% Temperature, 30% Precipitation, 20% Wind, 20% Conditions
 */
export function calculateReliabilityScore(
  forecasts: ForecastRow[],
  observations: ObservationRow[]
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

    // Temperature (average of max and min errors)
    if (f.tempMax != null && o.tempMax != null) {
      tempPredicted.push(f.tempMax);
      tempActual.push(o.tempMax);
    }
    if (f.tempMin != null && o.tempMin != null) {
      tempPredicted.push(f.tempMin);
      tempActual.push(o.tempMin);
    }

    // Precipitation
    if (f.precipitation != null && o.precipitation != null) {
      precipPredicted.push(f.precipitation);
      precipActual.push(o.precipitation);
    }

    // Wind
    if (f.windSpeed != null && o.windSpeed != null) {
      windPredicted.push(f.windSpeed);
      windActual.push(o.windSpeed);
    }
  }

  const maeT = mae(tempPredicted, tempActual);
  const maeP = mae(precipPredicted, precipActual);
  const maeW = mae(windPredicted, windActual);

  const rmseT = rmse(tempPredicted, tempActual);
  const rmseP = rmse(precipPredicted, precipActual);
  const rmseW = rmse(windPredicted, windActual);

  const biasT = bias(tempPredicted, tempActual);
  const biasP = bias(precipPredicted, precipActual);
  const biasW = bias(windPredicted, windActual);

  // Convert MAE to scores (max expected errors for normalization)
  const tempScore = maeToScore(maeT, 10); // 10°C max expected error
  const precipScore = maeToScore(maeP, 20); // 20mm max expected error
  const windScore = maeToScore(maeW, 30); // 30km/h max expected error
  const conditionScore = 70; // Default when no text comparison available

  // Weighted score: 30% Temp + 30% Precip + 20% Wind + 20% Conditions
  const weightedScore = (tempScore * 0.30) + (precipScore * 0.30) + (windScore * 0.20) + (conditionScore * 0.20);

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
  };
}

/**
 * Calculate Weather Stability Index™
 * Measures agreement between all services (0-100).
 * High = all services agree (stable), Low = services disagree (unstable).
 */
export function calculateStabilityIndex(forecasts: ForecastRow[]): {
  index: number;
  label: "stable" | "unstable";
} {
  if (forecasts.length < 2) return { index: 100, label: "stable" };

  const temps = forecasts.filter(f => f.tempMax != null).map(f => f.tempMax!);
  const precips = forecasts.filter(f => f.precipitation != null).map(f => f.precipitation!);

  // Standard deviation of temperature predictions
  const tempMean = temps.reduce((a, b) => a + b, 0) / temps.length;
  const tempStd = Math.sqrt(temps.reduce((acc, t) => acc + Math.pow(t - tempMean, 2), 0) / temps.length);

  // Standard deviation of precipitation predictions
  const precipMean = precips.length > 0 ? precips.reduce((a, b) => a + b, 0) / precips.length : 0;
  const precipStd = precips.length > 0
    ? Math.sqrt(precips.reduce((acc, p) => acc + Math.pow(p - precipMean, 2), 0) / precips.length)
    : 0;

  // Normalize: tempStd of 0 = perfect agreement, tempStd of 5+ = high disagreement
  const tempStability = Math.max(0, 100 - (tempStd * 20));
  const precipStability = Math.max(0, 100 - (precipStd * 10));

  const index = Math.round((tempStability * 0.6) + (precipStability * 0.4));
  const label = index >= 60 ? "stable" : "unstable";

  return { index, label };
}

/**
 * Generate MeteoAI synthesized forecast using weighted average of all services.
 * Services with higher reliability scores get higher weights.
 */
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
  // Calculate weights based on reliability scores
  const totalScore = serviceNames.reduce((acc, name) => acc + (reliabilityScores[name] || 50), 0);
  const weights: Record<string, number> = {};

  serviceNames.forEach(name => {
    weights[name] = Math.round(((reliabilityScores[name] || 50) / totalScore) * 100);
  });

  // Weighted average for each parameter
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
