import { describe, expect, it } from "vitest";
import { scorePersonalModelObservation, updatePersonalCalibration } from "./personalCalibration";

describe("calibration par observation personnelle", () => {
  it("favorise le modèle dont la température et la condition correspondent", () => {
    const observation = { temperature: 24, condition: "partly_cloudy" as const, windSpeed: null };
    const close = scorePersonalModelObservation(observation, { temperature: 23.5, windSpeed: null, weatherCode: 2, cloudCover: 65 });
    const distant = scorePersonalModelObservation(observation, { temperature: 26, windSpeed: null, weatherCode: 0, cloudCover: 0 });
    expect(close.overallScore).toBeGreaterThan(distant.overallScore);
    expect(close.conditionScore).toBe(100);
  });

  it("n’accorde aucune influence opérationnelle avant le seuil de preuve", () => {
    const result = scorePersonalModelObservation({ temperature: 24, condition: "overcast", windSpeed: null }, { temperature: 24, windSpeed: null, weatherCode: 3, cloudCover: 100 });
    const early = updatePersonalCalibration(undefined, result);
    const qualified = updatePersonalCalibration({ comparisonCount: 49, scoreEma: 100, temperatureMaeEma: 0, conditionScoreEma: 100, windScoreEma: null }, result);
    expect(early).toMatchObject({ evidenceState: "insufficient", weightMultiplier: 1 });
    expect(qualified.evidenceState).toBe("qualified");
    expect(qualified.weightMultiplier).toBeGreaterThan(1);
  });
});
