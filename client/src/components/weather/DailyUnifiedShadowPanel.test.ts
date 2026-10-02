import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DailyUnifiedShadowPanel } from "./DailyUnifiedShadowPanel";

describe("DailyUnifiedShadowPanel", () => {
  it("affiche le statut shadow, la couverture et l’exclusion de Best Match", () => {
    const html = renderToStaticMarkup(React.createElement(DailyUnifiedShadowPanel, {
      candidate: {
        version: "daily-unified-shadow-v1",
        candidateCount: 16,
        statuses: { SHADOW_READY: 2, PARTIAL: 14, UNAVAILABLE: 0 },
        averageDeterministicSourceCount: 6.5,
        expectedDeterministicSourceCount: 7,
        productionReadsEnabled: 0,
        appliedToProduction: 0,
        shadowModeViolations: 0,
        valid: true,
        latest: {
          forecastDate: "2026-10-02",
          candidateStatus: "PARTIAL",
          deterministicSourceCount: 6,
          expectedDeterministicSourceCount: 7,
          missingEvidence: ["air_temperature_max:deterministic_coverage"],
        },
      },
    }));
    expect(html).toContain("Série quotidienne unifiée à sept modèles");
    expect(html).toContain("Best Match reste une référence dérivée");
    expect(html).toContain("6.5/7");
    expect(html).toContain("Aucune bascule publique");
    expect(html).toContain("Shadow uniquement");
  });
});
