import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./weatherFetch", () => ({
  fetchWeather: vi.fn(),
  getWeatherResponseAttemptCount: vi.fn(() => 1),
}));

import { fetchWeather } from "./weatherFetch";
import { collect15DayForecast, collectCurrentWeatherSnapshot, collectHourlyForecast } from "./weatherServices";

const mockedFetchWeather = vi.mocked(fetchWeather);

function response(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

describe("collectHourlyForecast auxiliaire", () => {
  beforeEach(() => mockedFetchWeather.mockReset());

  it("préserve les prévisions des échéances active et future sans demander ni injecter current", async () => {
    mockedFetchWeather.mockResolvedValue(response({
      current: {
        time: Date.parse("2026-10-01T09:45:00.000Z") / 1000,
        temperature_2m: 99,
      },
      hourly: {
        time: [
          Date.parse("2026-10-01T08:00:00.000Z") / 1000,
          Date.parse("2026-10-01T09:00:00.000Z") / 1000,
          Date.parse("2026-10-01T10:00:00.000Z") / 1000,
        ],
        temperature_2m: [9, 11, 12],
        apparent_temperature: [9, 11, 12],
        precipitation: [0, 0, 0],
        wind_speed_10m: [0, 0, 0],
        wind_gusts_10m: [0, 0, 0],
        wind_direction_10m: [0, 0, 0],
        cloud_cover: [0, 0, 0],
        relative_humidity_2m: [0, 0, 0],
        uv_index: [0, 0, 0],
        surface_pressure: [1013, 1013, 1013],
        dew_point_2m: [0, 0, 0],
        visibility: [0, 0, 0],
        shortwave_radiation: [0, 0, 0],
        weather_code: [0, 0, 0],
      },
    }));

    const hours = await collectHourlyForecast(
      "2026-10-01",
      { lat: 50.7567, lon: 2.5204 },
      1,
      { now: Date.parse("2026-10-01T09:30:00.000Z") },
    );

    expect(mockedFetchWeather).toHaveBeenCalledTimes(1);
    const request = new URL(String(mockedFetchWeather.mock.calls[0]?.[0]));
    expect(request.searchParams.has("current")).toBe(false);
    expect(request.searchParams.get("timeformat")).toBe("unixtime");
    expect(hours.map(({ hour, temp, validAt }) => [hour, temp, validAt])).toEqual([
      ["11:00", 11, Date.parse("2026-10-01T09:00:00.000Z")],
      ["12:00", 12, Date.parse("2026-10-01T10:00:00.000Z")],
    ]);
    expect(hours[0]?.multiModelMetrics).toBeUndefined();
  });

  it("retourne le snapshot current avec une provenance modèle explicite", async () => {
    mockedFetchWeather.mockResolvedValue(response({
      current: {
        time: Date.parse("2026-10-01T09:45:00.000Z") / 1000,
        temperature_2m: 19,
        apparent_temperature: 18,
        precipitation: 0,
        wind_speed_10m: 6,
        wind_gusts_10m: 9,
        wind_direction_10m: 180,
        cloud_cover: 20,
        relative_humidity_2m: 60,
        weather_code: 1,
      },
    }));

    const snapshot = await collectCurrentWeatherSnapshot({ lat: 50.7567, lon: 2.5204 });
    const request = new URL(String(mockedFetchWeather.mock.calls[0]?.[0]));

    expect(request.searchParams.has("current")).toBe(true);
    expect(request.searchParams.has("hourly")).toBe(false);
    expect(snapshot).toMatchObject({
      sourceKind: "model_current_snapshot",
      source: "open-meteo",
      capturedAt: "2026-10-01T09:45:00.000Z",
      temp: 19,
      apparentTemp: 18,
    });
  });

  it("conserve les deux échéances 02:00 distinctes lors du retour à l’heure d’hiver", async () => {
    mockedFetchWeather.mockResolvedValue(response({
      hourly: {
        time: [
          Date.parse("2026-10-24T23:00:00.000Z") / 1000,
          Date.parse("2026-10-25T00:00:00.000Z") / 1000,
          Date.parse("2026-10-25T01:00:00.000Z") / 1000,
        ],
        temperature_2m: [9, 10, 11],
      },
    }));

    const hours = await collectHourlyForecast(
      "2026-10-25",
      { lat: 50.7567, lon: 2.5204 },
      1,
      { now: Date.parse("2026-10-25T00:30:00.000Z") },
    );

    expect(hours.map(({ date, hour, temp, validAt }) => [date, hour, temp, validAt])).toEqual([
      ["2026-10-25", "02:00", 10, Date.parse("2026-10-25T00:00:00.000Z")],
      ["2026-10-25", "02:00", 11, Date.parse("2026-10-25T01:00:00.000Z")],
    ]);
  });
});

describe("collect15DayForecast consensus de précipitations", () => {
  beforeEach(() => mockedFetchWeather.mockReset());

  it("compte les seuls modèles indépendants avec des données et expose le calcul dérivé", async () => {
    const dailyResponse = (amount: number) => response({
      daily: {
        time: ["2026-10-03"],
        precipitation_sum: [amount],
      },
    });
    mockedFetchWeather
      .mockResolvedValueOnce(dailyResponse(0))
      .mockResolvedValueOnce(dailyResponse(0.1))
      .mockResolvedValueOnce(dailyResponse(0.4))
      .mockResolvedValueOnce(dailyResponse(99));

    const result = await collect15DayForecast();
    const day = result.days[0]!;
    const summary = day.precipitationConsensus!;

    expect(result.modelsUsed).toContain("Open-Meteo");
    expect(summary).toMatchObject({
      thresholdMm: 0.1,
      expectedModelCount: 3,
      availableModelCount: 3,
      rainModelCount: 2,
      frequencyPercent: (2 / 3) * 100,
      conditionalMeanMm: 0.25,
      conditionalMeanMethod: "arithmetic_mean",
      modelsExpected: ["ECMWF", "GFS", "ICON"],
      modelsWithData: ["ECMWF", "GFS", "ICON"],
      modelsPredictingRain: ["GFS", "ICON"],
      isProbabilityCalibrated: false,
    });
    expect(summary.consensusEstimateMm).toBeCloseTo((2 / 3) * 0.25, 12);
    expect(summary.modelValues.map(({ modelName, amountMm }) => [modelName, amountMm])).toEqual([
      ["ECMWF", 0],
      ["GFS", 0.1],
      ["ICON", 0.4],
    ]);
    expect(day.precipitation).toBe(0.2);
  });
});
