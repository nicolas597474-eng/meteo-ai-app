import type { OfficialWeatherSnapshot } from "./officialWeatherSnapshot";

/**
 * Narrow, read-only projection for the AI Lab comparison panel. All three
 * products come from one resolved official snapshot and one location.
 */
export function buildAILabForecastComparisonReadModel(
  snapshot: OfficialWeatherSnapshot,
  coordinates: { lat: number; lon: number },
) {
  return {
    timeZone: "Europe/Paris" as const,
    coordinates: { lat: coordinates.lat, lon: coordinates.lon },
    assembledAt: snapshot.computedAt,
    currentSnapshotSource: {
      sourceKind: "model_current_snapshot" as const,
      source: "open-meteo" as const,
    },
    currentSnapshot: snapshot.currentSnapshot
      ? {
          sourceKind: snapshot.currentSnapshot.sourceKind,
          source: snapshot.currentSnapshot.source,
          capturedAt: snapshot.currentSnapshot.capturedAt,
          temp: Number.isFinite(snapshot.currentSnapshot.temp) ? snapshot.currentSnapshot.temp : null,
        }
      : null,
    hourlyForecast: {
      sourceKind: snapshot.sourceKind,
      source: snapshot.source,
      computedAt: snapshot.hourlyComputedAt,
      modelsConsidered: [...snapshot.hourlyWeighting.modelsConsidered],
      bestMatchIncluded: snapshot.hourlyWeighting.bestMatchIncluded,
      points: snapshot.hourly.map((point) => ({
        date: point.date ?? null,
        hour: point.hour,
        validAt: Number.isFinite(point.validAt) ? point.validAt ?? null : null,
        temp: Number.isFinite(point.temp) ? point.temp : null,
        modelsWithData: [...(point.forecastWeighting?.modelsWithData ?? [])],
      })),
    },
    dailyForecast: {
      source: "open-meteo" as const,
      computedAt: snapshot.computedAt,
      modelsUsed: [...snapshot.modelsUsed],
      days: snapshot.daily.map((day) => ({
        date: day.date,
        tempMax: Number.isFinite(day.tempMax) ? day.tempMax : null,
        tempMin: Number.isFinite(day.tempMin) ? day.tempMin : null,
      })),
    },
  };
}
