import { computeOfficialDailyForecast } from "./officialForecast";

export type LiveModelForecast = {
  serviceName: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust: number | null;
  humidity: number | null;
  cloudCover: number | null;
  condition: string | null;
  serviceCategory?: string | null;
  rawData?: unknown;
};

/**
 * Produces a non-persisted, inspectable fusion for an arbitrary geolocated
 * position. No saved-place evidence exists for this request, so the official
 * numerical fields stay unavailable instead of substituting a global score.
 */
export function buildLiveAILabSnapshot(
  date: string,
  forecasts: LiveModelForecast[],
  computedAt = new Date(),
) {
  if (forecasts.length === 0) return null;

  const fusion = computeOfficialDailyForecast(forecasts, {
    locationKey: `unsaved-live-position:${date}`,
    targetDate: date,
    issuedAt: computedAt.getTime(),
    evidenceStoreAvailable: true,
    evidence: [],
  });
  return {
    date,
    tempMax: fusion.tempMax,
    tempMin: fusion.tempMin,
    precipitation: fusion.precipitation,
    windSpeed: fusion.windSpeed,
    computedAt,
    weights: {
      version: 1,
      trigger: "live-position",
      weightByService: fusion.weights,
      trace: fusion.trace,
    },
  };
}
