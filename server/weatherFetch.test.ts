import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWeather, getWeatherFetchCacheMetrics, getWeatherProviderDiagnostics, isTransientWeatherStatus, resetWeatherFetchCache, resetWeatherProviderDiagnostics } from "./weatherFetch";

afterEach(() => {
  resetWeatherFetchCache();
  resetWeatherProviderDiagnostics();
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

  it("mesure un succès fournisseur avec le nombre réel de reprises", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("temporaire", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWeather("https://api.example.test/hourly", {}, { attempts: 2, cacheTtlMs: 0 });

    expect(getWeatherProviderDiagnostics()).toMatchObject([{
      provider: "api.example.test",
      lastOutcome: "success",
      lastStatus: 200,
      lastAttempts: 2,
      lastRetries: 1,
      lastError: null,
    }]);
  });

  it("reprend un délai réseau puis conserve le succès réel sans réponse fictive", async () => {
    const timeoutError = new DOMException("La requête a dépassé le délai", "TimeoutError");
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(new Response(JSON.stringify({ recovered: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWeather("https://api.example.test/retry", {}, { attempts: 2, cacheTtlMs: 0 });

    expect(await response.json()).toEqual({ recovered: true });
    expect(getWeatherProviderDiagnostics()).toMatchObject([{
      provider: "api.example.test",
      lastOutcome: "success",
      lastStatus: 200,
      lastAttempts: 2,
      lastRetries: 1,
      lastError: null,
    }]);
  });

  it("expose une erreur HTTP réelle sans fraîcheur ni statut fictifs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("indisponible", { status: 404 })));

    const response = await fetchWeather("https://meteo.example.test/daily", {}, { cacheTtlMs: 0 });

    expect(response.status).toBe(404);
    expect(getWeatherProviderDiagnostics()).toMatchObject([{
      provider: "meteo.example.test",
      lastOutcome: "http_error",
      lastStatus: 404,
      lastAttempts: 1,
      lastRetries: 0,
      freshnessMs: null,
    }]);
  });
});
