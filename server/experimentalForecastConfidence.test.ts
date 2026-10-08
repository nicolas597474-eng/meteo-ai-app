import { describe, expect, it } from "vitest";
import {
  calculateExperimentalForecastConfidence,
  EXPERIMENTAL_FORECAST_CONFIDENCE_WEIGHTS,
  type ExperimentalConfidenceModelValue,
  type ExperimentalConfidenceStation,
} from "../shared/experimentalForecastConfidence";

const NOW = Date.parse("2026-10-08T06:00:00.000Z");
const VALID_AT = NOW + 60 * 60_000;

function model(
  index: number,
  patch: Partial<ExperimentalConfidenceModelValue> = {}
): ExperimentalConfidenceModelValue {
  return {
    modelId: `model-${index}`,
    modelName: `Model ${index}`,
    value: [10, 12, 13][index - 1] ?? 10,
    validTime: VALID_AT,
    availableAt: NOW - 5 * 60_000,
    horizonMinutes: 60,
    horizonBucket: "0-6h",
    calibrationLevel: "EXACT_LOCAL_MODEL_VARIABLE_BUCKET",
    calibrationStatus: "CALIBRATED",
    historicalScore: { mae: index / 2, comparisonCount: 60, evaluatedDays: 15 },
    ...patch,
  };
}

function station(
  id: string,
  patch: Partial<ExperimentalConfidenceStation> = {}
): ExperimentalConfidenceStation {
  return {
    stationId: id,
    sourceKind: "physical",
    isActive: true,
    temperature: id === "station-a" ? 11 : 13,
    reliabilityScore: 90,
    measurementTimes: { temperature: new Date(NOW - 5 * 60_000).toISOString() },
    ...patch,
  };
}

function input(
  options: {
    models?: ExperimentalConfidenceModelValue[];
    stations?: ExperimentalConfidenceStation[];
    point?: Record<string, unknown> | null;
    expectedModelCount?: number;
    availableModelCount?: number;
  } = {}
) {
  const models = options.models ?? [model(1), model(2), model(3)];
  return {
    point:
      options.point === null
        ? null
        : {
            validAt: VALID_AT,
            temp: 12,
            precipitation: 0,
            windSpeed: 4,
            weatherCode: 2,
            weighting: {
              variableWeightings: [
                {
                  variable: "temperature",
                  expectedModelCount: options.expectedModelCount ?? 3,
                  availableModelCount:
                    options.availableModelCount ?? models.length,
                  modelWeights: models,
                },
              ],
            },
            ...options.point,
          },
    forecastComputedAt: NOW,
    stations: options.stations ?? [station("station-a"), station("station-b")],
    nowMs: NOW,
  };
}

describe("experimental forecast confidence", () => {
  it("conserve strictement les poids acceptés, totalisant 100", () => {
    expect(EXPERIMENTAL_FORECAST_CONFIDENCE_WEIGHTS).toEqual({
      agreement: 20,
      observationQuality: 20,
      historicalPerformance: 20,
      freshnessCoverage: 15,
      spatialCoherence: 10,
      horizon: 10,
      sampleSize: 5,
    });
    expect(
      Object.values(EXPERIMENTAL_FORECAST_CONFIDENCE_WEIGHTS).reduce(
        (sum, value) => sum + value,
        0
      )
    ).toBe(100);
  });

  it("calcule un score complet seulement avec des preuves exactes et conserve le barème fixe", () => {
    const result = calculateExperimentalForecastConfidence(input());
    expect(result.status).toBe("calculated");
    expect(result.calculableWeight).toBe(100);
    expect(result.coveragePercent).toBe(100);
    expect(result.extremePenalty).toBe(0);
    expect(result.components.map(({ score }) => score)).toEqual([
      63, 90, 70, 99, 75, 100, 50,
    ]);
    const expected = Math.round(
      result.components.reduce(
        (sum, component) => sum + component.weight * component.score!,
        0
      ) / 100
    );
    expect(result.score).toBe(expected);
  });

  it("n’affiche aucun score partiel et ne redistribue pas le poids d’une preuve manquante", () => {
    const stations = [
      station("station-a", { reliabilityScore: null }),
      station("station-b", { reliabilityScore: null }),
    ];
    const result = calculateExperimentalForecastConfidence(input({ stations }));
    expect(result.status).toBe("partial");
    expect(result.score).toBeNull();
    expect(result.calculableWeight).toBe(80);
    expect(result.coveragePercent).toBe(80);
    expect(
      result.components.find(({ key }) => key === "observationQuality")?.weight
    ).toBe(20);
    expect(
      result.components.find(({ key }) => key === "observationQuality")?.score
    ).toBeNull();
  });

  it("refuse le sous-échantillonnage si un modèle n’est pas aligné au validAt exact", () => {
    const result = calculateExperimentalForecastConfidence(
      input({
        models: [
          model(1),
          model(2),
          model(3, { validTime: VALID_AT + 60 * 60_000 }),
        ],
      })
    );
    expect(
      result.components.find(({ key }) => key === "agreement")?.score
    ).toBeNull();
    expect(
      result.components.find(({ key }) => key === "agreement")?.reason
    ).toMatch(/aucun sous-échantillon/i);
    expect(
      result.components.find(({ key }) => key === "historicalPerformance")
        ?.score
    ).toBeNull();
    expect(
      result.components.find(({ key }) => key === "sampleSize")?.score
    ).toBeNull();
  });

  it("refuse de comparer la performance et l’échantillon de modèles à horizons exacts différents", () => {
    const models = [
      model(1, { calibrationLevel: "EXACT_LOCAL_MODEL_VARIABLE_HORIZON" }),
      model(2, {
        calibrationLevel: "EXACT_LOCAL_MODEL_VARIABLE_HORIZON",
        horizonMinutes: 61,
      }),
      model(3, { calibrationLevel: "EXACT_LOCAL_MODEL_VARIABLE_HORIZON" }),
    ];
    const result = calculateExperimentalForecastConfidence(input({ models }));
    expect(
      result.components.find(({ key }) => key === "historicalPerformance")
        ?.score
    ).toBeNull();
    expect(
      result.components.find(({ key }) => key === "sampleSize")?.score
    ).toBeNull();
    expect(
      result.components.find(({ key }) => key === "historicalPerformance")
        ?.reason
    ).toMatch(/ne sont pas identiques/i);
  });

  it("n’utilise pas la MAE d’un modèle non calibré ni les poids de fusion", () => {
    const result = calculateExperimentalForecastConfidence(
      input({
        models: [
          model(1),
          model(2, {
            calibrationStatus: "UNCALIBRATED_ROBUST",
            historicalScore: null,
          }),
          model(3),
        ],
      })
    );
    expect(
      result.components.find(({ key }) => key === "historicalPerformance")
        ?.score
    ).toBeNull();
    expect(
      result.components.find(({ key }) => key === "sampleSize")?.score
    ).toBeNull();
  });

  it("n’utilise jamais updatedAt comme substitut à l’heure de mesure propre à la température", () => {
    const result = calculateExperimentalForecastConfidence(
      input({
        stations: [
          station("station-a", { measurementTimes: null }),
          station("station-b", { measurementTimes: null }),
        ],
      })
    );
    expect(
      result.components.find(({ key }) => key === "spatialCoherence")?.score
    ).toBeNull();
    expect(
      result.components.find(({ key }) => key === "spatialCoherence")?.reason
    ).toMatch(/updatedAt n’est pas utilisé/i);
  });

  it("refuse la cohérence spatiale si les relevés dépassent la fenêtre commune de 60 minutes", () => {
    const result = calculateExperimentalForecastConfidence(
      input({
        stations: [
          station("station-a", {
            measurementTimes: {
              temperature: new Date(NOW - 5 * 60_000).toISOString(),
            },
          }),
          station("station-b", {
            measurementTimes: {
              temperature: new Date(NOW - 66 * 60_000).toISOString(),
            },
          }),
        ],
      })
    );
    expect(
      result.components.find(({ key }) => key === "spatialCoherence")?.score
    ).toBeNull();
    expect(
      result.components.find(({ key }) => key === "spatialCoherence")?.reason
    ).toMatch(/plus de 60 min/i);
  });

  it("rend la fraîcheur/couverture indisponible si les timestamps des modèles comptés ne sont pas tous exposés", () => {
    const result = calculateExperimentalForecastConfidence(
      input({ availableModelCount: 2 })
    );
    expect(
      result.components.find(({ key }) => key === "freshnessCoverage")?.score
    ).toBeNull();
    expect(
      result.components.find(({ key }) => key === "freshnessCoverage")?.reason
    ).toMatch(/tous les modèles comptés/i);
  });

  it("borne la fraîcheur à zéro au-delà de 180 minutes sans pénaliser deux fois la couverture", () => {
    const stale = NOW - 240 * 60_000;
    const result = calculateExperimentalForecastConfidence(
      input({
        models: [
          model(1, { availableAt: stale }),
          model(2, { availableAt: stale }),
          model(3, { availableAt: stale }),
        ],
      })
    );
    expect(
      result.components.find(({ key }) => key === "freshnessCoverage")?.score
    ).toBe(50);
  });

  it("applique une pénalité extrême distincte, visible et plafonnée à 30 points", () => {
    const result = calculateExperimentalForecastConfidence(
      input({
        point: { temp: -7, precipitation: 6, windSpeed: 61, weatherCode: 95 },
      })
    );
    expect(result.status).toBe("calculated");
    expect(result.extremePenalty).toBe(30);
    expect(result.extremeReasons).toContain("vent > 60 km/h");
    expect(result.extremeReasons).toContain("gel intense < −5 °C");
    const base = Math.round(
      result.components.reduce(
        (sum, component) => sum + component.weight * component.score!,
        0
      ) / 100
    );
    expect(result.score).toBe(Math.max(0, base - 30));
  });

  it("traite zéro comme une valeur réelle et ne produit pas d’indice sans données", () => {
    const zero = calculateExperimentalForecastConfidence(
      input({
        models: [
          model(1, { value: 0 }),
          model(2, { value: 0 }),
          model(3, { value: 0 }),
        ],
        stations: [
          station("station-a", { temperature: 0 }),
          station("station-b", { temperature: 0 }),
        ],
        point: { temp: 0, precipitation: 0, windSpeed: 0, weatherCode: 0 },
      })
    );
    expect(zero.components.find(({ key }) => key === "agreement")?.score).toBe(
      100
    );
    expect(
      zero.components.find(({ key }) => key === "spatialCoherence")?.score
    ).toBe(100);
    expect(zero.extremePenalty).toBe(0);

    const empty = calculateExperimentalForecastConfidence({
      point: null,
      forecastComputedAt: null,
      stations: [],
      nowMs: NOW,
    });
    expect(empty.status).toBe("unavailable");
    expect(empty.score).toBeNull();
    expect(empty.calculableWeight).toBe(0);
  });
});
