import { describe, expect, it } from "vitest";
import { OFFICIAL_HOURLY_MODELS, type HourlyModelForecast } from "./weatherServices";
import type { HourlyForecastRunValue } from "../drizzle/schema";
import { computeOfficialHourlyForecast, reconstructOfficialHourlyModelsFromArchive, type OfficialHourlyEvaluationHistoryScore } from "./officialHourlyForecast";

const validAt = Date.parse("2026-10-01T12:00:00.000Z");
const availableAt = validAt - 12 * 60 * 60_000;

function modelForecasts(at = validAt, available = at - 12 * 60 * 60_000): HourlyModelForecast[] {
  return OFFICIAL_HOURLY_MODELS.map((model, index) => ({
    modelName: model.name,
    modelId: model.modelId,
    sourceName: "open-meteo",
    availableAt: available,
    hours: [{
      validAt: at,
      hour: new Date(at).getUTCHours(),
      temperature: 8 + index,
      apparentTemperature: 7 + index,
      precipitation: index === 6 ? 0.4 : 0,
      windSpeed: 8 + index,
      windGusts: 12 + index,
      windDirection: index === 0 ? 350 : 10,
      humidity: 70 + index,
      pressure: 1010 + index,
      cloudCover: 30 + index,
      weatherCode: index < 4 ? 2 : 3,
      uvIndex: 2 + index / 10,
    }],
  }));
}

function historicalScores(
  variable = "temperature",
  horizonBucket = "6_24h",
  maeForModel: (modelIndex: number) => number = (modelIndex) => 0.5 + modelIndex * 0.35,
  sampleSize = 5,
): OfficialHourlyEvaluationHistoryScore[] {
  return OFFICIAL_HOURLY_MODELS.flatMap((model, modelIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const mae = maeForModel(modelIndex);
      return {
        date: `2026-09-${String(20 + dayIndex).padStart(2, "0")}`,
        sourceName: "open-meteo",
        modelName: model.name,
        modelId: model.modelId,
        variable,
        horizonBucket,
        sampleSize,
        mae,
        rmse: mae + 0.2,
        bias: 0,
      };
    }),
  );
}

function bestMatchForecast(): HourlyModelForecast {
  return {
    modelName: "best_match",
    modelId: null,
    sourceName: "open-meteo",
    availableAt,
    hours: [{
      validAt,
      hour: 12,
      temperature: 99,
      apparentTemperature: 99,
      precipitation: 99,
      windSpeed: 99,
      windGusts: 99,
      windDirection: 180,
      humidity: 99,
      pressure: 900,
      cloudCover: 100,
      weatherCode: 65,
    }],
  };
}

function variableWeighting(result: ReturnType<typeof computeOfficialHourlyForecast>, variable: string) {
  return result.hours[0]?.forecastWeighting?.variableWeightings.find((item) => item.variable === variable);
}

describe("reconstructOfficialHourlyModelsFromArchive", () => {
  it("retient les derniers runs exacts des sept modèles, ignore Best Match et garde les epochs répétés", () => {
    const targetDate = "2026-10-25";
    const model = OFFICIAL_HOURLY_MODELS[0]!;
    const firstValidAt = Date.parse("2026-10-25T00:00:00Z");
    const secondValidAt = Date.parse("2026-10-25T01:00:00Z");
    const row = (values: Partial<HourlyForecastRunValue>): HourlyForecastRunValue => ({
      id: 1,
      captureRunId: "latest-run",
      locationKey: "50.7,2.5",
      targetDate,
      sourceName: "open-meteo",
      modelName: model.name,
      modelId: model.modelId,
      requestStartedAt: Date.parse("2026-10-25T07:00:00Z"),
      availableAt: Date.parse("2026-10-25T07:01:00Z"),
      validTime: firstValidAt,
      variable: "temperature",
      value: 8,
      unit: "°C",
      capturedAt: new Date("2026-10-25T07:01:00Z"),
      ...values,
    });
    const archives = [
      row({ id: 1, captureRunId: "older-run", requestStartedAt: 1, availableAt: 2, value: 99 }),
      row({ id: 2, validTime: firstValidAt, value: 8 }),
      row({ id: 3, validTime: secondValidAt, value: 12 }),
      row({ id: 4, captureRunId: "aggregate-run", modelName: "best_match", modelId: null, value: 99 }),
    ];

    const forecasts = reconstructOfficialHourlyModelsFromArchive(archives, targetDate);

    expect(forecasts).toHaveLength(1);
    expect(forecasts[0]?.modelName).toBe(model.name);
    expect(forecasts[0]?.hours.map((hour) => hour.validAt)).toEqual([firstValidAt, secondValidAt]);
    expect(forecasts[0]?.hours.map((hour) => hour.hour)).toEqual([2, 2]);
    expect(forecasts[0]?.hours.map((hour) => hour.temperature)).toEqual([8, 12]);
  });
});

describe("computeOfficialHourlyForecast", () => {
  it("pondère l’historique exact, exclut Best Match et conserve les autres variables avec leur repli robuste", () => {
    const validArome = modelForecasts()[0]!;
    const mislabeledArome: HourlyModelForecast = {
      ...validArome,
      modelId: null,
      availableAt: availableAt + 60_000,
      hours: [{ ...validArome.hours[0], temperature: 99 }],
    };
    const result = computeOfficialHourlyForecast(
      [...modelForecasts(), bestMatchForecast(), mislabeledArome],
      historicalScores(),
    );

    expect(result.hours).toHaveLength(1);
    expect(result.hours[0].multiModelMetrics?.temperature.availableModelCount).toBe(7);
    expect(result.hours[0].multiModelMetrics?.source).toBe("official_seven_models");
    expect(result.hours[0].multiModelMetrics?.bestMatchIncluded).toBe(false);
    expect(result.hours[0].multiModelMetrics?.temperature.min).toBe(8);
    expect(result.hours[0].multiModelMetrics?.temperature.max).toBe(14);
    expect(result.hours[0].multiModelMetrics?.temperature.median).toBe(11);
    expect(result.hours[0].multiModelMetrics?.temperature.standardDeviation).toBeCloseTo(2, 10);
    expect(result.hours[0].multiModelMetrics?.temperature.range).toBe(6);
    expect(result.hours[0].multiModelMetrics?.dispersion.windSpeed.standardDeviation).toBeCloseTo(2, 10);
    expect(result.hours[0].multiModelMetrics?.dispersion.windGust.standardDeviation).toBeCloseTo(2, 10);
    expect(result.hours[0].multiModelMetrics?.dispersion.windDirection.standardDeviation).toBeNull();
    expect(result.hours[0].multiModelMetrics?.temperature.weightedMean).toBe(result.hours[0].temp);
    expect(result.hours[0].multiModelMetrics?.modelsExpected).toEqual(OFFICIAL_HOURLY_MODELS.map((model) => model.name));
    expect(result.hours[0].temp).toBeLessThan(11);
    expect(result.hours[0].forecastWeighting?.method).toBe("mixed");
    expect(result.hours[0].forecastWeighting?.horizonBucket).toBe("6_24h");
    expect(result.hours[0].forecastWeighting?.scoredVariables).toEqual(["temperature"]);
    expect(result.hours[0].forecastWeighting?.unavailableVariables).toEqual([]);
    expect(result.hours[0].forecastWeighting?.robustVariables).toContain("wind_speed");
    expect(result.hours[0].forecastWeighting?.variableWeightings).toHaveLength(6);
    expect(result.hours[0].precipitation).toBeCloseTo(0.4 / 7, 10);
    expect(result.hours[0].multiModelMetrics?.precipitation).toMatchObject({
      thresholdMm: 0.1,
      rainModelCount: 1,
      availableModelCount: 7,
      conditionalMeanMm: 0.4,
      isProbabilityCalibrated: false,
    });
    expect(result.hours[0].multiModelMetrics?.precipitation.consensusEstimateMm).toBeCloseTo(0.4 / 7, 10);
    expect(result.hours[0].multiModelMetrics?.precipitation.frequencyPercent).toBeCloseTo(100 / 7, 10);
    expect(result.hours[0].windSpeed).not.toBeNull();
    expect(result.hours[0].apparentTemp).toBeNull();
    expect(variableWeighting(result, "temperature")).toMatchObject({
      availableModelCount: 7,
      contributingModelCount: 7,
      coverageLevel: "BROAD",
    });
    const weights = variableWeighting(result, "temperature")?.modelWeights ?? [];
    expect(weights).toHaveLength(7);
    expect(weights.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(1, 10);
    expect(weights.find((item) => item.modelName === "AROME")!.weight)
      .toBeGreaterThan(weights.find((item) => item.modelName === "UKMET")!.weight);
    expect(Math.max(...weights.map((item) => item.weight))).toBeLessThan(0.25);
    expect(Math.min(...weights.map((item) => item.weight))).toBeGreaterThan(0.08);
    expect(result.weighting.bestMatchIncluded).toBe(false);
    expect(result.weighting.modelsConsidered).toEqual(OFFICIAL_HOURLY_MODELS.map((model) => model.name));
    expect(result.weighting.horizons.find((row) => row.variable === "temperature")?.coverageLevelCounts).toEqual({
      NONE: 0,
      SINGLE_MODEL: 0,
      LIMITED: 0,
      MODERATE: 0,
      BROAD: 1,
    });
    expect(result.weighting.modelsConsidered).not.toContain("best_match");
    expect(result.weighting.modelsWithData).toHaveLength(7);
    expect(result.weighting.status).toBe("mixed");
  });

  it("calcule la quantité conditionnelle uniquement parmi les modèles pluvieux et avec leurs poids historiques", () => {
    const forecasts = modelForecasts().map((model, index) => ({
      ...model,
      hours: [{ ...model.hours[0], precipitation: index === 1 ? 0.1 : index === 6 ? 0.4 : 0 }],
    }));
    const result = computeOfficialHourlyForecast(forecasts, [
      ...historicalScores("temperature"),
      ...historicalScores("precipitation"),
    ]);
    const metrics = result.hours[0].multiModelMetrics!.precipitation;
    const weights = variableWeighting(result, "precipitation")!.modelWeights;
    const arpegeWeight = weights.find((item) => item.modelName === OFFICIAL_HOURLY_MODELS[1]!.name)!.weight;
    const ukmetWeight = weights.find((item) => item.modelName === OFFICIAL_HOURLY_MODELS[6]!.name)!.weight;

    expect(metrics).toMatchObject({
      rainModelCount: 2,
      availableModelCount: 7,
      frequencyPercent: (2 / 7) * 100,
      modelsPredictingRain: [OFFICIAL_HOURLY_MODELS[1]!.name, OFFICIAL_HOURLY_MODELS[6]!.name],
    });
    expect(metrics.conditionalMeanMm).toBeCloseTo((0.1 * arpegeWeight + 0.4 * ukmetWeight) / (arpegeWeight + ukmetWeight), 10);
    expect(metrics.consensusEstimateMm).toBeCloseTo((2 / 7) * metrics.conditionalMeanMm!, 10);
    expect(result.hours[0]!.precipitation).toBeCloseTo(metrics.consensusEstimateMm!, 10);
  });

  it("exclut null et non-finis, mais conserve zéro et le seuil de pluie de 0,1 mm", () => {
    const forecasts = modelForecasts().map((model, index) => ({
      ...model,
      hours: [{
        ...model.hours[0],
        temperature: index === 0 ? 0 : index === 1 ? null : index === 2 ? Number.NaN : 10 + index,
        precipitation: index === 0 ? 0 : index === 1 ? 0.1 : index === 2 ? 0.3 : index === 3 ? null : 0,
      }],
    }));
    const result = computeOfficialHourlyForecast(forecasts, [
      ...historicalScores("temperature"),
      ...historicalScores("precipitation"),
    ]);
    const metrics = result.hours[0].multiModelMetrics!;

    expect(metrics.temperature).toMatchObject({ min: 0, max: 16, median: 14, range: 16, availableModelCount: 5 });
    expect(metrics.temperature.modelsWithData).toEqual([
      OFFICIAL_HOURLY_MODELS[0]!.name,
      OFFICIAL_HOURLY_MODELS[3]!.name,
      OFFICIAL_HOURLY_MODELS[4]!.name,
      OFFICIAL_HOURLY_MODELS[5]!.name,
      OFFICIAL_HOURLY_MODELS[6]!.name,
    ]);
    expect(metrics.precipitation).toMatchObject({
      rainModelCount: 2,
      availableModelCount: 6,
      frequencyPercent: (2 / 6) * 100,
      modelsWithData: OFFICIAL_HOURLY_MODELS.filter((_, index) => index !== 3).map((model) => model.name),
      modelsPredictingRain: [OFFICIAL_HOURLY_MODELS[1]!.name, OFFICIAL_HOURLY_MODELS[2]!.name],
    });
    expect(metrics.precipitation.conditionalMeanMm).not.toBeNull();
  });

  it("ne calcule pas de dispersion avec un seul modèle température valide", () => {
    const forecasts = modelForecasts().map((model, index) => ({
      ...model,
      hours: [{ ...model.hours[0], temperature: index === 0 ? 0 : null }],
    }));
    const result = computeOfficialHourlyForecast(forecasts, historicalScores());

    expect(result.hours[0].multiModelMetrics?.temperature).toMatchObject({
      min: 0,
      max: 0,
      median: 0,
      weightedMean: 0,
      standardDeviation: null,
      range: null,
      availableModelCount: 1,
    });
  });

  it("conserve les valeurs et qualifie la preuve sous le seuil comme partielle", () => {
    const result = computeOfficialHourlyForecast(modelForecasts(), historicalScores("temperature", "6_24h", undefined, 4));
    const temperatureWeighting = variableWeighting(result, "temperature");

    expect(result.weighting.status).toBe("mixed");
    expect(result.hours[0].temp).not.toBeNull();
    expect(temperatureWeighting?.method).toBe("mixed");
    expect(temperatureWeighting?.availabilityStatus).toBe("FUSED");
    expect(temperatureWeighting?.calibrationStatus).toBe("PARTIALLY_CALIBRATED");
    expect(temperatureWeighting?.unavailableReason).toBeNull();
    expect(temperatureWeighting?.modelsWithData).toHaveLength(7);
    expect(temperatureWeighting?.modelWeights).toHaveLength(7);
    expect(result.hours[0].forecastWeighting?.method).toBe("mixed");
  });

  it("n’exclut pas les autres modèles si un seul modèle manque d’historique qualifié", () => {
    const scores = historicalScores().filter((score) => score.modelName !== "UKMET");
    const result = computeOfficialHourlyForecast(modelForecasts(), scores);

    expect(result.hours[0].temp).not.toBeNull();
    expect(variableWeighting(result, "temperature")?.availabilityStatus).toBe("FUSED");
    expect(variableWeighting(result, "temperature")?.calibrationStatus).toBe("PARTIALLY_CALIBRATED");
    expect(variableWeighting(result, "temperature")?.modelWeights).toHaveLength(7);
    expect(variableWeighting(result, "temperature")?.calibrationReasons.some((reason) => reason.modelName === "UKMET")).toBe(true);
    expect(variableWeighting(result, "temperature")?.modelsWithData).toHaveLength(7);
  });

  it("n’emprunte pas les scores d’un autre bucket et garde un repli robuste exact à cet horizon", () => {
    const nearForecasts = modelForecasts(validAt, validAt - 60 * 60_000);
    const result = computeOfficialHourlyForecast(nearForecasts, historicalScores());

    expect(result.hours[0].forecastWeighting?.horizonBucket).toBe("0_2h");
    expect(result.hours[0].temp).not.toBeNull();
    expect(variableWeighting(result, "temperature")?.calibrationStatus).toBe("UNCALIBRATED_ROBUST");
    expect(variableWeighting(result, "temperature")?.modelWeights).toHaveLength(7);
  });

  it("calcule des poids propres à chaque variable et conserve le seuil de régularisation", () => {
    const scores = [
      ...historicalScores("temperature", "6_24h", (index) => 0.5 + index * 0.35),
      ...historicalScores("wind_speed", "6_24h", (index) => 0.5 + (6 - index) * 0.35),
    ];
    const result = computeOfficialHourlyForecast(modelForecasts(), scores);
    const temperatureWeights = variableWeighting(result, "temperature")?.modelWeights ?? [];
    const windWeights = variableWeighting(result, "wind_speed")?.modelWeights ?? [];
    const aromeTemperature = temperatureWeights.find((item) => item.modelName === "AROME")!.weight;
    const ukmetTemperature = temperatureWeights.find((item) => item.modelName === "UKMET")!.weight;
    const aromeWind = windWeights.find((item) => item.modelName === "AROME")!.weight;
    const ukmetWind = windWeights.find((item) => item.modelName === "UKMET")!.weight;

    expect(result.hours[0].temp).not.toBeNull();
    expect(result.hours[0].windSpeed).not.toBeNull();
    expect(aromeTemperature).toBeGreaterThan(ukmetTemperature);
    expect(aromeWind).toBeLessThan(ukmetWind);
    expect(temperatureWeights).not.toEqual(windWeights);
    expect(variableWeighting(result, "wind_speed")?.minimumComparisons).toBe(35);
    expect(variableWeighting(result, "wind_speed")?.minimumComparableDays).toBe(7);
  });

  it("n’utilise pas l’historique d’une autre variable ou échéance et garde le vent en repli robuste", () => {
    const scores = [
      ...historicalScores("temperature", "6_24h"),
      ...historicalScores("wind_speed", "0_2h", (index) => 0.5 + index * 0.35),
    ];
    const result = computeOfficialHourlyForecast(modelForecasts(), scores);

    expect(result.hours[0].temp).not.toBeNull();
    expect(result.hours[0].windSpeed).not.toBeNull();
    expect(variableWeighting(result, "wind_speed")?.calibrationStatus).toBe("UNCALIBRATED_ROBUST");
    expect(variableWeighting(result, "wind_speed")?.unavailableReason).toBeNull();
  });

  it("publie une valeur single-model robuste sans la qualifier de fusion multimodèle", () => {
    const result = computeOfficialHourlyForecast(modelForecasts().slice(0, 1), [], {
      historyAvailable: false,
      referenceAt: availableAt,
    });

    expect(result.weighting.status).toBe("single_model");
    expect(result.weighting.availabilityStatus).toBe("SINGLE_MODEL");
    expect(result.weighting.calibrationStatus).toBe("UNCALIBRATED_ROBUST");
    expect(result.hours[0].forecastWeighting?.method).toBe("single_model");
    expect(result.hours[0].temp).toBe(8);
    expect(variableWeighting(result, "temperature")).toMatchObject({
      availableModelCount: 1,
      contributingModelCount: 1,
      coverageLevel: "SINGLE_MODEL",
    });
    expect(variableWeighting(result, "temperature")?.modelWeights[0]?.weight).toBe(1);
  });

  it("renormalise uniquement les poids historiques des modèles présents et liste les modèles manquants", () => {
    const forecasts = modelForecasts().filter((model) => model.modelName !== "UKMET");
    const result = computeOfficialHourlyForecast(forecasts, historicalScores());
    const weights = variableWeighting(result, "temperature")?.modelWeights ?? [];

    expect(result.hours[0].multiModelMetrics?.temperature.availableModelCount).toBe(6);
    expect(weights).toHaveLength(6);
    expect(weights.some((item) => item.modelName === "UKMET")).toBe(false);
    expect(variableWeighting(result, "temperature")?.modelsWithData).not.toContain("UKMET");
    expect(weights.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(1, 10);
  });

  it("pondère les échéances par bucket propre à chaque run au lieu d’exiger un horizon commun", () => {
    const forecasts = modelForecasts().map((model) => model.modelName === "UKMET"
      ? { ...model, availableAt: validAt - 60 * 60_000 }
      : model);
    const result = computeOfficialHourlyForecast(forecasts, historicalScores());

    expect(result.hours[0].forecastWeighting?.horizonBucket).toBeNull();
    expect(result.hours[0].temp).not.toBeNull();
    expect(variableWeighting(result, "temperature")?.availabilityStatus).toBe("FUSED");
    expect(variableWeighting(result, "temperature")?.modelWeights).toHaveLength(7);
    expect(variableWeighting(result, "temperature")?.calibrationReasons.some((reason) => reason.modelName === "UKMET")).toBe(true);
  });

  it("écarte les évaluations contemporaines ou futures pour éviter les fuites d’information", () => {
    const scores = historicalScores();
    scores.push(...OFFICIAL_HOURLY_MODELS.map((model) => ({
      date: "2026-10-01",
      sourceName: "open-meteo",
      modelName: model.name,
      modelId: model.modelId,
      variable: "temperature",
      horizonBucket: "6_24h",
      sampleSize: 1_000,
      mae: model.name === "UKMET" ? 0 : 100,
    })));
    const result = computeOfficialHourlyForecast(modelForecasts(), scores);

    expect(variableWeighting(result, "temperature")?.modelWeights.find((item) => item.modelName === "AROME")!.weight)
      .toBeGreaterThan(variableWeighting(result, "temperature")?.modelWeights.find((item) => item.modelName === "UKMET")!.weight ?? 0);
  });

  it("signale l’indisponibilité de l’historique et conserve les deux instants de l’heure répétée", () => {
    const firstRepeatedHour = Date.parse("2026-10-25T00:00:00.000Z");
    const secondRepeatedHour = Date.parse("2026-10-25T01:00:00.000Z");
    const repeatedForecasts = OFFICIAL_HOURLY_MODELS.map((model) => ({
      modelName: model.name,
      modelId: model.modelId,
      sourceName: "open-meteo",
      availableAt: firstRepeatedHour - 30 * 60_000,
      hours: [firstRepeatedHour, secondRepeatedHour].map((time) => ({
        validAt: time,
        hour: 2,
        temperature: 10,
        apparentTemperature: 10,
        precipitation: 0,
        windSpeed: 5,
        windGusts: 8,
        windDirection: 180,
        humidity: 80,
        pressure: 1012,
        cloudCover: 50,
        weatherCode: 2,
      })),
    }));
    const result = computeOfficialHourlyForecast(repeatedForecasts, [], {
      historyAvailable: false,
      referenceAt: firstRepeatedHour - 30 * 60_000,
    });

    expect(result.weighting.status).toBe("robust_fallback");
    expect(result.weighting.availabilityStatus).toBe("FUSED");
    expect(result.weighting.calibrationStatus).toBe("UNCALIBRATED_ROBUST");
    expect(result.hours).toHaveLength(2);
    expect(result.hours.map((hour) => hour.hour)).toEqual(["02:00", "02:00"]);
    expect(result.hours.map((hour) => hour.validAt)).toEqual([firstRepeatedHour, secondRepeatedHour]);
    expect(result.hours.every((hour) => hour.temp != null)).toBe(true);
    expect(result.hours.every((hour) => hour.forecastWeighting?.variableWeightings.every((item) =>
      item.availabilityStatus === "FUSED" && item.calibrationStatus === "UNCALIBRATED_ROBUST" && item.unavailableReason == null,
    ))).toBe(true);
  });
});
