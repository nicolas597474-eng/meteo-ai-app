import { describe, expect, it } from "vitest";
import {
  DAILY_UNIFIED_SHADOW_MODEL_KEYS,
  calculateDailyUnifiedShadowVariable,
} from "../shared/dailyUnifiedShadow";
import { buildDailyUnifiedShadowReport } from "./weatherDataHubShadow";

const fullSources = () => [
  ...DAILY_UNIFIED_SHADOW_MODEL_KEYS.map((sourceKey, index) => ({
    sourceKey,
    value: index + 1,
    qualityStatus: "VALID" as const,
    phase5Status: "VALID" as const,
    freshnessStatus: "FRESH" as const,
    isDerived: false,
    performanceScore: 100,
  })),
  {
    sourceKey: "openmeteo_best_match",
    value: 20,
    qualityStatus: "VALID" as const,
    phase5Status: "VALID" as const,
    freshnessStatus: "FRESH" as const,
    isDerived: true,
    performanceScore: 100,
  },
];

describe("daily unified shadow fusion", () => {
  it("utilise seulement les sept modèles déterministes et garde Best Match comme référence", () => {
    const result = calculateDailyUnifiedShadowVariable({
      variable: "air_temperature_max",
      sources: fullSources(),
    });

    expect(result.status).toBe("SHADOW_READY");
    expect(result.candidateValue).toBe(4);
    expect(result.contributingSourceCount).toBe(7);
    expect(result.availableDeterministicSourceCount).toBe(7);
    expect(result.bestMatchReferenceValue).toBe(20);
    expect(result.weights.find(weight => weight.sourceKey === "openmeteo_best_match")).toMatchObject({
      referenceOnly: true,
      included: false,
      normalizedWeight: 0,
    });
    expect(result.productionReadsEnabled).toBe(false);
    expect(result.appliedToProduction).toBe(0);
  });

  it("signale une couverture partielle sans remplacer le modèle absent", () => {
    const sources = fullSources().filter(source => source.sourceKey !== "openmeteo_gem_seamless");
    const result = calculateDailyUnifiedShadowVariable({
      variable: "precipitation_amount",
      sources,
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.availableDeterministicSourceCount).toBe(6);
    expect(result.missingDeterministicSourceKeys).toEqual(["openmeteo_gem_seamless"]);
    expect(result.candidateValue).toBeCloseTo(22 / 6, 2);
  });

  it("retourne UNAVAILABLE lorsqu’aucune valeur déterministe qualifiée n’est exploitable", () => {
    const result = calculateDailyUnifiedShadowVariable({
      variable: "wind_speed_10m",
      sources: DAILY_UNIFIED_SHADOW_MODEL_KEYS.map(sourceKey => ({
        sourceKey,
        value: null,
        qualityStatus: "MISSING" as const,
        phase5Status: "MISSING" as const,
        freshnessStatus: "UNKNOWN" as const,
        isDerived: false,
      })),
    });

    expect(result.status).toBe("UNAVAILABLE");
    expect(result.candidateValue).toBeNull();
    expect(result.contributingSourceCount).toBe(0);
    expect(result.productionReadsEnabled).toBe(false);
    expect(result.appliedToProduction).toBe(0);
  });

  it("refuse toute lecture ou application production dans le rapport agrégé", () => {
    const report = buildDailyUnifiedShadowReport([{
      cycleKey: "daily:2026-10-02:v1",
      forecastDate: "2026-10-03",
      candidateStatus: "PARTIAL",
      deterministicSourceCount: 6,
      expectedDeterministicSourceCount: 7,
      legacyReference: {},
      bestMatchReference: {},
      missingEvidence: ["qualified_performance"],
      productionReadsEnabled: 0,
      shadowMode: 1,
      appliedToProduction: 0,
      evaluatedAt: 1_791_328_800_000,
    }]);

    expect(report.candidateCount).toBe(1);
    expect(report.statuses.PARTIAL).toBe(1);
    expect(report.productionReadsEnabled).toBe(0);
    expect(report.appliedToProduction).toBe(0);
    expect(report.shadowModeViolations).toBe(0);
    expect(report.valid).toBe(true);
  });
});
