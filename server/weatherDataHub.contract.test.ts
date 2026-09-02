import { describe, expect, it } from "vitest";
import {
  P1_SHADOW_SOURCE_DEFINITIONS,
  PHASE2_SHADOW_SOURCE_CLASSIFICATIONS,
  PHASE2_SOURCE_CATEGORIES,
  SHADOW_CANONICAL_VARIABLES,
  SHADOW_RUN_EVIDENCE_SCOPES,
  SHADOW_RUN_EVIDENCE_STATUSES,
  getShadowCanonicalVariableDefinition,
  validatePhase2ShadowClassifications,
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
});
