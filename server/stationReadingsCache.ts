/**
 * Station Readings Cache — In-memory persistence of previous station readings
 * for frozen-value and sudden-jump detection in the anomaly detection system.
 *
 * This module maintains a rolling window of the last reading per station,
 * keyed by stationId. It is used by the ultra-local calculation pipeline
 * to detect:
 *   - Frozen values (no change for > 60 min → penalty 0.5)
 *   - Sudden jumps (> 5°C in < 10 min → penalty proportional to delta)
 *
 * The cache is process-global and survives across requests within the same
 * server instance. It auto-evicts entries older than 3 hours to prevent
 * memory leaks.
 */

interface StationReading {
  temperature: number;
  timestamp: number; // Date.now() at time of recording
}

const MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours
const cache = new Map<string, StationReading>();

/**
 * Record a station's current reading into the cache.
 * Call this AFTER using getPreviousReadings() so the current cycle
 * can compare against the previous cycle's values.
 */
export function recordStationReading(stationId: string, temperature: number): void {
  cache.set(stationId, { temperature, timestamp: Date.now() });
}

/**
 * Record multiple station readings at once.
 */
export function recordStationReadings(
  readings: Array<{ stationId: string; temperature: number }>
): void {
  const now = Date.now();
  for (const r of readings) {
    cache.set(r.stationId, { temperature: r.temperature, timestamp: now });
  }
}

/**
 * Get the previous readings map for use with detectAnomalies / computeFusion.
 * Returns a Map<stationId, { temperature, timestamp }> of all non-expired entries.
 */
export function getPreviousReadings(): Map<string, { temperature: number; timestamp: number }> {
  evictStale();
  return new Map(cache);
}

/**
 * Evict entries older than MAX_AGE_MS to prevent unbounded memory growth.
 */
function evictStale(): void {
  const cutoff = Date.now() - MAX_AGE_MS;
  const keys = Array.from(cache.keys());
  for (const key of keys) {
    const val = cache.get(key);
    if (val && val.timestamp < cutoff) {
      cache.delete(key);
    }
  }
}

/**
 * Get cache size (for diagnostics).
 */
export function getCacheSize(): number {
  return cache.size;
}

/**
 * Clear the entire cache (for testing).
 */
export function clearCache(): void {
  cache.clear();
}
