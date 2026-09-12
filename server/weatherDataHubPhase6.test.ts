import { describe, expect, it } from "vitest";
import { calculatePhase6ShadowCandidate } from "../shared/weatherDataHub";

describe("Phase 6 — candidat de fusion shadow", () => {
  const baseSource = (sourceKey: string, value: number, overrides: Record<string, unknown> = {}) => ({
    sourceKey,
    sourceType: "deterministic_model" as const,
    independenceClass: "independent_model" as const,
    value,
    available: true,
    phase5Status: "VALID" as const,
    freshnessStatus: "FRESH" as const,
    nativeResolutionKm: 2,
    isDerived: false,
    localPerformanceScore: 90,
    horizonPerformanceScore: 90,
    variablePerformanceScore: 90,
    regimeMatch: 1,
    convergenceScore: 1,
    ...overrides,
  });

  it("normalise les poids indépendants et protège le mode shadow", () => {
    const result = calculatePhase6ShadowCandidate({
      variable: "air_temperature_2m",
      phase3WindowKey: "0_2h",
      evaluatedAt: 1_757_000_000_000,
      sources: [baseSource("arome", 20), baseSource("ecmwf", 22)],
    });

    expect(result.status).toBe("SHADOW_READY");
    expect(result.contributingSourceCount).toBe(2);
    expect(result.independentSourceCount).toBe(2);
    expect(result.productionReadsEnabled).toBe(false);
    expect(result.appliedToProduction).toBe(0);
    expect(result.weights.reduce((sum, item) => sum + item.normalizedWeight, 0)).toBeCloseTo(1);
  });

  it("conserve Best Match comme référence dérivée sans le compter comme modèle indépendant", () => {
    const result = calculatePhase6ShadowCandidate({
      variable: "air_temperature_2m",
      phase3WindowKey: "6_24h",
      evaluatedAt: 1_757_000_000_000,
      sources: [
        baseSource("arome", 20),
        baseSource("best_match", 21, {
          sourceType: "aggregator",
          independenceClass: "non_independent",
          isDerived: true,
        }),
      ],
    });
    const bestMatch = result.weights.find(item => item.sourceKey === "best_match");

    expect(result.status).toBe("PARTIAL");
    expect(result.contributingSourceCount).toBe(1);
    expect(result.independentSourceCount).toBe(1);
    expect(bestMatch?.referenceOnly).toBe(true);
    expect(bestMatch?.includedInCandidate).toBe(false);
    expect(result.referenceValues).toEqual([{ sourceKey: "best_match", value: 21 }]);
  });

  it("retourne UNAVAILABLE sans fabriquer de valeur quand toutes les sources sont absentes", () => {
    const result = calculatePhase6ShadowCandidate({
      variable: "precipitation_amount",
      phase3WindowKey: "7_15d",
      evaluatedAt: 1_757_000_000_000,
      sources: [baseSource("arome", 0, { value: null, available: false, phase5Status: "MISSING" })],
    });

    expect(result.status).toBe("UNAVAILABLE");
    expect(result.candidateValue).toBeNull();
    expect(result.contributingSourceCount).toBe(0);
    expect(result.weights[0]?.normalizedWeight).toBe(0);
    expect(result.productionReadsEnabled).toBe(false);
    expect(result.appliedToProduction).toBe(0);
  });
});
