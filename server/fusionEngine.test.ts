import { describe, expect, it } from "vitest";
import { computeConfidenceScore, computeFusion, getLeadTimeWeights, isEligibleGlobalReliabilityScore, type FusionSource } from "./fusionEngine";

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

describe("getLeadTimeWeights", () => {
  it("ignore les scores par échéance trop peu nombreux ou périmés", () => {
    const weights = getLeadTimeWeights([
      { serviceName: "Faible", bucket: "0-6h", avgMaeTemp: 0.1, avgMaePrecip: 0.1, avgMaeWind: 0.1, sampleSize: 2, latestScoreDate: "2026-08-12" },
      { serviceName: "Ancien", bucket: "0-6h", avgMaeTemp: 0.1, avgMaePrecip: 0.1, avgMaeWind: 0.1, sampleSize: 12, latestScoreDate: "2026-08-01" },
      { serviceName: "Validé", bucket: "0-6h", avgMaeTemp: 0.4, avgMaePrecip: 0.2, avgMaeWind: 1.2, sampleSize: 9, latestScoreDate: "2026-08-10" },
    ], "0-6h", new Date("2026-08-12T12:00:00.000Z"));

    expect(weights).toEqual({
      "Validé": { maeTemp: 0.4, maePrecip: 0.2, maeWind: 1.2 },
    });
  });

  it("choisit le voisin d’échéance le plus proche avant une performance très courte", () => {
    const weights = getLeadTimeWeights([
      { serviceName: "AROME", bucket: "0-6h", avgMaeTemp: 0.1, avgMaePrecip: 0.2, avgMaeWind: 1, sampleSize: 10, latestScoreDate: "2026-08-11" },
      { serviceName: "AROME", bucket: "4-7d", avgMaeTemp: 1.8, avgMaePrecip: 2.2, avgMaeWind: 8, sampleSize: 10, latestScoreDate: "2026-08-11" },
    ], "8-15d", new Date("2026-08-12T12:00:00.000Z"));

    expect(weights.AROME).toEqual({ maeTemp: 1.8, maePrecip: 2.2, maeWind: 8 });
  });
});

describe("isEligibleGlobalReliabilityScore", () => {
  const now = new Date("2026-08-12T12:00:00.000Z");

  it("retient uniquement les scores globaux récents avec un effectif suffisant", () => {
    expect(isEligibleGlobalReliabilityScore(10, "2026-08-11", now)).toBe(true);
    expect(isEligibleGlobalReliabilityScore(3, "2026-08-12", now)).toBe(false);
    expect(isEligibleGlobalReliabilityScore(10, "2026-08-01", now)).toBe(false);
  });
});

describe("computeConfidenceScore", () => {
  const agreeingForecasts = [
    { tempMax: 20, tempMin: 12, precipitation: 0, windSpeed: 10 },
    { tempMax: 20.1, tempMin: 12.1, precipitation: 0, windSpeed: 10.2 },
  ];

  it("plafonne la confiance sans performance historique ni cohérence de station", () => {
    expect(computeConfidenceScore({ forecasts: agreeingForecasts, leadTimeBucket: "0-6h" })).toBeLessThanOrEqual(55);
  });

  it("ne remplace pas une preuve manquante par une note de performance arbitraire", () => {
    const partialEvidence = computeConfidenceScore({
      forecasts: agreeingForecasts,
      bestModelScore: 95,
      leadTimeBucket: "0-6h",
    });
    expect(partialEvidence).toBeLessThanOrEqual(75);
  });
});
