import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Phase2SourceClassificationPanel } from "./Phase2SourceClassificationPanel";

describe("Phase2SourceClassificationPanel", () => {
  it("shows seven deterministic models, one non-independent aggregator and empty future categories", () => {
    const sources = Array.from({ length: 7 }, (_, index) => ({
      sourceKey: `model_${index}`,
      displayName: `Modèle ${index + 1}`,
      sourceFamily: `family_${index}`,
      independenceClass: "independent_model",
      category: "DETERMINISTIC",
      role: "FORECAST",
      version: "phase2-source-classification-v1",
      appliedToProduction: 0,
    })).concat([{
      sourceKey: "openmeteo_best_match",
      displayName: "Open-Meteo Best Match",
      sourceFamily: "open_meteo_aggregate",
      independenceClass: "non_independent",
      category: "DERIVED_AGGREGATOR",
      role: "DERIVED",
      version: "phase2-source-classification-v1",
      appliedToProduction: 0,
    }]);
    const html = renderToStaticMarkup(React.createElement(Phase2SourceClassificationPanel, {
      classification: {
        version: "phase2-source-classification-v1",
        sourceCount: 8,
        unclassifiedSourceCount: 0,
        appliedToProduction: 0,
        valid: true,
        categories: [
          { category: "DETERMINISTIC", count: 7, empty: false },
          { category: "ENSEMBLE", count: 0, empty: true },
          { category: "OBSERVATION", count: 0, empty: true },
          { category: "RADAR", count: 0, empty: true },
          { category: "SATELLITE", count: 0, empty: true },
          { category: "DERIVED_AGGREGATOR", count: 1, empty: false },
        ],
        sources,
      },
    }));

    expect(html).toContain("Classification shadow des sources");
    expect(html).toContain("8/8 classés");
    expect(html).toContain("Open-Meteo Best Match");
    expect(html).toContain("Agrégateur dérivé · non indépendant");
    expect(html).toContain("Ensembles · aucun flux");
    expect(html).toContain("Radar · aucun flux");
    expect(html).toContain("Classification shadow uniquement");
  });
});
