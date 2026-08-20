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

  it("conserve une réponse en cache lisible après consommation de la première réponse", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ hourly: [1, 2] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchWeather("https://api.example.test/hourly", {}, { cacheTtlMs: 10_000 });
    expect(await first.json()).toEqual({ hourly: [1, 2] });
    const cached = await fetchWeather("https://api.example.test/hourly", {}, { cacheTtlMs: 10_000 });

    expect(await cached.json()).toEqual({ hourly: [1, 2] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
