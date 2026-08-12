import { computeFusion, type FusionSource } from "./fusionEngine";

export type OfficialDailyForecastInput = {
  serviceName: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust?: number | null;
  cloudCover?: number | null;
};

export type OfficialServicePerformance = {
  maeTemp?: number;
  maePrecip?: number;
  maeWind?: number;
  weightedScore?: number;
};

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
  const makeSources = (metric: "tempMax" | "tempMin" | "precipitation" | "windSpeed"): FusionSource[] =>
    forecasts.map((forecast) => {
      const performance = performanceByService[forecast.serviceName] ?? {};
      const metricMae = metric === "precipitation"
        ? performance.maePrecip
        : metric === "windSpeed"
          ? performance.maeWind
          : performance.maeTemp;
      return {
        id: `model:${forecast.serviceName}`,
        name: forecast.serviceName,
        // Les modèles sont interpolés au point cible : seule la performance
        // historique doit les départager, pas une distance géographique fictive.
        distanceKm: 1,
        temperature: metric === "tempMax"
          ? forecast.tempMax
          : metric === "tempMin"
            ? forecast.tempMin
            : forecast.tempMax != null && forecast.tempMin != null
              ? (forecast.tempMax + forecast.tempMin) / 2
              : null,
        precipitation: forecast.precipitation,
        windSpeed: forecast.windSpeed,
        windGust: forecast.windGust ?? null,
        cloudCover: forecast.cloudCover ?? null,
        updatedAt: now,
        reliabilityScore: performance.weightedScore ?? 50,
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

  const weights: Record<string, { tempWeight: number; precipWeight: number; windWeight: number }> = {};
  for (const source of maxFusion.usedSources) {
    weights[source.name] = {
      tempWeight: source.finalWeight,
      precipWeight: precipFusion.usedSources.find((entry) => entry.name === source.name)?.finalWeight ?? 0,
      windWeight: windFusion.usedSources.find((entry) => entry.name === source.name)?.finalWeight ?? 0,
    };
  }

  return {
    tempMax: maxFusion.temperature,
    tempMin: minFusion.temperature,
    precipitation: precipFusion.precipitation,
    windSpeed: windFusion.windSpeed,
    windGust: windFusion.windGust,
    cloudCover: maxFusion.cloudCover,
    weights,
    methodNote: `Fusion officielle ${maxFusion.methodUsed} par paramètre (${forecasts.length} modèles)`,
  };
}
