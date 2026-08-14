/**
 * Statistical Engine for MeteoAI — Multi-Dimension Error Analysis
 *
 * Principle: NEVER compute a single raw score. First measure each error dimension
 * independently with its own specific metrics, then combine with contextual weights.
 *
 * ─── 4 Error Dimensions ──────────────────────────────────────────────────────
 *
 * 🌡️ Temperature
 *   - MAE (Mean Absolute Error)
 *   - Bias (tendency to over/under-estimate)
 *   - Max error (worst forecast spike)
 *
 * 🌧️ Precipitation
 *   - Rain detection: POD (Probability of Detection), FAR (False Alarm Rate), CSI (Critical Success Index)
 *   - Quantity error: MAE on rainy days only
 *   - False positives (predicted rain, no rain) / False negatives (missed rain)
 *
 * 💨 Wind
 *   - MAE mean wind speed
 *   - MAE wind gusts (when available)
 *
 * ☁️ Cloud cover / Conditions
 *   - Categorical concordance score (sunny / cloudy / overcast)
 *
 * ─── Contextual Weighting ────────────────────────────────────────────────────
 * 🌧️ Jour pluvieux   → Précip 50% | Temp 20% | Vent 15% | Cond 15%
 * 🌞 Été stable      → Temp 40%   | Précip 20% | Vent 10% | Cond 30%
 * 🌬️ Tempête         → Vent 40%   | Précip 30% | Temp 15% | Cond 15%
 * ❄️  Hiver froid     → Temp 45%   | Précip 25% | Vent 20% | Cond 10%
 * ⛅ Standard        → Temp 30%   | Précip 30% | Vent 20% | Cond 20%
 */

// ─── Regime definitions ───────────────────────────────────────────────────────

// ─── Unified regime system (20 régimes — aligned with fusionEngine display) ────
// Import the 20-regime system from fusionEngine to unify calculation and display
import {
  detectExtendedRegime,
  getRegimeWeights,
  EXTENDED_REGIME_INFO,
  type ExtendedRegime,
} from "./fusionEngine";
import { LABORATORY_SCORE_WEIGHTS } from "./weatherReliabilityConfig";

// Alias for backward compatibility throughout this file
export type WeatherRegime = ExtendedRegime;
export type RegimeWeights = {
  temp: number;
  precip: number;
  wind: number;
  condition: number;
  humidity?: number;
  pressure?: number;
};

export type RegimeInfo = {
  regime: WeatherRegime;
  label: string;
  emoji: string;
  description: string;
  weights: RegimeWeights;
};

/**
 * Le moteur de fiabilité mesure actuellement quatre dimensions : température,
 * précipitations, vent et conditions. Les poids humidité/pression du moteur de
 * fusion sont donc intégrés au score « conditions » afin de conserver une somme
 * de 100 %, sans perdre l'importance contextuelle de ces deux paramètres.
 */
function toScoredWeights(weights: {
  temp: number;
  precip: number;
  wind: number;
  condition: number;
  humidity?: number;
  pressure?: number;
}): RegimeWeights {
  return {
    temp: weights.temp,
    precip: weights.precip,
    wind: weights.wind,
    condition: weights.condition + (weights.humidity ?? 0) + (weights.pressure ?? 0),
  };
}

// REGIME_DEFINITIONS is now EXTENDED_REGIME_INFO in fusionEngine.ts
// Use EXTENDED_REGIME_INFO[regime] for label/emoji/description
export const REGIME_DEFINITIONS = EXTENDED_REGIME_INFO;

export function detectWeatherRegime(params: {
  precipitation: number | null;
  windSpeed: number | null;
  tempMax: number | null;
  tempMin: number | null;
}): RegimeInfo {
  // Delegate to the unified 20-regime system in fusionEngine
  const avgTemp = ((params.tempMax ?? 15) + (params.tempMin ?? 5)) / 2;
  const regime = detectExtendedRegime({
    temperature: avgTemp,
    precipitation: params.precipitation,
    windSpeed: params.windSpeed,
  });
  const info = EXTENDED_REGIME_INFO[regime];
  const weights = toScoredWeights(getRegimeWeights(regime));
  return {
    regime,
    label: info.label,
    emoji: info.emoji,
    description: info.description,
    weights,
  };
}

// ─── Row types ────────────────────────────────────────────────────────────────

export type ForecastRow = {
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust?: number | null;
  humidity?: number | null;
  pressure?: number | null;
  cloudCover?: number | null;
  condition?: string | null;
};

export type ObservationRow = {
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust?: number | null;
  humidity?: number | null;
  pressure?: number | null;
  cloudCover?: number | null;
  condition?: string | null;
};

// ─── Dimension result types ───────────────────────────────────────────────────

/** 🌡️ Temperature dimension */
export type TempDimension = {
  mae: number;          // Mean Absolute Error (°C)
  bias: number;         // Systematic bias (+ = overestimate, - = underestimate)
  maxError: number;     // Worst single-day error (°C)
  rmse: number;         // Root Mean Square Error
  score: number;        // 0-100 (higher = better)
  sampleSize: number;
};

/** 🌧️ Precipitation dimension */
export type PrecipDimension = {
  // Detection skill (binary: rain vs no-rain, threshold 1mm)
  pod: number;          // Probability of Detection (hits / (hits + misses)) 0-1
  far: number;          // False Alarm Rate (false alarms / (hits + false alarms)) 0-1
  csi: number;          // Critical Success Index (hits / (hits + misses + false alarms)) 0-1
  falsePositives: number;  // Days predicted rain, no rain observed
  falseNegatives: number;  // Days missed rain (rain observed, none predicted)
  // Quantity error (only on days where both forecast and obs have rain)
  maeQuantity: number;  // MAE of precipitation amount (mm)
  biasQuantity: number; // Wet/dry bias on quantity
  score: number;        // 0-100 composite
  sampleSize: number;
};

/** 💨 Wind dimension */
export type WindDimension = {
  maeMean: number;      // MAE of mean wind speed (km/h)
  maeGusts: number;     // MAE of wind gusts (km/h), NaN if no gust data
  biasMean: number;     // Systematic bias on mean wind
  maxError: number;     // Worst single-day error
  score: number;        // 0-100
  sampleSize: number;
};

/** A scalar error dimension used by the laboratory's transparent normalized score. */
export type ScalarDimension = {
  mae: number;
  rmse: number;
  bias: number;
  score: number | null;
  sampleSize: number;
};

/** ☁️ Cloud cover / Conditions dimension */
export type ConditionDimension = {
  concordance: number;  // % of days where category matches (0-100)
  maeCloudCover: number; // MAE of cloud cover % (when available)
  score: number;        // 0-100
  sampleSize: number;
};

/** Full multi-dimension score result */
export type DimensionScores = {
  temperature: TempDimension;
  precipitation: PrecipDimension;
  wind: WindDimension;
  condition: ConditionDimension;
};

/** Final aggregated score result */
export type ScoreResult = {
  serviceName: string;
  // Legacy flat fields (kept for DB compatibility)
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
  /** Null until all six laboratory dimensions have real aligned values. */
  normalizedScore: number | null;
  // New dimension-level detail
  dimensions: DimensionScores;
  regime: WeatherRegime;
  regimeLabel: string;
  regimeEmoji: string;
  weights: RegimeWeights;
  laboratory: {
    wind: ScalarDimension;
    gusts: ScalarDimension;
    humidity: ScalarDimension;
    pressure: ScalarDimension;
  };
};

// ─── Math primitives ──────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function mae(predicted: number[], actual: number[]): number {
  if (predicted.length === 0) return 0;
  return mean(predicted.map((v, i) => Math.abs(v - actual[i])));
}

function rmse(predicted: number[], actual: number[]): number {
  if (predicted.length === 0) return 0;
  return Math.sqrt(mean(predicted.map((v, i) => Math.pow(v - actual[i], 2))));
}

function bias(predicted: number[], actual: number[]): number {
  if (predicted.length === 0) return 0;
  return mean(predicted.map((v, i) => v - actual[i]));
}

function maxAbsError(predicted: number[], actual: number[]): number {
  if (predicted.length === 0) return 0;
  return Math.max(...predicted.map((v, i) => Math.abs(v - actual[i])));
}

/** Convert MAE to 0-100 score using exponential decay */
function maeToScore(maeValue: number, maxExpectedError: number): number {
  const k = 3 / maxExpectedError;
  return Math.max(0, Math.min(100, 100 * Math.exp(-k * maeValue)));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── Dimension calculators ────────────────────────────────────────────────────

/**
 * 🌡️ Temperature dimension
 * Uses both tempMax and tempMin for all metrics.
 */
function calcTempDimension(forecasts: ForecastRow[], observations: ObservationRow[]): TempDimension {
  const pred: number[] = [];
  const actual: number[] = [];

  for (let i = 0; i < forecasts.length; i++) {
    const f = forecasts[i], o = observations[i];
    if (!f || !o) continue;
    if (f.tempMax != null && o.tempMax != null) { pred.push(f.tempMax); actual.push(o.tempMax); }
    if (f.tempMin != null && o.tempMin != null) { pred.push(f.tempMin); actual.push(o.tempMin); }
  }

  const maeVal = mae(pred, actual);
  return {
    mae: round2(maeVal),
    bias: round2(bias(pred, actual)),
    maxError: round2(maxAbsError(pred, actual)),
    rmse: round2(rmse(pred, actual)),
    score: round2(maeToScore(maeVal, 10)),
    sampleSize: pred.length,
  };
}

/**
 * 🌧️ Precipitation dimension
 * Threshold for rain/no-rain detection: 1 mm/day
 */
const RAIN_THRESHOLD = 1.0; // mm

function calcPrecipDimension(forecasts: ForecastRow[], observations: ObservationRow[]): PrecipDimension {
  let hits = 0;        // Both predicted and observed rain
  let misses = 0;      // Observed rain, not predicted
  let falseAlarms = 0; // Predicted rain, not observed
  let correctNeg = 0;  // Both correctly predicted no rain

  const quantityPred: number[] = [];
  const quantityActual: number[] = [];

  for (let i = 0; i < forecasts.length; i++) {
    const f = forecasts[i], o = observations[i];
    if (!f || !o || f.precipitation == null || o.precipitation == null) continue;

    const fRain = f.precipitation >= RAIN_THRESHOLD;
    const oRain = o.precipitation >= RAIN_THRESHOLD;

    if (fRain && oRain) {
      hits++;
      quantityPred.push(f.precipitation);
      quantityActual.push(o.precipitation);
    } else if (!fRain && oRain) {
      misses++;
    } else if (fRain && !oRain) {
      falseAlarms++;
    } else {
      correctNeg++;
    }
  }

  const pod = (hits + misses) > 0 ? hits / (hits + misses) : 0;
  const far = (hits + falseAlarms) > 0 ? falseAlarms / (hits + falseAlarms) : 0;
  const csi = (hits + misses + falseAlarms) > 0 ? hits / (hits + misses + falseAlarms) : 1;

  const maeQ = mae(quantityPred, quantityActual);
  const biasQ = bias(quantityPred, quantityActual);

  // Composite score: 50% detection skill (CSI) + 50% quantity accuracy
  const detectionScore = csi * 100;
  const quantityScore = quantityPred.length > 0 ? maeToScore(maeQ, 15) : 70;
  const compositeScore = (detectionScore * 0.5) + (quantityScore * 0.5);

  return {
    pod: round2(pod),
    far: round2(far),
    csi: round2(csi),
    falsePositives: falseAlarms,
    falseNegatives: misses,
    maeQuantity: round2(maeQ),
    biasQuantity: round2(biasQ),
    score: round2(compositeScore),
    sampleSize: hits + misses + falseAlarms + correctNeg,
  };
}

/**
 * 💨 Wind dimension
 * Separate MAE for mean wind and gusts.
 */
function calcWindDimension(forecasts: ForecastRow[], observations: ObservationRow[]): WindDimension {
  const meanPred: number[] = [];
  const meanActual: number[] = [];
  const gustPred: number[] = [];
  const gustActual: number[] = [];

  for (let i = 0; i < forecasts.length; i++) {
    const f = forecasts[i], o = observations[i];
    if (!f || !o) continue;
    if (f.windSpeed != null && o.windSpeed != null) { meanPred.push(f.windSpeed); meanActual.push(o.windSpeed); }
    if (f.windGust != null && o.windGust != null) { gustPred.push(f.windGust); gustActual.push(o.windGust); }
  }

  const maeMean = mae(meanPred, meanActual);
  const maeGusts = gustPred.length > 0 ? mae(gustPred, gustActual) : 0;

  // Score: 70% mean wind accuracy + 30% gust accuracy (if available)
  const meanScore = maeToScore(maeMean, 25);
  const gustScore = gustPred.length > 0 ? maeToScore(maeGusts, 35) : meanScore;
  const score = gustPred.length > 0 ? (meanScore * 0.7 + gustScore * 0.3) : meanScore;

  return {
    maeMean: round2(maeMean),
    maeGusts: gustPred.length > 0 ? round2(maeGusts) : 0,
    biasMean: round2(bias(meanPred, meanActual)),
    maxError: round2(maxAbsError(meanPred, meanActual)),
    score: round2(score),
    sampleSize: meanPred.length,
  };
}

/**
 * Measure one directly comparable scalar variable. Missing archived values stay
 * unavailable instead of being converted into a neutral or favourable score.
 */
function calcScalarDimension(
  forecasts: ForecastRow[],
  observations: ObservationRow[],
  forecastValue: (row: ForecastRow) => number | null | undefined,
  observationValue: (row: ObservationRow) => number | null | undefined,
  expectedError: number,
): ScalarDimension {
  const predicted: number[] = [];
  const actual: number[] = [];
  for (let index = 0; index < forecasts.length; index++) {
    const forecast = forecasts[index];
    const observation = observations[index];
    if (!forecast || !observation) continue;
    const predictedValue = forecastValue(forecast);
    const actualValue = observationValue(observation);
    if (predictedValue == null || actualValue == null) continue;
    predicted.push(predictedValue);
    actual.push(actualValue);
  }

  if (predicted.length === 0) {
    return { mae: 0, rmse: 0, bias: 0, score: null, sampleSize: 0 };
  }

  const maeValue = mae(predicted, actual);
  return {
    mae: round2(maeValue),
    rmse: round2(rmse(predicted, actual)),
    bias: round2(bias(predicted, actual)),
    score: round2(maeToScore(maeValue, expectedError)),
    sampleSize: predicted.length,
  };
}

/**
 * ☁️ Cloud cover / Conditions dimension
 * Categorical concordance: maps conditions to 3 categories (clear/partly/overcast).
 */
function conditionCategory(condition: string | null | undefined, cloudCover: number | null | undefined): number {
  // 0 = clear, 1 = partly cloudy, 2 = overcast/rain
  if (condition) {
    const c = condition.toLowerCase();
    if (c.includes("pluie") || c.includes("orage") || c.includes("couvert")) return 2;
    if (c.includes("nuageux") || c.includes("averses") || c.includes("partiellement")) return 1;
    if (c.includes("ensoleillé") || c.includes("clair") || c.includes("dégagé")) return 0;
  }
  if (cloudCover != null) {
    if (cloudCover > 75) return 2;
    if (cloudCover > 35) return 1;
    return 0;
  }
  return 1; // unknown → partly cloudy
}

function calcConditionDimension(forecasts: ForecastRow[], observations: ObservationRow[]): ConditionDimension {
  let matches = 0;
  let total = 0;
  const cloudPred: number[] = [];
  const cloudActual: number[] = [];

  for (let i = 0; i < forecasts.length; i++) {
    const f = forecasts[i], o = observations[i];
    if (!f || !o) continue;

    const fCat = conditionCategory(f.condition, f.cloudCover);
    const oCat = conditionCategory(o.condition, o.cloudCover);
    total++;
    if (fCat === oCat) matches++;

    if (f.cloudCover != null && o.cloudCover != null) {
      cloudPred.push(f.cloudCover);
      cloudActual.push(o.cloudCover);
    }
  }

  const concordance = total > 0 ? (matches / total) * 100 : 70;
  const maeCloud = cloudPred.length > 0 ? mae(cloudPred, cloudActual) : 0;

  // Score: concordance is primary, cloud MAE is secondary
  const score = cloudPred.length > 0
    ? (concordance * 0.6 + maeToScore(maeCloud, 40) * 0.4)
    : concordance;

  return {
    concordance: round2(concordance),
    maeCloudCover: round2(maeCloud),
    score: round2(score),
    sampleSize: total,
  };
}

// ─── RMSE helpers for legacy flat fields ─────────────────────────────────────

function rmsePrecipValue(forecasts: ForecastRow[], observations: ObservationRow[]): number {
  const pred: number[] = [];
  const actual: number[] = [];
  for (let i = 0; i < forecasts.length; i++) {
    const f = forecasts[i], o = observations[i];
    if (!f || !o || f.precipitation == null || o.precipitation == null) continue;
    pred.push(f.precipitation);
    actual.push(o.precipitation);
  }
  return rmse(pred, actual);
}

function rmseWindValue(forecasts: ForecastRow[], observations: ObservationRow[]): number {
  const pred: number[] = [];
  const actual: number[] = [];
  for (let i = 0; i < forecasts.length; i++) {
    const f = forecasts[i], o = observations[i];
    if (!f || !o || f.windSpeed == null || o.windSpeed == null) continue;
    pred.push(f.windSpeed);
    actual.push(o.windSpeed);
  }
  return rmse(pred, actual);
}

// ─── Main scoring function ────────────────────────────────────────────────────

/**
 * Calculate full multi-dimension reliability score.
 * Each dimension is measured independently before contextual combination.
 */
export function calculateReliabilityScore(
  forecasts: ForecastRow[],
  observations: ObservationRow[],
  forcedRegime?: WeatherRegime
): ScoreResult {
  // Calculate each dimension independently
  const tempDim = calcTempDimension(forecasts, observations);
  const precipDim = calcPrecipDimension(forecasts, observations);
  const windDim = calcWindDimension(forecasts, observations);
  const condDim = calcConditionDimension(forecasts, observations);
  const laboratoryWind = calcScalarDimension(forecasts, observations, row => row.windSpeed, row => row.windSpeed, 25);
  const laboratoryGusts = calcScalarDimension(forecasts, observations, row => row.windGust, row => row.windGust, 35);
  const laboratoryHumidity = calcScalarDimension(forecasts, observations, row => row.humidity, row => row.humidity, 30);
  const laboratoryPressure = calcScalarDimension(forecasts, observations, row => row.pressure, row => row.pressure, 20);

  const laboratoryComponents = {
    temperature: tempDim.sampleSize > 0 ? tempDim.score : null,
    precipitation: precipDim.sampleSize > 0 ? precipDim.score : null,
    wind: laboratoryWind.score,
    gusts: laboratoryGusts.score,
    humidity: laboratoryHumidity.score,
    pressure: laboratoryPressure.score,
  };
  const normalizedScore = laboratoryComponents.temperature !== null
    && laboratoryComponents.precipitation !== null
    && laboratoryComponents.wind !== null
    && laboratoryComponents.gusts !== null
    && laboratoryComponents.humidity !== null
    && laboratoryComponents.pressure !== null
    ? round2(
      laboratoryComponents.temperature * LABORATORY_SCORE_WEIGHTS.temperature
      + laboratoryComponents.precipitation * LABORATORY_SCORE_WEIGHTS.precipitation
      + laboratoryComponents.wind * LABORATORY_SCORE_WEIGHTS.wind
      + laboratoryComponents.gusts * LABORATORY_SCORE_WEIGHTS.gusts
      + laboratoryComponents.humidity * LABORATORY_SCORE_WEIGHTS.humidity
      + laboratoryComponents.pressure * LABORATORY_SCORE_WEIGHTS.pressure
    )
    : null;

  // Detect regime from observations
  let regimeInfo: RegimeInfo;
  if (forcedRegime) {
    const definition = REGIME_DEFINITIONS[forcedRegime];
    regimeInfo = {
      regime: forcedRegime,
      label: definition.label,
      emoji: definition.emoji,
      description: definition.description,
      weights: toScoredWeights(definition.weights),
    };
  } else {
    // Average precipitation and wind across observations for regime detection
    const obsPrecips = observations.filter(o => o.precipitation != null).map(o => o.precipitation!);
    const obsWinds = observations.filter(o => o.windSpeed != null).map(o => o.windSpeed!);
    const obsTempMax = observations.filter(o => o.tempMax != null).map(o => o.tempMax!);
    const obsTempMin = observations.filter(o => o.tempMin != null).map(o => o.tempMin!);
    regimeInfo = detectWeatherRegime({
      precipitation: obsPrecips.length > 0 ? mean(obsPrecips) : null,
      windSpeed: obsWinds.length > 0 ? mean(obsWinds) : null,
      tempMax: obsTempMax.length > 0 ? mean(obsTempMax) : null,
      tempMin: obsTempMin.length > 0 ? mean(obsTempMin) : null,
    });
  }

  const { weights } = regimeInfo;

  // Contextually-weighted final score
  const weightedScore =
    (tempDim.score * weights.temp) +
    (precipDim.score * weights.precip) +
    (windDim.score * weights.wind) +
    (condDim.score * weights.condition);

  return {
    serviceName: "",
    // Legacy flat fields
    maeTemp: tempDim.mae,
    maePrecip: precipDim.maeQuantity,
    maeWind: windDim.maeMean,
    rmseTemp: tempDim.rmse,
    rmsePrecip: round2(rmsePrecipValue(forecasts, observations)),
    rmseWind: round2(rmseWindValue(forecasts, observations)),
    biasTemp: tempDim.bias,
    biasPrecip: precipDim.biasQuantity,
    biasWind: windDim.biasMean,
    conditionAccuracy: condDim.concordance / 100,
    weightedScore: round2(weightedScore),
    normalizedScore,
    // Dimension detail
    dimensions: {
      temperature: tempDim,
      precipitation: precipDim,
      wind: windDim,
      condition: condDim,
    },
    regime: regimeInfo.regime,
    regimeLabel: regimeInfo.label,
    regimeEmoji: regimeInfo.emoji,
    weights,
    laboratory: {
      wind: laboratoryWind,
      gusts: laboratoryGusts,
      humidity: laboratoryHumidity,
      pressure: laboratoryPressure,
    },
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

  const tempMean = mean(temps);
  const tempStd = Math.sqrt(mean(temps.map(t => Math.pow(t - tempMean, 2))));

  const precipMean = precips.length > 0 ? mean(precips) : 0;
  const precipStd = precips.length > 0
    ? Math.sqrt(mean(precips.map(p => Math.pow(p - precipMean, 2))))
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
  let tempMaxW = 0, tempMinW = 0, precipW = 0, windW = 0;

  forecasts.forEach((f, i) => {
    const w = (reliabilityScores[serviceNames[i]] || 50) / totalScore;
    if (f.tempMax != null) { tempMaxSum += f.tempMax * w; tempMaxW += w; }
    if (f.tempMin != null) { tempMinSum += f.tempMin * w; tempMinW += w; }
    if (f.precipitation != null) { precipSum += f.precipitation * w; precipW += w; }
    if (f.windSpeed != null) { windSum += f.windSpeed * w; windW += w; }
  });

  return {
    tempMax: Math.round((tempMaxW > 0 ? tempMaxSum / tempMaxW : 0) * 10) / 10,
    tempMin: Math.round((tempMinW > 0 ? tempMinSum / tempMinW : 0) * 10) / 10,
    precipitation: Math.round((precipW > 0 ? precipSum / precipW : 0) * 10) / 10,
    windSpeed: Math.round((windW > 0 ? windSum / windW : 0) * 10) / 10,
    weights,
  };
}
