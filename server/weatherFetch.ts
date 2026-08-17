export const isTransientWeatherStatus = (status: number) => status === 408 || status === 429 || status >= 500;

type WeatherFetchOptions = {
  timeoutMs?: number;
  attempts?: number;
  cacheTtlMs?: number;
};

type CachedWeatherResponse = { expiresAt: number; response: Response };

const responseCache = new Map<string, CachedWeatherResponse>();
let cacheHits = 0;
let cacheMisses = 0;

function cacheKey(input: RequestInfo | URL, init: RequestInit): string | null {
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET") return null;
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  return `${method}:${url}`;
}

export function getWeatherFetchCacheMetrics() {
  return { entries: responseCache.size, hits: cacheHits, misses: cacheMisses };
}

export function resetWeatherFetchCache() {
  responseCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
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
  const now = Date.now();
  const cached = key ? responseCache.get(key) : null;
  if (cached && cached.expiresAt > now) {
    cacheHits += 1;
    return cached.response.clone();
  }
  if (key) {
    responseCache.delete(key);
    cacheMisses += 1;
  }
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok) {
        if (key && cacheTtlMs > 0) {
          responseCache.set(key, { expiresAt: Date.now() + cacheTtlMs, response: response.clone() });
        }
        return response;
      }
      if (!isTransientWeatherStatus(response.status) || attempt === attempts) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
  }

  throw lastError instanceof Error ? lastError : new Error("La source météo est indisponible.");
}
