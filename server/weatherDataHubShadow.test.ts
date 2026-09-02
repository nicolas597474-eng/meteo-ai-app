import { describe, expect, it } from "vitest";
import {
  executeShadowWriteSafely,
  normalizeDailyForecastToShadow,
  normalizeHourlyForecastToShadow,
  parisLocalDateTimeToEpochMs,
  resolveP1ShadowSourceKey,
} from "./weatherDataHubShadow";

const context = {
  locationKey: "50.756_2.438",
  latitude: 50.756,
  longitude: 2.438,
  targetDate: "2026-09-02",
  requestStartedAt: Date.parse("2026-09-02T03:00:00Z"),
  receivedAt: Date.parse("2026-09-02T03:00:02Z"),
};

describe("P1 shadow normalizer", () => {
  it("maps seven models and Best Match without public weather services", () => {
    expect(resolveP1ShadowSourceKey("AROME")).toBe("openmeteo_arome_france_hd");
    expect(resolveP1ShadowSourceKey("Open-Meteo")).toBe("openmeteo_best_match");
    expect(resolveP1ShadowSourceKey("best_match")).toBe("openmeteo_best_match");
    expect(resolveP1ShadowSourceKey("Météo-France")).toBeNull();
    expect(resolveP1ShadowSourceKey("OpenWeatherMap")).toBeNull();
  });

  it("converts Europe/Paris civil time independently of the server timezone", () => {
    expect(parisLocalDateTimeToEpochMs("2026-09-02", 12)).toBe(Date.parse("2026-09-02T10:00:00Z"));
    expect(parisLocalDateTimeToEpochMs("2026-01-15", 12)).toBe(Date.parse("2026-01-15T11:00:00Z"));
  });

  it("normalizes daily values with canonical units and unknown provider run time", () => {
    const values = normalizeDailyForecastToShadow({
      serviceName: "AROME",
      serviceCategory: "expert",
      tempMax: 20,
      tempMin: 12,
      precipitation: null,
      windSpeed: 18,
      windGust: 31,
      humidity: 76,
      cloudCover: 100,
      condition: null,
    }, context);
    expect(values).toHaveLength(7);
    expect(values.find(value => value.variable === "air_temperature_max")).toMatchObject({ value: 20, unit: "Cel", qualityStatus: "VALID" });
    expect(values.find(value => value.variable === "precipitation_amount")).toMatchObject({ value: null, missingData: 1, qualityStatus: "MISSING" });
    expect(values.every(value => value.forecastHorizonMinutes === null)).toBe(true);
    expect(values.every(value => value.qcFlags.includes("provider_run_time_unknown"))).toBe(true);
  });

  it("normalizes every hourly parameter without fabricating provider metadata", () => {
    const values = normalizeHourlyForecastToShadow({
      modelName: "best_match",
      hours: [{
        hour: 7,
        temperature: 15.6,
        apparentTemperature: 16.1,
        precipitation: 0.1,
        windSpeed: 8.3,
        windGusts: 30.2,
        windDirection: 270,
        humidity: 76,
        pressure: 1018,
        cloudCover: 100,
        weatherCode: 3,
      }],
    }, context);
    expect(values).toHaveLength(10);
    expect(values.find(value => value.variable === "air_pressure_msl")).toMatchObject({ value: 1018, unit: "hPa" });
    expect(values.every(value => value.freshnessStatus === "UNKNOWN")).toBe(true);
    expect(values.every(value => value.confidence === null)).toBe(true);
  });

  it("never propagates a shadow write failure to production", async () => {
    await expect(executeShadowWriteSafely("test", async () => {
      throw new Error("shadow unavailable");
    })).resolves.toBeNull();
  });
});
