import { describe, expect, it } from "vitest";
import { computeOfficialDailyForecast } from "./officialForecast";

const forecasts = [
  { serviceName: "Modèle précis", tempMax: 21, tempMin: 11, precipitation: 1.2, windSpeed: 12, windGust: 22, cloudCover: 35 },
  { serviceName: "Modèle incertain", tempMax: 25, tempMin: 15, precipitation: 5.4, windSpeed: 24, windGust: 40, cloudCover: 80 },
];

describe("computeOfficialDailyForecast", () => {
  it("produit une synthèse déterministe sans données simulées", () => {
    const performances = {
      "Modèle précis": { maeTemp: 0.5, maePrecip: 0.4, maeWind: 1, maeCloud: 2, weightedScore: 90 },
      "Modèle incertain": { maeTemp: 2, maePrecip: 2, maeWind: 4, maeCloud: 18, weightedScore: 70 },
    };

    const first = computeOfficialDailyForecast(forecasts, performances);
    const second = computeOfficialDailyForecast(forecasts, performances);

    expect(second.tempMax).toBe(first.tempMax);
    expect(second.tempMin).toBe(first.tempMin);
    expect(second.precipitation).toBe(first.precipitation);
    expect(second.windSpeed).toBe(first.windSpeed);
    expect(second.weights).toEqual(first.weights);
    expect(second.trace.parameterSources).toEqual(first.trace.parameterSources);
    expect(first.tempMax).toBeLessThan(23);
    expect(first.weights["Modèle précis"].tempWeight).toBeGreaterThan(
      first.weights["Modèle incertain"].tempWeight
    );
    expect(first.trace.parameterSources.temperature.map((source) => source.name)).toEqual([
      "Modèle précis",
      "Modèle incertain",
    ]);
    expect(first.trace.parameterSources.temperature.reduce((sum, source) => sum + source.finalWeight, 0)).toBeCloseTo(1, 8);
    expect(first.trace.parameterSources.precipitation.reduce((sum, source) => sum + source.finalWeight, 0)).toBeCloseTo(1, 8);
    expect(first.trace.parameterSources.wind.reduce((sum, source) => sum + source.finalWeight, 0)).toBeCloseTo(1, 8);
    expect(first.cloudCover).toBeLessThan(57.5);
  });

  it("départage chaque paramètre avec son propre historique, pas avec le score global", () => {
    const result = computeOfficialDailyForecast([
      { serviceName: "Fort en température", tempMax: 20, tempMin: 10, precipitation: 8, windSpeed: 25 },
      { serviceName: "Fort en pluie", tempMax: 28, tempMin: 18, precipitation: 1, windSpeed: 25 },
    ], {
      "Fort en température": { maeTemp: 0.1, maePrecip: 10, maeWind: 4, weightedScore: 95 },
      "Fort en pluie": { maeTemp: 5, maePrecip: 0.1, maeWind: 4, weightedScore: 20 },
    });

    expect(result.weights["Fort en température"].tempWeight).toBeGreaterThan(
      result.weights["Fort en pluie"].tempWeight,
    );
    expect(result.weights["Fort en pluie"].precipWeight).toBeGreaterThan(
      result.weights["Fort en température"].precipWeight,
    );
  });
});
