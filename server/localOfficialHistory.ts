import { buildNormalizedSpatialWeights } from "./spatialFusionCore";

export type LocalHistoryReading = {
  stationId: string;
  observedAt: number;
  temperature: number | null;
  distanceKm: number;
  reliabilityScore: number;
};

export type OfficialHourlyTemperaturePoint = {
  validAt: number;
  temperature: number | null;
};

export type LocalOfficialDeltaPoint = {
  key: string;
  label: string;
  validAt: number;
  observedAt: string;
  localTemperature: number;
  officialTemperature: number;
  deltaC: number;
  stationCount: number;
};

function formatParisHour(timestamp: number) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(new Date(timestamp));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "??";
  const timeZone = parts.find((part) => part.type === "timeZoneName")?.value;
  return timeZone ? `${hour}h ${timeZone}` : `${hour}h`;
}

/**
 * Compares admitted physical observations only with the already-computed official
 * seven-model hourly series. Both sides are aligned by UTC hour, so the repeated
 * local hour at the autumn DST transition remains two distinct observations.
 */
export function buildLocalOfficialDeltaHistory(
  readings: LocalHistoryReading[],
  officialForecasts: OfficialHourlyTemperaturePoint[],
): LocalOfficialDeltaPoint[] {
  const officialByValidAt = new Map<number, number>();
  for (const forecast of officialForecasts) {
    if (Number.isFinite(forecast.validAt) && forecast.temperature != null && Number.isFinite(forecast.temperature)) {
      officialByValidAt.set(forecast.validAt, forecast.temperature);
    }
  }

  const byValidAt = new Map<number, LocalHistoryReading[]>();
  for (const reading of readings) {
    if (reading.temperature == null || !Number.isFinite(reading.temperature) || !Number.isFinite(reading.observedAt)) continue;
    const validAt = Math.floor(reading.observedAt / 3_600_000) * 3_600_000;
    if (!officialByValidAt.has(validAt)) continue;
    const group = byValidAt.get(validAt) ?? [];
    group.push(reading);
    byValidAt.set(validAt, group);
  }

  return Array.from(byValidAt.entries())
    .map(([validAt, group]) => {
      const officialTemperature = officialByValidAt.get(validAt);
      if (officialTemperature == null) return null;
      const validReadings = group.filter((reading) =>
        Number.isFinite(reading.distanceKm) && reading.distanceKm >= 0 && Number.isFinite(reading.reliabilityScore),
      );
      const weights = buildNormalizedSpatialWeights(
        validReadings.map((reading, index) => ({
          id: `${reading.stationId}:${index}`,
          distanceKm: reading.distanceKm,
          reliabilityScore: reading.reliabilityScore,
          updatedAt: new Date(reading.observedAt),
          temperature: reading.temperature,
        })),
        { now: validAt },
      );
      const weighted = weights.reduce((acc, weight, index) => ({
        sum: acc.sum + validReadings[index].temperature! * weight.finalWeight,
        weights: acc.weights + weight.finalWeight,
      }), { sum: 0, weights: 0 });
      if (weighted.weights <= 0) return null;
      const localTemperature = Math.round((weighted.sum / weighted.weights) * 10) / 10;
      const deltaC = Math.round((localTemperature - officialTemperature) * 10) / 10;
      const latestObservedAt = Math.max(...group.map((reading) => reading.observedAt));
      return {
        key: String(validAt),
        label: formatParisHour(validAt),
        validAt,
        observedAt: new Date(latestObservedAt).toISOString(),
        localTemperature,
        officialTemperature,
        deltaC,
        stationCount: new Set(group.map((reading) => reading.stationId)).size,
      };
    })
    .filter((point): point is LocalOfficialDeltaPoint => point !== null)
    .sort((left, right) => left.validAt - right.validAt);
}
