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

export const SHADOW_CANONICAL_UNITS = ["Cel", "mm", "km/h", "degree", "%", "hPa", "wmo_code"] as const;

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
  cloud_cover_total: { unit: "%", levelKey: "total_atmosphere" },
  weather_code: { unit: "wmo_code", levelKey: "surface" },
} as const;

type ArrayValue<T extends readonly unknown[]> = T[number];

export type ShadowSourceType = ArrayValue<typeof SHADOW_SOURCE_TYPES>;
export type ShadowSourceRole = ArrayValue<typeof SHADOW_SOURCE_ROLES>;
export type Phase2SourceCategory = ArrayValue<typeof PHASE2_SOURCE_CATEGORIES>;
export type Phase2SourceRole = ArrayValue<typeof PHASE2_SOURCE_ROLES>;
export type Phase3SourceCapability = ArrayValue<typeof PHASE3_SOURCE_CAPABILITIES>;
export type ShadowIndependenceClass = ArrayValue<typeof SHADOW_INDEPENDENCE_CLASSES>;
export type ShadowRunStatus = ArrayValue<typeof SHADOW_RUN_STATUSES>;
export type ShadowRunEvidenceStatus = ArrayValue<typeof SHADOW_RUN_EVIDENCE_STATUSES>;
export type ShadowRunEvidenceScope = ArrayValue<typeof SHADOW_RUN_EVIDENCE_SCOPES>;
export type ShadowQualityStatus = ArrayValue<typeof SHADOW_QUALITY_STATUSES>;
export type ShadowFreshnessStatus = ArrayValue<typeof SHADOW_FRESHNESS_STATUSES>;
export type ShadowUsageStatus = ArrayValue<typeof SHADOW_USAGE_STATUSES>;
export type ShadowCanonicalUnit = ArrayValue<typeof SHADOW_CANONICAL_UNITS>;
export type ShadowCanonicalVariable = keyof typeof SHADOW_CANONICAL_VARIABLES;

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
