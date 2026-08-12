import { describe, expect, it } from "vitest";
import { computeOfficialDailyForecast } from "./officialForecast";

const forecasts = [
  { serviceName: "Modèle précis", tempMax: 21, tempMin: 11, precipitation: 1.2, windSpeed: 12, windGust: 22, cloudCover: 35 },
  { serviceName: "Modèle incertain", tempMax: 25, tempMin: 15, precipitation: 5.4, windSpeed: 24, windGust: 40, cloudCover: 80 },
];

describe("computeOfficialDailyForecast", () => {
  it("produit une synthèse déterministe sans données simulées", () => {
    const performances = {
      "Modèle précis": { maeTemp: 0.5, maePrecip: 0.4, maeWind: 1, weightedScore: 90 },
      "Modèle incertain": { maeTemp: 2, maePrecip: 2, maeWind: 4, weightedScore: 70 },
    };

    const first = computeOfficialDailyForecast(forecasts, performances);
    const second = computeOfficialDailyForecast(forecasts, performances);

    expect(second).toEqual(first);
    expect(first.tempMax).toBeLessThan(23);
    expect(first.weights["Modèle précis"].tempWeight).toBeGreaterThan(
      first.weights["Modèle incertain"].tempWeight
    );
  });
});
