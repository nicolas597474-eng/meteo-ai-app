import { describe, expect, it } from "vitest";
import { computeConfidenceScore, computeFusion, getLeadTimeWeights, isEligibleGlobalReliabilityScore, type FusionSource } from "./fusionEngine";
import { MODEL_FUSION_WEIGHT_CAP, normalizeModelWeightsWithCap, regularizeModelPerformance, type DailyFusionMetric, type ModelPerformanceEvidence } from "./fusionPerformance";

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

const performanceContext = { locationKey: "50.7567_2.5204", variable: "temperature_max" as const, horizonBucket: "6-24h" as const };

function modelEvidence(serviceName: string, mae: number, sampleSize: number, overrides: Partial<ModelPerformanceEvidence> = {}): ModelPerformanceEvidence {
  return {
    locationKey: performanceContext.locationKey,
    serviceName,
    modelId: serviceName,
    variable: performanceContext.variable,
    horizonBucket: performanceContext.horizonBucket,
    comparisonCount: sampleSize,
    sampleSize,
    evaluatedDays: sampleSize,
    mae,
    rmse: mae + 0.2,
    standardError: 0.02,
    latestScoreDate: new Date().toISOString().slice(0, 10),
    ...overrides,
  };
}

function modelSource(serviceName: string, value: number | null, evidence: ModelPerformanceEvidence): FusionSource {
  return {
    id: `model:${serviceName}`,
    name: serviceName,
    modelId: evidence.modelId,
    distanceKm: 1,
    temperature: value,
    updatedAt: new Date(),
    reliabilityScore: 50,
    performanceEvidence: evidence,
    type: "model",
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
    // La proximité reste prépondérante, mais ne contourne plus les parts
    // normalisées distance/qualité/fraîcheur du noyau spatial commun.
    expect(result.temperature!).toBeLessThan(15);
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

describe("computeFusion — preuve statistique quotidienne exacte", () => {
  const config = {
    maxDistanceKm: 5,
    maxFreshnessMin: 24 * 60,
    minReliabilityScore: 0,
    altitudeCorrectionEnabled: false,
    anomalyDetectionEnabled: false,
    modelWeightFraction: 1,
    performanceContext,
  };

  it("n’utilise pas un MAE brut sans effectif ni contexte lieu/variable/horizon", () => {
    const sources = [
      { ...modelSource("mae-brut-faible", 10, modelEvidence("mae-brut-faible", 0.6, 120)), maeTemp: 0.6, performanceEvidence: undefined },
      { ...modelSource("mae-brut-fort", 20, modelEvidence("mae-brut-fort", 0.8, 120)), maeTemp: 0.8, performanceEvidence: undefined },
    ];
    const result = computeFusion(sources, { ...config, performanceContext: undefined });

    expect(result.performanceEvidenceStatus).toBe("not_requested");
    expect(result.usedSources.map((source) => source.performanceWeight)).toEqual([1, 1]);
  });

  it("n’accorde pas d’avantage excessif à 0,6 °C sur 12 cas face à 0,8 °C sur 500", () => {
    const lowN = modelEvidence("faible-effectif", 0.6, 12);
    const highN = modelEvidence("grand-effectif", 0.8, 120, { comparisonCount: 500 });
    const sources = [
      modelSource("faible-effectif", 10, lowN),
      modelSource("grand-effectif", 20, highN),
      modelSource("autre-1", 30, modelEvidence("autre-1", 0.9, 120)),
      modelSource("autre-2", 40, modelEvidence("autre-2", 1.0, 120)),
    ];
    const result = computeFusion(sources, config);

    expect(result.performanceEvidenceStatus).toBe("qualified");
    expect(result.usedSources.map((source) => source.name)).not.toContain("faible-effectif");
    expect(result.excludedSources.find((source) => source.name === "faible-effectif")?.reason).toContain("30 jours indépendants");
    const largeSample = result.usedSources.find((source) => source.name === "grand-effectif")!;
    expect(largeSample.performanceEvidence?.comparisonCount).toBe(500);
    expect(largeSample.performanceEvidence?.sampleSize).toBe(120);
    expect(largeSample.sampleReliability).toBeCloseTo(0.8, 12);
    const weight = largeSample.finalWeight;
    expect(weight).toBeGreaterThan(result.usedSources.find((source) => source.name === "autre-1")!.finalWeight);
    expect(weight).toBeLessThanOrEqual(MODEL_FUSION_WEIGHT_CAP);
    expect(result.usedSources.reduce((sum, source) => sum + source.finalWeight, 0)).toBeCloseTo(1, 8);
  });

  it("régularise l’incertitude et garde le multiplicateur dans ses bornes", () => {
    const evidence = [
      modelEvidence("très-précis", 0.1, 120, { standardError: 0 }),
      modelEvidence("médian", 0.5, 120, { standardError: 0 }),
      modelEvidence("peu-précis", 9, 120, { standardError: 0 }),
    ];
    const regularized = regularizeModelPerformance(evidence, performanceContext, new Date());

    expect(regularized.get("très-précis")?.performanceMultiplier).toBe(2);
    expect(regularized.get("peu-précis")?.performanceMultiplier).toBe(0.3);
    for (const score of regularized.values()) {
      expect(score.performanceMultiplier).toBeGreaterThanOrEqual(0.3);
      expect(score.performanceMultiplier).toBeLessThanOrEqual(2);
      expect(score.uncertaintyAdjustedMae).toBeGreaterThanOrEqual(score.evidence.mae);
    }
  });

  it("normalise les poids à un et plafonne chaque modelId indépendamment", () => {
    const weights = normalizeModelWeightsWithCap([
      { modelId: "dominant", rawWeight: 100 },
      { modelId: "m2", rawWeight: 1 },
      { modelId: "m3", rawWeight: 1 },
      { modelId: "m4", rawWeight: 1 },
      { modelId: "m5", rawWeight: 1 },
    ]);

    expect(weights).not.toBeNull();
    expect(Array.from(weights!.values()).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
    expect(Math.max(...Array.from(weights!.values()))).toBeLessThanOrEqual(MODEL_FUSION_WEIGHT_CAP);
    expect(weights!.get("dominant")).toBeCloseTo(MODEL_FUSION_WEIGHT_CAP, 12);
    expect(normalizeModelWeightsWithCap([{ modelId: "only-one", rawWeight: 1 }])).toBeNull();
  });

  it("refuse une fusion si le nombre de modèles ne permet pas de respecter le plafond", () => {
    const result = computeFusion([
      modelSource("m1", 10, modelEvidence("m1", 0.8, 120)),
      modelSource("m2", 12, modelEvidence("m2", 0.9, 120)),
    ], config);
    expect(result.temperature).toBeNull();
    expect(result.usedSources).toEqual([]);
    expect(result.confidenceScore).toBe(0);
    expect(result.performanceEvidenceStatus).toBe("insufficient");
    expect(result.excludedSources.every((source) => source.reason.includes("plafond individuel"))).toBe(true);
  });

  it("ignore un modèle sans valeur pour la variable et exige des preuves du lieu, de la variable et de l’horizon exacts", () => {
    const available = [
      modelSource("m1", 10, modelEvidence("m1", 0.8, 120)),
      modelSource("m2", 12, modelEvidence("m2", 0.9, 120)),
      modelSource("m3", 14, modelEvidence("m3", 1.0, 120)),
    ];
    const missing = modelSource("m4", null, modelEvidence("m4", 0.7, 120));
    const result = computeFusion([...available, missing], config);
    expect(result.performanceEvidenceStatus).toBe("qualified");
    expect(result.usedSources.map((source) => source.name)).toEqual(["m1", "m2", "m3"]);
    expect(result.excludedSources.find((source) => source.name === "m4")?.reason).toContain("prévision de cette variable indisponible");
    expect(result.usedSources.reduce((sum, source) => sum + source.finalWeight, 0)).toBeCloseTo(1, 8);

    const mismatched = available.map((source, index) => ({
      ...source,
      performanceEvidence: {
        ...source.performanceEvidence!,
        locationKey: index === 0 ? "autre-lieu" : performanceContext.locationKey,
        variable: index === 1 ? "precipitation_sum" as DailyFusionMetric : performanceContext.variable,
        horizonBucket: index === 2 ? "1-3d" as const : performanceContext.horizonBucket,
      },
    }));
    const rejected = computeFusion(mismatched, config);
    expect(rejected.performanceEvidenceStatus).toBe("insufficient");
    expect(rejected.temperature).toBeNull();
    expect(rejected.excludedSources).toHaveLength(3);
  });
});
