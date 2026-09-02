import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Phase4NormalizationPanel } from "./Phase4NormalizationPanel";

describe("Phase4NormalizationPanel", () => {
  it("shows normalized, legacy and non-ingested values without implying Phase 5 or production use", () => {
    const html = renderToStaticMarkup(React.createElement(Phase4NormalizationPanel, {
      normalization: {
        version: "phase4-data-normalization-v1",
        expectedVariableCount: 15,
        ingestedVariableCount: 2,
        normalizedValueCount: 20,
        missingValueCount: 2,
        issueValueCount: 1,
        legacyValueCount: 10,
        canonicalUnitMismatchCount: 0,
        appliedToProduction: 0,
        normalizationAppliedToProduction: 0,
        nonShadowValueCount: 0,
        productionReadsEnabled: false,
        valid: true,
        issues: [{ issue: "VALUE_OUT_OF_RANGE", count: 1 }],
        variables: [
          { variable: "air_temperature_2m", canonicalUnit: "Cel", levelKey: "2m", status: "PARTIAL", totalValueCount: 30, normalizedValueCount: 20, missingValueCount: 0, issueValueCount: 0, legacyValueCount: 10, canonicalUnitMismatchCount: 0, sourceUnits: ["°C"], conversions: [{ conversion: "celsius_identity", count: 20 }], issues: [], appliedToProduction: 0 },
          { variable: "visibility", canonicalUnit: "km", levelKey: "surface", status: "NO_INGESTION", totalValueCount: 0, normalizedValueCount: 0, missingValueCount: 0, issueValueCount: 0, legacyValueCount: 0, canonicalUnitMismatchCount: 0, sourceUnits: [], conversions: [], issues: [], appliedToProduction: 0 },
        ],
      },
    }));

    expect(html).toContain("Normalisation canonique shadow");
    expect(html).toContain("20");
    expect(html).toContain("Héritées");
    expect(html).toContain("VALUE_OUT_OF_RANGE · 1");
    expect(html).toContain("Visibilité");
    expect(html).toContain("Aucune valeur réellement ingérée");
    expect(html).toContain("La préparation Phase 5 utilise une preuve QC séparée");
    expect(html).toContain("Normalisation shadow uniquement");
  });
});
