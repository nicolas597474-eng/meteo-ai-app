import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Phase3HorizonHierarchyPanel } from "./Phase3HorizonHierarchyPanel";

describe("Phase3HorizonHierarchyPanel", () => {
  it("shows six shadow windows, missing capabilities and the long-range uncertainty guardrail", () => {
    const html = renderToStaticMarkup(React.createElement(Phase3HorizonHierarchyPanel, {
      hierarchy: {
        version: "phase3-horizon-hierarchy-v1",
        horizonBasis: "ingestion_received_at",
        horizonBasisDetail: "Échéance calculée depuis la réception du payload.",
        windowCount: 6,
        knownHorizonValueCount: 840,
        unknownHorizonValueCount: 0,
        appliedToProduction: 0,
        productionReadsEnabled: false,
        valid: true,
        windows: [
          { key: "0_2h", label: "0 à 2 heures", status: "UNAVAILABLE", uncertaintyRequired: false, requiredCapabilities: ["OBSERVATION"], availableCapabilities: [], missingCapabilities: ["OBSERVATION", "RADAR"], availablePrioritySources: [], availableContextSources: [], derivedReferences: [], validValueCount: 0, appliedToProduction: 0 },
          { key: "2_6h", label: "2 à 6 heures", status: "PARTIAL", uncertaintyRequired: false, requiredCapabilities: ["DETERMINISTIC", "ENSEMBLE"], availableCapabilities: ["DETERMINISTIC"], missingCapabilities: ["ENSEMBLE"], availablePrioritySources: [{ sourceKey: "openmeteo_arome_france_hd", displayName: "AROME" }], availableContextSources: [], derivedReferences: [{ sourceKey: "openmeteo_best_match", displayName: "Open-Meteo Best Match", independent: false }], validValueCount: 42, appliedToProduction: 0 },
          { key: "6_24h", label: "6 à 24 heures", status: "PARTIAL", uncertaintyRequired: false, requiredCapabilities: ["DETERMINISTIC", "AI_MODEL"], availableCapabilities: ["DETERMINISTIC"], missingCapabilities: ["AI_MODEL"], availablePrioritySources: [], availableContextSources: [], derivedReferences: [], validValueCount: 0, appliedToProduction: 0 },
          { key: "1_3d", label: "1 à 3 jours", status: "PARTIAL", uncertaintyRequired: false, requiredCapabilities: ["DETERMINISTIC", "ENSEMBLE"], availableCapabilities: ["DETERMINISTIC"], missingCapabilities: ["ENSEMBLE"], availablePrioritySources: [], availableContextSources: [], derivedReferences: [], validValueCount: 0, appliedToProduction: 0 },
          { key: "3_7d", label: "3 à 7 jours", status: "PARTIAL", uncertaintyRequired: false, requiredCapabilities: ["DETERMINISTIC", "ENSEMBLE"], availableCapabilities: ["DETERMINISTIC"], missingCapabilities: ["ENSEMBLE"], availablePrioritySources: [], availableContextSources: [], derivedReferences: [], validValueCount: 0, appliedToProduction: 0 },
          { key: "7_15d", label: "7 à 15 jours", status: "UNAVAILABLE", uncertaintyRequired: true, requiredCapabilities: ["ENSEMBLE", "CONSENSUS"], availableCapabilities: [], missingCapabilities: ["ENSEMBLE", "CONSENSUS"], availablePrioritySources: [], availableContextSources: [{ sourceKey: "openmeteo_ecmwf_ifs025", displayName: "ECMWF" }], derivedReferences: [], validValueCount: 7, appliedToProduction: 0 },
        ],
      },
    }));

    expect(html).toContain("Hiérarchie shadow selon l’horizon");
    expect(html).toContain("6/6 fenêtres");
    expect(html).toContain("Open-Meteo Best Match · non indépendant");
    expect(html).toContain("observations");
    expect(html).toContain("7–15 jours");
    expect(html).toContain("aucune certitude");
    expect(html).toContain("Hiérarchie shadow uniquement");
  });
});
