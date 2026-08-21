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

  it("applique le poids de chaque contribution à la même station pour l’humidité", () => {
    const result = calculateUltraLocal([
      station({ stationId: "far", name: "Lointaine", distanceKm: 4, humidity: 90, temperature: 20 }),
      station({ stationId: "near", name: "Proche", distanceKm: 1, humidity: 20, temperature: 20 }),
    ], "ultra-local", 50.75, 2.52, 40, null);

    expect(result.humidity).not.toBeNull();
    expect(result.humidity!).toBeLessThan(50);
    expect(result.confidenceByParameter.humidity).not.toBeNull();
    expect(result.confidenceByParameter.temperature).toBe(result.confidenceScore);
  });

  it("signale une confiance indisponible pour une variable absente de toutes les stations", () => {
    const result = calculateUltraLocal([
      station({ stationId: "one", windGust: null }),
      station({ stationId: "two", distanceKm: 3, windGust: null }),
    ], "local", 50.75, 2.52, 40, null);

    expect(result.windGust).toBeNull();
    expect(result.confidenceByParameter.windGust).toBeNull();
  });

  it("n’invente pas de confiance avec une seule observation par variable", () => {
    const result = calculateUltraLocal([
      station({ stationId: "unique", humidity: 75, precipitation: 1.2, windSpeed: 18, windGust: 35 }),
      station({ stationId: "temp-only", distanceKm: 3, humidity: null, precipitation: null, windSpeed: null, windGust: null }),
    ], "local", 50.75, 2.52, 40, null);

    expect(result.temperature).not.toBeNull();
    expect(result.confidenceScore).not.toBeNull();
    expect(result.humidity).toBe(75);
    expect(result.precipitation).toBe(1.2);
    expect(result.windSpeed).toBe(18);
    expect(result.windGust).toBe(35);
    expect(result.confidenceByParameter).toMatchObject({ humidity: null, precipitation: null, windSpeed: null, windGust: null });
  });

  it("pondère indépendamment pluie, vent et rafales et écarte une station non fraîche", () => {
    const now = Date.now();
    const result = calculateUltraLocal([
      station({ stationId: "near", distanceKm: 1, precipitation: 0.2, windSpeed: 8, windGust: 14, updatedAt: new Date(now).toISOString() }),
      station({ stationId: "far", distanceKm: 4, precipitation: 8, windSpeed: 42, windGust: 70, updatedAt: new Date(now).toISOString() }),
      station({ stationId: "stale", distanceKm: 1.2, precipitation: 99, windSpeed: 99, windGust: 99, updatedAt: new Date(now - 90 * 60_000).toISOString() }),
    ], "ultra-local", 50.75, 2.52, 40, null);

    expect(result.stationsIgnored.map((item) => item.stationId)).toContain("stale");
    expect(result.precipitation).toBeLessThan(4);
    expect(result.windSpeed).toBeLessThan(25);
    expect(result.windGust).toBeLessThan(45);
    expect(result.confidenceByParameter.precipitation).not.toBeNull();
    expect(result.confidenceByParameter.windSpeed).not.toBeNull();
    expect(result.confidenceByParameter.windGust).not.toBeNull();
  });

  it("limite strictement l’Ultra-local aux stations situées dans les 10 km", () => {
    const result = calculateUltraLocal([
      station({ stationId: "outside-ultra", distanceKm: 12, temperature: 21 }),
    ], "ultra-local", 50.75, 2.52, 40, null);

    expect(result.stationsUsed).toHaveLength(0);
    expect(result.stationCount).toBe(0);
    expect(result.bandBreakdown.map((band) => band.band)).toEqual(["< 2 km", "2-5 km", "5-10 km"]);
  });

  it("inclut la bande 20-30 km dans le calcul Local élargi", () => {
    const result = calculateUltraLocal([
      station({ stationId: "local-sector", distanceKm: 25, temperature: 19 }),
    ], "local", 50.75, 2.52, 40, null);

    expect(result.stationsUsed.map((item) => item.stationId)).toContain("local-sector");
    expect(result.bandBreakdown.find((band) => band.band === "20-30 km")?.stationCount).toBe(1);
    expect(result.stationCount).toBe(1);
  });
});
