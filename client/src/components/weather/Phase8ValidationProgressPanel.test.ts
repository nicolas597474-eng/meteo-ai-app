import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Phase8ValidationProgressPanel } from "./Phase8ValidationProgressPanel";

describe("Phase8ValidationProgressPanel", () => {
  it("explique les seuils sans autoriser une publication automatique", () => {
    const html = renderToStaticMarkup(React.createElement(Phase8ValidationProgressPanel, {
      progress: {
        version: "phase8-validation-progress-v1",
        thresholds: { intermediateComparisons: 18, intermediateDays: 2, fullComparisons: 30, fullDays: 7 },
        scopeDefinition: "modèle + variable + horizon",
        physicalComparisonCount: 30,
        scopeCount: 1,
        scopesAt18: 1,
        scopesAt30: 1,
        intermediateReportReady: true,
        fullValidationReportReady: true,
        decisionStatus: "HUMAN_REVIEW_REQUIRED",
        target18Progress: 100,
        target30Progress: 100,
        highestScope: { sourceKey: "gfs", variable: "air_temperature_2m", horizonKey: "6_24h", comparisonCount: 30, evaluatedDays: 7, status: "VALIDABLE" },
        sources: ["gfs"], variables: ["air_temperature_2m"], horizons: ["6_24h"],
        blockers: ["Les métriques probabilistes restent hors périmètre."],
        integrity: { productionReadsEnabled: 0, appliedToProduction: 0, shadowModeViolations: 0, valid: true },
        automaticProductionPromotion: false,
      },
    }));
    expect(html).toContain("Quand les comparaisons seront-elles suffisantes ?");
    expect(html).toContain("18 comparaisons");
    expect(html).toContain("30 comparaisons");
    expect(html).toContain("Revue humaine requise");
    expect(html).toContain("Publication publique verrouillée");
    expect(html).toContain("bascule automatique");
  });
});
