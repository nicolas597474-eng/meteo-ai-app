import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Phase5QualityControlPanel } from "./Phase5QualityControlPanel";

describe("Phase5QualityControlPanel", () => {
  it("shows all QC statuses, keeps P1.6 open and states zero production use", () => {
    const counts = { VALID: 10, SUSPECT: 2, INVALID: 1, MISSING: 3, STALE: 4 };
    const html = renderToStaticMarkup(React.createElement(Phase5QualityControlPanel, { qualityControl: {
      version: "phase5-quality-control-v1", evaluatedAt: Date.now(), totalValueCount: 20, dynamicallyEvaluatedValueCount: 20, storedPhase5ValueCount: 20, legacyValueCount: 0, counts,
      freshnessCounts: { FRESH: 16, AGING: 0, STALE: 4, UNKNOWN: 0 }, usableInShadowCount: 12, excludedFromPhase5ShadowCount: 8, partialRunCount: 1, failedRunCount: 0, duplicateGroupCount: 0, unavailableSourceCount: 0, appliedToProduction: 0, metadataAppliedToProduction: 0, nonShadowValueCount: 0, productionReadsEnabled: false, valid: true,
      rules: [{ rule: "RUN_INCOMPLETE", count: 2 }], byVariable: [{ variable: "air_temperature_2m", total: 20, counts }],
      sources: [{ sourceKey: "openmeteo_arome_france_hd", displayName: "AROME", available: true, total: 20, counts, latestReceivedAt: Date.now() }],
      p1Observation: { completedDays: 1, requiredDays: 7, verdict: "OBSERVING", stillOpen: true },
    } }));
    for (const status of ["VALID", "SUSPECT", "INVALID", "MISSING", "STALE"]) expect(html).toContain(status);
    expect(html).toContain("P1.6 reste officiellement ouverte");
    expect(html).toContain("1/7 jour(s)");
    expect(html).toContain("Run incomplet · 2");
    expect(html).toContain("0");
    expect(html).toContain("QC shadow uniquement");
  });
});
