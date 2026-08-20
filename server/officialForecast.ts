import { computeFusion, type FusionResult, type FusionSource } from "./fusionEngine";

export type OfficialDailyForecastInput = {
  serviceName: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust?: number | null;
  humidity?: number | null;
  cloudCover?: number | null;
};

export type OfficialServicePerformance = {
  maeTemp?: number;
  maePrecip?: number;
  maeWind?: number;
  maeHumidity?: number;
  maeCloud?: number;
  weightedScore?: number;
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
};

export type ForecastTrace = {
  version: 1;
  issuedAt: string;
  method: string;
  sourceCount: number;
  parameterSources: {
    temperature: ForecastTraceSource[];
    precipitation: ForecastTraceSource[];
    wind: ForecastTraceSource[];
    humidity: ForecastTraceSource[];
  };
  excludedSources: Array<{ id: string; name: string; reason: string }>;
};

function toTraceSources(result: FusionResult): ForecastTraceSource[] {
  return result.usedSources.map((source) => ({
    id: source.id,
    name: source.name,
    type: source.type,
    finalWeight: source.finalWeight,
    distanceKm: source.distanceKm,
    distanceWeight: source.distanceWeight,
    qualityWeight: source.qualityWeight,
    freshnessWeight: source.freshnessWeight,
    performanceWeight: source.performanceWeight,
  }));
}

function reliabilityFromMetricMae(metric: "tempMax" | "tempMin" | "precipitation" | "windSpeed" | "humidity" | "cloudCover", mae: number | undefined): number {
  if (mae == null || !Number.isFinite(mae)) return 50;
  const expectedError = metric === "precipitation" ? 15 : metric === "windSpeed" ? 25 : metric === "humidity" || metric === "cloudCover" ? 40 : 10;
  return Math.max(0, Math.min(100, 100 * Math.exp((-3 * mae) / expectedError)));
}

/**
 * Fusion quotidienne officielle de MeteoAI.
 * Chaque paramètre utilise son MAE historique dédié et les mêmes règles, quel
 * que soit le déclencheur (cron, favori ou collecte manuelle).
 */
export function computeOfficialDailyForecast(
  forecasts: OfficialDailyForecastInput[],
  performanceByService: Record<string, OfficialServicePerformance>
) {
  const now = new Date();
  const makeSources = (metric: "tempMax" | "tempMin" | "precipitation" | "windSpeed" | "humidity" | "cloudCover"): FusionSource[] =>
    forecasts.map((forecast) => {
      const performance = performanceByService[forecast.serviceName] ?? {};
      const metricMae = metric === "precipitation"
        ? performance.maePrecip
        : metric === "windSpeed"
          ? performance.maeWind
          : metric === "humidity"
            ? performance.maeHumidity
          : metric === "cloudCover"
            ? performance.maeCloud
          : performance.maeTemp;
      return {
        id: `model:${forecast.serviceName}`,
        name: forecast.serviceName,
        // Les modèles sont interpolés au point cible : seule la performance
        // historique doit les départager, pas une distance géographique fictive.
        distanceKm: 1,
        temperature: metric === "cloudCover"
          ? forecast.cloudCover ?? null
          : metric === "tempMax"
          ? forecast.tempMax
          : metric === "tempMin"
            ? forecast.tempMin
            : forecast.tempMax != null && forecast.tempMin != null
              ? (forecast.tempMax + forecast.tempMin) / 2
              : null,
        precipitation: forecast.precipitation,
        windSpeed: forecast.windSpeed,
        windGust: forecast.windGust ?? null,
        humidity: forecast.humidity ?? null,
        cloudCover: forecast.cloudCover ?? null,
        updatedAt: now,
        // Sans MAE pour le paramètre, 50 est un poids neutre égalitaire entre
        // sources disponibles ; il n’est jamais présenté comme une performance.
        reliabilityScore: reliabilityFromMetricMae(metric, metricMae),
        maeTemp: metricMae,
        type: "model" as const,
      };
    });

  const config = {
    idwExponent: 2,
    maxDistanceKm: 5,
    maxFreshnessMin: 24 * 60,
    minReliabilityScore: 0,
    anomalyDetectionEnabled: false,
    adaptiveWeightingEnabled: true,
    modelWeightFraction: 1,
  };

  const maxFusion = computeFusion(makeSources("tempMax"), config);
  const minFusion = computeFusion(makeSources("tempMin"), config);
  const precipFusion = computeFusion(makeSources("precipitation"), config);
  const windFusion = computeFusion(makeSources("windSpeed"), config);
  const humidityFusion = computeFusion(makeSources("humidity"), config);
  const cloudFusion = computeFusion(makeSources("cloudCover"), config);

  const weights: Record<string, { tempWeight: number; precipWeight: number; windWeight: number; humidityWeight: number }> = {};
  for (const source of maxFusion.usedSources) {
    weights[source.name] = {
      tempWeight: source.finalWeight,
      precipWeight: precipFusion.usedSources.find((entry) => entry.name === source.name)?.finalWeight ?? 0,
      windWeight: windFusion.usedSources.find((entry) => entry.name === source.name)?.finalWeight ?? 0,
      humidityWeight: humidityFusion.usedSources.find((entry) => entry.name === source.name)?.finalWeight ?? 0,
    };
  }

  const excludedSources = [...maxFusion.excludedSources, ...precipFusion.excludedSources, ...windFusion.excludedSources, ...humidityFusion.excludedSources]
    .filter((source, index, all) => all.findIndex((entry) => entry.id === source.id && entry.reason === source.reason) === index)
    .map((source) => ({ id: source.id, name: source.name, reason: source.reason }));
  const trace: ForecastTrace = {
    version: 1,
    issuedAt: now.toISOString(),
    method: maxFusion.methodUsed,
    sourceCount: forecasts.length,
    parameterSources: {
      temperature: toTraceSources(maxFusion),
      precipitation: toTraceSources(precipFusion),
      wind: toTraceSources(windFusion),
      humidity: toTraceSources(humidityFusion),
    },
    excludedSources,
  };

  return {
    tempMax: maxFusion.temperature,
    tempMin: minFusion.temperature,
    precipitation: precipFusion.precipitation,
    windSpeed: windFusion.windSpeed,
    windGust: windFusion.windGust,
    humidity: humidityFusion.humidity,
    cloudCover: cloudFusion.temperature,
    weights,
    trace,
    methodNote: `Fusion officielle ${maxFusion.methodUsed} par paramètre (${forecasts.length} modèles)`,
  };
}
