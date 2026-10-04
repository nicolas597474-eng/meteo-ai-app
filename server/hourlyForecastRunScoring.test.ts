import { describe, expect, it } from "vitest";
import { evaluateHourlyForecastRuns, type HourlyForecastRunValue, type HourlyPhysicalSnapshot } from "./hourlyForecastRunScoring";
import { parisLocalHourToUniqueEpochMs } from "./parisHourlyTime";

const locationKey = "50.756_2.520";
const date = "2026-09-29";
const observedAt = (hour: number) => parisLocalHourToUniqueEpochMs(date, hour)!;

function snapshot(hour: number, temperature = 10): HourlyPhysicalSnapshot {
  return { locationKey, date, hour, stationCount: 2, temperature, precipitation: 0, windSpeed: 8, windGust: 12, humidity: 70, pressure: 1015 };
}

function forecast(input: Partial<HourlyForecastRunValue> & Pick<HourlyForecastRunValue, "captureRunId" | "validTime" | "availableAt" | "variable" | "value">): HourlyForecastRunValue {
  return {
    captureRunId: input.captureRunId,
    locationKey: input.locationKey ?? locationKey,
    targetDate: input.targetDate ?? date,
    sourceName: input.sourceName ?? "open-meteo",
    modelName: input.modelName ?? "ECMWF",
    modelId: input.modelId ?? "ecmwf_ifs025",
    requestStartedAt: input.requestStartedAt ?? input.availableAt - 30_000,
    availableAt: input.availableAt,
    validTime: input.validTime,
    variable: input.variable,
    value: input.value,
    unit: input.unit ?? "°C",
  };
}

function scoresFor(result: ReturnType<typeof evaluateHourlyForecastRuns>, variable = "temperature") {
  return result.scores.filter((score) => score.variable === variable);
}

describe("evaluateHourlyForecastRuns", () => {
  it("ignore un run reçu après l’observation et choisit le dernier run admissible", () => {
    const validTime = observedAt(12);
    const result = evaluateHourlyForecastRuns([snapshot(12)], [
      forecast({ captureRunId: "run-08", validTime, availableAt: validTime - 8 * 60 * 60_000, variable: "temperature", value: 8 }),
      forecast({ captureRunId: "run-10", validTime, availableAt: validTime - 4 * 60 * 60_000, variable: "temperature", value: 9 }),
      forecast({ captureRunId: "run-13", validTime, availableAt: validTime + 60_000, variable: "temperature", value: 100 }),
    ]);
    expect(scoresFor(result).find((score) => score.horizonBucket === "2_6h")).toMatchObject({ sampleSize: 1, mae: 1, bias: -1 });
    expect(scoresFor(result).find((score) => score.horizonBucket === "6_24h")?.sampleSize).toBe(0);
  });

  it("conserve plusieurs exécutions dans la journée et sépare les horizons Phase 3", () => {
    const hours = [9, 10, 11];
    const forecasts = hours.map((hour, index) => {
      const validTime = observedAt(hour);
      const leadHours = [1, 4, 12][index];
      return forecast({ captureRunId: `four-hour-run-${index}`, validTime, availableAt: validTime - leadHours * 60 * 60_000, variable: "temperature", value: 10 + index });
    });
    const result = evaluateHourlyForecastRuns(hours.map((hour) => snapshot(hour)), forecasts);
    expect(scoresFor(result).filter((score) => score.sampleSize > 0).map((score) => score.horizonBucket)).toEqual(["0_2h", "2_6h", "6_24h"]);
    expect(scoresFor(result).filter((score) => score.sampleSize > 0).every((score) => score.coverageRatio === 1)).toBe(true);
    expect(scoresFor(result).filter((score) => score.sampleSize === 0).every((score) => score.evaluableObservationCount === 0)).toBe(true);
  });

  it("classe le bucket depuis la durée exacte, sans arrondir une échéance proche de la frontière", () => {
    const validTime = observedAt(12);
    const result = evaluateHourlyForecastRuns([snapshot(12)], [
      forecast({
        captureRunId: "run-119-6",
        validTime,
        availableAt: validTime - 119.6 * 60_000,
        variable: "temperature",
        value: 12,
      }),
    ]);

    expect(scoresFor(result).find((score) => score.horizonBucket === "0_2h")).toMatchObject({ sampleSize: 1, mae: 2 });
    expect(scoresFor(result).find((score) => score.horizonBucket === "2_6h")?.sampleSize).toBe(0);
  });

  it("ne surcompte pas les doublons et retombe sur une valeur admissible quand le run récent est manquant", () => {
    const validTime = observedAt(12);
    const old = forecast({ captureRunId: "run-old", validTime, availableAt: validTime - 90 * 60_000, variable: "temperature", value: 11 });
    const result = evaluateHourlyForecastRuns([snapshot(12)], [
      old,
      { ...old },
      forecast({ captureRunId: "run-without-temp", validTime, availableAt: validTime - 60 * 60_000, variable: "temperature", value: null }),
    ]);
    expect(scoresFor(result).find((score) => score.horizonBucket === "0_2h")).toMatchObject({ sampleSize: 1, mae: 1, observationCount: 1 });
  });

  it("sépare la couverture des scores et exclut les échéances sans run exact du dénominateur", () => {
    const withValue = observedAt(12);
    const withNullValue = observedAt(13);
    const withoutRun = observedAt(14);
    const result = evaluateHourlyForecastRuns([snapshot(12), snapshot(13), snapshot(14)], [
      forecast({ captureRunId: "run-with-value", validTime: withValue, availableAt: withValue - 60 * 60_000, variable: "temperature", value: 12 }),
      forecast({ captureRunId: "run-with-null", validTime: withNullValue, availableAt: withNullValue - 60 * 60_000, variable: "temperature", value: null }),
    ]);
    expect(scoresFor(result).find((score) => score.horizonBucket === "0_2h")).toMatchObject({
      observationCount: 3,
      evaluableObservationCount: 2,
      sampleSize: 1,
      coverageRatio: 0.5,
      mae: 2,
    });
  });

  it("écarte un instant d’observation ambigu à l’heure répétée d’Europe/Paris", () => {
    const fallDate = "2026-10-25";
    const fallObservation: HourlyPhysicalSnapshot = { ...snapshot(2), date: fallDate, hour: 2 };
    const result = evaluateHourlyForecastRuns([fallObservation], [
      forecast({ captureRunId: "first-02", targetDate: fallDate, validTime: Date.parse("2026-10-25T00:00:00Z"), availableAt: Date.parse("2026-10-24T20:00:00Z"), variable: "temperature", value: 10 }),
      forecast({ captureRunId: "second-02", targetDate: fallDate, validTime: Date.parse("2026-10-25T01:00:00Z"), availableAt: Date.parse("2026-10-24T21:00:00Z"), variable: "temperature", value: 12 }),
    ]);
    expect(scoresFor(result).every((score) => score.sampleSize === 0 && score.evaluableObservationCount === 0)).toBe(true);
  });

  it("produit des compteurs et des scores propres à chaque variable", () => {
    const validTime = observedAt(12);
    const result = evaluateHourlyForecastRuns([snapshot(12)], [
      forecast({ captureRunId: "run-var", validTime, availableAt: validTime - 30 * 60_000, variable: "temperature", value: 12 }),
      forecast({ captureRunId: "run-var", validTime, availableAt: validTime - 30 * 60_000, variable: "precipitation", value: 0.5, unit: "mm" }),
    ]);
    expect(scoresFor(result, "temperature").find((score) => score.horizonBucket === "0_2h")).toMatchObject({ sampleSize: 1, observationCount: 1, evaluableObservationCount: 1, mae: 2 });
    expect(scoresFor(result, "precipitation").find((score) => score.horizonBucket === "0_2h")).toMatchObject({ sampleSize: 1, mae: 0.5 });
  });
});
