import { describe, expect, it } from "vitest";
import { computeFusion, type FusionSource } from "./fusionEngine";
import { calculateGroundTruth, type StationData } from "./stationService";
import { buildNormalizedSpatialWeights, evaluateSpatialQuality } from "./spatialFusionCore";
import { calculateUltraLocal } from "./ultraLocalService";

const now = new Date().toISOString();
function station(overrides: Partial<StationData>): StationData {
  return {
    stationId: "station", source: "meteofrance", name: "Station physique",
    lat: 50.75, lon: 2.52, altitude: 40, distanceKm: 1,
    temperature: 20, humidity: 60, pressure: 1015, windSpeed: 10, windGust: 15,
    windDirection: 180, precipitation: 0, updatedAt: now, reliabilityScore: 80,
    updateFrequencyMin: 10, dataAvailability: 0.95, isActive: true,
    qualificationStatus: "validated", sourceTier: 1, ...overrides,
  };
}

describe("noyau spatial commun", () => {
  it("normalise IDW, qualité et fraîcheur avant la combinaison 50/30/20", () => {
    const weights = buildNormalizedSpatialWeights([
      { id: "near", distanceKm: 0.5, reliabilityScore: 80, updatedAt: now, temperature: 20 },
      { id: "far", distanceKm: 10, reliabilityScore: 80, updatedAt: now, temperature: 30 },
    ]);
    expect(weights.reduce((sum, weight) => sum + weight.distanceWeight, 0)).toBeCloseTo(1, 10);
    expect(weights.reduce((sum, weight) => sum + weight.qualityWeight, 0)).toBeCloseTo(1, 10);
    expect(weights.reduce((sum, weight) => sum + weight.freshnessWeight, 0)).toBeCloseTo(1, 10);
    expect(weights.reduce((sum, weight) => sum + weight.finalWeight, 0)).toBeCloseTo(1, 10);
    expect(weights[0].finalWeight).toBeCloseTo(0.7455, 3);
  });

  it("partage le QC de distance, fraîcheur, fiabilité, cohérence et altitude", () => {
    const results = evaluateSpatialQuality([
      { id: "good-a", distanceKm: 1, reliabilityScore: 90, updatedAt: now, altitude: 50, temperature: 20 },
      { id: "good-b", distanceKm: 2, reliabilityScore: 90, updatedAt: now, altitude: 52, temperature: 20.2 },
      { id: "outlier", distanceKm: 2, reliabilityScore: 90, updatedAt: now, altitude: 51, temperature: 31 },
    ], { maxDistanceKm: 10, maxFreshnessMin: 60, minReliabilityScore: 40, maxTempDeviationC: 4, refAltitude: 40 });
    expect(results.filter((result) => result.passed).map((result) => result.source.id)).toEqual(["good-a", "good-b"]);
    const outlier = results.find((result) => result.source.id === "outlier")!;
    expect(outlier.checks.find((check) => check.code === "coherence")?.passed).toBe(false);
    expect(results[0].altitudeAdjustmentC).toBeCloseTo(-0.065, 3);
  });

  it("nomme le seuil reliabilityScore comme une priorité technique de source", () => {
    const [result] = evaluateSpatialQuality([
      { id: "low-priority", distanceKm: 1, reliabilityScore: 39, updatedAt: now, altitude: 50, temperature: 20 },
    ], { maxDistanceKm: 10, maxFreshnessMin: 60, minReliabilityScore: 40, maxTempDeviationC: 8, refAltitude: 40 });

    expect(result.checks.find((check) => check.code === "reliability")?.reason)
      .toBe("Priorité technique de source insuffisante");
  });

  it("produit la même synthèse stationnaire pour Ground Truth, Ultra-local standard et fusion avancée", () => {
    const stations = [
      station({ stationId: "near", distanceKm: 0.5, temperature: 20, reliabilityScore: 80 }),
      station({ stationId: "far", distanceKm: 10, temperature: 30, reliabilityScore: 80 }),
    ];
    const groundTruth = calculateGroundTruth(stations);
    const ultraLocal = calculateUltraLocal(stations, "standard", 50.75, 2.52, null, null);
    const sources: FusionSource[] = stations.map((item) => ({
      id: item.stationId, name: item.name, distanceKm: item.distanceKm, altitude: item.altitude,
      temperature: item.temperature, humidity: item.humidity, pressure: item.pressure,
      windSpeed: item.windSpeed, windGust: item.windGust, precipitation: item.precipitation,
      updatedAt: item.updatedAt, reliabilityScore: item.reliabilityScore, type: "station",
    }));
    const advanced = computeFusion(sources, {
      maxDistanceKm: 20, maxFreshnessMin: 120, minReliabilityScore: 30,
      maxTempDeviationC: 8, altitudeCorrectionEnabled: false,
      anomalyDetectionEnabled: false, adaptiveWeightingEnabled: false, modelWeightFraction: 0,
    });

    expect(groundTruth.temperature).toBeCloseTo(22.5, 1);
    expect(ultraLocal.temperature).toBe(groundTruth.temperature);
    expect(advanced.temperature).toBe(groundTruth.temperature);
    expect(advanced.methodUsed).toContain("spatial-core");
  });
});
