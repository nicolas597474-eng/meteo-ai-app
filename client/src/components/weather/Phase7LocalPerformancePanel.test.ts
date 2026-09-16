import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Phase7LocalPerformancePanel } from "./Phase7LocalPerformancePanel";

describe("Phase7LocalPerformancePanel", () => {
  it("explains why local performance is not promotable without physical shadow evidence", () => {
    const html = renderToStaticMarkup(React.createElement(Phase7LocalPerformancePanel, { performance: {
      version: "phase7-local-performance-v1",
      recordCount: 0,
      statuses: { INSUFFICIENT: 0, OBSERVING: 0, VALIDABLE: 0, INVALID: 0 },
      locations: [],
      bySource: [],
      physicalEvidenceComparisons: 0,
      legacyEvidenceComparisons: 0,
      productionReadsEnabled: 0,
      appliedToProduction: 0,
      shadowModeViolations: 0,
      readyForPromotion: false,
      valid: true,
    }}));
    expect(html).toContain("Performance locale shadow");
    expect(html).toContain("Aucune observation physique shadow qualifiante");
    expect(html).toContain("Promotion bloquée par conception");
    expect(html).toContain("Lectures production");
    expect(html).toContain("Appliquées production");
  });
});
