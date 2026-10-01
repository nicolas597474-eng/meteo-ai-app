import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./weatherFetch", () => ({
  fetchWeather: vi.fn(),
  getWeatherResponseAttemptCount: vi.fn(() => 1),
}));

import { fetchWeather } from "./weatherFetch";
import { collectHourlyForecastAllModels, collectHourlyForecastAllModelsWithDiagnostics, OFFICIAL_HOURLY_MODELS } from "./weatherServices";

const mockedFetchWeather = vi.mocked(fetchWeather);
const unixTimes = [
  Date.parse("2026-10-25T00:00:00Z") / 1000,
  Date.parse("2026-10-25T01:00:00Z") / 1000,
  Date.parse("2026-10-25T02:00:00Z") / 1000,
];
const completeHourly = {
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
};
const completeResponse = () => ({
  timezone: "Europe/Paris",
  utc_offset_seconds: 3600,
  hourly_units: {
    temperature_2m: "°C", apparent_temperature: "°C", precipitation: "mm",
    wind_speed_10m: "km/h", wind_gusts_10m: "km/h", wind_direction_10m: "°",
    relative_humidity_2m: "%", surface_pressure: "hPa", cloud_cover: "%", weather_code: "wmo code",
  },
  hourly: structuredClone(completeHourly),
});
const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
}) as Response;

describe("collectHourlyForecastAllModels immutable run metadata", () => {
  beforeEach(() => {
    mockedFetchWeather.mockReset();
  });

  it("uses Unix valid times and preserves both repeated Paris 02:00 instants", async () => {
    mockedFetchWeather.mockResolvedValue(response(completeResponse()));

    const result = await collectHourlyForecastAllModelsWithDiagnostics(
      "2026-10-25",
      { lat: 50.7567, lon: 2.5204 },
      { includeBestMatch: false },
    );
    const forecasts = result.forecasts;

    expect(forecasts).toHaveLength(7);
    expect(result.diagnostics).toHaveLength(7);
    expect(result.diagnostics.every((item) => item.status === "succeeded" && item.hoursReceived === 3 && item.valuesReceived === 18 && item.expectedValueCount === 18)).toBe(true);
    expect(forecasts[0].hours.map((hour) => hour.hour)).toEqual([2, 2, 3]);
    expect(forecasts[0].hours.map((hour) => hour.validAt)).toEqual(unixTimes.map((value) => value * 1000));
    expect(new Set(forecasts.map((forecast) => forecast.captureRunId)).size).toBe(7);
    expect(forecasts.every((forecast) => forecast.sourceName === "open-meteo" && forecast.availableAt! >= forecast.requestStartedAt!)).toBe(true);

    const requestUrls = mockedFetchWeather.mock.calls.map(([input]) => new URL(String(input)));
    expect(requestUrls).toHaveLength(7);
    expect(requestUrls.map((url) => url.searchParams.get("models")).sort()).toEqual(OFFICIAL_HOURLY_MODELS.map(({ modelId }) => modelId).sort());
    expect(requestUrls.every((url) => url.searchParams.get("timeformat") === "unixtime")).toBe(true);
    expect(requestUrls.every((url) => url.searchParams.get("timezone") === "Europe/Paris")).toBe(true);
  });

  it("retries only incomplete providers and preserves successful sources when another returns HTTP errors", async () => {
    const modelIds = OFFICIAL_HOURLY_MODELS.map(({ modelId }) => modelId);
    const callsByModel = new Map<string, number>();
    mockedFetchWeather.mockImplementation(async (input) => {
      const modelId = new URL(String(input)).searchParams.get("models")!;
      const count = (callsByModel.get(modelId) ?? 0) + 1;
      callsByModel.set(modelId, count);
      if (modelId === modelIds[0] && count === 1) {
        return response({ hourly: { time: unixTimes, temperature_2m: [10, 11, 12] } });
      }
      if (modelId === modelIds[1]) return response({ error: "private/raw upstream body must not be stored" }, 503);
      return response(completeResponse());
    });

    const result = await collectHourlyForecastAllModelsWithDiagnostics(
      "2026-10-25",
      { lat: 50.7567, lon: 2.5204 },
      { includeBestMatch: false },
    );

    expect(result.diagnostics).toHaveLength(7);
    expect(result.forecasts).toHaveLength(6);
    expect(result.diagnostics.find((item) => item.modelId === modelIds[0])).toMatchObject({ status: "succeeded", attemptCount: 2 });
    expect(result.diagnostics.find((item) => item.modelId === modelIds[1])).toMatchObject({ status: "failed", errorCode: "provider_http_5xx", attemptCount: 2 });
    expect(result.diagnostics.filter((item) => item.status === "succeeded")).toHaveLength(6);
    expect(mockedFetchWeather).toHaveBeenCalledTimes(9);
    expect(JSON.stringify(result.diagnostics)).not.toContain("private/raw upstream body");
  });

  it("classifies provider timeouts and malformed JSON without stopping other sources or leaking raw errors", async () => {
    const modelIds = OFFICIAL_HOURLY_MODELS.map(({ modelId }) => modelId);
    mockedFetchWeather.mockImplementation(async (input) => {
      const modelId = new URL(String(input)).searchParams.get("models")!;
      if (modelId === modelIds[0]) {
        const timeout = new Error("secret upstream timeout detail");
        timeout.name = "TimeoutError";
        throw timeout;
      }
      if (modelId === modelIds[1]) {
        return {
          ok: true,
          status: 200,
          json: async () => { throw new SyntaxError("raw malformed provider body"); },
        } as Response;
      }
      return response(completeResponse());
    });

    const result = await collectHourlyForecastAllModelsWithDiagnostics(
      "2026-10-25",
      { lat: 50.7567, lon: 2.5204 },
      { includeBestMatch: false },
    );

    expect(result.forecasts).toHaveLength(5);
    expect(result.diagnostics.find((item) => item.modelId === modelIds[0])).toMatchObject({ status: "safe_error", errorCode: "timeout", attemptCount: 3 });
    expect(result.diagnostics.find((item) => item.modelId === modelIds[1])).toMatchObject({ status: "failed", errorCode: "invalid_response", attemptCount: 2 });
    expect(result.diagnostics.filter((item) => item.status === "succeeded")).toHaveLength(5);
    expect(JSON.stringify(result.diagnostics)).not.toContain("secret upstream timeout detail");
    expect(JSON.stringify(result.diagnostics)).not.toContain("raw malformed provider body");
  });

  it("archives Best Match as a separate reference diagnostic, never as one of the seven official models", async () => {
    mockedFetchWeather.mockResolvedValue(response(completeResponse()));
    const result = await collectHourlyForecastAllModelsWithDiagnostics("2026-10-25", { lat: 50.7567, lon: 2.5204 });

    expect(result.forecasts).toHaveLength(8);
    expect(result.diagnostics.filter(({ modelId }) => modelId != null)).toHaveLength(7);
    expect(result.diagnostics.find(({ modelName }) => modelName === "best_match")).toMatchObject({ modelId: null, status: "succeeded" });
    const bestMatchRequest = mockedFetchWeather.mock.calls.map(([input]) => new URL(String(input))).find((url) => !url.searchParams.has("models"));
    expect(bestMatchRequest).toBeDefined();
  });

  it("can return the target and next Paris day for the official 48-hour composite", async () => {
    const nextDayUnixTimes = [
      Date.parse("2026-10-01T22:00:00Z") / 1000,
      Date.parse("2026-10-02T22:00:00Z") / 1000,
    ];
    mockedFetchWeather.mockResolvedValue(response({ hourly: { time: nextDayUnixTimes, temperature_2m: [8, 9] } }));

    const forecasts = await collectHourlyForecastAllModels(
      "2026-10-02",
      { lat: 50.7567, lon: 2.5204 },
      { includeBestMatch: false, includeNextDay: true },
    );

    expect(forecasts).toHaveLength(7);
    expect(forecasts[0].hours.map((hour) => hour.validAt)).toEqual(nextDayUnixTimes.map((value) => value * 1000));
    expect(forecasts[0].hours.map((hour) => hour.hour)).toEqual([0, 0]);
    expect(mockedFetchWeather.mock.calls.map(([input]) => new URL(String(input))).every((url) => url.searchParams.get("hourly")?.includes("uv_index"))).toBe(true);
  });
});
