import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./weatherFetch", () => ({ fetchWeather: vi.fn() }));

import { fetchWeather } from "./weatherFetch";
import { collectHourlyForecastAllModels } from "./weatherServices";

const mockedFetchWeather = vi.mocked(fetchWeather);

describe("collectHourlyForecastAllModels immutable run metadata", () => {
  beforeEach(() => {
    mockedFetchWeather.mockReset();
  });

  it("uses Unix valid times and preserves both repeated Paris 02:00 instants", async () => {
    const unixTimes = [
      Date.parse("2026-10-25T00:00:00Z") / 1000,
      Date.parse("2026-10-25T01:00:00Z") / 1000,
      Date.parse("2026-10-25T02:00:00Z") / 1000,
    ];
    const responseData = {
      timezone: "Europe/Paris",
      utc_offset_seconds: 3600,
      hourly_units: {
        temperature_2m: "°C", apparent_temperature: "°C", precipitation: "mm",
        wind_speed_10m: "km/h", wind_gusts_10m: "km/h", wind_direction_10m: "°",
        relative_humidity_2m: "%", surface_pressure: "hPa", cloud_cover: "%", weather_code: "wmo code",
      },
      hourly: {
        time: unixTimes,
        temperature_2m: [10, 11, 12],
        apparent_temperature: [9, 10, 11],
        precipitation: [0, 0.1, 0],
        wind_speed_10m: [5, 6, 7],
        wind_gusts_10m: [9, 10, 11],
        wind_direction_10m: [180, 190, 200],
        relative_humidity_2m: [80, 81, 82],
        surface_pressure: [1012, 1011, 1010],
        cloud_cover: [50, 55, 60],
        weather_code: [1, 2, 3],
      },
    };
    mockedFetchWeather.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => responseData,
    } as Response);

    const forecasts = await collectHourlyForecastAllModels(
      "2026-10-25",
      { lat: 50.7567, lon: 2.5204 },
      { includeBestMatch: false },
    );

    expect(forecasts).toHaveLength(7);
    expect(forecasts[0].hours.map((hour) => hour.hour)).toEqual([2, 2, 3]);
    expect(forecasts[0].hours.map((hour) => hour.validAt)).toEqual(unixTimes.map((value) => value * 1000));
    expect(new Set(forecasts.map((forecast) => forecast.captureRunId)).size).toBe(7);
    expect(forecasts.every((forecast) => forecast.sourceName === "open-meteo" && forecast.availableAt >= forecast.requestStartedAt)).toBe(true);

    const requestUrls = mockedFetchWeather.mock.calls.map(([input]) => new URL(String(input)));
    expect(requestUrls).toHaveLength(7);
    expect(requestUrls.every((url) => url.searchParams.get("timeformat") === "unixtime")).toBe(true);
    expect(requestUrls.every((url) => url.searchParams.get("timezone") === "Europe/Paris")).toBe(true);
  });
});
