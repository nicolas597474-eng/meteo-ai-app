import { describe, expect, it } from "vitest";
import { computeFusion, type FusionSource } from "./fusionEngine";

function station(
  id: string,
  distanceKm: number,
  temperature: number,
  updatedAt = new Date()
): FusionSource {
  return {
    id,
    name: id,
    distanceKm,
    temperature,
    humidity: 70,
    pressure: 1015,
    windSpeed: 12,
    updatedAt,
    reliabilityScore: 85,
    maeTemp: 1,
    type: "station",
  };
}

describe("computeFusion — fusion IDW avancée", () => {
  it("favorise une station proche de qualité comparable", () => {
    const result = computeFusion(
      [station("proche", 1, 10), station("lointaine", 4, 20)],
      {
        altitudeCorrectionEnabled: false,
        anomalyDetectionEnabled: false,
        modelWeightFraction: 0,
      }
    );

    expect(result.methodUsed).toContain("IDW");
    expect(result.stationCount).toBe(2);
    expect(result.temperature).not.toBeNull();
    expect(result.temperature!).toBeLessThan(12);
    expect(result.usedSources[0]?.name).toBe("proche");
  });

  it("détecte et pénalise une valeur station figée depuis plus d'une heure", () => {
    const sources = [station("figee", 1, 10), station("reference", 2, 11)];
    const baseline = computeFusion(sources, {
      altitudeCorrectionEnabled: false,
      anomalyDetectionEnabled: false,
      modelWeightFraction: 0,
    });
    const previousReadings = new Map([
      ["figee", { temperature: 10, timestamp: Date.now() - 61 * 60 * 1000 }],
    ]);
    const result = computeFusion(
      sources,
      {
        altitudeCorrectionEnabled: false,
        anomalyDetectionEnabled: true,
        modelWeightFraction: 0,
      },
      previousReadings
    );

    expect(result.anomaliesDetected.some((anomaly) => anomaly.type === "frozen_value")).toBe(true);
    const baselineWeight = baseline.usedSources.find((source) => source.id === "figee")?.finalWeight ?? 0;
    const penalizedWeight = result.usedSources.find((source) => source.id === "figee")?.finalWeight ?? 0;
    expect(penalizedWeight).toBeLessThan(baselineWeight);
  });
});
