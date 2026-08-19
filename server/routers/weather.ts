/**
 * Weather Router — tRPC procedures for MeteoAI
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "../_core/trpc";
import {
  getForecastsByDate,
  getForecastsByDateRange,
  getObservationByDate,
  getObservationsByDateRange,
  getMeteoAIForecastByDate,
  getLatestMeteoAIForecasts,
  getMeteoAIForecastHistory,
  getCumulativeRanking,
  getCumulativeRankingForLocation,
  getRecentCollectionJobs,
  insertForecasts,
  insertObservation,
  insertReliabilityScores,
  upsertMeteoAIForecast,
  getHistoricalScoreTimeSeries,
  getLeadTimeScoresForLocation,
  getQualifiedCumulativeRankingForLocation,
  getQualifiedLeadTimeScoresForLocation,
  makeLocationKey,
  getPhysicalStationHistory,
  getStoredHourlyForecasts,
  getStationCollectionSnapshots,
  getQualifiedEvidenceStatus,
  getStationQualityProfiles,
  getFavoriteLocations,
} from "../db";
import { collectExpertForecasts, collectObservations, collect15DayForecast, collectHourlyForecast, WEATHER_SERVICES, VALIDATION_WEATHER_MODELS } from "../weatherServices";
import { collectNearbyStations, fetchCurrentModelReferences, getPhysicalActiveStations, rankStations, calculateGroundTruth, haversineKm, HONDEGHEM, getStationSourceKind } from "../stationService";
import { calculateUltraLocal } from "../ultraLocalService";
import { calculateStabilityIndex, calculateReliabilityScore, detectWeatherRegime, REGIME_DEFINITIONS, type WeatherRegime } from "../statsEngine";
import { detectExtendedRegime, detectMultiRegime, EXTENDED_REGIME_INFO, computeConfidenceScore, applyBiasCorrection, getLeadTimeWeights, type ExtendedRegime, type MultiRegimeResult, type ServiceBias, type LeadTimePerf, type LeadTimeBucket } from "../fusionEngine";
import { getParisDate, getParisDateDaysAgo, getParisHour } from "../weatherTime";
import { conditionFromWeatherValues } from "../weatherConditionLabels";
import { computeOfficialDailyForecast } from "../officialForecast";
import { compareTraceWeights } from "../weightComparison";
import { buildOperationalRegime, findNextHourlyRegimeChange } from "../officialRegime";
import { buildLocalOfficialDeltaHistory } from "../localOfficialHistory";
import { buildModelIndicator } from "../modelIndicator";
import { buildAppliedModelWeights } from "../aiLabTrace";
import { buildModelReferenceCoherence } from "../modelReferenceCoherence";
import { resolveOfficialWeatherSnapshot } from "../officialWeatherSnapshot";
import { buildLiveAILabSnapshot, type LiveModelForecast } from "../aiLabLiveSnapshot";
import { getCollectedModelNames, getMissingModelNames } from "../stationCollectionModels";
import { isOperationalObservation } from "../observationProvenance";
import { latitudeSchema, longitudeSchema, optionalCoordinatesSchema, requiredCoordinatesSchema } from "../weatherInput";
import { buildReliabilityLaboratory } from "../weatherReliabilityLab";
import { getApparentAstronomyPosition, getEnvironmentalSnapshot, getTerrainHorizonProfile } from "../environmentalData";
import { refreshManualFusionForFavorite } from "../manualFusion";
import { getLocalEclipseCircumstances } from "../eclipseVisibility";

function getTodayParis(): string {
  return getParisDate();
}

export function getCurrentHourlyRegimeInput(hours: Array<any>, currentHour = getParisHour()) {
  const hourNumber = Number(currentHour);
  const current = hours.find((hour) => {
    const match = String(hour?.hour ?? "").match(/^(\d{1,2}):/);
    return match != null && Number(match[1]) === hourNumber;
  }) ?? null;
  if (!current) return null;
  return {
    temp: current.temp ?? null,
    precipitation: current.precipitation ?? null,
    windSpeed: current.windSpeed ?? null,
    humidity: current.humidity ?? null,
    cloudCover: current.cloudCover ?? null,
    updatedAt: new Date(),
  };
}

function getPersistedForecastTrace(weights: unknown, computedAt?: Date | null) {
  let normalizedWeights = weights;
  if (typeof normalizedWeights === "string") {
    try {
      normalizedWeights = JSON.parse(normalizedWeights);
    } catch {
      normalizedWeights = null;
    }
  }
  const record = normalizedWeights && typeof normalizedWeights === "object" ? normalizedWeights as Record<string, any> : null;
  if (!record) return null;
  if (record.trace) return record.trace;

  // Les snapshots précédant la traçabilité v1 contiennent déjà les poids finaux
  // par service. On les expose sans inventer les facteurs intermédiaires.
  const weightByService = record.weightByService && typeof record.weightByService === "object"
    ? record.weightByService as Record<string, any>
    : record;
  const services = Object.entries(weightByService);
  if (services.length === 0) return null;

  const hasParameterWeights = services.some(([, weight]) =>
    weight && typeof weight === "object" &&
    (typeof weight.tempWeight === "number" || typeof weight.precipWeight === "number" || typeof weight.windWeight === "number")
  );

  if (!hasParameterWeights) {
    const numericServices = services.filter(([, weight]) => typeof weight === "number");
    const total = numericServices.reduce((sum, [, weight]) => sum + Number(weight), 0);
    if (numericServices.length === 0 || total <= 0) return null;
    const globalSources = numericServices.map(([name, weight]) => ({
      id: `model:${name}`,
      name,
      type: "model" as const,
      finalWeight: Number(weight) / total,
    }));
    return {
      version: 0,
      issuedAt: computedAt?.toISOString?.() ?? null,
      method: "Fusion officielle — archive de pondérations globales",
      sourceCount: globalSources.length,
      parameterSources: {
        temperature: globalSources,
        precipitation: globalSources,
        wind: globalSources,
      },
      excludedSources: [],
    };
  }

  const parameterServices = services.filter(([, weight]) =>
    weight && typeof weight === "object" &&
    (typeof weight.tempWeight === "number" || typeof weight.precipWeight === "number" || typeof weight.windWeight === "number")
  );

  const parameterSources = (field: "tempWeight" | "precipWeight" | "windWeight") => parameterServices
    .filter(([, weight]) => typeof weight[field] === "number")
    .map(([name, weight]) => ({
      id: `model:${name}`,
      name,
      type: "model" as const,
      finalWeight: weight[field],
    }));

  return {
    version: 0,
    issuedAt: computedAt?.toISOString?.() ?? null,
    method: "Fusion officielle — archive de pondérations",
    sourceCount: parameterServices.length,
    parameterSources: {
      temperature: parameterSources("tempWeight"),
      precipitation: parameterSources("precipWeight"),
      wind: parameterSources("windWeight"),
    },
    excludedSources: [],
  };
}

export const weatherRouter = router({
  /** Catalogue descriptif des régimes : il n’altère jamais le régime détecté. */
  getRegimeCatalogue: publicProcedure.query(() => (
    Object.entries(EXTENDED_REGIME_INFO).map(([id, info]) => ({
      id,
      label: info.label,
      emoji: info.emoji,
      description: info.description,
      weights: {
        temp: info.weights.temp,
        precip: info.weights.precip,
        wind: info.weights.wind,
        condition: info.weights.condition,
      },
    }))
  )),

  /**
   * Dashboard: today's MeteoAI forecast + stability index + top services
   */
  getDashboard: publicProcedure
    .input(optionalCoordinatesSchema.optional())
    .query(async ({ input }) => {
    const today = getTodayParis();
    const locKey = input?.lat != null && input?.lon != null ? makeLocationKey(input.lat, input.lon) : "default";

    // Snapshot, observation et prévision horaire actualisée sont comparés par
    // le sélecteur partagé.
    const coords = input?.lat != null && input?.lon != null ? { lat: input.lat, lon: input.lon } : undefined;
    const [meteoAI, observation, officialSnapshot] = await Promise.all([
      getMeteoAIForecastByDate(today, locKey),
      getObservationByDate(today, locKey),
      resolveOfficialWeatherSnapshot(coords ?? HONDEGHEM),
    ]);
    const hourly = officialSnapshot.hourly;

    // Get all forecasts for today
    const forecasts = await getForecastsByDate(today, locKey);

    // Get ranking for this location
    const ranking = await getCumulativeRankingForLocation(locKey);

    // Get recent forecasts if no today data
    const recentForecasts = await getLatestMeteoAIForecasts(7, locKey);

    const officialRegime = buildOperationalRegime(meteoAI, observation, getCurrentHourlyRegimeInput(hourly));
    const trace = getPersistedForecastTrace(meteoAI?.weights, meteoAI?.computedAt);
    const modelIndicator = buildModelIndicator(trace);

    return {
      today,
      meteoAI,
      trace,
      modelIndicator,
      forecastCount: forecasts.length,
      topServices: ranking.slice(0, 5),
      recentForecasts,
      allServices: [...WEATHER_SERVICES.expert, ...WEATHER_SERVICES.public],
      regime: {
        id: officialRegime.primary.id,
        label: officialRegime.primary.label,
        emoji: officialRegime.primary.emoji,
        description: officialRegime.description,
        weights: officialRegime.blendedWeights,
      },
      multiRegime: {
        activeRegimes: officialRegime.active,
        confidenceScore: officialRegime.confidence,
        blendedWeights: officialRegime.blendedWeights,
        description: officialRegime.description,
      },
      officialRegime,
    };
  }),

  /** Snapshots successifs pouvant être comparés dans la vue des pondérations. */
  getWeightTraceHistory: publicProcedure
    .input(z.object({ lat: latitudeSchema.optional(), lon: longitudeSchema.optional(), limit: z.number().min(2).max(60).optional() }).optional())
    .query(async ({ input }) => {
      const locationKey = input?.lat != null && input?.lon != null ? makeLocationKey(input.lat, input.lon) : "default";
      const snapshots = await getMeteoAIForecastHistory(locationKey, input?.limit ?? 30);
      return snapshots
        .map((snapshot) => ({
          id: snapshot.id,
          date: snapshot.date,
          computedAt: snapshot.computedAt,
          confidenceScore: snapshot.confidenceScore,
          trace: getPersistedForecastTrace(snapshot.weights, snapshot.computedAt),
        }))
        .filter((snapshot) => snapshot.trace != null);
    }),

  /** Série horaire vérifiable pour le graphique local/officiel du Dashboard. */
  getLocalOfficialDeltaHistory: publicProcedure
    .input(requiredCoordinatesSchema)
    .query(async ({ input }) => {
      const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
      const locationKey = makeLocationKey(input.lat, input.lon);
      const [physicalHistory, todayRows, yesterdayRows] = await Promise.all([
        getPhysicalStationHistory(input.lat, input.lon, sinceMs),
        getStoredHourlyForecasts(locationKey, getTodayParis()),
        getStoredHourlyForecasts(locationKey, getParisDateDaysAgo(1)),
      ]);
      const readings = physicalHistory.stations.flatMap((station) => station.readings.map((reading) => ({
        stationId: station.stationId,
        observedAt: reading.observedAt,
        temperature: reading.temperature,
        distanceKm: Number(station.distanceKm),
        reliabilityScore: Number(station.reliabilityScore),
      })));
      return buildLocalOfficialDeltaHistory(readings, [...todayRows, ...yesterdayRows].map((row) => ({
        date: row.date,
        hour: row.hour,
        modelName: row.modelName,
        temperature: row.temperature,
      })));
    }),

  /** Écarts de poids, source par source, entre deux snapshots du même lieu. */
  compareWeightSnapshots: publicProcedure
    .input(z.object({
      lat: latitudeSchema.optional(),
      lon: longitudeSchema.optional(),
      beforeId: z.number().int().positive(),
      afterId: z.number().int().positive(),
    }))
    .query(async ({ input }) => {
      const locationKey = input.lat != null && input.lon != null ? makeLocationKey(input.lat, input.lon) : "default";
      const snapshots = await getMeteoAIForecastHistory(locationKey, 60);
      const beforeSnapshot = snapshots.find((snapshot) => snapshot.id === input.beforeId);
      const afterSnapshot = snapshots.find((snapshot) => snapshot.id === input.afterId);
      if (!beforeSnapshot || !afterSnapshot) return null;

      const beforeTrace = getPersistedForecastTrace(beforeSnapshot.weights, beforeSnapshot.computedAt);
      const afterTrace = getPersistedForecastTrace(afterSnapshot.weights, afterSnapshot.computedAt);
      if (!beforeTrace?.parameterSources || !afterTrace?.parameterSources) return null;

      return {
        before: {
          id: beforeSnapshot.id,
          date: beforeSnapshot.date,
          computedAt: beforeSnapshot.computedAt,
          confidenceScore: beforeSnapshot.confidenceScore,
          trace: beforeTrace,
        },
        after: {
          id: afterSnapshot.id,
          date: afterSnapshot.date,
          computedAt: afterSnapshot.computedAt,
          confidenceScore: afterSnapshot.confidenceScore,
          trace: afterTrace,
        },
        parameters: compareTraceWeights(beforeTrace, afterTrace),
      };
    }),

  /**
   * Full ranking of all services with cumulative scores
   */
  getRanking: publicProcedure
    .input(optionalCoordinatesSchema.optional())
    .query(async ({ input }) => {
    const today = getTodayParis();
    const locKey = input?.lat != null && input?.lon != null ? makeLocationKey(input.lat, input.lon) : "default";
    const ranking = await getCumulativeRankingForLocation(locKey);

    const coords = input?.lat != null && input?.lon != null ? { lat: input.lat, lon: input.lon } : undefined;
    const [meteoAI, observation, hourly] = await Promise.all([
      getMeteoAIForecastByDate(today, locKey),
      getObservationByDate(today, locKey),
      collectHourlyForecast(today, coords),
    ]);
    const officialRegime = buildOperationalRegime(meteoAI, observation, getCurrentHourlyRegimeInput(hourly));
    const regimeParams = officialRegime.params;
    const multiRegime = {
      primaryRegime: officialRegime.primary,
      activeRegimes: officialRegime.active,
      blendedWeights: officialRegime.blendedWeights,
      confidenceScore: officialRegime.confidence,
      description: officialRegime.description,
    };

    // All 12 extended regime definitions for the UI
    const allRegimes = (Object.keys(EXTENDED_REGIME_INFO) as ExtendedRegime[]).map(key => ({
      id: key,
      ...EXTENDED_REGIME_INFO[key],
    }));

    // Compute current weather parameters for display
    const currentParams = {
      temperature: regimeParams.temperature ?? 15,
      precipitation: regimeParams.precipitation ?? 0,
      windSpeed: regimeParams.windSpeed ?? 0,
      humidity: regimeParams.humidity ?? 60,
      cloudCover: regimeParams.cloudCover ?? 50,
      pressure: regimeParams.pressure ?? 1013,
    };

    // Determine impact level per parameter based on regime weights
    const getImpact = (weight: number): "Faible" | "Modéré" | "Élevé" | "Critique" => {
      if (weight >= 0.30) return "Critique";
      if (weight >= 0.20) return "Élevé";
      if (weight >= 0.12) return "Modéré";
      return "Faible";
    };

    const paramImpacts = {
      temperature: getImpact(multiRegime.blendedWeights.temp),
      precipitation: getImpact(multiRegime.blendedWeights.precip),
      wind: getImpact(multiRegime.blendedWeights.wind),
      cloudCover: getImpact(multiRegime.blendedWeights.condition),
      humidity: getImpact(multiRegime.blendedWeights.humidity),
      pressure: getImpact(multiRegime.blendedWeights.pressure),
    };

    // Key factors of the moment (top 5 based on current conditions)
    const keyFactors: Array<{ label: string; icon: string }> = [];
    if (currentParams.cloudCover > 70) keyFactors.push({ label: "Haute couverture nuageuse", icon: "☁️" });
    if (currentParams.humidity > 75) keyFactors.push({ label: "Humidité élevée", icon: "💧" });
    if (currentParams.pressure >= 1010 && currentParams.pressure <= 1020) keyFactors.push({ label: "Pression stable", icon: "🌀" });
    if (currentParams.precipitation > 0.5) keyFactors.push({ label: "Averses possibles", icon: "🌧️" });
    if (currentParams.windSpeed > 15 && currentParams.windSpeed <= 40) keyFactors.push({ label: `Vent modéré`, icon: "💨" });
    if (currentParams.windSpeed > 40) keyFactors.push({ label: "Vent fort", icon: "🌬️" });
    if (currentParams.temperature > 30) keyFactors.push({ label: "Forte chaleur", icon: "🌡️" });
    if (currentParams.temperature < 5) keyFactors.push({ label: "Froid marqué", icon: "❄️" });
    if (currentParams.cloudCover < 30) keyFactors.push({ label: "Ciel dégagé", icon: "☀️" });
    if (currentParams.pressure < 1005) keyFactors.push({ label: "Dépression active", icon: "🌀" });
    // Keep top 5
    const topFactors = keyFactors.slice(0, 5);

    // Best model info
    const bestModel = ranking[0] ?? null;
    const bestModelTrend = ranking[0] && ranking.length > 1
      ? Math.round(((ranking[0].avgScore ?? 0) - (ranking[1].avgScore ?? 0)) * 10) / 10
      : 0;

    return {
      ranking,
      totalServices: WEATHER_SERVICES.expert.length + WEATHER_SERVICES.public.length,
      officialRegime,
      // Legacy single-regime field (kept for backward compat)
      regime: {
        id: multiRegime.primaryRegime.id,
        label: multiRegime.primaryRegime.label,
        emoji: multiRegime.primaryRegime.emoji,
        description: multiRegime.description,
        weights: {
          temp: multiRegime.blendedWeights.temp,
          precip: multiRegime.blendedWeights.precip,
          wind: multiRegime.blendedWeights.wind,
          condition: multiRegime.blendedWeights.condition,
        },
      },
      // New multi-regime data
      multiRegime: {
        primaryRegime: multiRegime.primaryRegime,
        activeRegimes: multiRegime.activeRegimes,
        blendedWeights: multiRegime.blendedWeights,
        confidenceScore: multiRegime.confidenceScore,
        description: multiRegime.description,
      },
      allRegimes,
      // New fields for the redesigned UI
      currentParams,
      paramImpacts,
      keyFactors: topFactors,
      bestModel: bestModel ? {
        name: bestModel.serviceName,
        score: bestModel.avgScore ?? 0,
        trend: bestModelTrend,
      } : null,
    };
  }),

  /**
   * History: forecast vs observation comparison over date range
   */
  getHistory: publicProcedure
    .input(
      z.object({
        days: z.number().min(1).max(30).default(7),
        lat: latitudeSchema.optional(),
        lon: longitudeSchema.optional(),
      })
    )
    .query(async ({ input }) => {
      const endDate = getTodayParis();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.days);
      const startStr = startDate.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
      const locKey = input.lat != null && input.lon != null ? makeLocationKey(input.lat, input.lon) : "default";

      const forecasts = await getForecastsByDateRange(startStr, endDate, locKey);
      const observations = await getObservationsByDateRange(startStr, endDate, locKey);
      const meteoAIForecasts = await getLatestMeteoAIForecasts(input.days, locKey);
      const scoreTimeSeries = await getHistoricalScoreTimeSeries(input.days, locKey);
      const leadTimeScoresData = await getQualifiedLeadTimeScoresForLocation(locKey, input.days);

      return {
        forecasts,
        observations,
        meteoAIForecasts,
        scoreTimeSeries,
        leadTimeScores: leadTimeScoresData,
        startDate: startStr,
        endDate,
      };
    }),

  /**
   * Detailed report for a specific date
   */
  getReport: publicProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        lat: latitudeSchema.optional(),
        lon: longitudeSchema.optional(),
      })
    )
    .query(async ({ input }) => {
      const date = input.date || getTodayParis();
      const locKey = input.lat != null && input.lon != null ? makeLocationKey(input.lat, input.lon) : "default";

      const forecasts = await getForecastsByDate(date, locKey);
      const observation = await getObservationByDate(date, locKey);
      const meteoAI = await getMeteoAIForecastByDate(date, locKey);
      const ranking = await getCumulativeRankingForLocation(locKey);

      // Compute live dimension scores per service for this date
      let dimensionScores: Array<{
        serviceName: string;
        weightedScore: number;
        regime: string;
        regimeEmoji: string;
        regimeLabel: string;
        dimensions: {
          temperature: { mae: number; bias: number; maxError: number; score: number };
          precipitation: { pod: number; far: number; csi: number; falsePositives: number; falseNegatives: number; maeQuantity: number; score: number };
          wind: { maeMean: number; maeGusts: number; biasMean: number; score: number };
          condition: { concordance: number; maeCloudCover: number; score: number };
        };
        weights: { temp: number; precip: number; wind: number; condition: number };
      }> = [];

      if (observation) {
        const regimeInfo = detectWeatherRegime({
          precipitation: observation.precipitation,
          windSpeed: observation.windSpeed,
          tempMax: observation.tempMax,
          tempMin: observation.tempMin,
        });

        dimensionScores = forecasts.map((f) => {
          const score = calculateReliabilityScore(
            [{ tempMax: f.tempMax, tempMin: f.tempMin, precipitation: f.precipitation, windSpeed: f.windSpeed, windGust: f.windGust, cloudCover: f.cloudCover, condition: f.condition }],
            [{ tempMax: observation.tempMax, tempMin: observation.tempMin, precipitation: observation.precipitation, windSpeed: observation.windSpeed, windGust: observation.windGust, cloudCover: observation.cloudCover, condition: observation.condition }],
            regimeInfo.regime
          );
          return {
            serviceName: f.serviceName,
            weightedScore: score.weightedScore,
            regime: score.regime,
            regimeEmoji: score.regimeEmoji,
            regimeLabel: score.regimeLabel,
            dimensions: {
              temperature: {
                mae: score.dimensions.temperature.mae,
                bias: score.dimensions.temperature.bias,
                maxError: score.dimensions.temperature.maxError,
                score: score.dimensions.temperature.score,
              },
              precipitation: {
                pod: score.dimensions.precipitation.pod,
                far: score.dimensions.precipitation.far,
                csi: score.dimensions.precipitation.csi,
                falsePositives: score.dimensions.precipitation.falsePositives,
                falseNegatives: score.dimensions.precipitation.falseNegatives,
                maeQuantity: score.dimensions.precipitation.maeQuantity,
                score: score.dimensions.precipitation.score,
              },
              wind: {
                maeMean: score.dimensions.wind.maeMean,
                maeGusts: score.dimensions.wind.maeGusts,
                biasMean: score.dimensions.wind.biasMean,
                score: score.dimensions.wind.score,
              },
              condition: {
                concordance: score.dimensions.condition.concordance,
                maeCloudCover: score.dimensions.condition.maeCloudCover,
                score: score.dimensions.condition.score,
              },
            },
            weights: score.weights,
          };
        });
      }

      return {
        date,
        forecasts,
        observation,
        meteoAI,
        ranking,
        dimensionScores,
      };
    }),

  /**
   * 15-day MeteoAI forecast from multiple models
   */
  get15DayForecast: publicProcedure
    .input(optionalCoordinatesSchema.optional())
    .query(async ({ input }) => {
      const coords = input?.lat != null && input?.lon != null ? { lat: input.lat, lon: input.lon } : undefined;
      const snapshot = await resolveOfficialWeatherSnapshot(coords ?? HONDEGHEM);
      return { today: snapshot.weatherDate, days: snapshot.daily, modelsUsed: snapshot.modelsUsed, officialSnapshot: { validAt: snapshot.validAt, computedAt: snapshot.computedAt, sourceKind: snapshot.sourceKind, source: snapshot.source } };
    }),

  /**
   * Hourly forecast for today
   */
  getHourlyForecast: publicProcedure
    .input(optionalCoordinatesSchema.optional())
    .query(async ({ input }) => {
      const coords = input?.lat != null && input?.lon != null ? { lat: input.lat, lon: input.lon } : undefined;
      const snapshot = await resolveOfficialWeatherSnapshot(coords ?? HONDEGHEM);
      return { today: snapshot.weatherDate, hours: snapshot.hourly, officialSnapshot: { validAt: snapshot.validAt, computedAt: snapshot.computedAt, sourceKind: snapshot.sourceKind, source: snapshot.source } };
    }),

  /** Qualité de l’air et éphémérides réelles pour le lieu actif. */
  getEnvironmentalSnapshot: publicProcedure
    .input(requiredCoordinatesSchema)
    .query(({ input }) => getEnvironmentalSnapshot({ lat: input.lat, lon: input.lon })),

  /** Coordonnées apparentes actualisées des astres pour l'arche Soleil & Lune. */
  getApparentAstronomyPosition: publicProcedure
    .input(requiredCoordinatesSchema)
    .query(({ input }) => getApparentAstronomyPosition({ lat: input.lat, lon: input.lon })),

  /** Profil de relief local pour la superposition terrain de l'arche. */
  getTerrainHorizonProfile: publicProcedure
    .input(requiredCoordinatesSchema)
    .query(({ input }) => getTerrainHorizonProfile({ lat: input.lat, lon: input.lon })),

  /** Circonstances calculées pour une position choisie sur la carte d’éclipse. */
  getEclipseCircumstances: publicProcedure
    .input(z.object({
      eventId: z.enum(["lunar_partial_2026_08_28", "solar_partial_2027_08_02"]),
      lat: latitudeSchema,
      lon: longitudeSchema,
    }))
    .query(({ input }) => getLocalEclipseCircumstances(input)),

  /**
   * Detailed forecast page: 48h hourly + 15-day daily + regime + confidence
   */
  getDetailedForecast: publicProcedure
    .input(optionalCoordinatesSchema.optional())
    .query(async ({ input }) => {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
      const coords = input?.lat != null && input?.lon != null ? { lat: input.lat, lon: input.lon } : undefined;
      const locKey = input?.lat != null && input?.lon != null ? makeLocationKey(input.lat, input.lon) : "default";

      const snapshot = await resolveOfficialWeatherSnapshot(coords ?? HONDEGHEM);
      const hours = snapshot.hourly;
      const periodHours = await collectHourlyForecast(today, coords, 16);
      const days = snapshot.daily;
      const modelsUsed = snapshot.modelsUsed;

      const [meteoAI, observation, qualifiedRanking] = await Promise.all([
        getMeteoAIForecastByDate(today, locKey),
        getObservationByDate(today, locKey),
        getQualifiedCumulativeRankingForLocation(locKey),
      ]);
      const officialRegime = buildOperationalRegime(meteoAI, observation, getCurrentHourlyRegimeInput(hours));
      const nextRegimeChange = findNextHourlyRegimeChange(hours, `${getParisHour()}:00`, officialRegime.primary.id);

      // Best model
      const ranking = await getCumulativeRankingForLocation(locKey);
      const bestModel = ranking[0] ?? null;
      const dailyModelForecasts = await getForecastsByDate(today, locKey);
      const confidenceForecasts = dailyModelForecasts.map((forecast) => ({
        tempMax: forecast.tempMax,
        tempMin: forecast.tempMin,
        precipitation: forecast.precipitation,
        windSpeed: forecast.windSpeed,
      }));
      const bestModelScore = bestModel?.avgScore != null ? Number(bestModel.avgScore) : 60;
      // La confiance courante stockée par le cron combine accord, historique,
      // stations et horizon. Le repli conserve exactement la même formule.
      const todayConfidence = meteoAI?.confidenceScore ?? computeConfidenceScore({
        forecasts: confidenceForecasts,
        bestModelScore,
        leadTimeBucket: "6-24h",
      });
      // À J+4/J+7, le facteur d'échéance réduit la confiance de manière
      // explicite sans usurper l'indice de stabilité des modèles.
      const weekConfidence = computeConfidenceScore({
        forecasts: confidenceForecasts,
        bestModelScore,
        leadTimeBucket: "4-7d",
      });
      const trace = getPersistedForecastTrace(meteoAI?.weights, meteoAI?.computedAt);
      const qualifiedHistoricalModels = qualifiedRanking
        .filter((row) => row.avgScore != null && row.totalSamples != null)
        .map((row) => ({
          name: row.serviceName,
          score: Math.round(Number(row.avgScore)),
          comparisons: Number(row.totalSamples),
          temperatureMae: row.avgMaeTemp == null ? null : Math.round(Number(row.avgMaeTemp) * 10) / 10,
          precipitationMae: row.avgMaePrecip == null ? null : Math.round(Number(row.avgMaePrecip) * 10) / 10,
          windMae: row.avgMaeWind == null ? null : Math.round(Number(row.avgMaeWind) * 10) / 10,
        }));
      const historicalModelPerformance = qualifiedHistoricalModels.length > 0
        ? {
            score: Math.round(qualifiedHistoricalModels.reduce((sum, model) => sum + model.score, 0) / qualifiedHistoricalModels.length),
            comparisons: qualifiedHistoricalModels.reduce((sum, model) => sum + model.comparisons, 0),
            models: qualifiedHistoricalModels,
          }
        : null;

      return {
        today: snapshot.weatherDate,
        officialSnapshot: { validAt: snapshot.validAt, computedAt: snapshot.computedAt, sourceKind: snapshot.sourceKind, source: snapshot.source },
        hours,
        periodHours,
        days,
        modelsUsed,
        regime: {
          primary: officialRegime.primary,
          active: officialRegime.active,
          confidence: officialRegime.confidence,
          description: officialRegime.description,
          snapshotComputedAt: officialRegime.snapshotComputedAt,
          source: officialRegime.source,
          sourceLabel: officialRegime.sourceLabel,
          sourceUpdatedAt: officialRegime.sourceUpdatedAt,
          sourceAgeMinutes: officialRegime.sourceAgeMinutes,
          dataCoverage: officialRegime.dataCoverage,
        },
        nextRegimeChange,
        confidence: {
          current: todayConfidence,
          today: todayConfidence,
          week: weekConfidence,
          stabilityIndex: meteoAI?.stabilityIndex ?? null,
        },
        historicalModelPerformance,
        bestModel: bestModel ? { name: bestModel.serviceName, score: bestModel.avgScore ?? 0 } : null,
        trace: trace
          ? { ...trace, snapshotComputedAt: meteoAI?.computedAt?.toISOString?.() ?? null }
          : {
              available: false,
              issuedAt: meteoAI?.computedAt?.toISOString?.() ?? null,
              message: "La traçabilité détaillée sera disponible après la prochaine collecte officielle.",
            },
      };
    }),

  /**
   * Admin: Manual trigger for forecast collection (for testing)
   */
  triggerCollection: adminProcedure
    .input(
      z.object({
        type: z.enum(["forecast", "observation"]),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const targetDate = input.date || getTodayParis();

      if (input.type === "forecast") {
        const { HONDEGHEM } = await import("../weatherServices");
        const locationKey = makeLocationKey(HONDEGHEM.lat, HONDEGHEM.lon);
        const expertData = await collectExpertForecasts(targetDate);
        const forecastRows = expertData.map((f) => ({
          locationKey,
          date: targetDate,
          serviceName: f.serviceName,
          serviceCategory: f.serviceCategory,
          tempMax: f.tempMax,
          tempMin: f.tempMin,
          precipitation: f.precipitation,
          windSpeed: f.windSpeed,
          windGust: f.windGust,
          humidity: f.humidity,
          cloudCover: f.cloudCover,
          condition: f.condition,
          rawData: f.rawData as any,
        }));
        await insertForecasts(forecastRows);

        // Compute MeteoAI
        const allForecasts = await getForecastsByDate(targetDate, locationKey);
        const stability = calculateStabilityIndex(
          allForecasts.map((f) => ({
            tempMax: f.tempMax,
            tempMin: f.tempMin,
            precipitation: f.precipitation,
            windSpeed: f.windSpeed,
          }))
        );

        const locationRanking = await getQualifiedCumulativeRankingForLocation(locationKey);
        const ranking = locationRanking;

        const biases: ServiceBias[] = ranking
          .filter((row) => row.avgBiasTemp != null || row.avgBiasPrecip != null)
          .map((row) => ({
            serviceName: row.serviceName,
            biasTemp: row.avgBiasTemp != null ? Number(row.avgBiasTemp) : null,
            biasPrecip: row.avgBiasPrecip != null ? Number(row.avgBiasPrecip) : null,
            biasWind: null,
          }));
        const rawForecasts = allForecasts.map((forecast) => ({
          serviceName: forecast.serviceName,
          tempMax: forecast.tempMax,
          tempMin: forecast.tempMin,
          precipitation: forecast.precipitation,
          windSpeed: forecast.windSpeed,
          windGust: forecast.windGust,
          cloudCover: forecast.cloudCover ?? null,
        }));
        const correctedForecasts = biases.length > 0
          ? applyBiasCorrection(rawForecasts, biases)
          : rawForecasts;

        const leadTimeRows = await getQualifiedLeadTimeScoresForLocation(locationKey, 14);
        const leadTimePerfs: LeadTimePerf[] = leadTimeRows.map((row) => ({
          serviceName: row.serviceName,
          bucket: row.bucket as LeadTimeBucket,
          avgMaeTemp: row.avgMaeTemp != null ? Number(row.avgMaeTemp) : null,
          avgMaePrecip: row.avgMaePrecip != null ? Number(row.avgMaePrecip) : null,
          avgMaeWind: row.avgMaeWind != null ? Number(row.avgMaeWind) : null,
        }));
        const leadTimeWeights = getLeadTimeWeights(leadTimePerfs, "6-24h");
        const performanceByService: Record<string, { maeTemp?: number; maePrecip?: number; maeWind?: number; weightedScore?: number }> = {};
        ranking.forEach((row) => {
          const leadTime = leadTimeWeights[row.serviceName];
          performanceByService[row.serviceName] = {
            maeTemp: leadTime?.maeTemp ?? (row.avgMaeTemp != null ? Number(row.avgMaeTemp) : undefined),
            maePrecip: leadTime?.maePrecip ?? (row.avgMaePrecip != null ? Number(row.avgMaePrecip) : undefined),
            maeWind: leadTime?.maeWind ?? (row.avgMaeWind != null ? Number(row.avgMaeWind) : undefined),
            weightedScore: row.avgScore != null ? Number(row.avgScore) : 50,
          };
        });
        const meteoAI = computeOfficialDailyForecast(correctedForecasts, performanceByService);

        // Determine condition
        const avgPrecip = allForecasts.reduce((sum, f) => sum + (f.precipitation ?? 0), 0) / allForecasts.length;
        const avgCloud = allForecasts.reduce((sum, f) => sum + (f.cloudCover ?? 50), 0) / allForecasts.length;
        const condition = conditionFromWeatherValues(avgPrecip, avgCloud);

        await upsertMeteoAIForecast({
          locationKey,
          date: targetDate,
          tempMax: meteoAI.tempMax,
          tempMin: meteoAI.tempMin,
          precipitation: meteoAI.precipitation,
          windSpeed: meteoAI.windSpeed,
          condition,
          stabilityIndex: stability.index,
          stabilityLabel: stability.label,
          confidenceScore: computeConfidenceScore({
            forecasts: correctedForecasts.map(f => ({ tempMax: f.tempMax, tempMin: f.tempMin, precipitation: f.precipitation, windSpeed: f.windSpeed })),
            bestModelScore: ranking.length > 0 ? Number(ranking[0].avgScore ?? 60) : 60,
            leadTimeBucket: "6-24h",
          }),
          weights: { version: 1, weightByService: meteoAI.weights, trace: meteoAI.trace } as any,
          explanation: `Prévision synthétisée à partir de ${allForecasts.length} modèles.`,
        });

        return { success: true, collected: forecastRows.length, date: targetDate };
      } else {
        // Observation collection
        const obsData = await collectObservations(targetDate);
        if (!obsData) return { success: false, error: "No observation data available" };

        await insertObservation({
          date: obsData.date,
          tempMax: obsData.tempMax,
          tempMin: obsData.tempMin,
          precipitation: obsData.precipitation,
          windSpeed: obsData.windSpeed,
          windGust: obsData.windGust,
          humidity: obsData.humidity,
          cloudCover: obsData.cloudCover,
          condition: obsData.condition,
          source: obsData.source,
          provenanceType: obsData.provenanceType,
          isQualified: obsData.isQualified,
          rawData: obsData.rawData as any,
        });

        if (!isOperationalObservation(obsData)) {
          return { success: true, date: targetDate, scoreSkipped: true, reason: "Référence de modèle archivée : aucune observation physique qualifiée disponible" };
        }

        // Compute reliability scores
        const dayForecasts = await getForecastsByDate(targetDate);
        const observation = await getObservationByDate(targetDate);

        if (dayForecasts.length > 0 && observation) {
          // Detect regime from actual observation
          const regimeInfo = detectWeatherRegime({
            precipitation: observation.precipitation,
            windSpeed: observation.windSpeed,
            tempMax: observation.tempMax,
            tempMin: observation.tempMin,
          });

          const scoreRows = dayForecasts.map((f) => {
            const score = calculateReliabilityScore(
              [{ tempMax: f.tempMax, tempMin: f.tempMin, precipitation: f.precipitation, windSpeed: f.windSpeed }],
              [{ tempMax: observation.tempMax, tempMin: observation.tempMin, precipitation: observation.precipitation, windSpeed: observation.windSpeed }],
              regimeInfo.regime
            );
            const d = score.dimensions;
            return {
              date: targetDate,
              serviceName: f.serviceName,
              // Legacy flat fields
              maeTemp: score.maeTemp,
              maePrecip: score.maePrecip,
              maeWind: score.maeWind,
              rmseTemp: score.rmseTemp,
              rmsePrecip: score.rmsePrecip,
              rmseWind: score.rmseWind,
              biasTemp: score.biasTemp,
              biasPrecip: score.biasPrecip,
              biasWind: score.biasWind,
              conditionAccuracy: score.conditionAccuracy,
              weightedScore: score.weightedScore,
              regime: score.regime,
              // 🌡️ Temperature dimension
              tempScore: d.temperature.score,
              tempMaxError: d.temperature.maxError,
              // 🌧️ Precipitation dimension
              precipScore: d.precipitation.score,
              precipPod: d.precipitation.pod,
              precipFar: d.precipitation.far,
              precipCsi: d.precipitation.csi,
              precipFalsePositives: d.precipitation.falsePositives,
              precipFalseNegatives: d.precipitation.falseNegatives,
              // 💨 Wind dimension
              windScore: d.wind.score,
              windMaeGusts: d.wind.maeGusts,
              // ☁️ Condition dimension
              condScore: d.condition.score,
              condConcordance: d.condition.concordance,
              condMaeCloud: d.condition.maeCloudCover,
            };
          });
          await insertReliabilityScores(scoreRows);
        }

        return { success: true, date: targetDate };
      }
    }),

  /**
   * Get collection job history
   */
  getJobs: adminProcedure.query(async () => {
    return getRecentCollectionJobs(20);
  }),

  /** Relance ponctuelle réservée à l’utilisateur propriétaire du lieu favori. */
  refreshManualFusion: protectedProcedure
    .input(z.object({ favoriteId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const favorite = (await getFavoriteLocations(ctx.user.id)).find((entry) => entry.id === input.favoriteId);
      if (!favorite) throw new Error("Ce lieu favori est introuvable ou ne vous appartient pas.");
      return refreshManualFusionForFavorite(favorite);
    }),

  /**
   * Weather AI Lab — full transparency data for the AI Lab page
   */
  getAILab: publicProcedure
    .input(optionalCoordinatesSchema.optional())
    .query(async ({ input }) => {
    const today = getTodayParis();
    const coords = input?.lat != null && input?.lon != null ? { lat: input.lat, lon: input.lon } : null;
    const locationKey = coords ? makeLocationKey(coords.lat, coords.lon) : undefined;
    const observation = locationKey
      ? await getObservationByDate(today, locationKey)
      : await getObservationByDate(today);
    const currentMeteoAI = locationKey
      ? await getMeteoAIForecastByDate(today, locationKey)
      : await getMeteoAIForecastByDate(today);
    const archivedMeteoAI = !currentMeteoAI && locationKey
      ? (await getLatestMeteoAIForecasts(1, locationKey))[0] ?? null
      : null;
    const persistedMeteoAI = currentMeteoAI ?? archivedMeteoAI;
    const liveForecasts: LiveModelForecast[] = !persistedMeteoAI && coords
      ? await collectExpertForecasts(today, coords)
      : [];
    const liveMeteoAI = !persistedMeteoAI
      ? buildLiveAILabSnapshot(today, liveForecasts)
      : null;
    const meteoAI = persistedMeteoAI ?? liveMeteoAI;
    const snapshotStatus = currentMeteoAI ? "current" : archivedMeteoAI ? "archived" : liveMeteoAI ? "live" : "unavailable";
    const snapshotDate = meteoAI?.date ?? null;
    const forecasts = liveForecasts.length > 0
      ? liveForecasts
      : snapshotDate
      ? (locationKey ? await getForecastsByDate(snapshotDate, locationKey) : await getForecastsByDate(snapshotDate))
      : (locationKey ? await getForecastsByDate(today, locationKey) : await getForecastsByDate(today));
    const ranking = locationKey
      ? await getCumulativeRankingForLocation(locationKey)
      : await getCumulativeRanking();
    const jobs = await getRecentCollectionJobs(5);

    // 1. Régime opérationnel partagé avec le Dashboard. Une observation ne peut
    // remplacer la fusion officielle que si elle est plus récente, fraîche et
    // couvre notamment la nébulosité.
    const liveHours = await collectHourlyForecast(today, coords ?? undefined);
    const operationalRegime = buildOperationalRegime(currentMeteoAI, observation, getCurrentHourlyRegimeInput(liveHours));
    const regime = operationalRegime.primary.id;
    const regimeDef = operationalRegime.primary;
    const weights = operationalRegime.blendedWeights;

    // La trace persistée est la source de vérité des modèles réellement
    // contributeurs. Les prévisions archivées ne sont pas présentées comme
    // appliquées si elles n'apparaissent pas dans cette trace.
    const trace = getPersistedForecastTrace(meteoAI?.weights, meteoAI?.computedAt);
    const appliedModelWeights = buildAppliedModelWeights(trace);
    const contributingNames = new Set(appliedModelWeights.map((model) => model.name));
    const appliedForecasts = contributingNames.size > 0
      ? forecasts.filter((forecast) => contributingNames.has(forecast.serviceName))
      : forecasts;
    const modelIndicator = buildModelIndicator(trace);

    // Détails des prévisions quotidiennes persistées.
    const allServicesList = [...WEATHER_SERVICES.expert, ...WEATHER_SERVICES.public];
    const modelDetails = appliedForecasts.map(f => {
      const service = allServicesList.find((s: { name: string }) => s.name === f.serviceName);
      const applied = appliedModelWeights.find((model) => model.name === f.serviceName);
      return {
        name: f.serviceName,
        label: service?.name ?? f.serviceName,
        tempMax: f.tempMax,
        tempMin: f.tempMin,
        precipitation: f.precipitation,
        windSpeed: f.windSpeed,
        cloudCover: f.cloudCover,
        condition: f.condition,
        averageWeight: applied?.averageWeight ?? null,
      };
    });

    // Écart calculé sur les contributeurs réels lorsque la trace est disponible.
    const tempValues = appliedForecasts.map(f => f.tempMax ?? 0).filter(v => v > 0);
    const precipValues = appliedForecasts.map(f => f.precipitation ?? 0);
    const windValues = appliedForecasts.map(f => f.windSpeed ?? 0).filter(v => v > 0);
    const divergence = {
      tempRange: tempValues.length > 1 ? Math.round((Math.max(...tempValues) - Math.min(...tempValues)) * 10) / 10 : 0,
      precipRange: precipValues.length > 1 ? Math.round((Math.max(...precipValues) - Math.min(...precipValues)) * 10) / 10 : 0,
      windRange: windValues.length > 1 ? Math.round((Math.max(...windValues) - Math.min(...windValues)) * 10) / 10 : 0,
      tempMean: tempValues.length > 0 ? Math.round(tempValues.reduce((a, b) => a + b, 0) / tempValues.length * 10) / 10 : 0,
      precipMean: precipValues.length > 0 ? Math.round(precipValues.reduce((a, b) => a + b, 0) / precipValues.length * 10) / 10 : 0,
    };

    // Les scores sont ceux du même snapshot officiel que le Dashboard.
    const confidenceScore = meteoAI?.confidenceScore ?? operationalRegime.confidence ?? 0;
    const stabilityScore = meteoAI?.stabilityIndex ?? 0;

    // 6. Transparency score (always high — we expose everything)
    const transparencyScore = trace?.parameterSources
      ? Math.min(100, 40 + Math.min(4, trace.sourceCount ?? 0) * 10 + (trace.issuedAt ? 20 : 0))
      : 0;

    // 7. AI Analysis text
    const modelCount = forecasts.length;
    const topModel = ranking.length > 0 ? ranking[0].serviceName : null;
    const convergenceLevel = divergence.tempRange < 2 ? "excellente" : divergence.tempRange < 4 ? "bonne" : "modérée";
    const aiAnalysis = [
      `MeteoAI synthétise ${modelCount} modèles numériques pour Hondeghem (50.76°N, 2.52°E).`,
      `La convergence entre les modèles est ${convergenceLevel} aujourd'hui (écart max temp : ${divergence.tempRange}°C).`,
      `Le régime détecté est "${regimeDef.label}" ${regimeDef.emoji} — les précipitations sont pondérées à ${Math.round(weights.precip * 100)}%, la température à ${Math.round(weights.temp * 100)}%.`,
      topModel
        ? `Le modèle le mieux classé sur ce site est ${topModel}, sur la seule base des observations physiques qualifiées disponibles.`
        : "Aucun modèle n’est classé : les observations physiques qualifiées disponibles ne satisfont pas encore les seuils statistiques publiés.",
      `Score de confiance global : ${confidenceScore}/100 — ${confidenceScore >= 80 ? "prévision très fiable" : confidenceScore >= 60 ? "prévision fiable" : "incertitude modérée"}.`,
    ].join(" ");

    // 8. Formula description
    const formula = {
      description: "Score MeteoAI = Σ (poids_dimension × score_dimension)",
      components: [
        { name: "Température", weight: weights.temp, description: "MAE + biais + erreur max" },
        { name: "Précipitations", weight: weights.precip, description: "POD + FAR + CSI + faux+/faux−" },
        { name: "Vent", weight: weights.wind, description: "MAE moyen + MAE rafales" },
        { name: "Conditions", weight: weights.condition, description: "Concordance catégorielle + MAE nébulosité" },
      ],
    };

    // 9. Replay steps (7 étapes de la synthèse IA)
    const replaySteps = [
      { step: 1, title: "Collecte des modèles", description: `${modelCount} modèles collectés à 05h00 via Open-Meteo API`, icon: "📡" },
      { step: 2, title: "Détection du régime", description: `Régime "${regimeDef.label}" détecté — poids contextuels appliqués`, icon: "🔍" },
      { step: 3, title: "Calcul des dimensions", description: "4 dimensions d'erreur calculées indépendamment (T°, Précip, Vent, Cond)", icon: "📐" },
      { step: 4, title: "Scoring pondéré", description: `Score final = ${Math.round(weights.temp * 100)}% T° + ${Math.round(weights.precip * 100)}% Précip + ${Math.round(weights.wind * 100)}% Vent + ${Math.round(weights.condition * 100)}% Cond`, icon: "⚖️" },
      { step: 5, title: "Analyse de divergence", description: `Écart inter-modèles : ${divergence.tempRange}°C en température, ${divergence.precipRange} mm en précipitations`, icon: "📊" },
      { step: 6, title: "Synthèse MeteoAI", description: `Prévision finale : ${meteoAI?.tempMax ?? "—"}°C max, ${meteoAI?.tempMin ?? "—"}°C min, ${meteoAI?.precipitation ?? 0} mm`, icon: "🤖" },
      { step: 7, title: "Calcul du Weather Confidence Score", description: `Confiance : ${confidenceScore}/100 — Stabilité : ${stabilityScore}/100`, icon: "✅" },
    ];

    // 10. Sources with freshness info
    const lastForecastJob = jobs.find(j => j.jobType === "forecast");
    const lastObsJob = jobs.find(j => j.jobType === "observation");

    // 11. Historical time series for chart
    const rawTimeSeries = await getHistoricalScoreTimeSeries(14, locationKey ?? "default");
    const tsByDate: Record<string, Record<string, number>> = {};
    rawTimeSeries.forEach(row => {
      if (!tsByDate[row.date]) tsByDate[row.date] = {};
      tsByDate[row.date][row.serviceName] = row.weightedScore ?? 0;
    });
    const allServices = Array.from(new Set(rawTimeSeries.map(r => r.serviceName)));
    const historicalTimeSeries = Object.entries(tsByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, scores]) => ({
        date,
        ...Object.fromEntries(allServices.map(s => [s, scores[s] ?? null])),
      }));

    const sources = [
      { name: "Open-Meteo API", type: "Prévisions de modèles", models: WEATHER_SERVICES.expert.map((model) => model.name), updateFrequency: "Selon le modèle", lastSync: lastForecastJob?.startedAt ? new Date(lastForecastJob.startedAt).toISOString() : null, quality: "Prévisions, pas observations" },
      { name: "Modèles en validation", type: "Prévisions candidates", models: VALIDATION_WEATHER_MODELS.map((model) => model.name), updateFrequency: "Collecte quotidienne", lastSync: lastForecastJob?.startedAt ? new Date(lastForecastJob.startedAt).toISOString() : null, quality: "Hors fusion officielle" },
      { name: "Stations physiques", type: "Observations locales", models: [], updateFrequency: "Selon la dernière collecte", lastSync: lastObsJob?.startedAt ? new Date(lastObsJob.startedAt).toISOString() : null, quality: "Netatmo actif ; autres sources seulement si réellement collectées" },
      { name: "Scores de fiabilité", type: "Comparaisons qualifiées", models: [], updateFrequency: "Après observation physique", lastSync: lastObsJob?.startedAt ? new Date(lastObsJob.startedAt).toISOString() : null, quality: "Aucun classement avant seuil statistique" },
    ];
    const latestStationCollection = (await getStationCollectionSnapshots(locationKey ?? "default", 1))[0] ?? null;
    const activeModelNames = WEATHER_SERVICES.expert.map((model) => model.name);
    const dailyMissingModels = latestStationCollection ? getMissingModelNames(latestStationCollection.dailyMissingModels) : [];
    const hourlyMissingModels = latestStationCollection ? getMissingModelNames(latestStationCollection.hourlyMissingModels) : [];

    return {
      date: today,
      regime,
      regimeLabel: regimeDef.label,
      regimeEmoji: regimeDef.emoji,
      regimeDescription: regimeDef.description,
      weights,
      allRegimes: EXTENDED_REGIME_INFO,
      modelDetails,
      divergence,
      confidenceScore,
      stabilityScore,
      transparencyScore,
      trace,
      modelIndicator,
      appliedModelWeights,
      officialForecast: {
        tempMax: meteoAI?.tempMax ?? null,
        tempMin: meteoAI?.tempMin ?? null,
        precipitation: meteoAI?.precipitation ?? null,
        windSpeed: meteoAI?.windSpeed ?? null,
        computedAt: meteoAI?.computedAt ?? null,
      },
      latestStationCollection: latestStationCollection ? {
        physicalStationCount: latestStationCollection.physicalStationCount,
        radiusKm: latestStationCollection.radiusKm,
        dailyModelCount: latestStationCollection.dailyModelCount,
        hourlyModelCount: latestStationCollection.hourlyModelCount,
        dailyMissingModels,
        hourlyMissingModels,
        dailyCollectedModels: getCollectedModelNames(activeModelNames, dailyMissingModels),
        hourlyCollectedModels: getCollectedModelNames(activeModelNames, hourlyMissingModels),
        status: latestStationCollection.status,
        collectedAt: latestStationCollection.collectedAt,
      } : null,
      aiAnalysis,
      formula,
      replaySteps,
      sources,
      engineVersion: "MeteoAI v2.0 — Multi-Dimension",
      calculatedAt: meteoAI?.computedAt ?? null,
      snapshotStatus,
      snapshotDate,
      regimeSource: operationalRegime.source,
      regimeSourceLabel: operationalRegime.sourceLabel,
      regimeSourceUpdatedAt: operationalRegime.sourceUpdatedAt,
      regimeSourceAgeMinutes: operationalRegime.sourceAgeMinutes,
      regimeDataCoverage: operationalRegime.dataCoverage,
      modelsUsed: appliedModelWeights.length || modelDetails.length,
      historicalTimeSeries,
      historicalServices: allServices,
    };
  }),

  /** Couverture des observations physiques requise avant tout score qualifié. */
  getEvidenceStatus: publicProcedure
    .input(z.object({ lat: latitudeSchema.optional(), lon: longitudeSchema.optional() }))
    .query(async ({ input }) => {
      const lat = input.lat ?? HONDEGHEM.lat;
      const lon = input.lon ?? HONDEGHEM.lon;
      const evidence = await getQualifiedEvidenceStatus(makeLocationKey(lat, lon));
      return {
        ...evidence,
        requiredCoverageHours: 18,
        isEligible: evidence.coverageHours >= 18,
        evidenceTimeZone: "Europe/Paris",
        snapshotCadence: "Chaque heure à :05 UTC",
        dailyScoringSchedule: "22:30 UTC, sur la journée Europe/Paris précédente",
      };
    }),

  /**
   * Search nearby weather stations from all sources within a configurable radius.
   */
  searchStations: publicProcedure
    .input(z.object({
      lat: latitudeSchema.optional(),
      lon: longitudeSchema.optional(),
      radiusKm: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const lat = input.lat ?? HONDEGHEM.lat;
      const lon = input.lon ?? HONDEGHEM.lon;
      const radiusKm = input.radiusKm;

      let netatmoStatus: import("../netatmoService").NetatmoAvailability = "not_connected";
      const [stations, currentModelReferences] = await Promise.all([
        collectNearbyStations(lat, lon, radiusKm, "Local", {
          netatmoUserId: ctx.user?.id,
          onNetatmoStatus: (status) => { netatmoStatus = status; },
        }),
        fetchCurrentModelReferences(lat, lon),
      ]);
      const ranked = rankStations(stations);
      const physicalStations = getPhysicalActiveStations(ranked);
      const discoveredPhysicalStations = ranked.filter((station) => getStationSourceKind(station.source, station.stationId) === "physical");
      const excludedPhysicalStations = discoveredPhysicalStations.filter((station) => !station.isActive);
      // La vérité terrain locale ne repose que sur des observations physiques validées.
      const ultraResult = calculateUltraLocal(physicalStations, "local", lat, lon, null, null);
      const modelReferences = buildModelReferenceCoherence(
        currentModelReferences,
        physicalStations
          .map((station) => station.temperature)
          .filter((temperature): temperature is number => temperature !== null),
      );
      const groundTruth = {
        temperature: ultraResult.temperature,
        humidity: ultraResult.humidity,
        pressure: ultraResult.pressure,
        windSpeed: ultraResult.windSpeed,
        windGust: ultraResult.windGust,
        precipitation: ultraResult.precipitation,
        stationsUsed: ultraResult.stationsUsed.map(s => ({
          stationId: s.stationId,
          name: s.name,
          source: s.source,
          distanceKm: s.distanceKm,
          weight: s.weight,
          distanceWeight: s.distanceWeight,
          qualityWeight: s.qualityWeight,
          freshnessWeight: s.freshnessWeight,
          temperature: s.temperature,
          humidity: s.humidity,
          pressure: s.pressure,
          windSpeed: s.windSpeed,
          precipitation: s.precipitation,
        })),
        stationsIgnored: ultraResult.stationsIgnored.map(s => ({
          stationId: s.stationId,
          name: s.name,
          source: s.source,
          distanceKm: s.distanceKm,
          reason: s.reason,
        })),
        stationCount: ultraResult.stationCount,
        confidenceScore: ultraResult.confidenceScore,
      };

      return {
        lat,
        lon,
        radiusKm,
        stations: ranked.map(s => ({
          stationId: s.stationId,
          source: s.source,
          sourceKind: getStationSourceKind(s.source, s.stationId),
          name: s.name,
          lat: s.lat,
          lon: s.lon,
          altitude: s.altitude,
          distanceKm: s.distanceKm,
          temperature: s.temperature,
          humidity: s.humidity,
          pressure: s.pressure,
          windSpeed: s.windSpeed,
          windGust: s.windGust,
          windDirection: s.windDirection,
          precipitation: s.precipitation,
          updatedAt: s.updatedAt,
          reliabilityScore: s.reliabilityScore,
          updateFrequencyMin: s.updateFrequencyMin,
          dataAvailability: s.dataAvailability,
          isActive: s.isActive,
          exclusionReason: s.exclusionReason,
          qualificationStatus: s.qualificationStatus,
          sourceTier: s.sourceTier,
        })),
        modelReferences,
        groundTruth,
        totalFound: stations.length,
        activeCount: physicalStations.length,
        ignoredCount: stations.filter(s => !s.isActive).length,
        physicalStationCount: physicalStations.length,
        physicalStationDiagnostics: {
          netatmoStatus,
          discoveredCount: discoveredPhysicalStations.length,
          activeCount: physicalStations.length,
          exclusionReasons: Array.from(new Set(excludedPhysicalStations.map((station) => station.exclusionReason).filter((reason): reason is string => Boolean(reason)))).slice(0, 3),
        },
        referenceSourceCount: modelReferences.length,
        fetchedAt: new Date().toISOString(),
      };
    }),

  /**
   * Get ground truth for a location (weighted average from nearby stations).
   */
  getGroundTruth: publicProcedure
    .input(z.object({
      lat: latitudeSchema.optional(),
      lon: longitudeSchema.optional(),
      radiusKm: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const lat = input.lat ?? HONDEGHEM.lat;
      const lon = input.lon ?? HONDEGHEM.lon;

      const stations = await collectNearbyStations(lat, lon, input.radiusKm);
      const ranked = rankStations(stations);
      // Unified engine — same as Mode Local in Dashboard
      const result = calculateUltraLocal(ranked, "local", lat, lon, null, null);
      return {
        temperature: result.temperature,
        humidity: result.humidity,
        pressure: result.pressure,
        windSpeed: result.windSpeed,
        windGust: result.windGust,
        precipitation: result.precipitation,
        stationsUsed: result.stationsUsed.map(s => ({
          stationId: s.stationId,
          name: s.name,
          source: s.source,
          distanceKm: s.distanceKm,
          weight: s.weight,
          distanceWeight: s.distanceWeight,
          qualityWeight: s.qualityWeight,
          freshnessWeight: s.freshnessWeight,
          temperature: s.temperature,
          humidity: s.humidity,
          pressure: s.pressure,
          windSpeed: s.windSpeed,
          precipitation: s.precipitation,
        })),
        stationsIgnored: result.stationsIgnored.map(s => ({
          stationId: s.stationId,
          name: s.name,
          source: s.source,
          distanceKm: s.distanceKm,
          reason: s.reason,
        })),
        stationCount: result.stationCount,
        confidenceScore: result.confidenceScore,
      };
    }),

  /**
   * Get ranking criteria explanation for a set of stations.
   */
  getStationRankingCriteria: publicProcedure.query(() => {
    return {
      criteria: [
        { name: "Distance", weight: 40, description: "Plus la station est proche, plus son poids est élevé (inverse de la distance)" },
        { name: "Fiabilité historique", weight: 30, description: "Score de cohérence basé sur l'historique de la station" },
        { name: "Disponibilité", weight: 20, description: "Fraction des mises à jour attendues effectivement reçues" },
        { name: "Fréquence", weight: 10, description: "Stations à mise à jour fréquente (toutes les 5-10 min) favorisées" },
      ],
      groundTruthWeights: {
        distance: 50,
        qualityHistory: 30,
        freshness: 20,
      },
      exclusionRules: [
        "Aucune donnée disponible (température, vent et précipitations toutes nulles)",
        "Données trop anciennes (> 120 minutes)",
        "Score de fiabilité trop bas (< 40/100)",
      ],
      sources: [
        { id: "meteofrance", name: "Météo-France StatIC", reliability: 92, updateFreqMin: 60 },
        { id: "synop", name: "SYNOP/WMO (ECMWF)", reliability: 88, updateFreqMin: 60 },
        { id: "noaa", name: "NOAA International", reliability: 85, updateFreqMin: 60 },
        { id: "openmeteo", name: "Open-Meteo Grid", reliability: 80, updateFreqMin: 60 },
        { id: "davis", name: "Davis Instruments", reliability: 78, updateFreqMin: 10 },
        { id: "netatmo", name: "Netatmo Public", reliability: 65, updateFreqMin: 10 },
        { id: "cwop", name: "CWOP/APRS Amateur", reliability: 60, updateFreqMin: 15 },
        { id: "wunderground", name: "Weather Underground PWS", reliability: 58, updateFreqMin: 5 },
      ],
    };
  }),

  /**
   * Get full details for a single station by ID, including live data refresh.
   */
  getStationDetail: publicProcedure
    .input(z.object({
      stationId: z.string(),
      lat: latitudeSchema.optional(),
      lon: longitudeSchema.optional(),
      radiusKm: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const lat = input.lat ?? HONDEGHEM.lat;
      const lon = input.lon ?? HONDEGHEM.lon;
      const stations = await collectNearbyStations(lat, lon, input.radiusKm);
      const station = stations.find(s => s.stationId === input.stationId);
      if (!station) return null;
      return {
        ...station,
        groundTruthContribution: (() => {
          const ranked = rankStations(stations);
          // Unified engine — same as Mode Local in Dashboard
          const gt = calculateUltraLocal(ranked, "local", lat, lon, null, null);
          const used = gt.stationsUsed.find(s => s.stationId === input.stationId);
          return used ? { weight: used.weight, distanceWeight: used.distanceWeight, qualityWeight: used.qualityWeight, freshnessWeight: used.freshnessWeight } : null;
        })(),
      };
    }),

  /**
   * Get lead-time scores (MAE/RMSE/biais par échéance) for a location.
   * Returns per-service, per-bucket (0-6h, 6-24h, 1-3d, 4-7d, 8-15d) averages.
   */
  getLeadTimeScores: publicProcedure
    .input(z.object({
      lat: latitudeSchema.optional(),
      lon: longitudeSchema.optional(),
      days: z.number().min(1).max(90).default(14),
    }).optional())
    .query(async ({ input }) => {
      const lat = input?.lat ?? HONDEGHEM.lat;
      const lon = input?.lon ?? HONDEGHEM.lon;
      const locKey = makeLocationKey(lat, lon);
      const days = input?.days ?? 14;
      const scores = await getLeadTimeScoresForLocation(locKey, days);
      return { locationKey: locKey, days, scores };
    }),

  /** Physical station evidence and official forecast, aligned by Paris hour. */
  getStationReliabilityOverview: publicProcedure
    .input(z.object({
      lat: latitudeSchema.optional(),
      lon: longitudeSchema.optional(),
      periodDays: z.union([z.literal(1), z.literal(7)]).optional(),
      radiusKm: z.number().min(5).max(50).optional(),
    }).optional())
    .query(async ({ input }) => {
      const lat = input?.lat ?? HONDEGHEM.lat;
      const lon = input?.lon ?? HONDEGHEM.lon;
      const periodDays = input?.periodDays ?? 1;
      const now = Date.now();
      const sinceMs = now - periodDays * 24 * 60 * 60 * 1000;
      const locationKey = makeLocationKey(lat, lon);
      const date = getTodayParis();
      const [stationData, hourlyRows, collectionSnapshots] = await Promise.all([
        getPhysicalStationHistory(lat, lon, sinceMs),
        getStoredHourlyForecasts(locationKey, date),
        getStationCollectionSnapshots(locationKey, 14),
      ]);
      const qualityProfiles = await getStationQualityProfiles(stationData.stations.map((station) => station.stationId));
      const qualityByStationId = new Map(qualityProfiles.map((profile) => [profile.stationId, profile]));

      const officialRows = hourlyRows.filter((row) => row.modelName === "best_match");
      const byHour = new Map<number, Array<{ temperature: number | null; windSpeed: number | null; precipitation: number | null }>>();
      for (const station of stationData.stations) {
        for (const reading of station.readings) {
          const hour = Number(new Intl.DateTimeFormat("fr-FR", {
            timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23",
          }).format(new Date(reading.observedAt)));
          const list = byHour.get(hour) ?? [];
          list.push(reading);
          byHour.set(hour, list);
        }
      }

      const comparison24h = Array.from({ length: 24 }, (_, hour) => {
        const readings = byHour.get(hour) ?? [];
        const average = (key: "temperature" | "windSpeed" | "precipitation") => {
          const values = readings.map((reading) => reading[key]).filter((value): value is number => value !== null);
          return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
        };
        const forecast = officialRows.find((row) => row.hour === hour);
        return {
          hour,
          stationTemperature: average("temperature"),
          stationWindSpeed: average("windSpeed"),
          stationPrecipitation: average("precipitation"),
          stationSampleCount: readings.length,
          officialTemperature: forecast?.temperature ?? null,
          officialWindSpeed: forecast?.windSpeed ?? null,
          officialPrecipitation: forecast?.precipitation ?? null,
        };
      });

      const parisDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });
      const dateFormatter = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short" });
      const stationByDate = new Map<string, Array<{ temperature: number | null; windSpeed: number | null; precipitation: number | null }>>();
      for (const station of stationData.stations) {
        for (const reading of station.readings) {
          const key = parisDate.format(new Date(reading.observedAt));
          const list = stationByDate.get(key) ?? [];
          list.push(reading);
          stationByDate.set(key, list);
        }
      }
      const officialHistory = await getLatestMeteoAIForecasts(7, locationKey);
      const officialByDate = new Map(officialHistory.map((forecast) => [forecast.date, forecast]));
      const comparison7d = Array.from({ length: 7 }, (_, index) => {
        const targetDate = getParisDateDaysAgo(6 - index);
        const readings = stationByDate.get(targetDate) ?? [];
        const stationTemps = readings.map((reading) => reading.temperature).filter((value): value is number => value !== null);
        const official = officialByDate.get(targetDate);
        const officialTemperature = official && official.tempMax !== null && official.tempMin !== null
          ? Math.round(((official.tempMax + official.tempMin) / 2) * 10) / 10
          : null;
        return {
          label: dateFormatter.format(new Date(`${targetDate}T12:00:00+02:00`)),
          stationTemperature: stationTemps.length ? Math.round((stationTemps.reduce((sum, value) => sum + value, 0) / stationTemps.length) * 10) / 10 : null,
          officialTemperature,
          stationSampleCount: readings.length,
        };
      });

      const currentParisHour = Number(new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23",
      }).format(new Date())) % 24;
      const instant = comparison24h[currentParisHour];
      const instantDeltaC = instant && instant.stationTemperature !== null && instant.officialTemperature !== null
        ? Math.round((instant.stationTemperature - instant.officialTemperature) * 10) / 10
        : null;

      return {
        locationKey,
        center: { lat, lon },
        periodDays,
        radiusKm: input?.radiusKm ?? stationData.latestGroundTruth?.radiusKm ?? 20,
        collectedAt: stationData.latestGroundTruth?.computedAt ?? null,
        latestGroundTruth: stationData.latestGroundTruth,
        latestCollection: collectionSnapshots[0] ?? null,
        availabilityHistory: [...collectionSnapshots].reverse().map((snapshot) => ({
          date: snapshot.date,
          collectedAt: snapshot.collectedAt,
          radiusKm: snapshot.radiusKm,
          physicalStationCount: snapshot.physicalStationCount,
          dailyModelCount: snapshot.dailyModelCount,
          hourlyModelCount: snapshot.hourlyModelCount,
          dailyMissingModels: snapshot.dailyMissingModels,
          hourlyMissingModels: snapshot.hourlyMissingModels,
          status: snapshot.status,
        })),
        stations: stationData.stations.map((station) => {
          const latest = station.readings.at(-1) ?? null;
          const qualityProfile = qualityByStationId.get(station.stationId) ?? null;
          return {
            stationId: station.stationId,
            name: station.name,
            source: station.source,
            lat: station.lat,
            lon: station.lon,
            distanceKm: station.distanceKm,
            reliabilityScore: station.reliabilityScore,
            updateFrequencyMin: station.updateFrequencyMin,
            latest,
            ageMinutes: latest ? Math.max(0, Math.round((now - latest.observedAt) / 60000)) : null,
            readings: station.readings,
            qualityProfile,
          };
        }),
        comparison24h,
        comparison7d,
        instantDeltaC,
      };
    }),

  /**
   * Laboratory: a strict read-model over qualified physical evidence only.
   * It never ranks legacy/model-reference scores as if they were observations.
   */
  getReliabilityLaboratory: publicProcedure
    .input(z.object({
      lat: latitudeSchema.optional(),
      lon: longitudeSchema.optional(),
      period: z.enum(["24h", "7d", "30d", "90d", "365d"]).default("30d"),
      horizon: z.enum(["0-6h", "6-24h", "24-48h", "2-3d", "4-7d", "8-10d", "11-15d"]).default("6-24h"),
    }).optional())
    .query(async ({ input }) => buildReliabilityLaboratory({
      lat: input?.lat ?? HONDEGHEM.lat,
      lon: input?.lon ?? HONDEGHEM.lon,
      period: input?.period ?? "30d",
      horizon: input?.horizon ?? "6-24h",
    })),
});
