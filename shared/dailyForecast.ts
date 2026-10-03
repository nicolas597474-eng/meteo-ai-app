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
