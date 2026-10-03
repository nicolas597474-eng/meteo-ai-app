import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocalPrecipitationNowcastingPanel } from "./LocalPrecipitationNowcastingPanel";

describe("LocalPrecipitationNowcastingPanel", () => {
  it("explique le signal d’occurrence, les limites d’accumulation et le verrou de production", () => {
    const html = renderToStaticMarkup(React.createElement(LocalPrecipitationNowcastingPanel, {
      report: {
        version: "local-precipitation-nowcasting-shadow-v1",
        candidateCount: 3,
        statuses: { WET_SIGNAL: 1, BASELINE_WET: 0, BASELINE_DRY: 2, STALE_OBSERVATION: 0, UNAVAILABLE: 0, LEAKAGE_BLOCKED: 0 },
        productionReadsEnabled: 0,
        appliedToProduction: 0,
        shadowModeViolations: 0,
        valid: true,
        latest: {
          locationKey: "50.756_2.521", observationDate: "2026-10-01", observationHour: 13,
          observationReferenceAt: 1_790_856_800_000, observedPrecipitation: 0.4, stationCount: 3,
          confidenceScore: 85, validTime: 1_790_856_800_000, horizonMinutes: 0,
          candidateStatus: "WET_SIGNAL", baselinePrecipitation: 0, baselineWet: false,
          observedWet: true, localWetSignal: true, continuationFactor: 1,
          forecastAvailableAt: 1_790_853_200_000,
          forecastEvidence: { bestMatchIncluded: false, amountAdjustment: "forbidden" },
          reasons: ["MONTANT_MM_NON_CORRIGE"], evaluatedAt: 1_790_858_000_000,
        },
      },
    }));
    expect(html).toContain("Signal local d’occurrence de pluie");
    expect(html).toContain("Les millimètres officiels ne sont jamais modifiés");
    expect(html).toContain("Médiane 7 modèles");
    expect(html).toContain("Pare-feu temporel");
    expect(html).toContain("Les pluviomètres n’exposent pas tous le même intervalle d’accumulation");
    expect(html).toContain("Production verrouillée");
    expect(html).toContain("Best Match exclu");
  });
});
