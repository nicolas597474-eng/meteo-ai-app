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
