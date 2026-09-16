export const SHADOW_SOURCE_TYPES = [
  "deterministic_model",
  "ensemble",
  "aggregator",
  "observation",
  "radar",
  "satellite",
  "ai_model",
] as const;

export const SHADOW_SOURCE_ROLES = [
  "production_baseline",
  "shadow_candidate",
  "shadow_reference",
  "observation_truth",
] as const;

export const PHASE2_SOURCE_CATEGORIES = [
  "DETERMINISTIC",
  "ENSEMBLE",
  "OBSERVATION",
  "RADAR",
  "SATELLITE",
  "DERIVED_AGGREGATOR",
] as const;

export const PHASE2_SOURCE_ROLES = ["FORECAST", "OBSERVATION", "DERIVED"] as const;
export const PHASE2_CLASSIFICATION_VERSION = "phase2-source-classification-v1" as const;

export const PHASE3_HORIZON_STRATEGY_VERSION = "phase3-horizon-hierarchy-v1" as const;
export const PHASE3_SOURCE_CAPABILITIES = [
  "DETERMINISTIC",
  "ENSEMBLE",
  "AI_MODEL",
  "AI_ENSEMBLE",
  "OBSERVATION",
  "RADAR",
  "SATELLITE",
  "NOWCAST_AROME_PI",
  "VERY_SHORT_RANGE",
  "CONSENSUS",
] as const;

export const PHASE4_NORMALIZATION_VERSION = "phase4-data-normalization-v1" as const;
export const PHASE4_NORMALIZATION_STATUSES = ["NORMALIZED", "MISSING", "ISSUES"] as const;
export const PHASE4_NORMALIZATION_ISSUES = [
  "MISSING_VALUE",
  "NON_FINITE_VALUE",
  "MISSING_SOURCE_UNIT",
  "UNSUPPORTED_SOURCE_UNIT",
  "VALUE_OUT_OF_RANGE",
  "INVALID_TIMESTAMP",
  "INVALID_COORDINATES",
  "MISSING_SOURCE_TIMEZONE",
  "UNEXPECTED_SOURCE_TIMEZONE",
] as const;

export const PHASE5_QUALITY_CONTROL_VERSION = "phase5-quality-control-v1" as const;
export const PHASE5_QUALITY_RULES = [
  "MISSING_VALUE",
  "MISSING_FLAG_MISMATCH",
  "NON_FINITE_VALUE",
  "PHYSICAL_RANGE_INVALID",
  "NORMALIZATION_INVALID",
  "NORMALIZATION_MISSING",
  "TIMESTAMP_INCOHERENT",
  "COORDINATES_INVALID",
  "DUPLICATE_VALUE",
  "RUN_FAILED",
  "RUN_INCOMPLETE",
  "EXTREME_VALUE",
  "RAPID_VARIATION",
  "STALE_DATA",
] as const;

export const PHASE5_FRESHNESS_THRESHOLDS = {
  freshThroughHours: 24,
  staleAfterHours: 30,
} as const;

export const SHADOW_INDEPENDENCE_CLASSES = [
  "independent_model",
  "related_family",
  "derived",
  "aggregated",
  "non_independent",
  "unknown",
] as const;

export const SHADOW_RUN_STATUSES = ["SUCCESS", "PARTIAL", "FAILED", "STALE"] as const;
export const SHADOW_RUN_EVIDENCE_STATUSES = [
  "PROVIDER_REPORTED",
  "OPEN_METEO_METADATA",
  "SCHEDULE_DERIVED",
  "UNKNOWN",
] as const;

export const P1_OBSERVATION_VERDICTS = [
  "OBSERVING",
  "VALIDABLE",
  "EXTEND",
  "FAILED",
] as const;

export type P1ObservationVerdict = typeof P1_OBSERVATION_VERDICTS[number];

export const P1_OBSERVATION_THRESHOLDS = {
  requiredDays: 7,
  expectedSources: 8,
  minimumWriteSuccessRate: 0.99,
  minimumContractIntegrityRate: 1,
  maximumDuplicateRunGroups: 0,
  maximumAppliedToProduction: 0,
  maximumNonShadowValues: 0,
} as const;
export const SHADOW_RUN_EVIDENCE_SCOPES = [
  "payload_exact",
  "model_exact",
  "model_family",
  "aggregator_unresolved",
  "schedule_only",
  "none",
] as const;
export const SHADOW_QUALITY_STATUSES = ["VALID", "SUSPECT", "INVALID", "MISSING", "STALE"] as const;
export const SHADOW_FRESHNESS_STATUSES = ["FRESH", "AGING", "STALE", "UNKNOWN"] as const;
export const SHADOW_USAGE_STATUSES = [
  "allowed",
  "restricted",
  "attribution_required",
  "unknown",
  "disabled",
] as const;

export const SHADOW_CANONICAL_UNITS = ["Cel", "mm", "km/h", "degree", "%", "hPa", "km", "cm", "wmo_code"] as const;

export const SHADOW_CANONICAL_VARIABLES = {
  air_temperature_2m: { unit: "Cel", levelKey: "2m" },
  air_temperature_max: { unit: "Cel", levelKey: "2m" },
  air_temperature_min: { unit: "Cel", levelKey: "2m" },
  apparent_temperature: { unit: "Cel", levelKey: "2m" },
  precipitation_amount: { unit: "mm", levelKey: "surface" },
  wind_speed_10m: { unit: "km/h", levelKey: "10m" },
  wind_gust_10m: { unit: "km/h", levelKey: "10m" },
  wind_direction_10m: { unit: "degree", levelKey: "10m" },
  relative_humidity_2m: { unit: "%", levelKey: "2m" },
  air_pressure_msl: { unit: "hPa", levelKey: "msl" },
  air_pressure_surface: { unit: "hPa", levelKey: "surface" },
  cloud_cover_total: { unit: "%", levelKey: "total_atmosphere" },
  visibility: { unit: "km", levelKey: "surface" },
  snowfall_amount: { unit: "cm", levelKey: "surface" },
  weather_code: { unit: "wmo_code", levelKey: "surface" },
} as const;

type ArrayValue<T extends readonly unknown[]> = T[number];

export type ShadowSourceType = ArrayValue<typeof SHADOW_SOURCE_TYPES>;
export type ShadowSourceRole = ArrayValue<typeof SHADOW_SOURCE_ROLES>;
export type Phase2SourceCategory = ArrayValue<typeof PHASE2_SOURCE_CATEGORIES>;
export type Phase2SourceRole = ArrayValue<typeof PHASE2_SOURCE_ROLES>;
export type Phase3SourceCapability = ArrayValue<typeof PHASE3_SOURCE_CAPABILITIES>;
export type Phase4NormalizationStatus = ArrayValue<typeof PHASE4_NORMALIZATION_STATUSES>;
export type Phase4NormalizationIssue = ArrayValue<typeof PHASE4_NORMALIZATION_ISSUES>;
export type Phase5QualityRule = ArrayValue<typeof PHASE5_QUALITY_RULES>;
export type ShadowIndependenceClass = ArrayValue<typeof SHADOW_INDEPENDENCE_CLASSES>;
export type ShadowRunStatus = ArrayValue<typeof SHADOW_RUN_STATUSES>;
export type ShadowRunEvidenceStatus = ArrayValue<typeof SHADOW_RUN_EVIDENCE_STATUSES>;
export type ShadowRunEvidenceScope = ArrayValue<typeof SHADOW_RUN_EVIDENCE_SCOPES>;
export type ShadowQualityStatus = ArrayValue<typeof SHADOW_QUALITY_STATUSES>;
export type ShadowFreshnessStatus = ArrayValue<typeof SHADOW_FRESHNESS_STATUSES>;
export type ShadowUsageStatus = ArrayValue<typeof SHADOW_USAGE_STATUSES>;
export type ShadowCanonicalUnit = ArrayValue<typeof SHADOW_CANONICAL_UNITS>;
export type ShadowCanonicalVariable = keyof typeof SHADOW_CANONICAL_VARIABLES;

export type Phase4NormalizationMetadata = {
  version: typeof PHASE4_NORMALIZATION_VERSION;
  status: Phase4NormalizationStatus;
  sourceValue: number | null;
  sourceUnit: string | null;
  canonicalUnit: ShadowCanonicalUnit;
  conversion: string;
  sourceTimezone: string | null;
  cardinalDirection: string | null;
  coordinateStatus: "VALID" | "INVALID";
  nativeResolutionStatus: "KNOWN" | "UNKNOWN";
  issues: Phase4NormalizationIssue[];
  appliedToProduction: 0;
};

export type Phase4NormalizationInput = {
  variable: ShadowCanonicalVariable;
  value: number | null | undefined;
  sourceUnit: string | null | undefined;
  sourceTimezone: string | null | undefined;
  latitude: number;
  longitude: number;
  validTime: number;
  nativeResolutionKm: number | null;
};

export type Phase4NormalizationResult = {
  value: number | null;
  metadata: Phase4NormalizationMetadata;
};

export type Phase5QualityControlMetadata = {
  version: typeof PHASE5_QUALITY_CONTROL_VERSION;
  status: ShadowQualityStatus;
  freshnessStatus: ShadowFreshnessStatus;
  rules: Phase5QualityRule[];
  aggregation: "hourly" | "daily";
  runStatus: ShadowRunStatus;
  evaluatedAt: number;
  receivedAt: number;
  validTime: number;
  duplicateCount: number;
  usableInShadow: boolean;
  excludedFromPhase5Shadow: boolean;
  thresholdVersion: "phase5-qc-thresholds-v1";
  appliedToProduction: 0;
};

export type Phase5QualityControlInput = {
  variable: ShadowCanonicalVariable;
  value: number | null;
  missingData: 0 | 1;
  validTime: number;
  receivedAt: number;
  evaluatedAt: number;
  latitude: number;
  longitude: number;
  aggregation: "hourly" | "daily";
  runStatus: ShadowRunStatus;
  duplicateCount: number;
  normalizationMetadata: Phase4NormalizationMetadata | null;
  previousValue?: number | null;
  previousValidTime?: number | null;
};

export type Phase5QualityControlResult = {
  status: ShadowQualityStatus;
  metadata: Phase5QualityControlMetadata;
};

export const PHASE6_SMART_FUSION_VERSION = "phase6-smart-fusion-v1" as const;
export const PHASE6_WEIGHT_COMPONENTS = [
  "localPerformance",
  "horizonPerformance",
  "variablePerformance",
  "quality",
  "freshness",
  "resolution",
  "regime",
  "convergence",
  "independence",
] as const;
export const PHASE6_FUSION_VARIABLES = [
  "air_temperature_2m",
  "precipitation_amount",
  "wind_speed_10m",
  "wind_gust_10m",
  "relative_humidity_2m",
  "cloud_cover_total",
] as const;
export const PHASE6_SHADOW_CANDIDATE_STATUSES = ["SHADOW_READY", "PARTIAL", "UNAVAILABLE"] as const;

export type Phase6WeightComponent = ArrayValue<typeof PHASE6_WEIGHT_COMPONENTS>;
export type Phase6FusionVariable = ArrayValue<typeof PHASE6_FUSION_VARIABLES>;
export type Phase6ShadowCandidateStatus = ArrayValue<typeof PHASE6_SHADOW_CANDIDATE_STATUSES>;

export type Phase6ShadowFusionSource = {
  sourceKey: string;
  sourceType: ShadowSourceType;
  independenceClass: ShadowIndependenceClass;
  value: number | null;
  available?: boolean;
  phase5Status: ShadowQualityStatus;
  freshnessStatus: ShadowFreshnessStatus;
  localPerformanceScore?: number | null;
  horizonPerformanceScore?: number | null;
  variablePerformanceScore?: number | null;
  nativeResolutionKm?: number | null;
  regimeMatch?: number | null;
  convergenceScore?: number | null;
  isDerived?: boolean;
};

export type Phase6ShadowWeightMetadata = {
  sourceKey: string;
  value: number | null;
  rawWeight: number;
  normalizedWeight: number;
  includedInCandidate: boolean;
  referenceOnly: boolean;
  components: Record<Phase6WeightComponent, number>;
  missingEvidence: string[];
};

export type Phase6ShadowFusionInput = {
  variable: Phase6FusionVariable;
  sources: Phase6ShadowFusionSource[];
  phase3WindowKey: Phase3HorizonWindow["key"];
  evaluatedAt: number;
};

export type Phase6ShadowFusionResult = {
  version: typeof PHASE6_SMART_FUSION_VERSION;
  variable: Phase6FusionVariable;
  status: Phase6ShadowCandidateStatus;
  candidateValue: number | null;
  weights: Phase6ShadowWeightMetadata[];
  referenceValues: Array<{ sourceKey: string; value: number }>;
  contributingSourceCount: number;
  independentSourceCount: number;
  evaluatedAt: number;
  phase3WindowKey: Phase3HorizonWindow["key"];
  productionReadsEnabled: false;
  appliedToProduction: 0;
};

const phase6Clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const phase6EvidenceFactor = (score: number | null | undefined) =>
  score == null || !Number.isFinite(score)
    ? { value: 1, missing: true }
    : { value: phase6Clamp(score / 100, 0.25, 1.5), missing: false };

export function calculatePhase6ShadowCandidate(input: Phase6ShadowFusionInput): Phase6ShadowFusionResult {
  const weights = input.sources.map(source => {
    const referenceOnly = source.isDerived === true
      || source.sourceType === "aggregator"
      || source.independenceClass === "non_independent"
      || source.independenceClass === "derived";
    const usable = source.available !== false
      && source.value != null
      && Number.isFinite(source.value)
      && source.phase5Status !== "INVALID"
      && source.phase5Status !== "MISSING"
      && source.phase5Status !== "STALE"
      && !referenceOnly;
    const local = phase6EvidenceFactor(source.localPerformanceScore);
    const horizon = phase6EvidenceFactor(source.horizonPerformanceScore);
    const variable = phase6EvidenceFactor(source.variablePerformanceScore);
    const quality = source.phase5Status === "VALID" ? 1
      : source.phase5Status === "SUSPECT" ? 0.75
        : 0;
    const freshness = source.freshnessStatus === "FRESH" ? 1
      : source.freshnessStatus === "AGING" ? 0.85
        : source.freshnessStatus === "UNKNOWN" ? 0.7
          : 0;
    const resolution = source.nativeResolutionKm == null
      ? 1
      : phase6Clamp(1 / (1 + Math.max(0, source.nativeResolutionKm) / 10), 0.5, 1);
    const regime = source.regimeMatch == null
      ? 1
      : phase6Clamp(0.5 + phase6Clamp(source.regimeMatch, 0, 1) * 0.5, 0.5, 1);
    const convergence = source.convergenceScore == null
      ? 1
      : phase6Clamp(0.75 + phase6Clamp(source.convergenceScore, 0, 1) * 0.5, 0.75, 1.25);
    const independence = source.independenceClass === "independent_model" ? 1
      : source.independenceClass === "related_family" ? 0.85
        : source.independenceClass === "unknown" ? 0.7
          : 0;
    const rawWeight = usable
      ? local.value * horizon.value * variable.value * quality * freshness * resolution * regime * convergence * independence
      : 0;
    const missingEvidence = [
      local.missing ? "localPerformance" : null,
      horizon.missing ? "horizonPerformance" : null,
      variable.missing ? "variablePerformance" : null,
      source.nativeResolutionKm == null ? "resolution" : null,
      source.regimeMatch == null ? "regime" : null,
      source.convergenceScore == null ? "convergence" : null,
    ].filter((item): item is string => item != null);
    return {
      sourceKey: source.sourceKey,
      value: source.value,
      rawWeight,
      normalizedWeight: 0,
      includedInCandidate: usable,
      referenceOnly,
      components: {
        localPerformance: local.value,
        horizonPerformance: horizon.value,
        variablePerformance: variable.value,
        quality,
        freshness,
        resolution,
        regime,
        convergence,
        independence,
      },
      missingEvidence,
    } satisfies Phase6ShadowWeightMetadata;
  });
  const totalWeight = weights.reduce((sum, item) => sum + item.rawWeight, 0);
  const normalizedWeights = weights.map(item => ({
    ...item,
    normalizedWeight: totalWeight > 0 && item.rawWeight > 0 ? item.rawWeight / totalWeight : 0,
  }));
  const contributing = normalizedWeights.filter(item => item.includedInCandidate && item.normalizedWeight > 0);
  const candidateValue = contributing.length > 0
    ? contributing.reduce((sum, item) => sum + (item.value ?? 0) * item.normalizedWeight, 0)
    : null;
  const referenceValues = normalizedWeights
    .filter(item => item.referenceOnly && item.value != null && Number.isFinite(item.value))
    .map(item => ({ sourceKey: item.sourceKey, value: item.value as number }));
  const status: Phase6ShadowCandidateStatus = contributing.length === 0
    ? "UNAVAILABLE"
    : contributing.length < 2 || normalizedWeights.some(item => item.missingEvidence.length > 0 && item.includedInCandidate)
      ? "PARTIAL"
      : "SHADOW_READY";
  return {
    version: PHASE6_SMART_FUSION_VERSION,
    variable: input.variable,
    status,
    candidateValue,
    weights: normalizedWeights,
    referenceValues,
    contributingSourceCount: contributing.length,
    independentSourceCount: contributing.filter(item => !item.referenceOnly).length,
    evaluatedAt: input.evaluatedAt,
    phase3WindowKey: input.phase3WindowKey,
    productionReadsEnabled: false,
    appliedToProduction: 0,
  };
}

export type ShadowSourceDefinitionSeed = {
  sourceKey: string;
  displayName: string;
  provider: "open_meteo";
  sourceFamily: string;
  model: string;
  modelVersion: string | null;
  sourceType: ShadowSourceType;
  sourceRole: ShadowSourceRole;
  independenceClass: ShadowIndependenceClass;
  apiIdentifier: string;
  sourceUrl: string;
  licenseKey: "open_meteo_current";
  nativeResolutionKm: number | null;
  expectedUpdateMinutes: number | null;
  shadowEnabled: true;
};

export type ShadowProviderRunEvidence = {
  status: ShadowRunEvidenceStatus;
  scope: ShadowRunEvidenceScope;
  providerRunTime: number | null;
  providerAvailableAt: number | null;
  providerModifiedAt: number | null;
  observedAt: number;
  sourceUrl: string | null;
  evidenceHash: string | null;
  detail: string;
  evidence: Record<string, unknown> | null;
};

export type Phase2SourceClassification = {
  sourceKey: string;
  category: Phase2SourceCategory;
  role: Phase2SourceRole;
  independenceClass: ShadowIndependenceClass;
  evidence: {
    version: typeof PHASE2_CLASSIFICATION_VERSION;
    basis: "declared_model" | "derived_aggregator";
    explanation: string;
  };
  appliedToProduction: 0;
};

export type Phase3HorizonWindow = {
  key: "0_2h" | "2_6h" | "6_24h" | "1_3d" | "3_7d" | "7_15d";
  label: string;
  minMinutes: number;
  maxMinutes: number;
  requiredCapabilities: readonly Phase3SourceCapability[];
  prioritySourceKeys: readonly string[];
  contextSourceKeys: readonly string[];
  derivedReferenceSourceKeys: readonly ["openmeteo_best_match"];
  uncertaintyRequired: boolean;
  appliedToProduction: 0;
};

export const P1_SHADOW_SOURCE_DEFINITIONS = [
  {
    sourceKey: "openmeteo_arome_france_hd",
    displayName: "AROME",
    provider: "open_meteo",
    sourceFamily: "arome",
    model: "meteofrance_arome_france_hd",
    modelVersion: null,
    sourceType: "deterministic_model",
    sourceRole: "production_baseline",
    independenceClass: "independent_model",
    apiIdentifier: "open_meteo_forecast_api",
    sourceUrl: "https://open-meteo.com/en/docs/meteofrance-api",
    licenseKey: "open_meteo_current",
    nativeResolutionKm: null,
    expectedUpdateMinutes: null,
    shadowEnabled: true,
  },
  {
    sourceKey: "openmeteo_arpege_europe",
    displayName: "ARPEGE",
    provider: "open_meteo",
    sourceFamily: "arpege",
    model: "meteofrance_arpege_europe",
    modelVersion: null,
    sourceType: "deterministic_model",
    sourceRole: "production_baseline",
    independenceClass: "independent_model",
    apiIdentifier: "open_meteo_forecast_api",
    sourceUrl: "https://open-meteo.com/en/docs/meteofrance-api",
    licenseKey: "open_meteo_current",
    nativeResolutionKm: null,
    expectedUpdateMinutes: null,
    shadowEnabled: true,
  },
  {
    sourceKey: "openmeteo_icon_eu",
    displayName: "ICON",
    provider: "open_meteo",
    sourceFamily: "icon",
    model: "dwd_icon_eu",
    modelVersion: null,
    sourceType: "deterministic_model",
    sourceRole: "production_baseline",
    independenceClass: "independent_model",
    apiIdentifier: "open_meteo_forecast_api",
    sourceUrl: "https://open-meteo.com/en/docs/dwd-api",
    licenseKey: "open_meteo_current",
    nativeResolutionKm: null,
    expectedUpdateMinutes: null,
    shadowEnabled: true,
  },
  {
    sourceKey: "openmeteo_ecmwf_ifs025",
    displayName: "ECMWF",
    provider: "open_meteo",
    sourceFamily: "ecmwf_ifs",
    model: "ecmwf_ifs025",
    modelVersion: null,
    sourceType: "deterministic_model",
    sourceRole: "production_baseline",
    independenceClass: "independent_model",
    apiIdentifier: "open_meteo_forecast_api",
    sourceUrl: "https://open-meteo.com/en/docs/ecmwf-api",
    licenseKey: "open_meteo_current",
    nativeResolutionKm: null,
    expectedUpdateMinutes: null,
    shadowEnabled: true,
  },
  {
    sourceKey: "openmeteo_gfs_seamless",
    displayName: "GFS",
    provider: "open_meteo",
    sourceFamily: "gfs",
    model: "gfs_seamless",
    modelVersion: null,
    sourceType: "deterministic_model",
    sourceRole: "production_baseline",
    independenceClass: "independent_model",
    apiIdentifier: "open_meteo_forecast_api",
    sourceUrl: "https://open-meteo.com/en/docs/gfs-api",
    licenseKey: "open_meteo_current",
    nativeResolutionKm: null,
    expectedUpdateMinutes: null,
    shadowEnabled: true,
  },
  {
    sourceKey: "openmeteo_gem_seamless",
    displayName: "GEM",
    provider: "open_meteo",
    sourceFamily: "gem",
    model: "gem_seamless",
    modelVersion: null,
    sourceType: "deterministic_model",
    sourceRole: "production_baseline",
    independenceClass: "independent_model",
    apiIdentifier: "open_meteo_forecast_api",
    sourceUrl: "https://open-meteo.com/en/docs/gem-api",
    licenseKey: "open_meteo_current",
    nativeResolutionKm: null,
    expectedUpdateMinutes: null,
    shadowEnabled: true,
  },
  {
    sourceKey: "openmeteo_ukmo_seamless",
    displayName: "UKMET",
    provider: "open_meteo",
    sourceFamily: "ukmet",
    model: "ukmo_seamless",
    modelVersion: null,
    sourceType: "deterministic_model",
    sourceRole: "production_baseline",
    independenceClass: "independent_model",
    apiIdentifier: "open_meteo_forecast_api",
    sourceUrl: "https://open-meteo.com/en/docs/ukmo-api",
    licenseKey: "open_meteo_current",
    nativeResolutionKm: null,
    expectedUpdateMinutes: null,
    shadowEnabled: true,
  },
  {
    sourceKey: "openmeteo_best_match",
    displayName: "Open-Meteo Best Match",
    provider: "open_meteo",
    sourceFamily: "open_meteo_aggregate",
    model: "best_match",
    modelVersion: null,
    sourceType: "aggregator",
    sourceRole: "shadow_reference",
    independenceClass: "non_independent",
    apiIdentifier: "open_meteo_forecast_api",
    sourceUrl: "https://open-meteo.com/en/docs",
    licenseKey: "open_meteo_current",
    nativeResolutionKm: null,
    expectedUpdateMinutes: null,
    shadowEnabled: true,
  },
] as const satisfies readonly ShadowSourceDefinitionSeed[];

const PHASE3_DETERMINISTIC_SOURCE_KEYS = [
  "openmeteo_arome_france_hd",
  "openmeteo_arpege_europe",
  "openmeteo_icon_eu",
  "openmeteo_ecmwf_ifs025",
  "openmeteo_gfs_seamless",
  "openmeteo_gem_seamless",
  "openmeteo_ukmo_seamless",
] as const;

export const PHASE3_HORIZON_WINDOWS = [
  {
    key: "0_2h",
    label: "0 à 2 heures",
    minMinutes: 0,
    maxMinutes: 120,
    requiredCapabilities: ["OBSERVATION", "RADAR", "NOWCAST_AROME_PI", "SATELLITE", "VERY_SHORT_RANGE"],
    prioritySourceKeys: [],
    contextSourceKeys: PHASE3_DETERMINISTIC_SOURCE_KEYS,
    derivedReferenceSourceKeys: ["openmeteo_best_match"],
    uncertaintyRequired: false,
    appliedToProduction: 0,
  },
  {
    key: "2_6h",
    label: "2 à 6 heures",
    minMinutes: 120,
    maxMinutes: 360,
    requiredCapabilities: ["OBSERVATION", "RADAR", "NOWCAST_AROME_PI", "DETERMINISTIC", "ENSEMBLE"],
    prioritySourceKeys: [
      "openmeteo_arome_france_hd",
      "openmeteo_arpege_europe",
      "openmeteo_icon_eu",
      "openmeteo_ecmwf_ifs025",
      "openmeteo_gfs_seamless",
      "openmeteo_ukmo_seamless",
      "openmeteo_gem_seamless",
    ],
    contextSourceKeys: [],
    derivedReferenceSourceKeys: ["openmeteo_best_match"],
    uncertaintyRequired: false,
    appliedToProduction: 0,
  },
  {
    key: "6_24h",
    label: "6 à 24 heures",
    minMinutes: 360,
    maxMinutes: 1_440,
    requiredCapabilities: ["DETERMINISTIC", "AI_MODEL", "ENSEMBLE", "OBSERVATION"],
    prioritySourceKeys: [
      "openmeteo_arome_france_hd",
      "openmeteo_ecmwf_ifs025",
      "openmeteo_icon_eu",
      "openmeteo_arpege_europe",
      "openmeteo_gfs_seamless",
      "openmeteo_ukmo_seamless",
      "openmeteo_gem_seamless",
    ],
    contextSourceKeys: [],
    derivedReferenceSourceKeys: ["openmeteo_best_match"],
    uncertaintyRequired: false,
    appliedToProduction: 0,
  },
  {
    key: "1_3d",
    label: "1 à 3 jours",
    minMinutes: 1_440,
    maxMinutes: 4_320,
    requiredCapabilities: ["DETERMINISTIC", "AI_MODEL", "ENSEMBLE"],
    prioritySourceKeys: [
      "openmeteo_ecmwf_ifs025",
      "openmeteo_arome_france_hd",
      "openmeteo_icon_eu",
      "openmeteo_gfs_seamless",
      "openmeteo_ukmo_seamless",
      "openmeteo_gem_seamless",
      "openmeteo_arpege_europe",
    ],
    contextSourceKeys: [],
    derivedReferenceSourceKeys: ["openmeteo_best_match"],
    uncertaintyRequired: false,
    appliedToProduction: 0,
  },
  {
    key: "3_7d",
    label: "3 à 7 jours",
    minMinutes: 4_320,
    maxMinutes: 10_080,
    requiredCapabilities: ["DETERMINISTIC", "AI_MODEL", "ENSEMBLE"],
    prioritySourceKeys: [
      "openmeteo_ecmwf_ifs025",
      "openmeteo_gfs_seamless",
      "openmeteo_icon_eu",
      "openmeteo_ukmo_seamless",
      "openmeteo_gem_seamless",
      "openmeteo_arpege_europe",
      "openmeteo_arome_france_hd",
    ],
    contextSourceKeys: [],
    derivedReferenceSourceKeys: ["openmeteo_best_match"],
    uncertaintyRequired: false,
    appliedToProduction: 0,
  },
  {
    key: "7_15d",
    label: "7 à 15 jours",
    minMinutes: 10_080,
    maxMinutes: 21_600,
    requiredCapabilities: ["ENSEMBLE", "AI_ENSEMBLE", "CONSENSUS"],
    prioritySourceKeys: [],
    contextSourceKeys: [
      "openmeteo_ecmwf_ifs025",
      "openmeteo_gfs_seamless",
      "openmeteo_icon_eu",
      "openmeteo_ukmo_seamless",
      "openmeteo_gem_seamless",
      "openmeteo_arpege_europe",
      "openmeteo_arome_france_hd",
    ],
    derivedReferenceSourceKeys: ["openmeteo_best_match"],
    uncertaintyRequired: true,
    appliedToProduction: 0,
  },
] as const satisfies readonly Phase3HorizonWindow[];

export function getPhase3HorizonWindow(forecastHorizonMinutes: number | null | undefined) {
  if (forecastHorizonMinutes == null || !Number.isFinite(forecastHorizonMinutes) || forecastHorizonMinutes < 0) {
    return null;
  }
  return PHASE3_HORIZON_WINDOWS.find((window, index) => {
    const isLastWindow = index === PHASE3_HORIZON_WINDOWS.length - 1;
    return forecastHorizonMinutes >= window.minMinutes
      && (isLastWindow ? forecastHorizonMinutes <= window.maxMinutes : forecastHorizonMinutes < window.maxMinutes);
  }) ?? null;
}

export function validatePhase3HorizonStrategy(): { valid: true; windowCount: number } {
  if (PHASE3_HORIZON_WINDOWS.length !== 6) throw new Error("Phase 3 must define exactly six horizon windows");
  if (PHASE3_HORIZON_WINDOWS[0]?.minMinutes !== 0 || PHASE3_HORIZON_WINDOWS.at(-1)?.maxMinutes !== 21_600) {
    throw new Error("Phase 3 horizon windows must cover 0 minutes through 15 days");
  }
  for (let index = 0; index < PHASE3_HORIZON_WINDOWS.length; index++) {
    const window = PHASE3_HORIZON_WINDOWS[index];
    const next = PHASE3_HORIZON_WINDOWS[index + 1];
    if (next && window.maxMinutes !== next.minMinutes) throw new Error(`Phase 3 horizon gap after ${window.key}`);
    if (window.appliedToProduction !== 0) throw new Error(`Phase 3 window ${window.key} must remain shadow-only`);
    const prioritySourceKeys: readonly string[] = window.prioritySourceKeys;
    const contextSourceKeys: readonly string[] = window.contextSourceKeys;
    if (prioritySourceKeys.includes("openmeteo_best_match") || contextSourceKeys.includes("openmeteo_best_match")) {
      throw new Error("Best Match must remain a derived reference outside independent priorities");
    }
    const registeredKeys = new Set(P1_SHADOW_SOURCE_DEFINITIONS.map(source => source.sourceKey));
    for (const sourceKey of [...window.prioritySourceKeys, ...window.contextSourceKeys, ...window.derivedReferenceSourceKeys]) {
      if (!registeredKeys.has(sourceKey)) throw new Error(`Unregistered Phase 3 source: ${sourceKey}`);
    }
  }
  return { valid: true, windowCount: PHASE3_HORIZON_WINDOWS.length };
}

export const PHASE2_SHADOW_SOURCE_CLASSIFICATIONS = P1_SHADOW_SOURCE_DEFINITIONS.map(source => {
  const derived = source.model === "best_match";
  return {
    sourceKey: source.sourceKey,
    category: derived ? "DERIVED_AGGREGATOR" : "DETERMINISTIC",
    role: derived ? "DERIVED" : "FORECAST",
    independenceClass: source.independenceClass,
    evidence: {
      version: PHASE2_CLASSIFICATION_VERSION,
      basis: derived ? "derived_aggregator" : "declared_model",
      explanation: derived
        ? "Open-Meteo Best Match sélectionne ou assemble des modèles et reste non indépendant."
        : `${source.displayName} est un modèle déterministe nommé dans le registre P1.`,
    },
    appliedToProduction: 0,
  } as const satisfies Phase2SourceClassification;
});

export function validatePhase2ShadowClassifications(): { valid: true; sourceCount: number } {
  const classifications = PHASE2_SHADOW_SOURCE_CLASSIFICATIONS;
  if (classifications.length !== P1_SHADOW_SOURCE_DEFINITIONS.length) {
    throw new Error("Phase 2 must classify every registered P1 source exactly once");
  }

  const keys = classifications.map(classification => classification.sourceKey);
  if (new Set(keys).size !== keys.length) throw new Error("Duplicate Phase 2 source classification");

  const deterministic = classifications.filter(classification => classification.category === "DETERMINISTIC");
  const aggregators = classifications.filter(classification => classification.category === "DERIVED_AGGREGATOR");
  if (deterministic.length !== 7 || aggregators.length !== 1) {
    throw new Error("Phase 2 initial scope must contain seven deterministic models and one derived aggregator");
  }
  if (aggregators[0]?.sourceKey !== "openmeteo_best_match" || aggregators[0].independenceClass !== "non_independent") {
    throw new Error("Best Match must remain the only non-independent derived aggregator");
  }
  if (classifications.some(classification => classification.appliedToProduction !== 0)) {
    throw new Error("Phase 2 shadow classifications must never be applied to production");
  }

  return { valid: true, sourceCount: classifications.length };
}

export function getShadowCanonicalVariableDefinition(variable: ShadowCanonicalVariable) {
  return SHADOW_CANONICAL_VARIABLES[variable];
}

const PHASE4_CARDINAL_DIRECTIONS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
] as const;

function normalizePhase4UnitToken(unit: string) {
  return unit.trim().toLowerCase().replace(/\s+/g, "");
}

function roundPhase4Value(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function getPhase4CardinalDirection(degrees: number) {
  const index = Math.round(degrees / 22.5) % PHASE4_CARDINAL_DIRECTIONS.length;
  return PHASE4_CARDINAL_DIRECTIONS[index] ?? null;
}

function convertPhase4Value(
  variable: ShadowCanonicalVariable,
  sourceValue: number,
  sourceUnit: string,
): { value: number | null; conversion: string } {
  const canonicalUnit = SHADOW_CANONICAL_VARIABLES[variable].unit;
  const unit = normalizePhase4UnitToken(sourceUnit);

  if (canonicalUnit === "Cel") {
    if (["°c", "cel", "c", "celsius"].includes(unit)) return { value: sourceValue, conversion: "celsius_identity" };
    if (["°f", "f", "fahrenheit"].includes(unit)) return { value: (sourceValue - 32) * 5 / 9, conversion: "fahrenheit_to_celsius" };
    if (["k", "kelvin"].includes(unit)) return { value: sourceValue - 273.15, conversion: "kelvin_to_celsius" };
  }
  if (canonicalUnit === "km/h") {
    if (["km/h", "kmh", "kph"].includes(unit)) return { value: sourceValue, conversion: "kilometres_per_hour_identity" };
    if (["m/s", "mps"].includes(unit)) return { value: sourceValue * 3.6, conversion: "metres_per_second_to_kilometres_per_hour" };
    if (["mph", "mi/h"].includes(unit)) return { value: sourceValue * 1.609344, conversion: "miles_per_hour_to_kilometres_per_hour" };
    if (["kn", "kt", "knot", "knots"].includes(unit)) return { value: sourceValue * 1.852, conversion: "knots_to_kilometres_per_hour" };
  }
  if (canonicalUnit === "mm") {
    if (unit === "mm") return { value: sourceValue, conversion: "millimetres_identity" };
    if (unit === "cm") return { value: sourceValue * 10, conversion: "centimetres_to_millimetres" };
    if (["in", "inch", "inches"].includes(unit)) return { value: sourceValue * 25.4, conversion: "inches_to_millimetres" };
  }
  if (canonicalUnit === "hPa") {
    if (["hpa", "mbar"].includes(unit)) return { value: sourceValue, conversion: "hectopascals_identity" };
    if (unit === "pa") return { value: sourceValue / 100, conversion: "pascals_to_hectopascals" };
    if (unit === "kpa") return { value: sourceValue * 10, conversion: "kilopascals_to_hectopascals" };
  }
  if (canonicalUnit === "%") {
    if (["%", "percent", "percentage"].includes(unit)) return { value: sourceValue, conversion: "percentage_identity" };
    if (["fraction", "0-1"].includes(unit)) return { value: sourceValue * 100, conversion: "fraction_to_percentage" };
  }
  if (canonicalUnit === "degree") {
    if (["degree", "degrees", "°", "deg"].includes(unit)) {
      return { value: sourceValue === 360 ? 0 : sourceValue, conversion: sourceValue === 360 ? "degrees_wrap_360_to_0" : "degrees_identity" };
    }
    if (["rad", "radian", "radians"].includes(unit)) return { value: sourceValue * 180 / Math.PI, conversion: "radians_to_degrees" };
  }
  if (canonicalUnit === "km") {
    if (unit === "km") return { value: sourceValue, conversion: "kilometres_identity" };
    if (["m", "metre", "metres", "meter", "meters"].includes(unit)) return { value: sourceValue / 1_000, conversion: "metres_to_kilometres" };
  }
  if (canonicalUnit === "cm") {
    if (unit === "cm") return { value: sourceValue, conversion: "centimetres_identity" };
    if (unit === "mm") return { value: sourceValue / 10, conversion: "millimetres_to_centimetres" };
    if (["m", "metre", "metres", "meter", "meters"].includes(unit)) return { value: sourceValue * 100, conversion: "metres_to_centimetres" };
  }
  if (canonicalUnit === "wmo_code" && ["wmo_code", "wmocode", "wmo", "code"].includes(unit)) {
    return { value: sourceValue, conversion: "wmo_code_identity" };
  }
  return { value: null, conversion: "unsupported_source_unit" };
}

function isPhase4ValueInStructuralRange(variable: ShadowCanonicalVariable, value: number) {
  if (["air_temperature_2m", "air_temperature_max", "air_temperature_min", "apparent_temperature"].includes(variable)) return value >= -100 && value <= 70;
  if (["wind_speed_10m", "wind_gust_10m"].includes(variable)) return value >= 0 && value <= 500;
  if (["relative_humidity_2m", "cloud_cover_total"].includes(variable)) return value >= 0 && value <= 100;
  if (variable === "precipitation_amount") return value >= 0 && value <= 1_000;
  if (["air_pressure_msl", "air_pressure_surface"].includes(variable)) return value >= 800 && value <= 1_200;
  if (variable === "wind_direction_10m") return value >= 0 && value < 360;
  if (variable === "visibility") return value >= 0 && value <= 500;
  if (variable === "snowfall_amount") return value >= 0 && value <= 1_000;
  if (variable === "weather_code") return Number.isInteger(value) && value >= 0 && value <= 99;
  return true;
}

export function normalizePhase4WeatherValue(input: Phase4NormalizationInput): Phase4NormalizationResult {
  const definition = SHADOW_CANONICAL_VARIABLES[input.variable];
  const issues: Phase4NormalizationIssue[] = [];
  const sourceValue = input.value == null ? null : Number(input.value);
  const sourceUnit = input.sourceUnit?.trim() || null;
  const sourceTimezone = input.sourceTimezone?.trim() || null;

  if (sourceValue == null) issues.push("MISSING_VALUE");
  else if (!Number.isFinite(sourceValue)) issues.push("NON_FINITE_VALUE");
  if (!sourceUnit) issues.push("MISSING_SOURCE_UNIT");
  if (!Number.isFinite(input.validTime) || input.validTime <= 0) issues.push("INVALID_TIMESTAMP");
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90 || !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    issues.push("INVALID_COORDINATES");
  }
  if (!sourceTimezone) issues.push("MISSING_SOURCE_TIMEZONE");
  else if (!["Europe/Paris", "UTC", "GMT"].includes(sourceTimezone)) issues.push("UNEXPECTED_SOURCE_TIMEZONE");

  let normalizedValue: number | null = null;
  let conversion = sourceValue == null ? "missing_value" : "unresolved_unit";
  if (sourceValue != null && Number.isFinite(sourceValue) && sourceUnit) {
    const converted = convertPhase4Value(input.variable, sourceValue, sourceUnit);
    normalizedValue = converted.value == null ? null : roundPhase4Value(converted.value);
    conversion = converted.conversion;
    if (converted.value == null) issues.push("UNSUPPORTED_SOURCE_UNIT");
  }
  if (normalizedValue != null && !isPhase4ValueInStructuralRange(input.variable, normalizedValue)) {
    issues.push("VALUE_OUT_OF_RANGE");
  }

  const status: Phase4NormalizationStatus = sourceValue == null
    ? "MISSING"
    : issues.length === 0
      ? "NORMALIZED"
      : "ISSUES";
  const cardinalDirection = input.variable === "wind_direction_10m"
    && normalizedValue != null
    && isPhase4ValueInStructuralRange(input.variable, normalizedValue)
      ? getPhase4CardinalDirection(normalizedValue)
      : null;

  return {
    value: normalizedValue,
    metadata: {
      version: PHASE4_NORMALIZATION_VERSION,
      status,
      sourceValue: sourceValue != null && Number.isFinite(sourceValue) ? sourceValue : null,
      sourceUnit,
      canonicalUnit: definition.unit,
      conversion,
      sourceTimezone,
      cardinalDirection,
      coordinateStatus: issues.includes("INVALID_COORDINATES") ? "INVALID" : "VALID",
      nativeResolutionStatus: input.nativeResolutionKm == null ? "UNKNOWN" : "KNOWN",
      issues,
      appliedToProduction: 0,
    },
  };
}

function isPhase5ExtremeValue(variable: ShadowCanonicalVariable, value: number, aggregation: "hourly" | "daily") {
  if (["air_temperature_2m", "air_temperature_max", "air_temperature_min", "apparent_temperature"].includes(variable)) {
    return value < -60 || value > 50;
  }
  if (variable === "wind_speed_10m") return value > 250;
  if (variable === "wind_gust_10m") return value > 300;
  if (variable === "precipitation_amount") return value > (aggregation === "daily" ? 500 : 150);
  if (["air_pressure_msl", "air_pressure_surface"].includes(variable)) return value < 850 || value > 1_100;
  return false;
}

function getPhase5RapidVariationThreshold(variable: ShadowCanonicalVariable) {
  if (["air_temperature_2m", "air_temperature_max", "air_temperature_min", "apparent_temperature"].includes(variable)) return 15;
  if (["wind_speed_10m", "wind_gust_10m"].includes(variable)) return 150;
  if (["air_pressure_msl", "air_pressure_surface"].includes(variable)) return 20;
  return null;
}

export function evaluatePhase5QualityControl(input: Phase5QualityControlInput): Phase5QualityControlResult {
  const invalidRules = new Set<Phase5QualityRule>();
  const suspectRules = new Set<Phase5QualityRule>();
  const secondaryRules = new Set<Phase5QualityRule>();
  const valueMissing = input.value == null;
  const flagMissing = input.missingData === 1;

  if (valueMissing) secondaryRules.add("MISSING_VALUE");
  if (valueMissing !== flagMissing) invalidRules.add("MISSING_FLAG_MISMATCH");
  if (input.value != null && !Number.isFinite(input.value)) invalidRules.add("NON_FINITE_VALUE");
  if (input.value != null && Number.isFinite(input.value) && !isPhase4ValueInStructuralRange(input.variable, input.value)) {
    invalidRules.add("PHYSICAL_RANGE_INVALID");
  }
  if (!input.normalizationMetadata) suspectRules.add("NORMALIZATION_MISSING");
  else if (input.normalizationMetadata.status === "ISSUES"
    || input.normalizationMetadata.issues.some(issue => issue !== "MISSING_VALUE")) {
    invalidRules.add("NORMALIZATION_INVALID");
  }
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90
    || !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    invalidRules.add("COORDINATES_INVALID");
  }
  const maximumForecastOffsetMs = 16 * 86_400_000;
  const minimumForecastOffsetMs = -24 * 3_600_000;
  if (!Number.isFinite(input.validTime) || input.validTime <= 0
    || !Number.isFinite(input.receivedAt) || input.receivedAt <= 0
    || !Number.isFinite(input.evaluatedAt) || input.evaluatedAt < input.receivedAt - 300_000
    || input.validTime - input.receivedAt < minimumForecastOffsetMs
    || input.validTime - input.receivedAt > maximumForecastOffsetMs) {
    invalidRules.add("TIMESTAMP_INCOHERENT");
  }
  if (input.duplicateCount > 1) invalidRules.add("DUPLICATE_VALUE");
  if (input.runStatus === "FAILED") invalidRules.add("RUN_FAILED");
  else if (input.runStatus === "PARTIAL") suspectRules.add("RUN_INCOMPLETE");

  if (input.value != null && Number.isFinite(input.value) && isPhase5ExtremeValue(input.variable, input.value, input.aggregation)) {
    suspectRules.add("EXTREME_VALUE");
  }

  const rapidThreshold = getPhase5RapidVariationThreshold(input.variable);
  if (rapidThreshold != null && input.value != null && input.previousValue != null
    && Number.isFinite(input.value) && Number.isFinite(input.previousValue)
    && input.previousValidTime != null) {
    const deltaMinutes = (input.validTime - input.previousValidTime) / 60_000;
    if (deltaMinutes > 0 && deltaMinutes <= 60) {
      const ratePerHour = Math.abs(input.value - input.previousValue) / (deltaMinutes / 60);
      if (deltaMinutes <= 30 && ratePerHour > rapidThreshold * 2) invalidRules.add("RAPID_VARIATION");
      else if (ratePerHour > rapidThreshold) suspectRules.add("RAPID_VARIATION");
    }
  }

  const ageHours = Math.max(0, (input.evaluatedAt - input.receivedAt) / 3_600_000);
  const freshnessStatus: ShadowFreshnessStatus = ageHours > PHASE5_FRESHNESS_THRESHOLDS.staleAfterHours
    ? "STALE"
    : ageHours > PHASE5_FRESHNESS_THRESHOLDS.freshThroughHours
      ? "AGING"
      : "FRESH";
  if (freshnessStatus === "STALE") secondaryRules.add("STALE_DATA");

  const status: ShadowQualityStatus = valueMissing || flagMissing
    ? "MISSING"
    : invalidRules.size > 0
      ? "INVALID"
      : freshnessStatus === "STALE"
        ? "STALE"
        : suspectRules.size > 0
          ? "SUSPECT"
          : "VALID";
  const rules = Array.from(new Set([
    ...Array.from(invalidRules),
    ...Array.from(suspectRules),
    ...Array.from(secondaryRules),
  ]));
  const usableInShadow = status === "VALID" || status === "SUSPECT";

  return {
    status,
    metadata: {
      version: PHASE5_QUALITY_CONTROL_VERSION,
      status,
      freshnessStatus,
      rules,
      aggregation: input.aggregation,
      runStatus: input.runStatus,
      evaluatedAt: input.evaluatedAt,
      receivedAt: input.receivedAt,
      validTime: input.validTime,
      duplicateCount: Math.max(0, Math.trunc(input.duplicateCount)),
      usableInShadow,
      excludedFromPhase5Shadow: !usableInShadow,
      thresholdVersion: "phase5-qc-thresholds-v1",
      appliedToProduction: 0,
    },
  };
}

export function validateP1ShadowSourceRegistry(): { valid: true; sourceCount: number } {
  const keys = P1_SHADOW_SOURCE_DEFINITIONS.map(source => source.sourceKey);
  if (new Set(keys).size !== keys.length) throw new Error("Duplicate P1 shadow source key");
  if (P1_SHADOW_SOURCE_DEFINITIONS.length !== 8) throw new Error("P1 must start with exactly eight flows");

  const bestMatch = P1_SHADOW_SOURCE_DEFINITIONS.find(source => source.model === "best_match");
  if (!bestMatch || bestMatch.sourceType !== "aggregator" || bestMatch.independenceClass !== "non_independent") {
    throw new Error("Best Match must remain a non-independent aggregator");
  }

  if (P1_SHADOW_SOURCE_DEFINITIONS.some(source => /météo-france|openweathermap/i.test(source.displayName))) {
    throw new Error("P1 registry must not add public weather services");
  }

  return { valid: true, sourceCount: keys.length };
}

export const PHASE7_LOCAL_PERFORMANCE_VERSION = "phase7-local-performance-v1" as const;
export const PHASE7_LOCAL_PERFORMANCE_STATUSES = ["INSUFFICIENT", "OBSERVING", "VALIDABLE", "INVALID"] as const;
export const PHASE7_LOCAL_PERFORMANCE_THRESHOLDS = {
  minimumComparisons: 18,
  minimumDays: 2,
  validableComparisons: 30,
  validableDays: 7,
} as const;
export const PHASE7_LOCAL_PERFORMANCE_VARIABLES = PHASE6_FUSION_VARIABLES;

export type Phase7LocalPerformanceStatus = ArrayValue<typeof PHASE7_LOCAL_PERFORMANCE_STATUSES>;
export type Phase7LocalPerformanceVariable = ArrayValue<typeof PHASE7_LOCAL_PERFORMANCE_VARIABLES>;
export type Phase7EvidenceType = "physical_observation" | "legacy_unqualified";

export type Phase7LocalPerformanceSample = {
  forecastValue: number | null;
  observedValue: number | null;
  validTime: number;
  evidenceType: Phase7EvidenceType;
  qualityStatus: ShadowQualityStatus;
};

export type Phase7LocalPerformanceInput = {
  locationKey: string;
  sourceKey: string;
  variable: Phase7LocalPerformanceVariable;
  horizonKey: Phase3HorizonWindow["key"];
  samples: Phase7LocalPerformanceSample[];
  evaluatedAt: number;
};

export type Phase7LocalPerformanceResult = {
  version: typeof PHASE7_LOCAL_PERFORMANCE_VERSION;
  locationKey: string;
  sourceKey: string;
  variable: Phase7LocalPerformanceVariable;
  horizonKey: Phase3HorizonWindow["key"];
  status: Phase7LocalPerformanceStatus;
  comparisonCount: number;
  evaluatedDays: number;
  physicalComparisonCount: number;
  legacyComparisonCount: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  lastValidTime: number | null;
  missingEvidence: string[];
  productionReadsEnabled: false;
  appliedToProduction: 0;
  evaluatedAt: number;
};

export function calculatePhase7LocalPerformance(input: Phase7LocalPerformanceInput): Phase7LocalPerformanceResult {
  const usable = input.samples.filter(sample =>
    sample.forecastValue != null
    && sample.observedValue != null
    && Number.isFinite(sample.forecastValue)
    && Number.isFinite(sample.observedValue)
    && Number.isFinite(sample.validTime)
    && sample.qualityStatus !== "INVALID"
    && sample.qualityStatus !== "MISSING"
    && sample.qualityStatus !== "STALE",
  );
  const errors = usable.map(sample => (sample.forecastValue as number) - (sample.observedValue as number));
  const absoluteErrors = errors.map(error => Math.abs(error));
  const mae = errors.length > 0 ? absoluteErrors.reduce((sum, error) => sum + error, 0) / errors.length : null;
  const rmse = errors.length > 0
    ? Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length)
    : null;
  const bias = errors.length > 0 ? errors.reduce((sum, error) => sum + error, 0) / errors.length : null;
  const evaluatedDays = new Set(usable.map(sample => new Date(sample.validTime).toISOString().slice(0, 10))).size;
  const physicalComparisonCount = usable.filter(sample => sample.evidenceType === "physical_observation").length;
  const legacyComparisonCount = usable.filter(sample => sample.evidenceType === "legacy_unqualified").length;
  const missingEvidence = [
    physicalComparisonCount === 0 ? "physical_observation" : null,
    input.samples.length === 0 ? "samples" : null,
    evaluatedDays < PHASE7_LOCAL_PERFORMANCE_THRESHOLDS.minimumDays ? "distinct_days" : null,
  ].filter((item): item is string => item != null);
  const status: Phase7LocalPerformanceStatus = usable.length === 0
    ? "INSUFFICIENT"
    : usable.some(sample => sample.qualityStatus === "SUSPECT")
      ? "OBSERVING"
      : usable.length >= PHASE7_LOCAL_PERFORMANCE_THRESHOLDS.validableComparisons
        && evaluatedDays >= PHASE7_LOCAL_PERFORMANCE_THRESHOLDS.validableDays
        && physicalComparisonCount > 0
        ? "VALIDABLE"
        : usable.length >= PHASE7_LOCAL_PERFORMANCE_THRESHOLDS.minimumComparisons
          && evaluatedDays >= PHASE7_LOCAL_PERFORMANCE_THRESHOLDS.minimumDays
          ? "OBSERVING"
          : "INSUFFICIENT";
  return {
    version: PHASE7_LOCAL_PERFORMANCE_VERSION,
    locationKey: input.locationKey,
    sourceKey: input.sourceKey,
    variable: input.variable,
    horizonKey: input.horizonKey,
    status,
    comparisonCount: usable.length,
    evaluatedDays,
    physicalComparisonCount,
    legacyComparisonCount,
    mae,
    rmse,
    bias,
    lastValidTime: usable.length > 0 ? Math.max(...usable.map(sample => sample.validTime)) : null,
    missingEvidence,
    productionReadsEnabled: false,
    appliedToProduction: 0,
    evaluatedAt: input.evaluatedAt,
  };
}
