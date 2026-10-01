import { describe, expect, it } from "vitest";
import { OFFICIAL_HOURLY_MODELS, type HourlyModelForecast } from "./weatherServices";
import { computeOfficialHourlyForecast, type OfficialHourlyEvaluationHistoryScore } from "./officialHourlyForecast";

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
  horizonBucket = "6_24h",
  sampleSize = 5,
): OfficialHourlyEvaluationHistoryScore[] {
  return OFFICIAL_HOURLY_MODELS.flatMap((model, modelIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => ({
      date: `2026-09-${String(20 + dayIndex).padStart(2, "0")}`,
      sourceName: "open-meteo",
      modelName: model.name,
      modelId: model.modelId,
      variable: "temperature",
      horizonBucket,
      sampleSize,
      mae: 0.5 + modelIndex * 0.35,
    })),
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

describe("computeOfficialHourlyForecast", () => {
  it("applique des poids par modèle issus des MAE seulement après le seuil, sans Best Match", () => {
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
      { now: validAt - 30 * 60_000 },
    );

    expect(result.hours).toHaveLength(1);
    expect(result.hours[0].modelCount).toBe(7);
    expect(result.hours[0].temp).toBeLessThan(11);
    expect(result.hours[0].forecastWeighting?.method).toBe("historical_skill");
    expect(result.hours[0].forecastWeighting?.horizonBucket).toBe("6_24h");
    expect(result.hours[0].forecastWeighting?.scoredVariables).toEqual(["temperature"]);
    const weights = result.hours[0].forecastWeighting?.modelWeights ?? [];
    expect(weights).toHaveLength(7);
    expect(weights.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(1, 10);
    expect(weights.find((item) => item.modelName === "AROME")!.weight)
      .toBeGreaterThan(weights.find((item) => item.modelName === "UKMET")!.weight);
    expect(result.weighting.bestMatchIncluded).toBe(false);
    expect(result.weighting.modelsConsidered).not.toContain("best_match");
    expect(result.weighting.status).toBe("historical_skill");
  });

  it("utilise des poids égaux si l’échantillon n’atteint pas 30 comparaisons sur 7 jours", () => {
    const result = computeOfficialHourlyForecast(modelForecasts(), historicalScores("6_24h", 4));

    expect(result.weighting.status).toBe("equal_fallback");
    expect(result.hours[0].forecastWeighting?.method).toBe("equal_fallback");
    expect(result.hours[0].forecastWeighting?.fallbackReason).toBe("insufficient_historical_evidence");
    expect(result.hours[0].forecastWeighting?.modelWeights.every((item) => item.weight === 1 / 7)).toBe(true);
  });

  it("n’emprunte pas les scores d’un autre bucket d’échéance", () => {
    const nearForecasts = modelForecasts(validAt, validAt - 60 * 60_000);
    const result = computeOfficialHourlyForecast(nearForecasts, historicalScores("6_24h"));

    expect(result.hours[0].forecastWeighting?.horizonBucket).toBe("0_2h");
    expect(result.hours[0].forecastWeighting?.method).toBe("equal_fallback");
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

    expect(result.hours[0].forecastWeighting?.modelWeights.find((item) => item.modelName === "AROME")!.weight)
      .toBeGreaterThan(result.hours[0].forecastWeighting?.modelWeights.find((item) => item.modelName === "UKMET")!.weight ?? 0);
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
    const result = computeOfficialHourlyForecast(repeatedForecasts, [], { historyAvailable: false });

    expect(result.hours).toHaveLength(2);
    expect(result.hours.map((hour) => hour.hour)).toEqual(["02:00", "02:00"]);
    expect(result.hours.map((hour) => hour.validAt)).toEqual([firstRepeatedHour, secondRepeatedHour]);
    expect(result.weighting.historyStatus).toBe("unavailable");
    expect(result.hours.every((hour) => hour.forecastWeighting?.fallbackReason === "history_unavailable")).toBe(true);
  });
});
