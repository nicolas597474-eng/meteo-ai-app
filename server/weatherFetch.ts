export const isTransientWeatherStatus = (status: number) => status === 408 || status === 429 || status >= 500;

type WeatherFetchOptions = {
  timeoutMs?: number;
  attempts?: number;
  cacheTtlMs?: number;
};

type CachedWeatherResponse = {
  expiresAt: number;
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: ArrayBuffer;
};

export type WeatherProviderDiagnostic = {
  provider: string;
  lastOutcome: "success" | "http_error" | "network_error" | "cache";
  lastObservedAt: string;
  lastNetworkAttemptAt: string | null;
  lastSuccessAt: string | null;
  freshnessMs: number | null;
  lastDurationMs: number;
  lastStatus: number | null;
  lastError: string | null;
  lastAttempts: number;
  lastRetries: number;
};

type ProviderDiagnosticState = Omit<WeatherProviderDiagnostic, "freshnessMs">;

const responseCache = new Map<string, CachedWeatherResponse>();
const providerDiagnostics = new Map<string, ProviderDiagnosticState>();
let cacheHits = 0;
let cacheMisses = 0;

function cacheKey(input: RequestInfo | URL, init: RequestInit): string | null {
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET") return null;
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  return `${method}:${url}`;
}

function providerName(input: RequestInfo | URL): string {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  try {
    return new URL(url).hostname;
  } catch {
    return "source-inconnue";
  }
}

function responseFromCache(cached: CachedWeatherResponse): Response {
  return new Response(cached.body.slice(0), {
    status: cached.status,
    statusText: cached.statusText,
    headers: cached.headers,
  });
}

async function makeCachedWeatherResponse(response: Response, expiresAt: number): Promise<CachedWeatherResponse> {
  const snapshot = response.clone();
  return {
    expiresAt,
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers: Array.from(snapshot.headers.entries()),
    body: await snapshot.arrayBuffer(),
  };
}

function recordProviderDiagnostic(diagnostic: ProviderDiagnosticState) {
  providerDiagnostics.set(diagnostic.provider, diagnostic);
}

export function getWeatherFetchCacheMetrics() {
  return { entries: responseCache.size, hits: cacheHits, misses: cacheMisses };
}

export function getWeatherProviderDiagnostics(now = Date.now()): WeatherProviderDiagnostic[] {
  return Array.from(providerDiagnostics.values())
    .map((diagnostic) => ({
      ...diagnostic,
      freshnessMs: diagnostic.lastSuccessAt == null
        ? null
        : Math.max(0, now - new Date(diagnostic.lastSuccessAt).getTime()),
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

export function resetWeatherFetchCache() {
  responseCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

export function resetWeatherProviderDiagnostics() {
  providerDiagnostics.clear();
}

export async function fetchWeather(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: WeatherFetchOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const attempts = options.attempts ?? 2;
  const cacheTtlMs = options.cacheTtlMs ?? 20_000;
  const key = cacheKey(input, init);
  const provider = providerName(input);
  const now = Date.now();
  const cached = key ? responseCache.get(key) : null;
  if (cached && cached.expiresAt > now) {
    cacheHits += 1;
    const previous = providerDiagnostics.get(provider);
    recordProviderDiagnostic({
      provider,
      lastOutcome: "cache",
      lastObservedAt: new Date(now).toISOString(),
      lastNetworkAttemptAt: previous?.lastNetworkAttemptAt ?? null,
      lastSuccessAt: previous?.lastSuccessAt ?? null,
      lastDurationMs: 0,
      lastStatus: previous?.lastStatus ?? null,
      lastError: null,
      lastAttempts: 0,
      lastRetries: 0,
    });
    return responseFromCache(cached);
  }
  if (key) {
    responseCache.delete(key);
    cacheMisses += 1;
  }

  let lastError: unknown;
  let lastStatus: number | null = null;
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok) {
        if (key && cacheTtlMs > 0) {
          try {
            const expiresAt = Date.now() + cacheTtlMs;
            responseCache.set(key, await makeCachedWeatherResponse(response, expiresAt));
          } catch {
            // La réponse réseau reste rendue à l’appel courant, sans conserver
            // un flux potentiellement consommé pour un appel ultérieur.
            responseCache.delete(key);
          }
        }
        const completedAt = Date.now();
        recordProviderDiagnostic({
          provider,
          lastOutcome: "success",
          lastObservedAt: new Date(completedAt).toISOString(),
          lastNetworkAttemptAt: new Date(startedAt).toISOString(),
          lastSuccessAt: new Date(completedAt).toISOString(),
          lastDurationMs: completedAt - startedAt,
          lastStatus: response.status,
          lastError: null,
          lastAttempts: attempt,
          lastRetries: attempt - 1,
        });
        return response;
      }

      lastStatus = response.status;
      if (!isTransientWeatherStatus(response.status) || attempt === attempts) {
        const completedAt = Date.now();
        const previous = providerDiagnostics.get(provider);
        recordProviderDiagnostic({
          provider,
          lastOutcome: "http_error",
          lastObservedAt: new Date(completedAt).toISOString(),
          lastNetworkAttemptAt: new Date(startedAt).toISOString(),
          lastSuccessAt: previous?.lastSuccessAt ?? null,
          lastDurationMs: completedAt - startedAt,
          lastStatus,
          lastError: `HTTP ${response.status}`,
          lastAttempts: attempt,
          lastRetries: attempt - 1,
        });
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
  }

  const completedAt = Date.now();
  const previous = providerDiagnostics.get(provider);
  recordProviderDiagnostic({
    provider,
    lastOutcome: "network_error",
    lastObservedAt: new Date(completedAt).toISOString(),
    lastNetworkAttemptAt: new Date(startedAt).toISOString(),
    lastSuccessAt: previous?.lastSuccessAt ?? null,
    lastDurationMs: completedAt - startedAt,
    lastStatus,
    lastError: lastError instanceof Error ? lastError.message : "Source météo indisponible",
    lastAttempts: attempts,
    lastRetries: Math.max(0, attempts - 1),
  });
  throw lastError instanceof Error ? lastError : new Error("La source météo est indisponible.");
}
