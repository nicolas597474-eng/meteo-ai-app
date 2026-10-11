import { describe, expect, it } from "vitest";
import {
  buildCwopCoverageReport,
  parseCwopInventoryFeature,
  validateCwopInventoryResponse,
} from "./cwopMadisService";
import { StationSourceCollectionError } from "./stationSourceDiagnostics";

// Fixtures de test explicitement marquées comme données de test :
// elles imitent le format GeoJSON documenté de l'IEM et ne sont jamais
// utilisées en production.
const HONDEGHEM = { lat: 50.7567, lon: 2.5204 };

function fixtureFeature(overrides: Record<string, unknown> = {}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [2.53, 50.76, 42] },
    properties: { sid: "EW1234", name: "HONDEGHEM TEST", elevation: 25, online: true },
    ...overrides,
  };
}

describe("CWOP/MADIS — mesure de couverture", () => {
  it("mappe une station identifiée dans le rayon sans lui inventer de mesure", () => {
    const station = parseCwopInventoryFeature(
      fixtureFeature(),
      HONDEGHEM.lat,
      HONDEGHEM.lon,
      5,
    );
    expect(station).toMatchObject({
      providerStationId: "EW1234",
      name: "HONDEGHEM TEST",
      online: true,
      elevationM: 25,
    });
    expect(station?.distanceKm).toBe(0.8);
    expect(station?.lat).toBe(50.76);
    expect(station?.lon).toBe(2.53);
  });

  it("refuse les stations sans identifiant fournisseur réel ou sans coordonnées valides", () => {
    expect(parseCwopInventoryFeature(
      fixtureFeature({ properties: { sid: "  " } }),
      HONDEGHEM.lat, HONDEGHEM.lon, 5,
    )).toBeNull();
    expect(parseCwopInventoryFeature(
      fixtureFeature({ properties: {} }),
      HONDEGHEM.lat, HONDEGHEM.lon, 5,
    )).toBeNull();
    expect(parseCwopInventoryFeature(
      fixtureFeature({ geometry: { type: "Point", coordinates: [] } }),
      HONDEGHEM.lat, HONDEGHEM.lon, 5,
    )).toBeNull();
    expect(parseCwopInventoryFeature(
      fixtureFeature({ geometry: { type: "Point", coordinates: ["abc", "def"] } }),
      HONDEGHEM.lat, HONDEGHEM.lon, 5,
    )).toBeNull();
  });

  it("borne la mesure au rayon demandé", () => {
    // Paris est à environ 212 km de Hondeghem : hors d'un rayon de 5 km.
    expect(parseCwopInventoryFeature(
      fixtureFeature({ geometry: { type: "Point", coordinates: [2.3522, 48.8566] } }),
      HONDEGHEM.lat, HONDEGHEM.lon, 5,
    )).toBeNull();
    expect(parseCwopInventoryFeature(
      fixtureFeature({ geometry: { type: "Point", coordinates: [2.3522, 48.8566] } }),
      HONDEGHEM.lat, HONDEGHEM.lon, 300,
    )).not.toBeNull();
  });

  it("laisse null toute valeur non fournie au lieu de la deviner", () => {
    const station = parseCwopInventoryFeature(
      fixtureFeature({ properties: { sid: "EW5678" }, geometry: { type: "Point", coordinates: [2.53, 50.76] } }),
      HONDEGHEM.lat, HONDEGHEM.lon, 5,
    );
    expect(station).toMatchObject({ providerStationId: "EW5678", name: null, online: null, elevationM: null });
  });

  it("déduplique les identifiants dupliqués en gardant la première occurrence", () => {
    const report = buildCwopCoverageReport(
      [
        fixtureFeature({ properties: { sid: "EW1234", name: "PREMIÈRE", elevation: 25, online: true } }),
        fixtureFeature({ properties: { sid: "EW1234", name: "SECONDE", elevation: 30, online: false } }),
      ],
      HONDEGHEM.lat, HONDEGHEM.lon, 5, "2026-10-11T12:00:00.000Z",
    );
    expect(report.totalInRadius).toBe(1);
    expect(report.stations[0]?.name).toBe("PREMIÈRE");
  });

  it("trie par distance, compte les stations et n'expose que l'inventaire", () => {
    const report = buildCwopCoverageReport(
      [
        fixtureFeature({ geometry: { type: "Point", coordinates: [2.53, 50.76, 42] }, properties: { sid: "EW1234", online: true } }),
        fixtureFeature({ geometry: { type: "Point", coordinates: [2.521, 50.757, 42] }, properties: { sid: "EW9999", online: false } }),
      ],
      HONDEGHEM.lat, HONDEGHEM.lon, 5, "2026-10-11T12:00:00.000Z",
    );
    expect(report.totalInRadius).toBe(2);
    expect(report.onlineInRadius).toBe(1);
    expect(report.stations.map((station) => station.providerStationId)).toEqual(["EW9999", "EW1234"]);
    // Aucune grandeur d'observation ne doit exister dans le rapport.
    const serialized = JSON.stringify(report);
    for (const forbidden of ["temperature", "humidity", "pressure", "windSpeed", "precipitation"]) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
  });

  it("rend le compte en ligne non estimable quand l'indicateur manque", () => {
    const report = buildCwopCoverageReport(
      [
        fixtureFeature({ properties: { sid: "EW1234", online: true } }),
        fixtureFeature({ properties: { sid: "EW5678" } }),
      ],
      HONDEGHEM.lat, HONDEGHEM.lon, 5, "2026-10-11T12:00:00.000Z",
    );
    expect(report.totalInRadius).toBe(2);
    expect(report.onlineInRadius).toBeNull();
  });

  it("accepte une collection vide mais refuse une réponse invalide", () => {
    expect(validateCwopInventoryResponse({ type: "FeatureCollection", features: [] })).toEqual([]);
    for (const invalid of [
      null,
      [],
      { type: "Feature" },
      { type: "FeatureCollection", features: "nope" },
      { type: "FeatureCollection", features: [null] },
      { type: "FeatureCollection", features: [["array"]] },
    ]) {
      expect(() => validateCwopInventoryResponse(invalid)).toThrow(StationSourceCollectionError);
    }
  });
});
