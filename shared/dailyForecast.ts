export type DailyForecastMetric =
  | "temperature_max"
  | "temperature_min"
  | "precipitation_sum"
  | "wind_speed_max"
  | "wind_gust_max";

export type DailyForecastHorizon = "0-6h" | "6-24h" | "1-3d" | "4-7d" | "8-15d";
export type DailyForecastEvidenceStatus =
  | "calibrated"
  | "insufficient_data"
  | "schema_unavailable";

export type DailyFusionDiagnosticStatus =
  | "calibrated"
  | "no_model_values"
  | "insufficient_evidence"
  | "weight_cap_blocked"
  | "evidence_store_unavailable"
  | "horizon_unavailable"
  | "no_rain_contributors";

export type DailyFusionModelReason = {
  modelName: string;
  reason: string;
};

/** Counts describe value coverage and actual engine eligibility, never reliability. */
export type DailyFusionMetricDiagnostic = {
  status: DailyFusionDiagnosticStatus;
  expectedModelCount: number;
  availableValueModelCount: number;
  evidenceEligibleModelCount: number;
  contributingModelCount: number;
  availableModels: string[];
  evidenceEligibleModels: string[];
  modelReasons: DailyFusionModelReason[];
  reason: string;
};

export type DailyForecastSourceDiagnostic = {
  modelName: string;
  variable: DailyForecastMetric;
  horizonBucket: DailyForecastHorizon;
  finalWeight: number;
  /** Signed forecast-minus-observation error; diagnostic only. */
  signedBias: number | null;
  sampleSize: number | null;
  comparisonCount: number | null;
  evaluatedDays: number | null;
  latestScoreDate: string | null;
};

export type DailyOfficialFusionDisplay = {
  issuedAt: string;
  horizonBucket: DailyForecastHorizon | null;
  calibrationStatus: {
    tempMax: DailyForecastEvidenceStatus;
    tempMin: DailyForecastEvidenceStatus;
    precipitation: DailyForecastEvidenceStatus;
    windSpeed: DailyForecastEvidenceStatus;
    windGust: DailyForecastEvidenceStatus;
  };
  sourcesByVariable: {
    tempMax: DailyForecastSourceDiagnostic[];
    tempMin: DailyForecastSourceDiagnostic[];
    precipitation: DailyForecastSourceDiagnostic[];
    windSpeed: DailyForecastSourceDiagnostic[];
    windGust: DailyForecastSourceDiagnostic[];
  };
  diagnosticsByVariable?: {
    tempMax: DailyFusionMetricDiagnostic;
    tempMin: DailyFusionMetricDiagnostic;
    precipitation: DailyFusionMetricDiagnostic;
    windSpeed: DailyFusionMetricDiagnostic;
    windGust: DailyFusionMetricDiagnostic;
  };
};

/** Best Match is retained as a separate derived reference, never a fusion input. */
export type BestMatchDailyReference = {
  source: "Open-Meteo Best Match";
  role: "derived_reference";
  officialContributor: false;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust: number | null;
};
