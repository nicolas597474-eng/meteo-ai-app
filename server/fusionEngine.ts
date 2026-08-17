/**
 * FusionEngine — Moteur de fusion scientifique unifié pour MeteoAI
 *
 * Améliorations par rapport aux algorithmes précédents :
 *
 * 1. IDW adaptatif (p=2) — exposant quadratique pour mieux pondérer les stations proches
 *    vs IDW p=1 (linéaire) utilisé dans calculateGroundTruth
 *
 * 2. Pondération adaptative par performance historique — les stations/modèles ayant
 *    démontré une meilleure précision (MAE plus faible) reçoivent un poids plus élevé
 *
 * 3. Détection d'anomalies avancée — valeurs figées, sauts brutaux (Δ > 5°C en < 10min),
 *    outliers statistiques (Z-score > 2.5σ)
 *
 * 4. Fusion par paramètre — chaque variable (temp, vent, précip, humidité, pression)
 *    utilise ses propres pondérations basées sur les performances historiques de chaque source
 *
 * 5. Régimes météo étendus (12 régimes vs 5) — scoring contextuel plus précis
 *
 * 6. Scoring par échéance — MAE/RMSE calculés séparément pour 0-6h, 6-24h, 1-3j, 4-7j, 8-15j
 *
 * Règle de validation : une nouvelle méthode ne remplace l'ancienne QUE si elle réduit
 * le MAE de manière statistiquement significative (p < 0.05, n >= 10 observations)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type FusionSource = {
  id: string;
  name: string;
  distanceKm: number;
  altitude?: number | null;
  temperature?: number | null;
  apparentTemp?: number | null;
  humidity?: number | null;
  pressure?: number | null;
  windSpeed?: number | null;
  windGust?: number | null;
  windDirection?: number | null;
  precipitation?: number | null;
  cloudCover?: number | null;
  dewPoint?: number | null;
  uvIndex?: number | null;
  visibility?: number | null;
  updatedAt?: Date | string | null;
  reliabilityScore?: number; // 0-100 historical quality
  // Per-parameter historical MAE (lower = better, used for adaptive weighting)
  maeTemp?: number | null;
  maePrecip?: number | null;
  maeWind?: number | null;
  // Source type
  type: "station" | "model" | "service";
};

export type FusionConfig = {
  idwExponent: number;          // IDW exponent p (default 2.0, range 1-3)
  maxDistanceKm: number;        // Maximum search radius
  maxFreshnessMin: number;      // Max age of data in minutes
  maxTempDeviationC: number;    // Max deviation from neighbors (coherence check)
  minReliabilityScore: number;  // Minimum historical quality score
  altitudeCorrectionEnabled: boolean;
  anomalyDetectionEnabled: boolean;
  adaptiveWeightingEnabled: boolean; // Use historical MAE for weighting
  modelWeightFraction: number;  // Fraction of weight given to numerical models (0-1)
  refAltitude?: number | null;
};

export type FusionResult = {
  temperature: number | null;
  apparentTemp: number | null;
  humidity: number | null;
  pressure: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDirection: number | null;
  precipitation: number | null;
  cloudCover: number | null;
  dewPoint: number | null;
  uvIndex: number | null;
  visibility: number | null;
  confidenceScore: number;       // 0-100
  stationCount: number;
  modelCount: number;
  usedSources: UsedSource[];
  excludedSources: ExcludedSource[];
  anomaliesDetected: AnomalyReport[];
  altitudeAdjustmentC: number;
  methodUsed: string;
  validationNote: string;
};

export type UsedSource = {
  id: string;
  name: string;
  type: "station" | "model" | "service";
  distanceKm: number;
  finalWeight: number;         // normalized 0-1
  distanceWeight: number;
  qualityWeight: number;
  freshnessWeight: number;
  performanceWeight: number;   // from historical MAE
  altitudeAdjustmentC: number;
  temperature: number | null;
  adjustedTemperature: number | null;
};

export type ExcludedSource = {
  id: string;
  name: string;
  reason: string;
  temperature: number | null;
};

export type AnomalyReport = {
  sourceId: string;
  sourceName: string;
  type: "frozen_value" | "sudden_jump" | "statistical_outlier" | "coherence_failure";
  description: string;
  severity: "low" | "medium" | "high";
  penaltyApplied: number; // weight reduction factor 0-1
};

// ─── Extended Weather Regimes (12 vs 5) ──────────────────────────────────────

export type ExtendedRegime =
  | "overcast"          // Ciel couvert (nébulosité > 80%)
  | "partly_cloudy"     // Partiellement nuageux (50-80%)
  | "few_clouds"        // Peu nuageux (20-50%)
  | "sunny"             // Ensoleillé (nébulosité < 20%)
  | "fog"               // Brouillard (visibilité < 1km, humidité > 90%)
  | "showers"           // Averses (précip légères intermittentes)
  | "rainy"             // Pluie (précip modérées 2-10mm)
  | "thunderstorm"      // Orages (vent > 35km/h + précip > 5mm)
  | "windy"             // Vent fort (> 40km/h)
  | "snow"              // Neige (T < 2°C + précip)
  | "frost"             // Verglas / Gel (T < 0°C sans précip)
  | "freezing_rain"     // Pluie verglaçante (T ~ 0°C + précip)
  | "deep_frost"        // Gel intense (T < -5°C)
  | "summer_heat"       // Canicule (> 33°C)
  | "cold_wave"         // Vague de froid (T < -2°C prolongé)
  | "storm"             // Tempête (vent > 60km/h)
  | "variable"          // Temps variable (conditions changeantes)
  | "spring_unstable"   // Printemps instable (alternance soleil/averses)
  | "stable"            // Été stable (chaud, sec, calme)
  | "autumn_disturbed"; // Automne perturbé (pluie + vent + frais)

export type RegimeWeights = {
  temp: number;
  precip: number;
  wind: number;
  condition: number;
  humidity: number;
  pressure: number;
};

const EXTENDED_REGIME_WEIGHTS: Record<ExtendedRegime, RegimeWeights> = {
  overcast:        { temp: 0.25, precip: 0.15, wind: 0.10, condition: 0.30, humidity: 0.10, pressure: 0.10 },
  partly_cloudy:   { temp: 0.25, precip: 0.15, wind: 0.10, condition: 0.30, humidity: 0.10, pressure: 0.10 },
  few_clouds:      { temp: 0.30, precip: 0.10, wind: 0.10, condition: 0.30, humidity: 0.10, pressure: 0.10 },
  sunny:           { temp: 0.35, precip: 0.05, wind: 0.10, condition: 0.30, humidity: 0.10, pressure: 0.10 },
  fog:             { temp: 0.20, precip: 0.10, wind: 0.05, condition: 0.20, humidity: 0.35, pressure: 0.10 },
  showers:         { temp: 0.20, precip: 0.35, wind: 0.15, condition: 0.15, humidity: 0.10, pressure: 0.05 },
  rainy:           { temp: 0.20, precip: 0.40, wind: 0.15, condition: 0.15, humidity: 0.05, pressure: 0.05 },
  thunderstorm:    { temp: 0.10, precip: 0.35, wind: 0.35, condition: 0.10, humidity: 0.05, pressure: 0.05 },
  windy:           { temp: 0.15, precip: 0.15, wind: 0.45, condition: 0.15, humidity: 0.05, pressure: 0.05 },
  snow:            { temp: 0.40, precip: 0.30, wind: 0.15, condition: 0.10, humidity: 0.03, pressure: 0.02 },
  frost:           { temp: 0.50, precip: 0.15, wind: 0.15, condition: 0.10, humidity: 0.05, pressure: 0.05 },
  freezing_rain:   { temp: 0.40, precip: 0.30, wind: 0.15, condition: 0.10, humidity: 0.03, pressure: 0.02 },
  deep_frost:      { temp: 0.55, precip: 0.10, wind: 0.15, condition: 0.10, humidity: 0.05, pressure: 0.05 },
  summer_heat:     { temp: 0.45, precip: 0.10, wind: 0.15, condition: 0.15, humidity: 0.10, pressure: 0.05 },
  cold_wave:       { temp: 0.50, precip: 0.15, wind: 0.20, condition: 0.10, humidity: 0.03, pressure: 0.02 },
  storm:           { temp: 0.10, precip: 0.25, wind: 0.45, condition: 0.10, humidity: 0.05, pressure: 0.05 },
  variable:        { temp: 0.25, precip: 0.25, wind: 0.20, condition: 0.15, humidity: 0.10, pressure: 0.05 },
  spring_unstable: { temp: 0.25, precip: 0.30, wind: 0.15, condition: 0.15, humidity: 0.10, pressure: 0.05 },
  stable:          { temp: 0.35, precip: 0.10, wind: 0.10, condition: 0.25, humidity: 0.10, pressure: 0.10 },
  autumn_disturbed:{ temp: 0.20, precip: 0.30, wind: 0.25, condition: 0.15, humidity: 0.05, pressure: 0.05 },
};

export function detectExtendedRegime(params: {
  temperature?: number | null;
  precipitation?: number | null;
  windSpeed?: number | null;
  humidity?: number | null;
  visibility?: number | null;
  cloudCover?: number | null;
}): ExtendedRegime {
  const t = params.temperature ?? 15;
  const p = params.precipitation ?? 0;
  const w = params.windSpeed ?? 0;
  const h = params.humidity ?? 60;
  const v = params.visibility ?? 10000;
  const c = params.cloudCover ?? 50;

  // Extreme events first
  if (w > 60) return "storm";
  if (w > 35 && p > 5) return "thunderstorm";
  if (w > 40) return "windy";
  // Cold + precipitation
  if (t <= 0 && p > 0.5) return "freezing_rain";
  if (t <= 2 && p > 0) return "snow";
  if (t < -5) return "deep_frost";
  if (t < 0) return "frost";
  if (t < -2 && w > 15) return "cold_wave";
  // Fog
  if (v < 1000 && h > 90) return "fog";
  // Precipitation regimes
  if (p > 5) return "rainy";
  if (p > 0.5 && p <= 5) return "showers";
  // Temperature extremes
  if (t > 33 && p < 0.5) return "summer_heat";
  // Seasonal patterns
  if (t > 20 && p < 0.5 && w < 20 && c < 30) return "stable";
  if (t >= 8 && t <= 18 && p > 0.2 && p <= 3 && c > 40) return "spring_unstable";
  if (t >= 5 && t <= 15 && p > 1 && w > 15) return "autumn_disturbed";
  if (p > 0.1 && c > 50 && w > 10) return "variable";
  // Cloud-based regimes
  if (c > 80) return "overcast";
  if (c > 50) return "partly_cloudy";
  if (c > 20) return "few_clouds";
  return "sunny";
}

export function getRegimeWeights(regime: ExtendedRegime): RegimeWeights {
  return EXTENDED_REGIME_WEIGHTS[regime];
}

// ─── Extended Regime Info (labels, emojis, descriptions) ─────────────────────

export type ExtendedRegimeInfo = {
  id: ExtendedRegime;
  label: string;
  emoji: string;
  description: string;
  weights: RegimeWeights;
};

export const EXTENDED_REGIME_INFO: Record<ExtendedRegime, Omit<ExtendedRegimeInfo, 'id'>> = {
  overcast:        { label: "Ciel couvert",         emoji: "☁️",  description: "Nébulosité > 80%, ciel entièrement couvert.",                              weights: EXTENDED_REGIME_WEIGHTS.overcast },
  partly_cloudy:   { label: "Partiellement nuageux",emoji: "⛅",  description: "Nébulosité 50-80%, alternance de nuages et d'éclaircies.",                  weights: EXTENDED_REGIME_WEIGHTS.partly_cloudy },
  few_clouds:      { label: "Peu nuageux",          emoji: "🌤️", description: "Nébulosité 20-50%, quelques nuages épars.",                                  weights: EXTENDED_REGIME_WEIGHTS.few_clouds },
  sunny:           { label: "Ensoleillé",           emoji: "☀️",  description: "Ciel dégagé, nébulosité < 20%.",                                           weights: EXTENDED_REGIME_WEIGHTS.sunny },
  fog:             { label: "Brouillard",           emoji: "🌫️", description: "Visibilité réduite (< 1 km), humidité > 90%.",                              weights: EXTENDED_REGIME_WEIGHTS.fog },
  showers:         { label: "Averses",              emoji: "🌦️", description: "Précipitations légères intermittentes (0.5-5 mm).",                          weights: EXTENDED_REGIME_WEIGHTS.showers },
  rainy:           { label: "Pluie",                emoji: "🌧️", description: "Précipitations modérées à fortes (> 5 mm).",                                weights: EXTENDED_REGIME_WEIGHTS.rainy },
  thunderstorm:    { label: "Orages",               emoji: "⛈️",  description: "Orages — vent fort et précipitations intenses combinés.",                   weights: EXTENDED_REGIME_WEIGHTS.thunderstorm },
  windy:           { label: "Vent fort",            emoji: "💨",  description: "Vents soutenus > 40 km/h.",                                                weights: EXTENDED_REGIME_WEIGHTS.windy },
  snow:            { label: "Neige",                emoji: "❄️",  description: "Températures < 2°C avec précipitations — risque de neige.",                  weights: EXTENDED_REGIME_WEIGHTS.snow },
  frost:           { label: "Verglas / Gel",        emoji: "🧊",  description: "Températures négatives sans précipitations — risque de gel.",               weights: EXTENDED_REGIME_WEIGHTS.frost },
  freezing_rain:   { label: "Pluie verglaçante",    emoji: "🌧",  description: "Température ~ 0°C avec précipitations — verglas.",                          weights: EXTENDED_REGIME_WEIGHTS.freezing_rain },
  deep_frost:      { label: "Gel",                  emoji: "❄",   description: "Gel intense (T < -5°C) — froid extrême.",                                   weights: EXTENDED_REGIME_WEIGHTS.deep_frost },
  summer_heat:     { label: "Canicule",             emoji: "🔥",  description: "Températures > 33°C, temps sec et calme.",                                  weights: EXTENDED_REGIME_WEIGHTS.summer_heat },
  cold_wave:       { label: "Vague de froid",       emoji: "🧊",  description: "Températures très basses prolongées (< -2°C).",                             weights: EXTENDED_REGIME_WEIGHTS.cold_wave },
  storm:           { label: "Tempête",              emoji: "🌀",  description: "Vents violents > 60 km/h — paramètre critique.",                           weights: EXTENDED_REGIME_WEIGHTS.storm },
  variable:        { label: "Temps variable",       emoji: "🌦",  description: "Conditions changeantes, alternance de soleil et nuages.",                  weights: EXTENDED_REGIME_WEIGHTS.variable },
  spring_unstable: { label: "Printemps instable",   emoji: "🌸",  description: "Alternance soleil/averses typique du printemps.",                           weights: EXTENDED_REGIME_WEIGHTS.spring_unstable },
  stable:          { label: "Été stable",           emoji: "☀️",  description: "Temps chaud, sec et calme — conditions estivales.",                        weights: EXTENDED_REGIME_WEIGHTS.stable },
  autumn_disturbed:{ label: "Automne perturbé",     emoji: "🍂",  description: "Pluie + vent modéré + températures fraîches.",                              weights: EXTENDED_REGIME_WEIGHTS.autumn_disturbed },
};

// ─── Multi-Regime Detection ───────────────────────────────────────────────────

export type ActiveRegime = {
  id: ExtendedRegime;
  label: string;
  emoji: string;
  influence: number; // 0-100 percentage
};

export type MultiRegimeResult = {
  primaryRegime: ExtendedRegimeInfo;
  activeRegimes: ActiveRegime[];
  blendedWeights: RegimeWeights;
  confidenceScore: number; // 0-100: how clear-cut the dominant regime is
  description: string;
};

/**
 * Detect multiple simultaneous weather regimes with influence percentages.
 * Returns the primary regime, all active regimes with their influence,
 * blended weights, and a global confidence score.
 */
export function detectMultiRegime(params: {
  temperature?: number | null;
  precipitation?: number | null;
  windSpeed?: number | null;
  humidity?: number | null;
  visibility?: number | null;
  cloudCover?: number | null;
}): MultiRegimeResult {
  const t = params.temperature ?? 15;
  const p = params.precipitation ?? 0;
  const w = params.windSpeed ?? 0;
  const h = params.humidity ?? 60;
  const v = params.visibility ?? 10000;
  const c = params.cloudCover ?? 50;

  // Compute raw scores for each regime (0-100)
  const scores: Record<ExtendedRegime, number> = {
    // Extreme events
    storm:           Math.max(0, Math.min(100, (w > 60 ? 80 + (w - 60) * 0.5 : w > 50 ? (w - 50) * 8 : 0))),
    thunderstorm:    Math.max(0, Math.min(100, (w > 35 && p > 5 ? 60 + Math.min(40, (w - 35) * 1.5 + (p - 5) * 2) : w > 25 && p > 3 ? 30 : 0))),
    windy:           Math.max(0, Math.min(100, (w > 40 && p < 2 ? 50 + (w - 40) * 2 : w > 25 ? (w - 25) * 3 : 0))),
    // Precipitation
    rainy:           Math.max(0, Math.min(100, (p > 5 ? 50 + Math.min(50, (p - 5) * 5) : p > 3 ? (p - 3) * 25 : 0))),
    showers:         Math.max(0, Math.min(100, (p > 0.5 && p <= 5 ? 40 + Math.min(40, p * 10) : p > 0.2 ? p * 30 : 0))),
    // Cold
    snow:            Math.max(0, Math.min(100, (t <= 2 && p > 0 ? 50 + Math.min(50, (2 - t) * 10 + p * 5) : t < 0 && p > 0 ? 80 : 0))),
    frost:           Math.max(0, Math.min(100, (t < 0 && p < 0.5 ? 50 + Math.min(50, (-t) * 10) : t < 2 ? (2 - t) * 20 : 0))),
    freezing_rain:   Math.max(0, Math.min(100, (t <= 0 && t >= -3 && p > 0.5 ? 60 + Math.min(40, p * 10) : t < 2 && t > -5 && p > 0.3 ? 25 : 0))),
    deep_frost:      Math.max(0, Math.min(100, (t < -5 ? 60 + Math.min(40, (-t - 5) * 5) : t < -2 ? (Math.abs(t) - 2) * 20 : 0))),
    cold_wave:       Math.max(0, Math.min(100, (t < -2 && w > 15 ? 50 + Math.min(50, (-t) * 5 + w * 0.5) : t < 0 ? 20 : 0))),
    // Heat
    summer_heat:     Math.max(0, Math.min(100, (t > 33 ? 60 + Math.min(40, (t - 33) * 5) : t > 28 ? (t - 28) * 12 : 0))),
    // Fog
    fog:             Math.max(0, Math.min(100, (v < 1000 && h > 90 ? 60 + Math.min(40, (1000 - v) / 20 + (h - 90) * 2) : v < 3000 && h > 85 ? 30 : 0))),
    // Cloud-based
    overcast:        Math.max(0, Math.min(100, (c > 80 ? 40 + Math.min(40, (c - 80) * 3) : c > 70 ? (c - 70) * 4 : 0))),
    partly_cloudy:   Math.max(0, Math.min(100, (c >= 50 && c <= 80 ? 40 + Math.min(30, (c - 50)) : c > 35 ? (c - 35) * 2.5 : 0))),
    few_clouds:      Math.max(0, Math.min(100, (c >= 20 && c < 50 ? 40 + Math.min(30, (50 - c)) : c < 60 && c > 10 ? 20 : 0))),
    sunny:           Math.max(0, Math.min(100, (c < 20 ? 50 + Math.min(50, (20 - c) * 3) : c < 30 ? (30 - c) * 5 : 0))),
    // Seasonal
    stable:          Math.max(0, Math.min(100, (t > 20 && p < 0.5 && w < 20 && c < 30 ? 50 + Math.min(40, (t - 20) * 3 + (30 - c)) : t > 18 && p < 1 && w < 15 ? 25 : 0))),
    spring_unstable: Math.max(0, Math.min(100, (t >= 8 && t <= 18 && p > 0.2 && p <= 3 && c > 40 ? 40 + Math.min(30, p * 10) : 0))),
    autumn_disturbed:Math.max(0, Math.min(100, (t >= 5 && t <= 15 && p > 1 && w > 15 ? 40 + Math.min(30, p * 5 + (w - 15) * 2) : 0))),
    variable:        Math.max(0, Math.min(100, (p > 0.1 && c > 50 && w > 10 ? 30 + Math.min(30, c * 0.3 + w * 0.5) : 0))),
  };

  // Normalize to sum to 100
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const normalized: Record<ExtendedRegime, number> = {} as any;
  for (const key of Object.keys(scores) as ExtendedRegime[]) {
    normalized[key] = Math.round((scores[key] / total) * 100);
  }

  // Active regimes: those with >= 5% influence
  const active: ActiveRegime[] = (Object.keys(normalized) as ExtendedRegime[])
    .filter(k => normalized[k] >= 5)
    .sort((a, b) => normalized[b] - normalized[a])
    .map(k => ({
      id: k,
      label: EXTENDED_REGIME_INFO[k].label,
      emoji: EXTENDED_REGIME_INFO[k].emoji,
      influence: normalized[k],
    }));

  const primaryKey = active[0]?.id ?? "variable";
  const primaryInfo = EXTENDED_REGIME_INFO[primaryKey];

  // Blend weights proportionally to influence
  const blended: RegimeWeights = { temp: 0, precip: 0, wind: 0, condition: 0, humidity: 0, pressure: 0 };
  for (const ar of active) {
    const w2 = EXTENDED_REGIME_WEIGHTS[ar.id];
    const frac = ar.influence / 100;
    blended.temp      += w2.temp      * frac;
    blended.precip    += w2.precip    * frac;
    blended.wind      += w2.wind      * frac;
    blended.condition += w2.condition * frac;
    blended.humidity  += w2.humidity  * frac;
    blended.pressure  += w2.pressure  * frac;
  }
  // Re-normalize blended weights to sum to 1
  const bSum = blended.temp + blended.precip + blended.wind + blended.condition + blended.humidity + blended.pressure || 1;
  blended.temp      = Math.round(blended.temp / bSum * 100) / 100;
  blended.precip    = Math.round(blended.precip / bSum * 100) / 100;
  blended.wind      = Math.round(blended.wind / bSum * 100) / 100;
  blended.condition = Math.round(blended.condition / bSum * 100) / 100;
  blended.humidity  = Math.round(blended.humidity / bSum * 100) / 100;
  blended.pressure  = Math.round(blended.pressure / bSum * 100) / 100;

  // Confidence: how dominant is the primary regime (0-100)
  const primaryInfluence = active[0]?.influence ?? 0;
  const secondInfluence  = active[1]?.influence ?? 0;
  const confidenceScore  = Math.round(Math.min(100, primaryInfluence + (primaryInfluence - secondInfluence) * 0.5));

  // Build description from active regimes
  const topLabels = active.slice(0, 3).map(r => `${r.emoji} ${r.label} (${r.influence}%)`).join(', ');
  const description = `Régimes actifs : ${topLabels}. ${primaryInfo.description}`;

  return {
    primaryRegime: { id: primaryKey, ...primaryInfo },
    activeRegimes: active,
    blendedWeights: blended,
    confidenceScore,
    description,
  };
}

// ─── Scoring by Lead Time ─────────────────────────────────────────────────────

export type LeadTimeBucket = "0-6h" | "6-24h" | "1-3d" | "4-7d" | "8-15d";

export function classifyLeadTime(forecastDateStr: string, issueDateStr: string): LeadTimeBucket {
  const forecastMs = new Date(forecastDateStr).getTime();
  const issueMs = new Date(issueDateStr).getTime();
  const hoursAhead = (forecastMs - issueMs) / 3600000;
  if (hoursAhead <= 6) return "0-6h";
  if (hoursAhead <= 24) return "6-24h";
  if (hoursAhead <= 72) return "1-3d";
  if (hoursAhead <= 168) return "4-7d";
  return "8-15d";
}

export type LeadTimeScores = Record<LeadTimeBucket, {
  maeTemp: number | null;
  rmseTemp: number | null;
  biasTemp: number | null;
  maePrecip: number | null;
  maeWind: number | null;
  sampleSize: number;
}>;

/**
 * Compute per-lead-time error metrics from paired forecast/observation arrays.
 * Each entry must have forecastDate and issueDate to classify the lead time.
 */
export function computeLeadTimeScores(
  pairs: Array<{
    forecastDate: string;
    issueDate: string;
    forecastTemp: number | null;
    observedTemp: number | null;
    forecastPrecip: number | null;
    observedPrecip: number | null;
    forecastWind: number | null;
    observedWind: number | null;
  }>
): LeadTimeScores {
  const buckets: LeadTimeBucket[] = ["0-6h", "6-24h", "1-3d", "4-7d", "8-15d"];
  const grouped: Record<LeadTimeBucket, typeof pairs> = {
    "0-6h": [], "6-24h": [], "1-3d": [], "4-7d": [], "8-15d": [],
  };
  for (const p of pairs) {
    const bucket = classifyLeadTime(p.forecastDate, p.issueDate);
    grouped[bucket].push(p);
  }

  const result = {} as LeadTimeScores;
  for (const bucket of buckets) {
    const group = grouped[bucket];
    const tempPairs = group.filter(p => p.forecastTemp != null && p.observedTemp != null);
    const precipPairs = group.filter(p => p.forecastPrecip != null && p.observedPrecip != null);
    const windPairs = group.filter(p => p.forecastWind != null && p.observedWind != null);

    const maeTemp = tempPairs.length > 0
      ? tempPairs.reduce((s, p) => s + Math.abs(p.forecastTemp! - p.observedTemp!), 0) / tempPairs.length
      : null;
    const rmseTemp = tempPairs.length > 0
      ? Math.sqrt(tempPairs.reduce((s, p) => s + Math.pow(p.forecastTemp! - p.observedTemp!, 2), 0) / tempPairs.length)
      : null;
    const biasTemp = tempPairs.length > 0
      ? tempPairs.reduce((s, p) => s + (p.forecastTemp! - p.observedTemp!), 0) / tempPairs.length
      : null;
    const maePrecip = precipPairs.length > 0
      ? precipPairs.reduce((s, p) => s + Math.abs(p.forecastPrecip! - p.observedPrecip!), 0) / precipPairs.length
      : null;
    const maeWind = windPairs.length > 0
      ? windPairs.reduce((s, p) => s + Math.abs(p.forecastWind! - p.observedWind!), 0) / windPairs.length
      : null;

    result[bucket] = {
      maeTemp: maeTemp != null ? Math.round(maeTemp * 100) / 100 : null,
      rmseTemp: rmseTemp != null ? Math.round(rmseTemp * 100) / 100 : null,
      biasTemp: biasTemp != null ? Math.round(biasTemp * 100) / 100 : null,
      maePrecip: maePrecip != null ? Math.round(maePrecip * 100) / 100 : null,
      maeWind: maeWind != null ? Math.round(maeWind * 100) / 100 : null,
      sampleSize: group.length,
    };
  }
  return result;
}

// ─── Statistical Validation ───────────────────────────────────────────────────

/**
 * Paired t-test for improvement validation.
 * Returns true if the new method is significantly better (p < 0.05, n >= 10).
 * Uses the Welch t-test approximation.
 */
export function isSignificantImprovement(
  oldErrors: number[],
  newErrors: number[],
  alpha = 0.05
): { significant: boolean; pValue: number; improvement: number; note: string } {
  const n = Math.min(oldErrors.length, newErrors.length);
  if (n < 10) {
    return {
      significant: false,
      pValue: 1,
      improvement: 0,
      note: `Données insuffisantes (n=${n} < 10). Validation reportée.`,
    };
  }

  const oldMean = oldErrors.reduce((s, v) => s + v, 0) / n;
  const newMean = newErrors.reduce((s, v) => s + v, 0) / n;
  const improvement = oldMean - newMean; // positive = new is better

  // Paired differences
  const diffs = oldErrors.slice(0, n).map((v, i) => v - newErrors[i]);
  const diffMean = diffs.reduce((s, v) => s + v, 0) / n;
  const diffVar = diffs.reduce((s, v) => s + Math.pow(v - diffMean, 2), 0) / (n - 1);
  const se = Math.sqrt(diffVar / n);

  if (se === 0) {
    return {
      significant: improvement > 0,
      pValue: improvement > 0 ? 0 : 1,
      improvement: Math.round(improvement * 100) / 100,
      note: "Erreur standard nulle — méthodes identiques.",
    };
  }

  const tStat = diffMean / se;
  // Approximate p-value using normal distribution (valid for n >= 10)
  const pValue = 2 * (1 - normalCDF(Math.abs(tStat)));

  return {
    significant: pValue < alpha && improvement > 0,
    pValue: Math.round(pValue * 1000) / 1000,
    improvement: Math.round(improvement * 100) / 100,
    note: pValue < alpha && improvement > 0
      ? `Amélioration significative: MAE réduit de ${Math.round(improvement * 100) / 100}°C (p=${Math.round(pValue * 1000) / 1000})`
      : `Pas d'amélioration significative (p=${Math.round(pValue * 1000) / 1000}, amélioration=${Math.round(improvement * 100) / 100}°C)`,
  };
}

function normalCDF(x: number): number {
  // Abramowitz & Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return x > 0 ? 1 - p : p;
}

// ─── Anomaly Detection ────────────────────────────────────────────────────────

/**
 * Detect anomalies in a set of station readings.
 * Returns a map of sourceId → penalty factor (0-1, where 1 = no penalty).
 */
export function detectAnomalies(
  sources: FusionSource[],
  previousReadings?: Map<string, { temperature: number; timestamp: number }>
): { penalties: Map<string, number>; reports: AnomalyReport[] } {
  const penalties = new Map<string, number>();
  const reports: AnomalyReport[] = [];

  // Initialize all sources with no penalty
  sources.forEach(s => penalties.set(s.id, 1.0));

  const temps = sources
    .filter(s => s.temperature != null)
    .map(s => s.temperature!);

  if (temps.length < 2) return { penalties, reports };

  // Statistical outlier detection (Z-score)
  const mean = temps.reduce((a, b) => a + b, 0) / temps.length;
  const std = Math.sqrt(temps.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / temps.length);

  sources.forEach(s => {
    if (s.temperature == null) return;

    // 1. Statistical outlier (Z-score > 2.5σ)
    if (std > 0) {
      const z = Math.abs(s.temperature - mean) / std;
      if (z > 2.5) {
        const penalty = Math.max(0.1, 1 - (z - 2.5) * 0.3);
        penalties.set(s.id, Math.min(penalties.get(s.id)!, penalty));
        reports.push({
          sourceId: s.id,
          sourceName: s.name,
          type: "statistical_outlier",
          description: `Température ${s.temperature.toFixed(1)}°C écart de ${z.toFixed(1)}σ (moy: ${mean.toFixed(1)}°C, σ: ${std.toFixed(1)}°C)`,
          severity: z > 3.5 ? "high" : "medium",
          penaltyApplied: penalty,
        });
      }
    }

    // 2. Sudden jump detection (requires previous readings)
    if (previousReadings) {
      const prev = previousReadings.get(s.id);
      if (prev && s.updatedAt) {
        const ageMin = (Date.now() - prev.timestamp) / 60000;
        const tempDelta = Math.abs(s.temperature - prev.temperature);
        // More than 5°C change in less than 10 minutes is suspicious
        if (ageMin < 10 && tempDelta > 5) {
          const penalty = Math.max(0.2, 1 - (tempDelta - 5) * 0.1);
          penalties.set(s.id, Math.min(penalties.get(s.id)!, penalty));
          reports.push({
            sourceId: s.id,
            sourceName: s.name,
            type: "sudden_jump",
            description: `Saut de ${tempDelta.toFixed(1)}°C en ${ageMin.toFixed(0)} min (${prev.temperature.toFixed(1)}→${s.temperature.toFixed(1)}°C)`,
            severity: tempDelta > 10 ? "high" : "medium",
            penaltyApplied: penalty,
          });
        }
        // Frozen value (no change at all for > 60 min)
        if (ageMin > 60 && tempDelta < 0.01) {
          const penalty = 0.5;
          penalties.set(s.id, Math.min(penalties.get(s.id)!, penalty));
          reports.push({
            sourceId: s.id,
            sourceName: s.name,
            type: "frozen_value",
            description: `Valeur figée à ${s.temperature.toFixed(1)}°C depuis ${ageMin.toFixed(0)} min`,
            severity: "low",
            penaltyApplied: penalty,
          });
        }
      }
    }
  });

  return { penalties, reports };
}

// ─── IDW p=2 Adaptive Fusion ──────────────────────────────────────────────────

const DEFAULT_CONFIG: FusionConfig = {
  idwExponent: 2.0,
  maxDistanceKm: 20,
  maxFreshnessMin: 90,
  maxTempDeviationC: 6,
  minReliabilityScore: 35,
  altitudeCorrectionEnabled: true,
  anomalyDetectionEnabled: true,
  adaptiveWeightingEnabled: true,
  modelWeightFraction: 0.15, // 15% for numerical models, 85% for stations
  refAltitude: null,
};

/**
 * Main fusion function — IDW p=2 with adaptive weighting.
 *
 * Algorithm:
 * 1. Filter sources by freshness, reliability, coherence
 * 2. Detect anomalies and compute penalties
 * 3. Compute IDW weights (p=2) for each source
 * 4. Apply quality multiplier (reliability score)
 * 5. Apply freshness decay (exponential half-life 60 min)
 * 6. Apply performance multiplier (1/MAE if available)
 * 7. Apply anomaly penalty
 * 8. Separate station vs model weights, apply modelWeightFraction
 * 9. Compute weighted average for each parameter
 * 10. Apply altitude correction
 * 11. Compute confidence score
 */
export function computeFusion(
  sources: FusionSource[],
  config: Partial<FusionConfig> = {},
  previousReadings?: Map<string, { temperature: number; timestamp: number }>
): FusionResult {
  const cfg: FusionConfig = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  // ── Step 1: Filter sources ──────────────────────────────────────────────────
  const excluded: ExcludedSource[] = [];
  const candidates: FusionSource[] = [];

  for (const s of sources) {
    // Distance filter
    if (s.distanceKm > cfg.maxDistanceKm) {
      excluded.push({ id: s.id, name: s.name, reason: `Distance ${s.distanceKm.toFixed(1)}km > ${cfg.maxDistanceKm}km`, temperature: s.temperature ?? null });
      continue;
    }
    // Freshness filter
    const ageMin = s.updatedAt
      ? (now - new Date(s.updatedAt).getTime()) / 60000
      : 999;
    if (ageMin > cfg.maxFreshnessMin) {
      excluded.push({ id: s.id, name: s.name, reason: `Données trop anciennes (${Math.round(ageMin)} min > ${cfg.maxFreshnessMin} min)`, temperature: s.temperature ?? null });
      continue;
    }
    // Reliability filter
    const reliability = s.reliabilityScore ?? 50;
    if (reliability < cfg.minReliabilityScore) {
      excluded.push({ id: s.id, name: s.name, reason: `Score fiabilité trop bas (${reliability}/100 < ${cfg.minReliabilityScore})`, temperature: s.temperature ?? null });
      continue;
    }
    candidates.push(s);
  }

  // Coherence check: remove stations deviating too much from neighbors
  const stationCandidates = candidates.filter(s => s.type === "station");
  const modelCandidates = candidates.filter(s => s.type !== "station");

  if (stationCandidates.length >= 3) {
    const temps = stationCandidates.filter(s => s.temperature != null).map(s => s.temperature!);
    const medianTemp = temps.sort((a, b) => a - b)[Math.floor(temps.length / 2)];

    stationCandidates.forEach(s => {
      if (s.temperature != null && Math.abs(s.temperature - medianTemp) > cfg.maxTempDeviationC) {
        const idx = candidates.indexOf(s);
        if (idx !== -1) candidates.splice(idx, 1);
        excluded.push({
          id: s.id,
          name: s.name,
          reason: `Incohérence: ${s.temperature.toFixed(1)}°C vs médiane ${medianTemp.toFixed(1)}°C (écart ${Math.abs(s.temperature - medianTemp).toFixed(1)}°C > ${cfg.maxTempDeviationC}°C)`,
          temperature: s.temperature,
        });
      }
    });
  }

  if (candidates.length === 0) {
    return {
      temperature: null, apparentTemp: null, humidity: null, pressure: null,
      windSpeed: null, windGust: null, windDirection: null, precipitation: null,
      cloudCover: null, dewPoint: null, uvIndex: null, visibility: null,
      confidenceScore: 0, stationCount: 0, modelCount: 0,
      usedSources: [], excludedSources: excluded, anomaliesDetected: [],
      altitudeAdjustmentC: 0, methodUsed: "IDW-p2-adaptive",
      validationNote: "Aucune source disponible après filtrage",
    };
  }

  // ── Step 2: Anomaly detection ───────────────────────────────────────────────
  const { penalties, reports: anomalyReports } = cfg.anomalyDetectionEnabled
    ? detectAnomalies(candidates, previousReadings)
    : { penalties: new Map<string, number>(), reports: [] };

  // ── Step 3-7: Compute weights ───────────────────────────────────────────────
  const stationsOnly = candidates.filter(s => s.type === "station");
  const modelsOnly = candidates.filter(s => s.type !== "station");

  function computeRawWeight(s: FusionSource): number {
    const ageMin = s.updatedAt
      ? (now - new Date(s.updatedAt).getTime()) / 60000
      : 30;

    // IDW p=2: weight ∝ 1/d²
    const distW = 1 / Math.pow(s.distanceKm + 0.1, cfg.idwExponent);

    // Quality multiplier (0.5 to 1.5 range)
    const reliability = s.reliabilityScore ?? 50;
    const qualW = 0.5 + (reliability / 100);

    // Freshness decay: exponential half-life 60 min
    const freshW = Math.exp(-ageMin / 60);

    // Performance multiplier: 1/MAE (better accuracy → higher weight)
    // Only applied if adaptive weighting is enabled and MAE data is available
    let perfW = 1.0;
    if (cfg.adaptiveWeightingEnabled && s.maeTemp != null && s.maeTemp > 0) {
      // Normalize: MAE of 0.5°C → perfW=2.0, MAE of 2.0°C → perfW=0.5
      perfW = Math.min(2.0, Math.max(0.3, 1.0 / s.maeTemp));
    }

    // Anomaly penalty
    const penalty = penalties.get(s.id) ?? 1.0;

    return distW * qualW * freshW * perfW * penalty;
  }

  // ── Step 8: Separate station/model weights ──────────────────────────────────
  const stationWeights = stationsOnly.map(s => ({ source: s, raw: computeRawWeight(s) }));
  const modelWeights = modelsOnly.map(s => ({ source: s, raw: computeRawWeight(s) }));

  const stationTotalRaw = stationWeights.reduce((s, w) => s + w.raw, 0);
  const modelTotalRaw = modelWeights.reduce((s, w) => s + w.raw, 0);

  // Determine effective fractions
  const hasStations = stationTotalRaw > 0;
  const hasModels = modelTotalRaw > 0;
  const stationFraction = hasStations
    ? (hasModels ? 1 - cfg.modelWeightFraction : 1.0)
    : 0;
  const modelFraction = hasModels
    ? (hasStations ? cfg.modelWeightFraction : 1.0)
    : 0;

  // Normalize within each group then apply fraction
  const allWeighted: { source: FusionSource; weight: number; distW: number; qualW: number; freshW: number; perfW: number }[] = [];

  stationWeights.forEach(({ source: s, raw }) => {
    const ageMin = s.updatedAt ? (now - new Date(s.updatedAt).getTime()) / 60000 : 30;
    const distW = 1 / Math.pow(s.distanceKm + 0.1, cfg.idwExponent);
    const qualW = 0.5 + ((s.reliabilityScore ?? 50) / 100);
    const freshW = Math.exp(-ageMin / 60);
    const perfW = cfg.adaptiveWeightingEnabled && s.maeTemp != null && s.maeTemp > 0
      ? Math.min(2.0, Math.max(0.3, 1.0 / s.maeTemp)) : 1.0;
    const weight = stationTotalRaw > 0 ? (raw / stationTotalRaw) * stationFraction : 0;
    allWeighted.push({ source: s, weight, distW, qualW, freshW, perfW });
  });

  modelWeights.forEach(({ source: s, raw }) => {
    const ageMin = s.updatedAt ? (now - new Date(s.updatedAt).getTime()) / 60000 : 30;
    const distW = 1 / Math.pow(s.distanceKm + 0.1, cfg.idwExponent);
    const qualW = 0.5 + ((s.reliabilityScore ?? 50) / 100);
    const freshW = Math.exp(-ageMin / 60);
    const perfW = cfg.adaptiveWeightingEnabled && s.maeTemp != null && s.maeTemp > 0
      ? Math.min(2.0, Math.max(0.3, 1.0 / s.maeTemp)) : 1.0;
    const weight = modelTotalRaw > 0 ? (raw / modelTotalRaw) * modelFraction : 0;
    allWeighted.push({ source: s, weight, distW, qualW, freshW, perfW });
  });

  // ── Step 9: Weighted average per parameter ──────────────────────────────────
  function weightedAvg(field: keyof Pick<FusionSource,
    "temperature" | "apparentTemp" | "humidity" | "pressure" | "windSpeed" |
    "windGust" | "precipitation" | "cloudCover" | "dewPoint" | "uvIndex" | "visibility">
  ): number | null {
    let sum = 0, wSum = 0;
    for (const { source, weight } of allWeighted) {
      const v = source[field];
      if (v != null) {
        sum += (v as number) * weight;
        wSum += weight;
      }
    }
    return wSum > 0 ? Math.round((sum / wSum) * 10) / 10 : null;
  }

  // Wind direction: circular mean
  function circularMeanDeg(): number | null {
    let sinSum = 0, cosSum = 0, wSum = 0;
    for (const { source, weight } of allWeighted) {
      if (source.windDirection != null) {
        const rad = (source.windDirection * Math.PI) / 180;
        sinSum += Math.sin(rad) * weight;
        cosSum += Math.cos(rad) * weight;
        wSum += weight;
      }
    }
    if (wSum === 0) return null;
    const angle = (Math.atan2(sinSum / wSum, cosSum / wSum) * 180) / Math.PI;
    return Math.round((angle + 360) % 360);
  }

  let temperature = weightedAvg("temperature");
  const humidity = weightedAvg("humidity");
  const pressure = weightedAvg("pressure");
  const windSpeed = weightedAvg("windSpeed");
  const windGust = weightedAvg("windGust");
  const windDirection = circularMeanDeg();
  const precipitation = weightedAvg("precipitation");
  const cloudCover = weightedAvg("cloudCover");
  const dewPoint = weightedAvg("dewPoint");
  const uvIndex = weightedAvg("uvIndex");
  const visibility = weightedAvg("visibility");
  const apparentTemp = weightedAvg("apparentTemp");

  // ── Step 10: Altitude correction ────────────────────────────────────────────
  let altitudeAdjustmentC = 0;
  if (cfg.altitudeCorrectionEnabled && cfg.refAltitude != null && temperature != null) {
    // Compute weighted mean altitude of used stations
    const altStations = allWeighted.filter(w => w.source.altitude != null && w.source.type === "station");
    if (altStations.length > 0) {
      const wAlt = altStations.reduce((s, w) => s + w.source.altitude! * w.weight, 0);
      const wSum = altStations.reduce((s, w) => s + w.weight, 0);
      const avgStationAlt = wAlt / wSum;
      const altDiff = avgStationAlt - cfg.refAltitude;
      // Only apply if difference is meaningful (> 20m)
      if (Math.abs(altDiff) > 20) {
        altitudeAdjustmentC = -(altDiff / 100) * 0.65;
        temperature = Math.round((temperature + altitudeAdjustmentC) * 10) / 10;
      }
    }
  }

  // ── Step 11: Confidence score ────────────────────────────────────────────────
  const stationCount = stationsOnly.length;
  const modelCount = modelsOnly.length;
  const temps = allWeighted
    .filter(w => w.source.temperature != null)
    .map(w => w.source.temperature!);
  const tempMean = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;
  const tempStd = temps.length > 1
    ? Math.sqrt(temps.reduce((s, v) => s + Math.pow(v - tempMean, 2), 0) / temps.length)
    : 0;
  const avgReliability = candidates.reduce((s, c) => s + (c.reliabilityScore ?? 50), 0) / candidates.length;

  const confidenceScore = Math.max(0, Math.min(100, Math.round(
    // Base: agreement between sources (low std dev → high confidence)
    (Math.max(0, 100 - tempStd * 15)) * 0.4 +
    // Station count bonus
    (Math.min(100, stationCount * 10)) * 0.3 +
    // Average reliability
    avgReliability * 0.3
  )));

  // ── Build used sources list ──────────────────────────────────────────────────
  const usedSources: UsedSource[] = allWeighted.map(({ source: s, weight, distW, qualW, freshW, perfW }) => {
    const ageMin = s.updatedAt ? (now - new Date(s.updatedAt).getTime()) / 60000 : 30;
    const altAdj = cfg.altitudeCorrectionEnabled && cfg.refAltitude != null && s.altitude != null
      ? -(((s.altitude - cfg.refAltitude) / 100) * 0.65)
      : 0;
    return {
      id: s.id,
      name: s.name,
      type: s.type,
      distanceKm: s.distanceKm,
      finalWeight: Math.round(weight * 1000) / 1000,
      distanceWeight: Math.round(distW * 1000) / 1000,
      qualityWeight: Math.round(qualW * 1000) / 1000,
      freshnessWeight: Math.round(Math.exp(-ageMin / 60) * 1000) / 1000,
      performanceWeight: Math.round(perfW * 1000) / 1000,
      altitudeAdjustmentC: Math.round(altAdj * 100) / 100,
      temperature: s.temperature ?? null,
      adjustedTemperature: s.temperature != null
        ? Math.round((s.temperature + altAdj) * 10) / 10
        : null,
    };
  });

  const methodParts = [
    `IDW-p${cfg.idwExponent}`,
    cfg.adaptiveWeightingEnabled ? "adaptive" : "fixed",
    cfg.anomalyDetectionEnabled ? "anomaly-checked" : "",
    cfg.altitudeCorrectionEnabled ? "alt-corrected" : "",
  ].filter(Boolean).join("+");

  return {
    temperature,
    apparentTemp,
    humidity,
    pressure,
    windSpeed,
    windGust,
    windDirection,
    precipitation,
    cloudCover,
    dewPoint,
    uvIndex,
    visibility,
    confidenceScore,
    stationCount,
    modelCount,
    usedSources,
    excludedSources: excluded,
    anomaliesDetected: anomalyReports,
    altitudeAdjustmentC: Math.round(altitudeAdjustmentC * 100) / 100,
    methodUsed: methodParts,
    validationNote: `${stationCount} station(s) + ${modelCount} modèle(s) utilisés. IDW p=${cfg.idwExponent}.`,
  };
}

// ─── Adaptive Model Fusion (per-parameter) ────────────────────────────────────

/**
 * Generate MeteoAI forecast using per-parameter adaptive weighting.
 * Each parameter (tempMax, tempMin, precip, wind) uses its own set of weights
 * based on the historical MAE of each service for that specific parameter.
 *
 * This replaces the single-score weighting in generateMeteoAIForecast.
 */
export function generateAdaptiveForecast(
  forecasts: Array<{
    serviceName: string;
    tempMax: number | null;
    tempMin: number | null;
    precipitation: number | null;
    windSpeed: number | null;
    windGust?: number | null;
    cloudCover?: number | null;
  }>,
  performanceByService: Record<string, {
    maeTemp?: number;
    maePrecip?: number;
    maeWind?: number;
    weightedScore?: number;
  }>
): {
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust: number | null;
  cloudCover: number | null;
  weights: Record<string, { tempWeight: number; precipWeight: number; windWeight: number }>;
  methodNote: string;
} {
  if (forecasts.length === 0) {
    return {
      tempMax: null, tempMin: null, precipitation: null,
      windSpeed: null, windGust: null, cloudCover: null,
      weights: {}, methodNote: "Aucune prévision disponible",
    };
  }

  // Compute per-parameter weights: 1/MAE (lower MAE → higher weight)
  // Fallback to global score if MAE not available
  function computeParamWeights(
    field: "maeTemp" | "maePrecip" | "maeWind"
  ): Record<string, number> {
    const raw: Record<string, number> = {};
    for (const f of forecasts) {
      const perf = performanceByService[f.serviceName];
      const mae = perf?.[field];
      // If MAE available and > 0, use 1/MAE; else fallback to global score or 50
      raw[f.serviceName] = mae != null && mae > 0
        ? 1 / mae
        : (perf?.weightedScore ?? 50) / 100;
    }
    const total = Object.values(raw).reduce((s, v) => s + v, 0);
    const normalized: Record<string, number> = {};
    for (const [name, w] of Object.entries(raw)) {
      normalized[name] = total > 0 ? w / total : 1 / forecasts.length;
    }
    return normalized;
  }

  const tempWeights = computeParamWeights("maeTemp");
  const precipWeights = computeParamWeights("maePrecip");
  const windWeights = computeParamWeights("maeWind");

  function wavg(
    field: "tempMax" | "tempMin" | "precipitation" | "windSpeed" | "windGust" | "cloudCover",
    weights: Record<string, number>
  ): number | null {
    let sum = 0, wSum = 0;
    for (const f of forecasts) {
      const v = f[field];
      const w = weights[f.serviceName] ?? (1 / forecasts.length);
      if (v != null) {
        sum += v * w;
        wSum += w;
      }
    }
    return wSum > 0 ? Math.round((sum / wSum) * 10) / 10 : null;
  }

  const weights: Record<string, { tempWeight: number; precipWeight: number; windWeight: number }> = {};
  for (const f of forecasts) {
    weights[f.serviceName] = {
      tempWeight: Math.round((tempWeights[f.serviceName] ?? 0) * 1000) / 1000,
      precipWeight: Math.round((precipWeights[f.serviceName] ?? 0) * 1000) / 1000,
      windWeight: Math.round((windWeights[f.serviceName] ?? 0) * 1000) / 1000,
    };
  }

  return {
    tempMax: wavg("tempMax", tempWeights),
    tempMin: wavg("tempMin", tempWeights),
    precipitation: wavg("precipitation", precipWeights),
    windSpeed: wavg("windSpeed", windWeights),
    windGust: wavg("windGust", windWeights),
    cloudCover: wavg("cloudCover", tempWeights), // use temp weights for cloud cover
    weights,
    methodNote: `Fusion adaptative par paramètre: ${forecasts.length} services, pondération 1/MAE`,
  };
}

// ─── Bias Correction ──────────────────────────────────────────────────────────
/**
 * Historical bias per service per parameter.
 * biasTemp > 0 means the model OVERESTIMATES temperature → subtract bias.
 * biasTemp < 0 means the model UNDERESTIMATES temperature → add |bias|.
 */
export type ServiceBias = {
  serviceName: string;
  biasTemp: number | null;   // °C — average (forecast - observed)
  biasPrecip: number | null; // mm
  biasWind: number | null;   // km/h
};

/**
 * Apply historical bias correction to a set of forecasts before fusion.
 * Each forecast value is shifted by -bias so the corrected value is closer
 * to the expected observation.
 *
 * Example: if AROME has biasTemp = +0.8°C (overestimates by 0.8°C),
 * we subtract 0.8°C from every AROME temperature forecast.
 *
 * A dampening factor (0.7) is applied to avoid over-correction when the
 * bias estimate is based on few samples.
 */
export function applyBiasCorrection<T extends {
  serviceName: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust?: number | null;
}>(
  forecasts: T[],
  biases: ServiceBias[],
  dampening = 0.7
): T[] {
  const biasMap = new Map<string, ServiceBias>();
  for (const b of biases) biasMap.set(b.serviceName, b);

  return forecasts.map(f => {
    const bias = biasMap.get(f.serviceName);
    if (!bias) return f;

    const corrected = { ...f };

    if (bias.biasTemp != null && Math.abs(bias.biasTemp) > 0.1) {
      const correction = bias.biasTemp * dampening;
      if (corrected.tempMax != null) corrected.tempMax = Math.round((corrected.tempMax - correction) * 10) / 10;
      if (corrected.tempMin != null) corrected.tempMin = Math.round((corrected.tempMin - correction) * 10) / 10;
    }

    if (bias.biasPrecip != null && Math.abs(bias.biasPrecip) > 0.2) {
      const correction = bias.biasPrecip * dampening;
      if (corrected.precipitation != null) {
        corrected.precipitation = Math.max(0, Math.round((corrected.precipitation - correction) * 10) / 10);
      }
    }

    if (bias.biasWind != null && Math.abs(bias.biasWind) > 1.0) {
      const correction = bias.biasWind * dampening;
      if (corrected.windSpeed != null) {
        corrected.windSpeed = Math.max(0, Math.round((corrected.windSpeed - correction) * 10) / 10);
      }
      if (corrected.windGust != null) {
        corrected.windGust = Math.max(0, Math.round((corrected.windGust - correction) * 10) / 10);
      }
    }

    return corrected;
  });
}

// ─── Lead-Time Weighted Fusion ────────────────────────────────────────────────
/**
 * Scores per service per lead-time bucket (from DB).
 */
export type LeadTimePerf = {
  serviceName: string;
  bucket: LeadTimeBucket;
  avgMaeTemp: number | null;
  avgMaePrecip: number | null;
  avgMaeWind: number | null;
  sampleSize?: number | null;
  latestScoreDate?: string | null;
};

export const MIN_LEAD_TIME_SAMPLES = 7;
export const MAX_LEAD_TIME_SCORE_AGE_DAYS = 7;
export const MIN_GLOBAL_RELIABILITY_SAMPLES = 7;
export const MAX_GLOBAL_RELIABILITY_SCORE_AGE_DAYS = 7;

function isEligibleLeadTimePerf(perf: LeadTimePerf, now: Date): boolean {
  if ((perf.sampleSize ?? 0) < MIN_LEAD_TIME_SAMPLES) return false;
  if (!perf.latestScoreDate) return false;
  const parsed = new Date(`${perf.latestScoreDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const ageMs = now.getTime() - parsed.getTime();
  return ageMs >= 0 && ageMs <= MAX_LEAD_TIME_SCORE_AGE_DAYS * 24 * 60 * 60 * 1000;
}

export function isEligibleGlobalReliabilityScore(
  sampleSize: number | null | undefined,
  latestScoreDate: string | null | undefined,
  now = new Date(),
): boolean {
  if ((sampleSize ?? 0) < MIN_GLOBAL_RELIABILITY_SAMPLES || !latestScoreDate) return false;
  const parsed = new Date(`${latestScoreDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const ageMs = now.getTime() - parsed.getTime();
  return ageMs >= 0 && ageMs <= MAX_GLOBAL_RELIABILITY_SCORE_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Select the best performance metrics for a given lead-time bucket.
 * Falls back to adjacent buckets if the exact bucket has no data.
 * Returns a map of serviceName → { maeTemp, maePrecip, maeWind }.
 */
export function getLeadTimeWeights(
  leadTimePerfs: LeadTimePerf[],
  targetBucket: LeadTimeBucket,
  now = new Date(),
): Record<string, { maeTemp?: number; maePrecip?: number; maeWind?: number }> {
  const bucketPriority: LeadTimeBucket[] = [
    targetBucket,
    ...["0-6h", "6-24h", "1-3d", "4-7d", "8-15d"].filter(b => b !== targetBucket) as LeadTimeBucket[],
  ];

  const result: Record<string, { maeTemp?: number; maePrecip?: number; maeWind?: number }> = {};

  const eligiblePerfs = leadTimePerfs.filter((perf) => isEligibleLeadTimePerf(perf, now));
  const uniqueServices = Array.from(new Set(eligiblePerfs.map(p => p.serviceName)));
  for (const svc of uniqueServices) {
    let found: LeadTimePerf | undefined;
    for (const bucket of bucketPriority) {
      found = eligiblePerfs.find(p => p.serviceName === svc && p.bucket === bucket);
      if (found) break;
    }
    if (found) {
      result[svc] = {
        maeTemp: found.avgMaeTemp ?? undefined,
        maePrecip: found.avgMaePrecip ?? undefined,
        maeWind: found.avgMaeWind ?? undefined,
      };
    }
  }

  return result;
}

/**
 * Compute a true confidence score based on:
 * 1. Model agreement (divergence between forecasts) — 40%
 * 2. Historical performance of the best model — 30%
 * 3. Station coherence (if available) — 20%
 * 4. Lead-time factor (shorter horizon = more reliable) — 10%
 *
 * Returns 0–100.
 */
export function computeConfidenceScore(params: {
  forecasts: Array<{ tempMax: number | null; tempMin: number | null; precipitation: number | null; windSpeed: number | null }>;
  bestModelScore?: number | null;
  stationCoherence?: number | null;
  leadTimeBucket?: LeadTimeBucket | null;
}): number {
  const { forecasts, bestModelScore, stationCoherence, leadTimeBucket } = params;

  // 1. Model agreement (40%)
  const temps = forecasts.map(f => f.tempMax).filter((v): v is number => v != null);
  const precips = forecasts.map(f => f.precipitation).filter((v): v is number => v != null);
  const winds = forecasts.map(f => f.windSpeed).filter((v): v is number => v != null);

  let agreementScore = 100;
  if (temps.length > 1) {
    const tempRange = Math.max(...temps) - Math.min(...temps);
    agreementScore = Math.max(0, 100 - tempRange * 8);
  }
  if (precips.length > 1) {
    const precipRange = Math.max(...precips) - Math.min(...precips);
    agreementScore = Math.min(agreementScore, Math.max(0, 100 - precipRange * 15));
  }
  if (winds.length > 1) {
    const windRange = Math.max(...winds) - Math.min(...winds);
    agreementScore = Math.min(agreementScore, Math.max(0, 100 - windRange * 3));
  }

  // 4. Lead-time factor (10%)
  const leadTimeFactors: Record<LeadTimeBucket, number> = {
    "0-6h": 95,
    "6-24h": 85,
    "1-3d": 75,
    "4-7d": 60,
    "8-15d": 45,
  };
  const leadFactor = leadTimeBucket ? leadTimeFactors[leadTimeBucket] : 70;

  const components = [
    { score: agreementScore, weight: 0.40 },
    { score: leadFactor, weight: 0.10 },
    ...(bestModelScore != null ? [{ score: Math.min(100, Math.max(0, bestModelScore)), weight: 0.30 }] : []),
    ...(stationCoherence != null ? [{ score: Math.min(100, Math.max(0, stationCoherence)), weight: 0.20 }] : []),
  ];
  const knownWeight = components.reduce((total, component) => total + component.weight, 0);
  const measuredConfidence = knownWeight > 0
    ? Math.round(components.reduce((total, component) => total + component.score * component.weight, 0) / knownWeight)
    : 0;

  // Sans performance qualifiée ni cohérence physique, l'accord des modèles ne
  // suffit pas pour suggérer une forte précision. Le plafond matérialise cette
  // absence de preuve au lieu de la remplacer par une valeur par défaut.
  const confidence = bestModelScore == null && stationCoherence == null
    ? Math.min(55, measuredConfidence)
    : bestModelScore == null || stationCoherence == null
      ? Math.min(75, measuredConfidence)
      : measuredConfidence;

  return Math.max(0, Math.min(100, confidence));
}
