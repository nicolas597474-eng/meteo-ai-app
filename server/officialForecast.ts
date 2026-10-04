import { computeFusion, type FusionResult, type FusionSource } from "./fusionEngine";
import { getDailyForecastHorizon } from "./dailyForecastPerformance";
import { OFFICIAL_HOURLY_MODELS, type ForecastData } from "./weatherServices";
import type { DailyFusionMetric, DailyFusionHorizon, ModelPerformanceEvidence } from "./fusionPerformance";
import { PRECIPITATION_RAIN_THRESHOLD_MM, summarizePrecipitationModels, type PrecipitationModelConsensus } from "../shared/precipitationConsensus";
import type { DailyFusionMetricDiagnostic } from "../shared/dailyForecast";

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
  /** Signed forecast-minus-observation error; diagnostic only, never applied. */
  signedBias?: number;
  latestScoreDate?: string;
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
    temperatureMin: ForecastTraceSource[];
    precipitation: ForecastTraceSource[];
    wind: ForecastTraceSource[];
    windGust: ForecastTraceSource[];
    humidity: ForecastTraceSource[];
  };
  precipitationConsensus: PrecipitationModelConsensus;
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
        ...(typeof evidence.signedBias === "number" && Number.isFinite(evidence.signedBias) ? { signedBias: evidence.signedBias } : {}),
        latestScoreDate: evidence.latestScoreDate,
        variable: evidence.variable,
        horizonBucket: evidence.horizonBucket,
        uncertaintyAdjustedMae: source.uncertaintyAdjustedMae,
        regularizedMae: source.regularizedMae,
        sampleReliability: source.sampleReliability,
      } : {}),
    };
  });
}

const OFFICIAL_DAILY_MODEL_BY_NAME = new Map<string, (typeof OFFICIAL_HOURLY_MODELS)[number]>(
  OFFICIAL_HOURLY_MODELS.map((model) => [model.name, model]),
);
const DAILY_PRECIPITATION_MODEL_NAMES = OFFICIAL_HOURLY_MODELS.map((model) => model.name);
const DAILY_PRECIPITATION_MODEL_SET = new Set<string>(DAILY_PRECIPITATION_MODEL_NAMES);

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
function computeOfficialDailyForecastInternal(
  forecasts: OfficialDailyForecastInput[],
  options: OfficialDailyForecastOptions,
) {
  const now = new Date(options.issuedAt);
  // Best Match is a derived reference, not an eighth official model. Filter it
  // before constructing any value, provenance, count, or weighting output.
  const officialForecasts = forecasts.filter((forecast) => OFFICIAL_DAILY_MODEL_BY_NAME.has(forecast.serviceName));
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
  const precipitationInputs = officialForecasts
    .filter((forecast) => DAILY_PRECIPITATION_MODEL_SET.has(forecast.serviceName))
    .map((forecast) => ({ modelName: forecast.serviceName, amountMm: forecast.precipitation }));
  const rawPrecipitationConsensus = summarizePrecipitationModels(
    precipitationInputs,
    DAILY_PRECIPITATION_MODEL_NAMES,
  );

  const fusions = new Map<DailyFusionMetric, FusionResult>();
  const metricForecastsByMetric = new Map<DailyFusionMetric, OfficialDailyForecastInput[]>();
  for (const { key } of metrics) {
    const expected = horizonBucket ? { locationKey: options.locationKey, variable: key, horizonBucket } : null;
    const metricForecasts = key === "precipitation_sum"
      ? officialForecasts.filter((forecast) => DAILY_PRECIPITATION_MODEL_SET.has(forecast.serviceName)
        && typeof forecast.precipitation === "number"
        && Number.isFinite(forecast.precipitation)
        && forecast.precipitation >= PRECIPITATION_RAIN_THRESHOLD_MM)
      : officialForecasts;
    metricForecastsByMetric.set(key, metricForecasts);
    const sources: FusionSource[] = expected ? metricForecasts.map((forecast) => {
      const service = OFFICIAL_DAILY_MODEL_BY_NAME.get(forecast.serviceName);
      const evidence = options.evidence.find((item) => item.serviceName === forecast.serviceName
        && item.modelId === service?.modelId
        && item.locationKey === options.locationKey
        && item.variable === key
        && item.horizonBucket === horizonBucket) ?? null;
      return {
        id: `model:${forecast.serviceName}`,
        name: forecast.serviceName,
        modelId: service?.modelId ?? null,
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
  const precipitationConsensus = precipFusion.performanceEvidenceStatus === "qualified" && precipFusion.temperature != null
    ? summarizePrecipitationModels(precipitationInputs, DAILY_PRECIPITATION_MODEL_NAMES, {
        conditionalMeanMm: precipFusion.temperature,
        conditionalMeanMethod: "historical_skill",
      })
    : rawPrecipitationConsensus;
  const windFusion = getFusion("wind_speed_max");
  const gustFusion = getFusion("wind_gust_max");

  const buildMetricDiagnostic = (key: DailyFusionMetric): DailyFusionMetricDiagnostic => {
    const fusion = getFusion(key);
    const valueByModel = new Map<string, number>();
    for (const forecast of officialForecasts) {
      const value = forecastValue(forecast, key);
      if (typeof value === "number" && Number.isFinite(value)) valueByModel.set(forecast.serviceName, value);
    }
    const availableModels = Array.from(valueByModel.keys());
    const capBlockedSources = fusion.excludedSources.filter((source) => source.reason.includes("plafond individuel"));
    const capBlockedNames = new Set(capBlockedSources.map((source) => source.name));
    const contributingNames = new Set(fusion.usedSources.map((source) => source.name));
    // The engine's cap exclusion is the authoritative signal that these models
    // passed exact evidence checks but could not be normalized under its cap.
    const evidenceEligibleModels = Array.from(new Set(Array.from(contributingNames).concat(Array.from(capBlockedNames))));
    const metricForecastNames = new Set((metricForecastsByMetric.get(key) ?? []).map((forecast) => forecast.serviceName));
    const engineReasons = new Map(fusion.excludedSources.map((source) => [source.name, source.reason]));
    const modelReasons = DAILY_PRECIPITATION_MODEL_NAMES.flatMap((modelName) => {
      if (evidenceEligibleModels.includes(modelName)) return [];
      if (!valueByModel.has(modelName)) return [{ modelName, reason: "Aucune valeur finie disponible pour cette variable à cette échéance." }];
      if (!horizonBucket) return [{ modelName, reason: "Aucune tranche d’horizon exacte n’est disponible pour cette date." }];
      if (key === "precipitation_sum" && !metricForecastNames.has(modelName)) {
        return [{ modelName, reason: `Valeur disponible, mais sous le seuil de pluie de ${PRECIPITATION_RAIN_THRESHOLD_MM} mm utilisé pour la quantité conditionnelle.` }];
      }
      const reason = engineReasons.get(modelName);
      return [{ modelName, reason: reason ?? "Le moteur n’a pas retenu ce modèle comme contributeur de cette variable." }];
    });

    let status: DailyFusionMetricDiagnostic["status"];
    let reason: string;
    if (availableModels.length === 0) {
      status = "no_model_values";
      reason = `Aucun des ${DAILY_PRECIPITATION_MODEL_NAMES.length} modèles officiels ne fournit une valeur finie pour cette variable à cette échéance; cela ne signale pas à lui seul une erreur.`;
    } else if (!horizonBucket) {
      status = "horizon_unavailable";
      reason = "La date ne correspond à aucune tranche d’horizon exacte; aucune preuve d’une autre échéance n’est réutilisée.";
    } else if (key === "precipitation_sum" && precipitationConsensus.rainModelCount === 0) {
      status = "no_rain_contributors";
      reason = `${availableModels.length} modèle(s) fournissent une valeur, mais aucun n’atteint le seuil de pluie de ${precipitationConsensus.thresholdMm} mm utilisé pour la quantité conditionnelle.`;
    } else if (!options.evidenceStoreAvailable) {
      status = "evidence_store_unavailable";
      reason = "L’archive des preuves historiques est indisponible; le moteur ne remplace pas cette preuve par des poids égaux.";
    } else if (capBlockedSources.length > 0) {
      status = "weight_cap_blocked";
      reason = `${evidenceEligibleModels.length} modèle(s) ont une valeur et une preuve exacte admissible, mais la fusion est bloquée par le moteur : ${capBlockedSources[0]!.reason}.`;
    } else if (fusion.performanceEvidenceStatus === "qualified" && contributingNames.size > 0) {
      status = "calibrated";
      reason = `Fusion produite par le moteur avec ${contributingNames.size} contributeur(s) disposant de preuves exactes qualifiées.`;
    } else {
      status = "insufficient_evidence";
      const engineEvidenceReasons = Array.from(new Set(availableModels
        .map((modelName) => engineReasons.get(modelName))
        .filter((reason): reason is string => Boolean(reason))));
      reason = engineEvidenceReasons.length > 0
        ? `Des valeurs sont présentes, mais aucune preuve historique exacte n’a permis de qualifier un contributeur : ${engineEvidenceReasons.join("; ")}.`
        : "Des valeurs sont présentes, mais le moteur n’a renvoyé aucun contributeur avec des preuves historiques qualifiées pour ce lieu, cette variable et cet horizon.";
    }

    return {
      status,
      expectedModelCount: DAILY_PRECIPITATION_MODEL_NAMES.length,
      availableValueModelCount: availableModels.length,
      evidenceEligibleModelCount: evidenceEligibleModels.length,
      contributingModelCount: contributingNames.size,
      availableModels,
      evidenceEligibleModels,
      modelReasons,
      reason,
    };
  };
  const parameterDiagnostics = Object.fromEntries(
    metrics.map(({ key }) => [key, buildMetricDiagnostic(key)]),
  ) as Record<DailyFusionMetric, DailyFusionMetricDiagnostic>;
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
  for (const forecast of officialForecasts) {
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
      ? "Fusion officielle indisponible — archive de comparaisons indisponible"
      : "Fusion officielle indisponible — preuves par lieu/variable/horizon insuffisantes";
  const trace: ForecastTrace = {
    version: 2,
    issuedAt: now.toISOString(),
    method,
    sourceCount: officialForecasts.length,
    horizonBucket: horizon?.bucket ?? null,
    calibrationStatus,
    parameterSources: {
      temperature: toTraceSources(maxFusion),
      temperatureMin: toTraceSources(minFusion),
      precipitation: toTraceSources(precipFusion),
      wind: toTraceSources(windFusion),
      windGust: toTraceSources(gustFusion),
      humidity: [],
    },
    precipitationConsensus,
    excludedSources,
  };

  const coreReady = calibrationStatus.tempMax === "calibrated"
    && calibrationStatus.tempMin === "calibrated"
    && calibrationStatus.precipitation === "calibrated"
    && calibrationStatus.windSpeed === "calibrated";
  const forecast = {
    tempMax: calibrationStatus.tempMax === "calibrated" ? maxFusion.temperature : null,
    tempMin: calibrationStatus.tempMin === "calibrated" ? minFusion.temperature : null,
    precipitation: calibrationStatus.precipitation === "calibrated" ? precipitationConsensus.consensusEstimateMm : null,
    windSpeed: calibrationStatus.windSpeed === "calibrated" ? windFusion.temperature : null,
    windGust: calibrationStatus.windGust === "calibrated" ? gustFusion.temperature : null,
    humidity: null,
    cloudCover: null,
    confidenceScore: coreReady ? maxFusion.confidenceScore : null,
    calibrationStatus,
    coreCalibrationComplete: coreReady,
    weights,
    trace,
    methodNote: `Fusion quotidienne ${coreReady ? "calibrée" : "non calibrée"}: ${calibratedCount}/7 variables disposent d’une preuve qualifiée; horizon ${horizon?.bucket ?? "indisponible"}. La pluie est calculée par fréquence brute × quantité conditionnelle et n’est jamais une probabilité calibrée.`,
  };
  return { forecast, parameterDiagnostics };
}

/** Production/archive result: keeps the historical forecast and trace contract unchanged. */
export function computeOfficialDailyForecast(
  forecasts: OfficialDailyForecastInput[],
  options: OfficialDailyForecastOptions,
) {
  return computeOfficialDailyForecastInternal(forecasts, options).forecast;
}

/** Live-only additive diagnostics; callers persisting the forecast should use computeOfficialDailyForecast. */
export function computeOfficialDailyForecastWithDiagnostics(
  forecasts: OfficialDailyForecastInput[],
  options: OfficialDailyForecastOptions,
) {
  const { forecast, parameterDiagnostics } = computeOfficialDailyForecastInternal(forecasts, options);
  return { ...forecast, parameterDiagnostics };
}
