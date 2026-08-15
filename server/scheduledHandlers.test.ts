import { describe, expect, it } from "vitest";
import { buildStationCollectionSnapshot, getModelCoverage } from "./scheduledHandlers";
import { VALIDATION_WEATHER_MODELS } from "./weatherServices";

describe("getModelCoverage", () => {
  it("définit une couverture quotidienne et horaire sur les huit modèles actifs", () => {
    const coverage = getModelCoverage([
      "AROME", "ARPEGE", "ICON", "ECMWF", "GFS", "GEM", "UKMET", "Open-Meteo",
    ]);

    expect(coverage).toMatchObject({ expected: expect.any(Array), collected: expect.any(Array), missing: [] });
    expect(coverage.expected).toHaveLength(8);
  });

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

  it("conserve les candidats hors du compteur de couverture active", () => {
    const coverage = getModelCoverage(["AROME", "ARPEGE", "ICON", "ECMWF", "GFS", "GEM", "UKMET", "Open-Meteo"]);
    expect(coverage.expected).toHaveLength(8);
    expect(VALIDATION_WEATHER_MODELS).toHaveLength(5);
    expect(coverage.expected).not.toContain("DMI HARMONIE-DINI");
  });
});

describe("buildStationCollectionSnapshot", () => {
  it("conserve le rayon choisi et signale une couverture complète", () => {
    const complete = getModelCoverage(["AROME", "ARPEGE", "ICON", "ECMWF", "GFS", "GEM", "UKMET", "Open-Meteo"]);
    const snapshot = buildStationCollectionSnapshot({
      locationKey: "50.756_2.521",
      date: "2026-08-12",
      radiusKm: 30,
      physicalStationCount: 2,
      daily: complete,
      hourly: complete,
    });

    expect(snapshot).toMatchObject({ radiusKm: 30, physicalStationCount: 2, dailyModelCount: 8, hourlyModelCount: 8, status: "completed" });
  });

  it("distingue une couverture partielle et une indisponibilité totale", () => {
    const partial = getModelCoverage(["AROME", "ECMWF"]);
    const partialSnapshot = buildStationCollectionSnapshot({ locationKey: "key", date: "2026-08-12", radiusKm: 20, physicalStationCount: 0, daily: partial, hourly: partial });
    const failedSnapshot = buildStationCollectionSnapshot({ locationKey: "key", date: "2026-08-12", radiusKm: 20, physicalStationCount: 0, daily: partial, hourly: partial, forceFailed: true });

    expect(partialSnapshot.status).toBe("partial");
    expect(partialSnapshot.dailyMissingModels).toHaveLength(6);
    expect(failedSnapshot.status).toBe("failed");
  });
});
