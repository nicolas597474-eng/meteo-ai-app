import { describe, expect, it } from "vitest";
import {
  P1_SHADOW_SOURCE_DEFINITIONS,
  SHADOW_CANONICAL_VARIABLES,
  getShadowCanonicalVariableDefinition,
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
});
