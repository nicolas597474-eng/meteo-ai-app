import { computeFusion, type FusionResult, type FusionSource } from "./fusionEngine";
import { getDailyForecastHorizon } from "./dailyForecastPerformance";
import { WEATHER_SERVICES, type ForecastData } from "./weatherServices";
import type { DailyFusionMetric, DailyFusionHorizon, ModelPerformanceEvidence } from "./fusionPerformance";

export type OfficialDailyForecastInput = Pick<ForecastData, "serviceName" | "tempMax" | "tempMin" | "precipitation" | "windSpeed" | "windGust" | "humidity" | "cloudCover">;
export type DailyCalibrationStatus = "calibrated" | "insufficient_data" | "schema_unavailable";

export type OfficialDailyForecastOptions = {
  locationKey: string;
  targetDate: string;
  issuedAt: number;
  evidenceStoreAvailable: boolean;
  evidence: ModelPerformanceEvidence[];
};

export type ForecastTraceSource = {
  id: string;
  name: string;
  type: "station" | "model" | "service";
  finalWeight: number;
  distanceKm: number;
  distanceWeight: number;
  qualityWeight: number;
  freshnessWeight: number;
  performanceWeight: number;
  sampleSize?: number;
  comparisonCount?: number;
  evaluatedDays?: number;
  mae?: number;
  rmse?: number;
  standardError?: number;
  uncertaintyAdjustedMae?: number;
  regularizedMae?: number;
  sampleReliability?: number;
  variable?: DailyFusionMetric;
  horizonBucket?: DailyFusionHorizon;
};

export type ForecastTrace = {
  version: 2;
  issuedAt: string;
  method: string;
  sourceCount: number;
  horizonBucket: DailyFusionHorizon | null;
  calibrationStatus: {
    tempMax: DailyCalibrationStatus;
    tempMin: DailyCalibrationStatus;
    precipitation: DailyCalibrationStatus;
    windSpeed: DailyCalibrationStatus;
    windGust: DailyCalibrationStatus;
    humidity: DailyCalibrationStatus;
    cloudCover: DailyCalibrationStatus;
  };
  parameterSources: {
    temperature: ForecastTraceSource[];
    precipitation: ForecastTraceSource[];
    wind: ForecastTraceSource[];
    humidity: ForecastTraceSource[];
  };
  excludedSources: Array<{ id: string; name: string; reason: string }>;
};

function toTraceSources(result: FusionResult): ForecastTraceSource[] {
  return result.usedSources.map((source) => {
    const evidence = source.performanceEvidence;
    return {
      id: source.id,
      name: source.name,
      type: source.type,
      finalWeight: source.finalWeight,
      distanceKm: source.distanceKm,
      distanceWeight: source.distanceWeight,
      qualityWeight: source.qualityWeight,
      freshnessWeight: source.freshnessWeight,
      performanceWeight: source.performanceWeight,
      ...(evidence ? {
        sampleSize: evidence.sampleSize,
        comparisonCount: evidence.comparisonCount,
        evaluatedDays: evidence.evaluatedDays,
        mae: evidence.mae,
        rmse: evidence.rmse,
        standardError: evidence.standardError,
        variable: evidence.variable,
        horizonBucket: evidence.horizonBucket,
        uncertaintyAdjustedMae: source.uncertaintyAdjustedMae,
        regularizedMae: source.regularizedMae,
        sampleReliability: source.sampleReliability,
      } : {}),
    };
  });
}

const SERVICE_BY_NAME = new Map(WEATHER_SERVICES.expert.map((service) => [service.name, service]));

function forecastValue(forecast: OfficialDailyForecastInput, metric: DailyFusionMetric): number | null {
  switch (metric) {
    case "temperature_max": return forecast.tempMax;
    case "temperature_min": return forecast.tempMin;
    case "precipitation_sum": return forecast.precipitation;
    case "wind_speed_max": return forecast.windSpeed;
    case "wind_gust_max": return forecast.windGust ?? null;
  }
}

function resultStatus(result: FusionResult, options: OfficialDailyForecastOptions): DailyCalibrationStatus {
  if (!options.evidenceStoreAvailable) return "schema_unavailable";
  return result.performanceEvidenceStatus === "qualified" ? "calibrated" : "insufficient_data";
}

/** Official daily model-only fusion. Missing exact production evidence never becomes an equal-weight forecast. */
export function computeOfficialDailyForecast(
  forecasts: OfficialDailyForecastInput[],
  options: OfficialDailyForecastOptions,
) {
  const now = new Date(options.issuedAt);
  const horizon = getDailyForecastHorizon(options.issuedAt, options.targetDate);
  const horizonBucket = horizon?.bucket ?? null;
  const metrics: Array<{ key: DailyFusionMetric; traceKey: "tempMax" | "tempMin" | "precipitation" | "windSpeed" | "windGust" }> = [
    { key: "temperature_max", traceKey: "tempMax" },
    { key: "temperature_min", traceKey: "tempMin" },
    { key: "precipitation_sum", traceKey: "precipitation" },
    { key: "wind_speed_max", traceKey: "windSpeed" },
    { key: "wind_gust_max", traceKey: "windGust" },
  ];
  const config = {
    idwExponent: 2,
    maxDistanceKm: 5,
    maxFreshnessMin: 24 * 60,
    minReliabilityScore: 0,
    anomalyDetectionEnabled: false,
    adaptiveWeightingEnabled: true,
    modelWeightFraction: 1,
  };

  const fusions = new Map<DailyFusionMetric, FusionResult>();
  for (const { key } of metrics) {
    const expected = horizonBucket ? { locationKey: options.locationKey, variable: key, horizonBucket } : null;
    const sources: FusionSource[] = expected ? forecasts.map((forecast) => {
      const service = SERVICE_BY_NAME.get(forecast.serviceName);
      const evidence = options.evidence.find((item) => item.serviceName === forecast.serviceName
        && item.locationKey === options.locationKey
        && item.variable === key
        && item.horizonBucket === horizonBucket) ?? null;
      return {
        id: `model:${forecast.serviceName}`,
        name: forecast.serviceName,
        modelId: service?.modelId ?? evidence?.modelId ?? null,
        distanceKm: 1,
        // computeFusion uses this one field as the selected variable, so the cap
        // is enforced over exactly the contributors that can affect this result.
        temperature: forecastValue(forecast, key),
        updatedAt: now,
        reliabilityScore: 50,
        performanceEvidence: evidence,
        type: "model" as const,
      };
    }) : [];
    const fusion = computeFusion(sources, {
      ...config,
      ...(expected ? { performanceContext: expected } : {}),
    });
    fusions.set(key, fusion);
  }

  const getFusion = (key: DailyFusionMetric) => fusions.get(key)!;
  const maxFusion = getFusion("temperature_max");
  const minFusion = getFusion("temperature_min");
  const precipFusion = getFusion("precipitation_sum");
  const windFusion = getFusion("wind_speed_max");
  const gustFusion = getFusion("wind_gust_max");
  const calibrationStatus = {
    tempMax: resultStatus(maxFusion, options),
    tempMin: resultStatus(minFusion, options),
    precipitation: resultStatus(precipFusion, options),
    windSpeed: resultStatus(windFusion, options),
    windGust: resultStatus(gustFusion, options),
    // Qualified physical daily snapshots do not currently contain these two
    // variables; their forecast values therefore remain explicitly unavailable.
    humidity: options.evidenceStoreAvailable ? "insufficient_data" as const : "schema_unavailable" as const,
    cloudCover: options.evidenceStoreAvailable ? "insufficient_data" as const : "schema_unavailable" as const,
  };

  const weights: Record<string, { tempWeight: number; precipWeight: number; windWeight: number; humidityWeight: number }> = {};
  for (const forecast of forecasts) {
    const findWeight = (fusion: FusionResult, name: string) => fusion.usedSources.find((entry) => entry.name === name)?.finalWeight ?? 0;
    weights[forecast.serviceName] = {
      tempWeight: findWeight(maxFusion, forecast.serviceName),
      precipWeight: findWeight(precipFusion, forecast.serviceName),
      windWeight: findWeight(windFusion, forecast.serviceName),
      humidityWeight: 0,
    };
  }

  const allFusions = metrics.map(({ key }) => getFusion(key));
  const excludedSources = allFusions.flatMap((fusion) => fusion.excludedSources)
    .filter((source, index, all) => all.findIndex((entry) => entry.id === source.id && entry.reason === source.reason) === index)
    .map((source) => ({ id: source.id, name: source.name, reason: source.reason }));
  const calibratedCount = Object.values(calibrationStatus).filter((status) => status === "calibrated").length;
  const method = calibrationStatus.tempMax === "calibrated"
    ? `${maxFusion.methodUsed}+métriques exactes`
    : !options.evidenceStoreAvailable
      ? "Fusion officielle indisponible — schéma de comparaisons non migré"
      : "Fusion officielle indisponible — preuves par lieu/variable/horizon insuffisantes";
  const trace: ForecastTrace = {
    version: 2,
    issuedAt: now.toISOString(),
    method,
    sourceCount: forecasts.length,
    horizonBucket: horizon?.bucket ?? null,
    calibrationStatus,
    parameterSources: {
      temperature: toTraceSources(maxFusion),
      precipitation: toTraceSources(precipFusion),
      wind: toTraceSources(windFusion),
      humidity: [],
    },
    excludedSources,
  };

  const coreReady = calibrationStatus.tempMax === "calibrated"
    && calibrationStatus.tempMin === "calibrated"
    && calibrationStatus.precipitation === "calibrated"
    && calibrationStatus.windSpeed === "calibrated";
  return {
    tempMax: calibrationStatus.tempMax === "calibrated" ? maxFusion.temperature : null,
    tempMin: calibrationStatus.tempMin === "calibrated" ? minFusion.temperature : null,
    precipitation: calibrationStatus.precipitation === "calibrated" ? precipFusion.temperature : null,
    windSpeed: calibrationStatus.windSpeed === "calibrated" ? windFusion.temperature : null,
    windGust: calibrationStatus.windGust === "calibrated" ? gustFusion.temperature : null,
    humidity: null,
    cloudCover: null,
    confidenceScore: coreReady ? maxFusion.confidenceScore : null,
    calibrationStatus,
    coreCalibrationComplete: coreReady,
    weights,
    trace,
    methodNote: `Fusion quotidienne ${coreReady ? "calibrée" : "non calibrée"} : ${calibratedCount}/7 variables disposent d’une preuve qualifiée; horizon ${horizon?.bucket ?? "indisponible"}.`,
  };
}
