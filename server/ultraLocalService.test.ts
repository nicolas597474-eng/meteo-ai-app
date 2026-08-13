import { describe, expect, it } from "vitest";
import { calculateUltraLocal } from "./ultraLocalService";
import type { StationData } from "./stationService";

function station(overrides: Partial<StationData>): StationData {
  return {
    stationId: "station",
    source: "meteofrance",
    name: "Station physique",
    lat: 50.75,
    lon: 2.52,
    altitude: 40,
    distanceKm: 1,
    temperature: 20,
    humidity: 60,
    pressure: 1015,
    windSpeed: 10,
    windGust: 15,
    windDirection: 180,
    precipitation: 0,
    updatedAt: new Date().toISOString(),
    reliabilityScore: 80,
    updateFrequencyMin: 10,
    dataAvailability: 0.95,
    isActive: true,
    qualificationStatus: "validated",
    sourceTier: 1,
    ...overrides,
  };
}

describe("calculateUltraLocal", () => {
  it("favorise la station plus fraîche à distance et fiabilité égales", () => {
    const now = Date.now();
    const result = calculateUltraLocal([
      station({ stationId: "fresh", name: "Fraîche", temperature: 20, updatedAt: new Date(now).toISOString() }),
      station({ stationId: "older", name: "Ancienne", temperature: 16, updatedAt: new Date(now - 25 * 60_000).toISOString() }),
    ], "ultra-local", 50.75, 2.52, 40, null);

    const fresh = result.stationsUsed.find((item) => item.stationId === "fresh");
    const older = result.stationsUsed.find((item) => item.stationId === "older");

    expect(fresh?.freshnessWeight).toBeGreaterThan(older?.freshnessWeight ?? 1);
    expect(fresh?.weight).toBeGreaterThan(older?.weight ?? 1);
    expect(result.temperature).toBeGreaterThan(18);
  });
});
