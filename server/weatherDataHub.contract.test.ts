import { describe, expect, it } from "vitest";
import {
  P1_SHADOW_SOURCE_DEFINITIONS,
  PHASE2_SHADOW_SOURCE_CLASSIFICATIONS,
  PHASE2_SOURCE_CATEGORIES,
  PHASE3_HORIZON_WINDOWS,
  PHASE4_NORMALIZATION_VERSION,
  SHADOW_CANONICAL_VARIABLES,
  SHADOW_RUN_EVIDENCE_SCOPES,
  SHADOW_RUN_EVIDENCE_STATUSES,
  getShadowCanonicalVariableDefinition,
  getPhase3HorizonWindow,
  normalizePhase4WeatherValue,
  calculatePhase6ShadowCandidate,
  validatePhase2ShadowClassifications,
  validatePhase3HorizonStrategy,
  validateP1ShadowSourceRegistry,
} from "../shared/weatherDataHub";

describe("P1 shadow weather data hub contract", () => {
  it("registers seven deterministic models and one non-independent aggregator", () => {
    expect(validateP1ShadowSourceRegistry()).toEqual({ valid: true, sourceCount: 8 });
    expect(P1_SHADOW_SOURCE_DEFINITIONS.filter(source => source.sourceType === "deterministic_model")).toHaveLength(7);
    expect(P1_SHADOW_SOURCE_DEFINITIONS.filter(source => source.sourceType === "aggregator")).toEqual([
      expect.objectContaining({ model: "best_match", independenceClass: "non_independent" }),
    ]);
  });

  it("does not add a public Météo-France or OpenWeatherMap service", () => {
    const names = P1_SHADOW_SOURCE_DEFINITIONS.map(source => source.displayName);
    expect(names).not.toContain("Météo-France");
    expect(names).not.toContain("OpenWeatherMap");
  });

  it("keeps one canonical unit and level for every P1 variable", () => {
    for (const [variable, definition] of Object.entries(SHADOW_CANONICAL_VARIABLES)) {
      expect(definition.unit).toBeTruthy();
      expect(definition.levelKey).toBeTruthy();
      expect(getShadowCanonicalVariableDefinition(variable as keyof typeof SHADOW_CANONICAL_VARIABLES)).toEqual(definition);
    }
  });

  it("defines four explicit Phase 17 evidence levels without treating metadata as payload proof", () => {
    expect(SHADOW_RUN_EVIDENCE_STATUSES).toEqual([
      "PROVIDER_REPORTED",
      "OPEN_METEO_METADATA",
      "SCHEDULE_DERIVED",
      "UNKNOWN",
    ]);
    expect(SHADOW_RUN_EVIDENCE_SCOPES).toContain("payload_exact");
    expect(SHADOW_RUN_EVIDENCE_SCOPES).toContain("model_exact");
    expect(SHADOW_RUN_EVIDENCE_SCOPES).toContain("aggregator_unresolved");
  });

  it("classifies seven deterministic models and Best Match as one derived non-independent aggregator", () => {
    expect(validatePhase2ShadowClassifications()).toEqual({ valid: true, sourceCount: 8 });
    expect(PHASE2_SHADOW_SOURCE_CLASSIFICATIONS.filter(source => source.category === "DETERMINISTIC")).toHaveLength(7);
    expect(PHASE2_SHADOW_SOURCE_CLASSIFICATIONS.filter(source => source.category === "DERIVED_AGGREGATOR")).toEqual([
      expect.objectContaining({ sourceKey: "openmeteo_best_match", role: "DERIVED", appliedToProduction: 0 }),
    ]);
  });

  it("distingue l’indépendance du modèle de la provenance amont partagée", () => {
    expect(PHASE2_SHADOW_SOURCE_CLASSIFICATIONS.every(source => source.evidence.upstreamProvider === "open_meteo")).toBe(true);
    expect(PHASE2_SHADOW_SOURCE_CLASSIFICATIONS.every(source => source.evidence.providerIndependence === "shared_provider")).toBe(true);
    expect(PHASE2_SHADOW_SOURCE_CLASSIFICATIONS.filter(source => source.category === "DETERMINISTIC")).toHaveLength(7);
  });

  it("defines future categories without assigning a source before a real ingestion exists", () => {
    expect(PHASE2_SOURCE_CATEGORIES).toEqual([
      "DETERMINISTIC",
      "ENSEMBLE",
      "OBSERVATION",
      "RADAR",
      "SATELLITE",
      "DERIVED_AGGREGATOR",
    ]);
    for (const category of ["ENSEMBLE", "OBSERVATION", "RADAR", "SATELLITE"] as const) {
      expect(PHASE2_SHADOW_SOURCE_CLASSIFICATIONS.filter(source => source.category === category)).toHaveLength(0);
    }
  });

  it("defines six continuous Phase 3 horizon windows without applying them to production", () => {
    expect(validatePhase3HorizonStrategy()).toEqual({ valid: true, windowCount: 6 });
    expect(PHASE3_HORIZON_WINDOWS.map(window => window.key)).toEqual([
      "0_2h",
      "2_6h",
      "6_24h",
      "1_3d",
      "3_7d",
      "7_15d",
    ]);
    expect(PHASE3_HORIZON_WINDOWS.every(window => window.appliedToProduction === 0)).toBe(true);
    expect(PHASE3_HORIZON_WINDOWS.every(window => !window.prioritySourceKeys.includes("openmeteo_best_match"))).toBe(true);
  });

  it("classifies exact Phase 3 boundaries and requires uncertainty after seven days", () => {
    expect(getPhase3HorizonWindow(0)?.key).toBe("0_2h");
    expect(getPhase3HorizonWindow(119)?.key).toBe("0_2h");
    expect(getPhase3HorizonWindow(120)?.key).toBe("2_6h");
    expect(getPhase3HorizonWindow(10_080)?.key).toBe("7_15d");
    expect(getPhase3HorizonWindow(21_600)?.key).toBe("7_15d");
    expect(getPhase3HorizonWindow(21_601)).toBeNull();
    expect(getPhase3HorizonWindow(10_080)?.uncertaintyRequired).toBe(true);
  });

  it("normalizes the Phase 4 canonical units with deterministic conversions", () => {
    const base = {
      sourceTimezone: "Europe/Paris",
      latitude: 50.756,
      longitude: 2.438,
      validTime: Date.parse("2026-09-02T10:00:00Z"),
      nativeResolutionKm: null,
    };
    expect(normalizePhase4WeatherValue({ ...base, variable: "air_temperature_2m", value: 68, sourceUnit: "°F" })).toMatchObject({
      value: 20,
      metadata: { version: PHASE4_NORMALIZATION_VERSION, status: "NORMALIZED", canonicalUnit: "Cel", conversion: "fahrenheit_to_celsius", appliedToProduction: 0 },
    });
    expect(normalizePhase4WeatherValue({ ...base, variable: "wind_speed_10m", value: 10, sourceUnit: "m/s" }).value).toBe(36);
    expect(normalizePhase4WeatherValue({ ...base, variable: "air_pressure_surface", value: 101_325, sourceUnit: "Pa" }).value).toBe(1013.25);
    expect(normalizePhase4WeatherValue({ ...base, variable: "visibility", value: 12_000, sourceUnit: "m" }).value).toBe(12);
    expect(normalizePhase4WeatherValue({ ...base, variable: "snowfall_amount", value: 25, sourceUnit: "mm" }).value).toBe(2.5);
  });

  it("calculates explainable Phase 6 shadow weights without counting Best Match as independent", () => {
    const result = calculatePhase6ShadowCandidate({
      variable: "air_temperature_2m",
      phase3WindowKey: "6_24h",
      evaluatedAt: Date.parse("2026-09-02T10:00:00Z"),
      sources: [
        {
          sourceKey: "openmeteo_arome_france_hd",
          sourceType: "deterministic_model",
          independenceClass: "independent_model",
          value: 10,
          phase5Status: "VALID",
          freshnessStatus: "FRESH",
          localPerformanceScore: 80,
          horizonPerformanceScore: 90,
          variablePerformanceScore: 90,
          nativeResolutionKm: 1,
          regimeMatch: 1,
          convergenceScore: 1,
        },
        {
          sourceKey: "openmeteo_ecmwf_ifs025",
          sourceType: "deterministic_model",
          independenceClass: "independent_model",
          value: 20,
          phase5Status: "SUSPECT",
          freshnessStatus: "AGING",
          localPerformanceScore: 60,
          horizonPerformanceScore: 70,
          variablePerformanceScore: 80,
          nativeResolutionKm: 9,
          regimeMatch: 0.5,
          convergenceScore: 0.5,
        },
        {
          sourceKey: "openmeteo_best_match",
          sourceType: "aggregator",
          independenceClass: "non_independent",
          value: 15,
          phase5Status: "VALID",
          freshnessStatus: "FRESH",
          isDerived: true,
        },
      ],
    });

    expect(result.status).toBe("SHADOW_READY");
    expect(result.candidateValue).toBeGreaterThan(10);
    expect(result.candidateValue).toBeLessThan(20);
    expect(result.weights.reduce((sum, item) => sum + item.normalizedWeight, 0)).toBeCloseTo(1, 8);
    expect(result.weights.find(item => item.sourceKey === "openmeteo_best_match")).toMatchObject({
      normalizedWeight: 0,
      includedInCandidate: false,
      referenceOnly: true,
    });
    expect(result.referenceValues).toEqual([{ sourceKey: "openmeteo_best_match", value: 15 }]);
    expect(result.independentSourceCount).toBe(2);
    expect(result.productionReadsEnabled).toBe(false);
    expect(result.appliedToProduction).toBe(0);
  });

  it("keeps missing evidence visible and returns unavailable when no eligible value exists", () => {
    const partial = calculatePhase6ShadowCandidate({
      variable: "wind_speed_10m",
      phase3WindowKey: "1_3d",
      evaluatedAt: Date.parse("2026-09-02T10:00:00Z"),
      sources: [
        {
          sourceKey: "openmeteo_arpege_europe",
          sourceType: "deterministic_model",
          independenceClass: "independent_model",
          value: 12,
          phase5Status: "VALID",
          freshnessStatus: "UNKNOWN",
        },
        {
          sourceKey: "openmeteo_icon_eu",
          sourceType: "deterministic_model",
          independenceClass: "independent_model",
          value: 18,
          phase5Status: "VALID",
          freshnessStatus: "UNKNOWN",
        },
      ],
    });
    expect(partial.status).toBe("PARTIAL");
    expect(partial.weights.every(item => item.missingEvidence.length > 0)).toBe(true);

    const unavailable = calculatePhase6ShadowCandidate({
      variable: "precipitation_amount",
      phase3WindowKey: "7_15d",
      evaluatedAt: Date.parse("2026-09-02T10:00:00Z"),
      sources: [
        {
          sourceKey: "openmeteo_gfs_seamless",
          sourceType: "deterministic_model",
          independenceClass: "independent_model",
          value: null,
          phase5Status: "MISSING",
          freshnessStatus: "STALE",
        },
      ],
    });
    expect(unavailable).toMatchObject({ status: "UNAVAILABLE", candidateValue: null, contributingSourceCount: 0 });
  });

  it("keeps missing or structurally impossible Phase 4 values explicit", () => {
    const base = {
      sourceTimezone: "Europe/Paris",
      latitude: 50.756,
      longitude: 2.438,
      validTime: Date.parse("2026-09-02T10:00:00Z"),
      nativeResolutionKm: null,
    };
    expect(normalizePhase4WeatherValue({ ...base, variable: "precipitation_amount", value: null, sourceUnit: "mm" })).toMatchObject({
      value: null,
      metadata: { status: "MISSING", issues: ["MISSING_VALUE"] },
    });
    expect(normalizePhase4WeatherValue({ ...base, variable: "relative_humidity_2m", value: 120, sourceUnit: "%" })).toMatchObject({
      value: 120,
      metadata: { status: "ISSUES", issues: ["VALUE_OUT_OF_RANGE"] },
    });
    expect(normalizePhase4WeatherValue({ ...base, variable: "wind_speed_10m", value: 12, sourceUnit: null })).toMatchObject({
      value: null,
      metadata: { status: "ISSUES", issues: ["MISSING_SOURCE_UNIT"] },
    });
  });
});


describe("Phase 7 local performance shadow contract", () => {
  it("requires physical evidence for a VALIDABLE local result and never enables production", async () => {
    const { calculatePhase7LocalPerformance } = await import("../shared/weatherDataHub");
    const result = calculatePhase7LocalPerformance({
      locationKey: "50.676_2.845",
      sourceKey: "openmeteo_arome_france_hd",
      variable: "air_temperature_2m",
      horizonKey: "6_24h",
      evaluatedAt: Date.parse("2026-09-13T10:00:00Z"),
      samples: Array.from({ length: 30 }, (_, index) => ({
        forecastValue: 20 + index / 100,
        observedValue: 20,
        validTime: Date.parse("2026-09-01T10:00:00Z") + index * 86_400_000,
        evidenceType: "physical_observation" as const,
        qualityStatus: "VALID" as const,
      })),
    });
    expect(result.status).toBe("VALIDABLE");
    expect(result.physicalComparisonCount).toBe(30);
    expect(result.legacyComparisonCount).toBe(0);
    expect(result.productionReadsEnabled).toBe(false);
    expect(result.appliedToProduction).toBe(0);
  });

  it("keeps legacy evidence separate and does not invent a local qualification", async () => {
    const { calculatePhase7LocalPerformance } = await import("../shared/weatherDataHub");
    const result = calculatePhase7LocalPerformance({
      locationKey: "50.676_2.845",
      sourceKey: "openmeteo_gfs_seamless",
      variable: "wind_speed_10m",
      horizonKey: "1_3d",
      evaluatedAt: Date.parse("2026-09-13T10:00:00Z"),
      samples: Array.from({ length: 30 }, (_, index) => ({
        forecastValue: 12,
        observedValue: 10,
        validTime: Date.parse("2026-09-01T10:00:00Z") + index * 86_400_000,
        evidenceType: "legacy_unqualified" as const,
        qualityStatus: "VALID" as const,
      })),
    });
    expect(result.status).toBe("OBSERVING");
    expect(result.physicalComparisonCount).toBe(0);
    expect(result.legacyComparisonCount).toBe(30);
    expect(result.missingEvidence).toContain("physical_observation");
    expect(result.appliedToProduction).toBe(0);
  });
});
