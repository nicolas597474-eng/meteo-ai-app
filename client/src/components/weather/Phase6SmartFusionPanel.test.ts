import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Phase6SmartFusionPanel } from "./Phase6SmartFusionPanel";

describe("Phase6SmartFusionPanel", () => {
  it("affiche les candidats, les statuts et l’isolation de production", () => {
    const html = renderToStaticMarkup(React.createElement(Phase6SmartFusionPanel, { fusion: {
      version: "phase6-smart-fusion-v1", candidateCount: 12,
      statuses: { SHADOW_READY: 3, PARTIAL: 9, UNAVAILABLE: 0 },
      byVariable: [{ variable: "air_temperature_2m", count: 4 }],
      byWindow: [{ window: "6_24h", count: 12 }],
      productionReadsEnabled: 0, appliedToProduction: 0, shadowModeViolations: 0, valid: true,
    } }));
    expect(html).toContain("Fusion intelligente candidate");
    expect(html).toContain("SHADOW READY");
    expect(html).toContain("PARTIAL");
    expect(html).toContain("Température à 2 m");
    expect(html).toContain("6–24 h");
    expect(html).toContain("0");
    expect(html).toContain("P1.6 reste séparée");
    expect(html).toContain("Shadow uniquement");
  });
});
