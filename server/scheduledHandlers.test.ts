import { describe, expect, it } from "vitest";
import { getModelCoverage } from "./scheduledHandlers";

describe("getModelCoverage", () => {
  it("identifie les huit modèles experts attendus et les indisponibilités", () => {
    const coverage = getModelCoverage(["AROME", "ECMWF", "GEM"]);

    expect(coverage.expected).toHaveLength(8);
    expect(coverage.collected).toEqual(["AROME", "ECMWF", "GEM"]);
    expect(coverage.missing).toEqual(expect.arrayContaining(["ARPEGE", "ICON", "GFS", "UKMET", "Open-Meteo"]));
  });

  it("ne signale aucune indisponibilité lorsque les huit modèles sont présents", () => {
    const coverage = getModelCoverage([
      "AROME", "ARPEGE", "ICON", "ECMWF", "GFS", "GEM", "UKMET", "Open-Meteo",
    ]);

    expect(coverage.collected).toHaveLength(8);
    expect(coverage.missing).toEqual([]);
  });
});
