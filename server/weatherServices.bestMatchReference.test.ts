import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./weatherFetch", () => ({
  fetchWeather: vi.fn(),
  getWeatherResponseAttemptCount: vi.fn(() => 1),
}));

import { fetchWeather } from "./weatherFetch";
import { collect15DayForecast, collectHourlyForecast } from "./weatherServices";

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

  it("ne publie aucune métrique multi-modèle depuis Best Match et conserve les zéros valides", async () => {
    mockedFetchWeather.mockResolvedValue(response({
      hourly: {
        time: ["2026-10-01T12:00"],
        temperature_2m: [0],
        apparent_temperature: [0],
        precipitation: [0],
        wind_speed_10m: [0],
        wind_gusts_10m: [0],
        wind_direction_10m: [0],
        cloud_cover: [0],
        relative_humidity_2m: [0],
        uv_index: [0],
        surface_pressure: [1013],
        dew_point_2m: [0],
        visibility: [0],
        shortwave_radiation: [0],
        weather_code: [0],
      },
    }));

    const hours = await collectHourlyForecast(
      "2026-10-01",
      { lat: 50.7567, lon: 2.5204 },
      1,
      { includeCurrentSnapshot: false },
    );

    expect(mockedFetchWeather).toHaveBeenCalledTimes(1);
    expect(hours).toHaveLength(1);
    expect(hours[0]).toMatchObject({ temp: 0, precipitation: 0, windSpeed: 0, humidity: 0 });
    expect(hours[0]?.multiModelMetrics).toBeUndefined();
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
