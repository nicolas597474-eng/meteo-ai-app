import { applyBiasCorrection, computeConfidenceScore, getLeadTimeWeights, isEligibleGlobalReliabilityScore, type LeadTimeBucket, type LeadTimePerf, type ServiceBias } from "./fusionEngine";
import { conditionFromWeatherValues } from "./weatherConditionLabels";
import { getParisDate, getParisHour } from "./weatherTime";
import { calculateStabilityIndex } from "./statsEngine";
import { computeOfficialDailyForecast } from "./officialForecast";
import { WEATHER_SERVICES, collectExpertForecasts } from "./weatherServices";
import { getMeteoAIForecastByDate, getQualifiedCumulativeRankingForLocation, getQualifiedLeadTimeScoresForLocation, insertForecastRuns, insertForecasts, makeLocationKey, upsertLocationForecast, upsertMeteoAIForecast } from "./db";

type ManualFusionFavorite = {
  id: number;
  userId: number;
  lat: number;
  lon: number;
  name: string;
  customName: string | null;
};

export const MANUAL_FUSION_COOLDOWN_MS = 90_000;

export function isManualFusionCoolingDown(computedAt: Date | null | undefined, now = Date.now()) {
  return computedAt != null && now - computedAt.getTime() < MANUAL_FUSION_COOLDOWN_MS;
}

/** Recalcule un snapshot seulement pour un favori validé de l’utilisateur connecté. */
export async function refreshManualFusionForFavorite(favorite: ManualFusionFavorite) {
  const today = getParisDate();
  const locationKey = makeLocationKey(favorite.lat, favorite.lon);
  const currentSnapshot = await getMeteoAIForecastByDate(today, locationKey);
  if (isManualFusionCoolingDown(currentSnapshot?.computedAt)) {
    return { status: "cooldown" as const, retryAfterSeconds: Math.ceil((MANUAL_FUSION_COOLDOWN_MS - (Date.now() - currentSnapshot!.computedAt.getTime())) / 1000) };
  }

  const expertData = await collectExpertForecasts(today, { lat: favorite.lat, lon: favorite.lon });
  if (expertData.length === 0) throw new Error("Aucun modèle expert n’a renvoyé de prévision pour ce lieu.");

  const ranking = await getQualifiedCumulativeRankingForLocation(locationKey);
  const biases: ServiceBias[] = ranking
    .filter((entry) => entry.avgBiasTemp != null || entry.avgBiasPrecip != null)
    .map((entry) => ({
      serviceName: entry.serviceName,
      biasTemp: entry.avgBiasTemp == null ? null : Number(entry.avgBiasTemp),
      biasPrecip: entry.avgBiasPrecip == null ? null : Number(entry.avgBiasPrecip),
      biasWind: null,
    }));
  const rawForecasts = expertData.map((entry) => ({
    serviceName: entry.serviceName,
    tempMax: entry.tempMax,
    tempMin: entry.tempMin,
    precipitation: entry.precipitation,
    windSpeed: entry.windSpeed,
    windGust: null as number | null,
    cloudCover: entry.cloudCover ?? null,
  }));
  const biasCorrectedForecasts = biases.length > 0 ? applyBiasCorrection(rawForecasts, biases) : rawForecasts;
  const leadTimeRows = await getQualifiedLeadTimeScoresForLocation(locationKey, 14);
  const leadTimePerfs: LeadTimePerf[] = leadTimeRows.map((entry) => ({
    serviceName: entry.serviceName,
    bucket: entry.bucket as LeadTimeBucket,
    avgMaeTemp: entry.avgMaeTemp == null ? null : Number(entry.avgMaeTemp),
    avgMaePrecip: entry.avgMaePrecip == null ? null : Number(entry.avgMaePrecip),
    avgMaeWind: entry.avgMaeWind == null ? null : Number(entry.avgMaeWind),
    sampleSize: entry.totalSamples == null ? 0 : Number(entry.totalSamples),
    latestScoreDate: entry.latestScoreDate ?? null,
  }));
  const leadTimeWeights = getLeadTimeWeights(leadTimePerfs, "6-24h");
  const performanceByModel: Record<string, { maeTemp?: number; maePrecip?: number; maeWind?: number; maeCloud?: number; weightedScore?: number }> = {};
  ranking.filter((entry) => isEligibleGlobalReliabilityScore(Number(entry.daysTracked ?? 0), entry.latestScoreDate ?? null)).forEach((entry) => {
    const leadTime = leadTimeWeights[entry.serviceName];
    performanceByModel[entry.serviceName] = {
      maeTemp: leadTime?.maeTemp ?? (entry.avgMaeTemp == null ? undefined : Number(entry.avgMaeTemp)),
      maePrecip: leadTime?.maePrecip ?? (entry.avgMaePrecip == null ? undefined : Number(entry.avgMaePrecip)),
      maeWind: leadTime?.maeWind ?? (entry.avgMaeWind == null ? undefined : Number(entry.avgMaeWind)),
      maeCloud: entry.avgCondMaeCloud == null ? undefined : Number(entry.avgCondMaeCloud),
      weightedScore: entry.avgScore == null ? 50 : Number(entry.avgScore),
    };
  });

  const meteoAI = computeOfficialDailyForecast(biasCorrectedForecasts, performanceByModel);
  const stability = calculateStabilityIndex(expertData.map((entry) => ({ tempMax: entry.tempMax, tempMin: entry.tempMin, precipitation: entry.precipitation, windSpeed: entry.windSpeed })));
  const averagePrecipitation = expertData.reduce((sum, entry) => sum + (entry.precipitation ?? 0), 0) / expertData.length;
  const averageCloudCover = expertData.reduce((sum, entry) => sum + (entry.cloudCover ?? 50), 0) / expertData.length;
  const condition = conditionFromWeatherValues(averagePrecipitation, averageCloudCover);
  const bestModelScore = ranking.length > 0 ? Number(ranking[0].avgScore ?? 60) : 60;
  const confidenceScore = computeConfidenceScore({ forecasts: biasCorrectedForecasts, bestModelScore, leadTimeBucket: "6-24h" });
  const hour = getParisHour();
  const dayProgress = Math.max(0, Math.min(1, (hour - 6) / 12));
  const tempCurrent = meteoAI.tempMin != null && meteoAI.tempMax != null
    ? Math.round((meteoAI.tempMin + (meteoAI.tempMax - meteoAI.tempMin) * Math.sin(dayProgress * Math.PI / 2)) * 10) / 10
    : null;
  const explanation = `Fusion relancée manuellement pour ${favorite.customName ?? favorite.name} à partir de ${expertData.length}/${WEATHER_SERVICES.expert.length} modèles experts disponibles.`;

  await insertForecasts(expertData.map((entry) => ({
    locationKey,
    date: today,
    serviceName: entry.serviceName,
    serviceCategory: entry.serviceCategory,
    tempMax: entry.tempMax,
    tempMin: entry.tempMin,
    precipitation: entry.precipitation,
    windSpeed: entry.windSpeed,
    windGust: entry.windGust,
    humidity: entry.humidity,
    cloudCover: entry.cloudCover,
    condition: entry.condition,
    rawData: entry.rawData as any,
  })));
  const issuedAt = Date.now();
  await insertForecastRuns(expertData.map((entry) => ({
    locationKey,
    validDate: today,
    serviceName: entry.serviceName,
    provider: "open-meteo",
    modelId: WEATHER_SERVICES.expert.find((service) => service.name === entry.serviceName)?.modelId ?? null,
    sourceKind: "model_forecast" as const,
    issuedAt,
    tempMax: entry.tempMax,
    tempMin: entry.tempMin,
    precipitation: entry.precipitation,
    windSpeed: entry.windSpeed,
    windGust: entry.windGust,
    humidity: entry.humidity,
    cloudCover: entry.cloudCover,
    condition: entry.condition,
    rawData: entry.rawData as any,
  })));
  await upsertMeteoAIForecast({
    locationKey,
    date: today,
    tempMax: meteoAI.tempMax,
    tempMin: meteoAI.tempMin,
    precipitation: meteoAI.precipitation,
    windSpeed: meteoAI.windSpeed,
    condition,
    stabilityIndex: stability.index,
    stabilityLabel: stability.label,
    confidenceScore,
    weights: { version: 1, weightByService: meteoAI.weights, trace: meteoAI.trace, trigger: "manual" } as any,
    explanation,
  });
  await upsertLocationForecast({
    favoriteLocationId: favorite.id,
    userId: favorite.userId,
    lat: favorite.lat,
    lon: favorite.lon,
    date: today,
    tempMax: meteoAI.tempMax,
    tempMin: meteoAI.tempMin,
    tempCurrent,
    precipitation: meteoAI.precipitation,
    windSpeed: meteoAI.windSpeed,
    condition,
    aiScore: confidenceScore,
    confidenceScore,
    stabilityIndex: stability.index,
    modelsData: expertData as any,
    explanation,
  });

  return { status: "refreshed" as const, modelCount: expertData.length, calculatedAt: new Date(), confidenceScore };
}
