export type LocalHistoryReading = {
  stationId: string;
  observedAt: number;
  temperature: number | null;
  distanceKm: number;
  reliabilityScore: number;
};

export type OfficialHourlyTemperature = {
  date: string;
  hour: number;
  modelName: string;
  temperature: number | null;
};

export type LocalOfficialDeltaPoint = {
  key: string;
  label: string;
  observedAt: string;
  localTemperature: number;
  officialTemperature: number;
  deltaC: number;
  stationCount: number;
};

function getParisKey(timestamp: number) {
  const date = new Date(timestamp);
  const day = date.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const hour = Number(date.toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    hourCycle: "h23",
  }).slice(0, 2));
  return { day, hour, key: `${day}-${String(hour).padStart(2, "0")}`, label: `${String(hour).padStart(2, "0")}h` };
}

/**
 * Builds a historical comparison from persisted, physical local observations.
 * The official series is intentionally limited to Open-Meteo best_match: it is
 * the same reference used by the current official hourly display. No model
 * average or simulated station is introduced here.
 */
export function buildLocalOfficialDeltaHistory(
  readings: LocalHistoryReading[],
  forecasts: OfficialHourlyTemperature[],
): LocalOfficialDeltaPoint[] {
  const official = new Map<string, number>();
  for (const forecast of forecasts) {
    if (forecast.modelName !== "best_match" || forecast.temperature == null) continue;
    official.set(`${forecast.date}-${String(forecast.hour).padStart(2, "0")}`, forecast.temperature);
  }

  const byHour = new Map<string, Array<LocalHistoryReading & { label: string }>>();
  for (const reading of readings) {
    if (reading.temperature == null || !Number.isFinite(reading.observedAt)) continue;
    const { key, label } = getParisKey(reading.observedAt);
    const group = byHour.get(key) ?? [];
    group.push({ ...reading, label });
    byHour.set(key, group);
  }

  return Array.from(byHour.entries())
    .map(([key, group]) => {
      const officialTemperature = official.get(key);
      if (officialTemperature == null) return null;
      // Same distance/reliability principle as the local ground-truth engine.
      const weighted = group.reduce((acc: { sum: number; weights: number }, reading: LocalHistoryReading & { label: string }) => {
        const weight = (1 / (reading.distanceKm + 0.5)) * 0.5 + (reading.reliabilityScore / 100) * 0.3 + 0.2;
        return { sum: acc.sum + (reading.temperature ?? 0) * weight, weights: acc.weights + weight };
      }, { sum: 0, weights: 0 });
      if (weighted.weights <= 0) return null;
      const localTemperature = Math.round((weighted.sum / weighted.weights) * 10) / 10;
      const deltaC = Math.round((localTemperature - officialTemperature) * 10) / 10;
      const latestObservedAt = Math.max(...group.map((reading: LocalHistoryReading & { label: string }) => reading.observedAt));
      return {
        key,
        label: group[0].label,
        observedAt: new Date(latestObservedAt).toISOString(),
        localTemperature,
        officialTemperature,
        deltaC,
        stationCount: new Set(group.map((reading: LocalHistoryReading & { label: string }) => reading.stationId)).size,
      };
    })
    .filter((point): point is LocalOfficialDeltaPoint => point !== null)
    .sort((a, b) => a.key.localeCompare(b.key));
}
