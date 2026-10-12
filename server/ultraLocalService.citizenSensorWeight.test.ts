import { describe, expect, it } from "vitest";
import { calculateUltraLocal } from "./ultraLocalService";
import type { StationData } from "./stationService";

// Fixtures de test only : stations synthétiques, aucune observation réelle.

function station(overrides: Partial<StationData>): StationData {
  const updatedAt = overrides.updatedAt !== undefined ? overrides.updatedAt : new Date().toISOString();
  return {
    stationId: "station",
    source: "meteofrance",
    name: "Station de test",
    lat: 50.75,
    lon: 2.52,
    altitude: 40,
    distanceKm: 1.5,
    temperature: 20,
    humidity: 60,
    pressure: 1015,
    windSpeed: 10,
    windGust: 15,
    windDirection: 180,
    precipitation: 0,
    updatedAt,
    reliabilityScore: 80,
    updateFrequencyMin: 10,
    dataAvailability: 0.95,
    isActive: true,
    qualificationStatus: "validated",
    sourceTier: 1,
    ...overrides,
    measurementTimes: overrides.measurementTimes ?? {
      temperature: updatedAt,
      humidity: updatedAt,
      pressure: updatedAt,
      windSpeed: updatedAt,
      windGust: updatedAt,
      windDirection: updatedAt,
      precipitation: updatedAt,
    },
  };
}

describe("calculateUltraLocal — pondération adaptative des capteurs citoyens", () => {
  it("module le poids d'un capteur citoyen par sa preuve persistée", () => {
    const stations = [
      station({ stationId: "physique", distanceKm: 1.5 }),
      station({ stationId: "citoyen", source: "opensensemap", distanceKm: 1.5, reliabilityScore: 80, sourceTier: 3 }),
    ];
    const neutre = calculateUltraLocal(stations, "local", 50.75, 2.52, null, null, { recordStationReadings: false });
    const penalise = calculateUltraLocal(stations, "local", 50.75, 2.52, null, null, {
      recordStationReadings: false,
      performanceMultiplierById: new Map([["citoyen", 0.3]]),
    });
    const neutreCitoyen = neutre.stationsUsed.find((entry) => entry.stationId === "citoyen")!;
    const penaliseCitoyen = penalise.stationsUsed.find((entry) => entry.stationId === "citoyen")!;
    const penalisePhysique = penalise.stationsUsed.find((entry) => entry.stationId === "physique")!;

    expect(neutreCitoyen.weight).toBeGreaterThan(0);
    expect(penaliseCitoyen.weight).toBeLessThan(neutreCitoyen.weight);
    expect(penalisePhysique.weight).toBeGreaterThan(penaliseCitoyen.weight);
  });

  it("laisse le poids strictement inchangé sans multiplicateur persisté", () => {
    const stations = [
      station({ stationId: "physique", distanceKm: 1.5 }),
      station({ stationId: "citoyen", source: "cwop", distanceKm: 1.5, sourceTier: 3 }),
    ];
    const reference = calculateUltraLocal(stations, "local", 50.75, 2.52, null, null, { recordStationReadings: false });
    const avecMapVide = calculateUltraLocal(stations, "local", 50.75, 2.52, null, null, {
      recordStationReadings: false,
      performanceMultiplierById: new Map(),
    });
    const poids = (result: typeof reference) =>
      result.stationsUsed.map((entry) => [entry.stationId, entry.weight] as const).sort();

    expect(poids(avecMapVide)).toEqual(poids(reference));
  });

  it("n’égalise pas des stations dont tous les multiplicateurs sont nuls", () => {
    const stations = [
      station({ stationId: "citoyen-a", source: "opensensemap", temperature: 12, reliabilityScore: 80, sourceTier: 3 }),
      station({ stationId: "citoyen-b", source: "cwop", temperature: 28, reliabilityScore: 80, sourceTier: 3 }),
    ];
    const result = calculateUltraLocal(stations, "local", 50.75, 2.52, null, null, {
      recordStationReadings: false,
      performanceMultiplierById: new Map([["citoyen-a", 0], ["citoyen-b", 0]]),
    });

    expect(result.temperature).toBeNull();
    expect(result.stationCount).toBe(0);
    expect(result.stationsUsed).toEqual([]);
    expect(result.confidenceScore).toBeNull();
  });
});
