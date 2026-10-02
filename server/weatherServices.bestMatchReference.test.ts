import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./weatherFetch", () => ({
  fetchWeather: vi.fn(),
  getWeatherResponseAttemptCount: vi.fn(() => 1),
}));

import { fetchWeather } from "./weatherFetch";
import { collectHourlyForecast } from "./weatherServices";

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
