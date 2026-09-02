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
