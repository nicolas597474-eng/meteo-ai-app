import type { PrecipitationModelConsensus } from "./precipitationConsensus";

export type ManualHourlyOverride = {
  source: "manual_refresh";
  reason: string;
  computedAt: string;
  officialOriginalComputedAt: string;
  officialOriginalPreserved: true;
  officialOriginalPointCount: number;
};

export type HourlyHistoricalEvidenceStatus =
  | "qualified"
  | "insufficient_evidence"
  | "no_evidence"
  | "incomplete_metrics"
  | "history_unavailable";

export type HistoricalMetricValues = {
  mae: number;
  rmse: number;
  bias: number;
  comparisonCount: number;
  evaluatedDays: number;
};

export type HourlyHistoricalTrend = {
  status: "qualified" | "insufficient_evidence" | "no_evidence" | "history_unavailable";
  recentWindowStart: string;
  recentWindowEnd: string;
  previousWindowStart: string;
  previousWindowEnd: string;
  recent: HistoricalMetricValues | null;
  previous: HistoricalMetricValues | null;
  delta: { mae: number; rmse: number; bias: number } | null;
  minimumComparisons: number;
  minimumComparableDays: number;
};

export type HourlyHistoricalEvidence = {
  modelName: string;
  modelId: string;
  variable: string;
  horizonBucket: string;
  status: HourlyHistoricalEvidenceStatus;
  metrics: HistoricalMetricValues | null;
  minimumComparisons: number;
  minimumComparableDays: number;
  firstScoreDate: string | null;
  latestScoreDate: string | null;
  latestComputedAt: string | null;
  incompleteMetricRows: number;
  trend: HourlyHistoricalTrend;
};

/**
 * Descriptive summaries of the seven independent hourly forecast models.
 * Null means no admissible value exists at the exact validTime; missing
 * historical evidence affects calibration status, never physical availability.
 * Zero is always a valid meteorological value.
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
  /** Population standard deviation for scalar variables; null when unavailable or circular. */
  standardDeviation: number | null;
  availableModelCount: number;
};

export type HourlyMultiModelMetrics = {
  /** This object is emitted only by the official seven-model hourly engine. */
  source: "official_seven_models";
  bestMatchIncluded: false;
  /** Models that supplied at least one eligible value at this validTime. */
  expectedModelCount: number;
  modelsExpected: readonly string[];
  /** Static catalogue, context only; not a performance-scoring denominator. */
  configuredModelCount: number;
  modelsConfigured: readonly string[];
  temperature: HourlyModelSummary & {
    /** Official historical-skill or robust-fallback forecast; null only without an admissible value. */
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
