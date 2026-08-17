import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWeather, getWeatherFetchCacheMetrics, isTransientWeatherStatus, resetWeatherFetchCache } from "./weatherFetch";

afterEach(() => {
  resetWeatherFetchCache();
  vi.unstubAllGlobals();
});

describe("reprises des sources météo", () => {
  it("ne retente que les statuts transitoires documentés", () => {
    expect(isTransientWeatherStatus(408)).toBe(true);
    expect(isTransientWeatherStatus(429)).toBe(true);
    expect(isTransientWeatherStatus(500)).toBe(true);
    expect(isTransientWeatherStatus(404)).toBe(false);
  });

  it("réutilise une réponse GET récente et expose les métriques de cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWeather("https://api.example.test/weather", {}, { cacheTtlMs: 10_000 });
    const second = await fetchWeather("https://api.example.test/weather", {}, { cacheTtlMs: 10_000 });

    expect(await second.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getWeatherFetchCacheMetrics()).toMatchObject({ entries: 1, hits: 1, misses: 1 });
  });
});
