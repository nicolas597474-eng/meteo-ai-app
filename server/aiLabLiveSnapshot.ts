import { computeConfidenceScore } from "./fusionEngine";
import { computeOfficialDailyForecast } from "./officialForecast";
import { calculateStabilityIndex } from "./statsEngine";

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
 * position. No historical score or station coherence is substituted when the
 * position is not a saved favourite: computeConfidenceScore deliberately caps
 * the result in that case.
 */
export function buildLiveAILabSnapshot(
  date: string,
  forecasts: LiveModelForecast[],
  computedAt = new Date(),
) {
  if (forecasts.length === 0) return null;

  const fusion = computeOfficialDailyForecast(forecasts, {});
  const stability = calculateStabilityIndex(forecasts.map((forecast) => ({
    tempMax: forecast.tempMax,
    tempMin: forecast.tempMin,
    precipitation: forecast.precipitation,
    windSpeed: forecast.windSpeed,
  })));
  const confidenceScore = computeConfidenceScore({
    forecasts,
    leadTimeBucket: "0-6h",
  });

  return {
    date,
    tempMax: fusion.tempMax,
    tempMin: fusion.tempMin,
    precipitation: fusion.precipitation,
    windSpeed: fusion.windSpeed,
    confidenceScore,
    stabilityIndex: stability.index,
    computedAt,
    weights: {
      version: 1,
      trigger: "live-position",
      weightByService: fusion.weights,
      trace: fusion.trace,
    },
  };
}
