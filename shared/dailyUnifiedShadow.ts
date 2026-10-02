import type { ShadowFreshnessStatus, ShadowQualityStatus } from "./weatherDataHub";

/**
 * Fusion quotidienne expérimentale, strictement shadow.
 *
 * Cette logique ne lit ni poids, ni scores, ni archives de production. Elle
 * reçoit uniquement les valeurs déjà normalisées et contrôlées du Data Hub.
 */
export const DAILY_UNIFIED_SHADOW_VERSION = "daily-unified-shadow-v1" as const;

export const DAILY_UNIFIED_SHADOW_VARIABLES = [
  "air_temperature_max",
  "air_temperature_min",
  "precipitation_amount",
  "wind_speed_10m",
  "wind_gust_10m",
  "relative_humidity_2m",
  "cloud_cover_total",
] as const;

export type DailyUnifiedShadowVariable = typeof DAILY_UNIFIED_SHADOW_VARIABLES[number];

/** Les seuls contributeurs indépendants admissibles au moteur quotidien candidat. */
export const DAILY_UNIFIED_SHADOW_MODEL_KEYS = [
  "openmeteo_arome_france_hd",
  "openmeteo_arpege_europe",
  "openmeteo_icon_eu",
  "openmeteo_ecmwf_ifs025",
  "openmeteo_gfs_seamless",
  "openmeteo_gem_seamless",
  "openmeteo_ukmo_seamless",
] as const;

/** Réplique structurelle, à fins de comparaison seulement, de l’ancienne moyenne 15 jours. */
export const DAILY_UNIFIED_LEGACY_REFERENCE_KEYS = [
  "openmeteo_ecmwf_ifs025",
  "openmeteo_gfs_seamless",
  "openmeteo_icon_eu",
  "openmeteo_best_match",
] as const;

export type DailyUnifiedShadowSource = {
  sourceKey: string;
  value: number | null;
  qualityStatus: ShadowQualityStatus;
  phase5Status: ShadowQualityStatus | null;
  freshnessStatus: ShadowFreshnessStatus;
  isDerived: boolean;
  /** Utilisable uniquement lorsqu’une preuve validée l’a rendu disponible. */
  performanceScore?: number | null;
};

export type DailyUnifiedShadowSourceTrace = {
  sourceKey: string;
  value: number | null;
  referenceOnly: boolean;
  included: boolean;
  normalizedWeight: number;
  components: {
    quality: number;
    freshness: number;
    performance: number;
    independence: number;
  };
  missingEvidence: string[];
  exclusionReasons: string[];
};

export type DailyUnifiedShadowVariableResult = {
  version: typeof DAILY_UNIFIED_SHADOW_VERSION;
  variable: DailyUnifiedShadowVariable;
  status: "SHADOW_READY" | "PARTIAL" | "UNAVAILABLE";
  candidateValue: number | null;
  legacyReferenceValue: number | null;
  differenceFromLegacyReference: number | null;
  contributingSourceCount: number;
  availableDeterministicSourceCount: number;
  requiredDeterministicSourceCount: number;
  missingDeterministicSourceKeys: string[];
  bestMatchReferenceValue: number | null;
  weights: DailyUnifiedShadowSourceTrace[];
  missingEvidence: string[];
  productionReadsEnabled: false;
  appliedToProduction: 0;
};

function round(value: number | null) {
  return value == null ? null : Math.round(value * 100) / 100;
}

function phase5QualityFactor(status: ShadowQualityStatus | null) {
  if (status === "VALID") return { value: 1, missing: false };
  if (status === "SUSPECT") return { value: 0.75, missing: false };
  return { value: 0, missing: false };
}

function freshnessFactor(status: ShadowFreshnessStatus) {
  if (status === "FRESH") return { value: 1, missing: false };
  if (status === "AGING") return { value: 0.85, missing: false };
  if (status === "UNKNOWN") return { value: 0.7, missing: true };
  return { value: 0, missing: false };
}

function performanceFactor(score: number | null | undefined) {
  if (score == null || !Number.isFinite(score)) return { value: 1, missing: true };
  return { value: Math.min(1.5, Math.max(0.25, score / 100)), missing: false };
}

/**
 * Calcule une valeur par variable en appliquant la même discipline que la
 * fusion shadow : qualité, fraîcheur, preuve de performance et indépendance.
 * Best Match est conservé uniquement comme référence : son poids est toujours 0.
 */
export function calculateDailyUnifiedShadowVariable(input: {
  variable: DailyUnifiedShadowVariable;
  sources: readonly DailyUnifiedShadowSource[];
}): DailyUnifiedShadowVariableResult {
  const expected = new Set<string>(DAILY_UNIFIED_SHADOW_MODEL_KEYS);
  const sourceByKey = new Map(input.sources.map(source => [source.sourceKey, source]));
  const availableDeterministic = DAILY_UNIFIED_SHADOW_MODEL_KEYS.filter(key => {
    const source = sourceByKey.get(key);
    return source != null
      && source.value != null
      && Number.isFinite(source.value)
      && source.qualityStatus === "VALID"
      && (source.phase5Status === "VALID" || source.phase5Status === "SUSPECT");
  });
  const missingDeterministicSourceKeys = DAILY_UNIFIED_SHADOW_MODEL_KEYS.filter(key => !availableDeterministic.includes(key));

  const traces = input.sources.map(source => {
    const referenceOnly = source.isDerived || source.sourceKey === "openmeteo_best_match" || !expected.has(source.sourceKey);
    const quality = phase5QualityFactor(source.phase5Status);
    const freshness = freshnessFactor(source.freshnessStatus);
    const performance = performanceFactor(source.performanceScore);
    const finiteValue = source.value != null && Number.isFinite(source.value);
    const exclusionReasons = [
      referenceOnly ? "derived_reference" : null,
      !finiteValue ? "value_missing" : null,
      source.qualityStatus !== "VALID" ? `normalization_${source.qualityStatus.toLowerCase()}` : null,
      source.phase5Status == null ? "phase5_not_evaluated" : null,
      source.phase5Status === "INVALID" || source.phase5Status === "MISSING" || source.phase5Status === "STALE"
        ? `phase5_${source.phase5Status.toLowerCase()}`
        : null,
      source.freshnessStatus === "STALE" ? "freshness_stale" : null,
    ].filter((reason): reason is string => reason != null);
    const included = !referenceOnly && exclusionReasons.length === 0;
    const independence = referenceOnly ? 0 : 1;
    const rawWeight = included ? quality.value * freshness.value * performance.value * independence : 0;
    const missingEvidence = [
      freshness.missing ? "freshness" : null,
      performance.missing ? "qualified_performance" : null,
    ].filter((item): item is string => item != null);
    return {
      sourceKey: source.sourceKey,
      value: source.value,
      referenceOnly,
      included,
      rawWeight,
      normalizedWeight: 0,
      components: { quality: quality.value, freshness: freshness.value, performance: performance.value, independence },
      missingEvidence,
      exclusionReasons,
    };
  });

  const totalWeight = traces.reduce((sum, trace) => sum + trace.rawWeight, 0);
  const weights = traces.map(({ rawWeight, ...trace }) => ({
    ...trace,
    normalizedWeight: totalWeight > 0 && rawWeight > 0 ? rawWeight / totalWeight : 0,
  }));
  const contributing = weights.filter(weight => weight.included && weight.normalizedWeight > 0);
  const candidateValue = contributing.length === 0
    ? null
    : round(contributing.reduce((sum, weight) => sum + (weight.value ?? 0) * weight.normalizedWeight, 0));

  const legacyReferenceValues = DAILY_UNIFIED_LEGACY_REFERENCE_KEYS
    .map(key => sourceByKey.get(key)?.value ?? null)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const legacyReferenceValue = legacyReferenceValues.length === 0
    ? null
    : round(legacyReferenceValues.reduce((sum, value) => sum + value, 0) / legacyReferenceValues.length);
  const bestMatchReferenceValue = sourceByKey.get("openmeteo_best_match")?.value ?? null;

  const missingEvidence = [
    missingDeterministicSourceKeys.length > 0 ? "deterministic_coverage" : null,
    weights.some(weight => weight.included && weight.missingEvidence.includes("freshness")) ? "freshness" : null,
    weights.some(weight => weight.included && weight.missingEvidence.includes("qualified_performance")) ? "qualified_performance" : null,
  ].filter((item): item is string => item != null);
  const status = candidateValue == null
    ? "UNAVAILABLE"
    : missingEvidence.length > 0 || contributing.length < DAILY_UNIFIED_SHADOW_MODEL_KEYS.length
      ? "PARTIAL"
      : "SHADOW_READY";

  return {
    version: DAILY_UNIFIED_SHADOW_VERSION,
    variable: input.variable,
    status,
    candidateValue,
    legacyReferenceValue,
    differenceFromLegacyReference: candidateValue == null || legacyReferenceValue == null
      ? null
      : round(candidateValue - legacyReferenceValue),
    contributingSourceCount: contributing.length,
    availableDeterministicSourceCount: availableDeterministic.length,
    requiredDeterministicSourceCount: DAILY_UNIFIED_SHADOW_MODEL_KEYS.length,
    missingDeterministicSourceKeys,
    bestMatchReferenceValue: bestMatchReferenceValue != null && Number.isFinite(bestMatchReferenceValue)
      ? bestMatchReferenceValue
      : null,
    weights,
    missingEvidence,
    productionReadsEnabled: false,
    appliedToProduction: 0,
  };
}
