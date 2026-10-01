import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("weather.getStationReliabilityOverview", () => {
  it("compare les stations au moteur horaire qualifié à sept modèles, sans Best Match ni projection locale", () => {
    const source = readFileSync(new URL("./weather.ts", import.meta.url), "utf8");
    const start = source.indexOf("getStationReliabilityOverview: publicProcedure");
    const end = source.indexOf("getReliabilityLaboratory: publicProcedure", start);
    const procedure = source.slice(start, end);

    expect(procedure).toContain("getHourlyForecastRunValues(locationKey, date)");
    expect(procedure).toContain("reconstructOfficialHourlyModelsFromArchive(hourlyRunValues, date)");
    expect(procedure).toContain("getHourlyForecastEvaluationHistory(");
    expect(procedure).toContain("computeOfficialHourlyForecast(");
    expect(procedure).toContain("buildStationForecastComparison24h(date, officialHourlyForecast.hours");
    expect(procedure).toContain("officialHourlyWeighting: officialHourlyForecast.weighting");
    expect(procedure).not.toContain('modelName === "best_match"');
    expect(procedure).not.toContain("getStoredHourlyForecasts");
  });
});

describe("weather.getLocalOfficialDeltaHistory", () => {
  it("utilise les archives horaires immuables et des valeurs déjà pondérées, jamais best_match", () => {
    const source = readFileSync(new URL("./weather.ts", import.meta.url), "utf8");
    const start = source.indexOf("getLocalOfficialDeltaHistory: publicProcedure");
    const end = source.indexOf("compareWeightSnapshots: publicProcedure", start);
    const procedure = source.slice(start, end);

    expect(procedure).toContain("getHourlyForecastRunValues(locationKey, today)");
    expect(procedure).toContain("getHourlyForecastRunValues(locationKey, yesterday)");
    expect(procedure).toContain("computeOfficialHourlyForecast(");
    expect(procedure).toContain("buildLocalOfficialDeltaHistory(readings, officialHourlyTemperatures)");
    expect(procedure).not.toContain("getStoredHourlyForecasts");
    expect(procedure).not.toContain('modelName === "best_match"');
  });
});
