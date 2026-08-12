export const isTransientWeatherStatus = (status: number) => status === 408 || status === 429 || status >= 500;

export async function fetchWeather(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { timeoutMs?: number; attempts?: number } = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const attempts = options.attempts ?? 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok || !isTransientWeatherStatus(response.status) || attempt === attempts) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
  }

  throw lastError instanceof Error ? lastError : new Error("La source météo est indisponible.");
}
