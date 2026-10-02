import type { PrecipitationModelConsensus } from "./precipitationConsensus";

/**
 * Descriptive summaries of the seven independent hourly forecast models.
 * Null means no valid observations (or no qualified historical weights for an
 * official weighted value); zero is always a valid meteorological value.
 */
export type HourlyModelSummary = {
  min: number | null;
  max: number | null;
  median: number | null;
  /** Population standard deviation; null when fewer than two valid models exist. */
  standardDeviation: number | null;
  /** Max - min; null when fewer than two valid models exist. */
  range: number | null;
  availableModelCount: number;
};

export type HourlyModelRange = {
  /** Max - min; null when fewer than two valid models exist. */
  range: number | null;
  availableModelCount: number;
};

export type HourlyMultiModelMetrics = {
  /** This object is emitted only by the official seven-model hourly engine. */
  source: "official_seven_models";
  bestMatchIncluded: false;
  expectedModelCount: number;
  modelsExpected: readonly string[];
  temperature: HourlyModelSummary & {
    /** Historical-skill weighted official forecast; null without qualified weights. */
    weightedMean: number | null;
    modelsWithData: readonly string[];
    minModel: string | null;
    maxModel: string | null;
  };
  precipitation: PrecipitationModelConsensus;
  dispersion: {
    windSpeed: HourlyModelRange;
    windGust: HourlyModelRange;
    windDirection: HourlyModelRange;
    humidity: HourlyModelRange;
    cloudCover: HourlyModelRange;
  };
};
