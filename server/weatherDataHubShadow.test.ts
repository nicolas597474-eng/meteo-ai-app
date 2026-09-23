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

  it("normalizes daily values with canonical units and a shadow horizon based on ingestion time", () => {
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
      rawData: {
        timezone: "Europe/Paris",
        daily_units: {
          temperature_2m_max: "°C",
          temperature_2m_min: "°C",
          precipitation_sum: "mm",
          wind_speed_10m_max: "km/h",
          wind_gusts_10m_max: "km/h",
          relative_humidity_2m_mean: "%",
          cloud_cover_mean: "%",
        },
      },
    }, context);
    expect(values).toHaveLength(7);
    expect(values.find(value => value.variable === "air_temperature_max")).toMatchObject({ value: 20, unit: "Cel", qualityStatus: "VALID" });
    expect(values.find(value => value.variable === "precipitation_amount")).toMatchObject({ value: null, missingData: 1, qualityStatus: "MISSING" });
    expect(values.every(value => value.forecastHorizonMinutes === 420)).toBe(true);
    expect(values.every(value => value.qcFlags.includes("horizon_from_ingestion_time"))).toBe(true);
    expect(values.every(value => value.qcFlags.includes("provider_run_time_unknown"))).toBe(true);
    expect(values.find(value => value.variable === "air_temperature_max")?.normalizationMetadata).toMatchObject({
      version: "phase4-data-normalization-v1",
      status: "NORMALIZED",
      sourceUnit: "°C",
      canonicalUnit: "Cel",
      conversion: "celsius_identity",
      sourceTimezone: "Europe/Paris",
      coordinateStatus: "VALID",
      appliedToProduction: 0,
    });
  });

  it("reuses the received daily payload through fifteen days without a new provider call", () => {
    const dates = Array.from({ length: 16 }, (_, index) => `2026-09-${String(index + 2).padStart(2, "0")}`);
    const series = dates.map((_, index) => index + 1);
    const values = normalizeDailyForecastToShadow({
      serviceName: "ECMWF",
      serviceCategory: "expert",
      tempMax: 20,
      tempMin: 12,
      precipitation: 0,
      windSpeed: 18,
      windGust: 31,
      humidity: 76,
      cloudCover: 50,
      condition: null,
      rawData: {
        timezone: "Europe/Paris",
        daily_units: {
          temperature_2m_max: "°C",
          temperature_2m_min: "°C",
          precipitation_sum: "mm",
          wind_speed_10m_max: "km/h",
          wind_gusts_10m_max: "km/h",
          relative_humidity_2m_mean: "%",
          cloud_cover_mean: "%",
        },
        daily: {
          time: dates,
          temperature_2m_max: series,
          temperature_2m_min: series,
          precipitation_sum: series,
          wind_speed_10m_max: series,
          wind_gusts_10m_max: series,
          relative_humidity_2m_mean: series,
          cloud_cover_mean: series,
        },
      },
    }, context);

    expect(values).toHaveLength(15 * 7);
    expect(values[0]?.forecastHorizonMinutes).toBe(420);
    expect(values.at(-1)?.forecastHorizonMinutes).toBe(20_580);
    expect(values.every(value => value.qcFlags.includes("phase3_horizon"))).toBe(true);
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
      sourceMetadata: {
        timezone: "Europe/Paris",
        utcOffsetSeconds: 7200,
        units: {
          temperature: "°C",
          apparentTemperature: "°C",
          precipitation: "mm",
          windSpeed: "km/h",
          windGusts: "km/h",
          windDirection: "°",
          humidity: "%",
          pressure: "hPa",
          cloudCover: "%",
          weatherCode: "wmo code",
        },
      },
    }, context);
    expect(values).toHaveLength(10);
    expect(values.find(value => value.variable === "air_pressure_surface")).toMatchObject({
      value: 1018,
      unit: "hPa",
      normalizationMetadata: { status: "NORMALIZED", sourceUnit: "hPa", canonicalUnit: "hPa" },
    });
    expect(values.find(value => value.variable === "wind_direction_10m")?.normalizationMetadata.cardinalDirection).toBe("O");
    expect(values.every(value => value.forecastHorizonMinutes === 120)).toBe(true);
    expect(values.every(value => value.freshnessStatus === "UNKNOWN")).toBe(true);
    expect(values.every(value => value.confidence === null)).toBe(true);
  });

  it("exclut les créneaux horaires déjà écoulés au lieu de leur attribuer un horizon nul", () => {
    const values = normalizeHourlyForecastToShadow({
      modelName: "best_match",
      hours: [{ hour: 4, temperature: 15, apparentTemperature: 15, precipitation: 0, windSpeed: 5, windGusts: 8, windDirection: 180, humidity: 70, pressure: 1015, cloudCover: 40, weatherCode: 1 }],
      sourceMetadata: { timezone: "Europe/Paris", utcOffsetSeconds: 7200, units: { temperature: "°C", apparentTemperature: "°C", precipitation: "mm", windSpeed: "km/h", windGusts: "km/h", windDirection: "°", humidity: "%", pressure: "hPa", cloudCover: "%", weatherCode: "wmo code" } },
    }, context);
    expect(values).toEqual([]);
  });

  it("never propagates a shadow write failure to production", async () => {
    await expect(executeShadowWriteSafely("test", async () => {
      throw new Error("shadow unavailable");
    })).resolves.toBeNull();
  });
});
