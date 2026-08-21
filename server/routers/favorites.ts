import { z } from "zod";
import { publicProcedure, protectedProcedure } from "../_core/trpc";
import { router } from "../_core/trpc";
import {
  getFavoriteLocations,
  addFavoriteLocation,
  updateFavoriteLocation,
  deleteFavoriteLocation,
  setDefaultFavorite,
  getLocationForecastsForUser,
  getLocationForecast,
  getMeteoAIForecastByDate,
  makeLocationKey,
} from "../db";

export type DashboardCurrentTemperature = {
  temperature: number;
  stationCount: number;
  confidenceScore: number | null;
  source: "local_validated" | "model_fallback";
  observedAt: string | null;
  deltaFromOfficialC: number | null;
};

export type LocalModeTemperatureResolution = {
  temperature: number | null;
  usesOfficialFallback: boolean;
  microclimateAdjustment: number;
  usesModelFallback: boolean;
};

/**
 * Aucun mode local ne doit modifier la température officielle sans observation
 * physique qualifiée. Le repli conserve donc la même valeur et annule tout
 * micro-ajustement heuristique.
 */
export function resolveLocalModeTemperature(input: {
  officialTemperature: number | null;
  localTemperature: number | null;
  physicalStationCount: number;
  microclimateAdjustment: number;
  modelFallbackTemperature?: number | null;
}): LocalModeTemperatureResolution {
  if (input.physicalStationCount < 1) {
    const usesModelFallback = input.modelFallbackTemperature != null;
    return {
      temperature: input.modelFallbackTemperature ?? input.officialTemperature,
      usesOfficialFallback: !usesModelFallback,
      microclimateAdjustment: 0,
      usesModelFallback,
    };
  }
  return {
    temperature: input.localTemperature ?? input.officialTemperature,
    usesOfficialFallback: false,
    microclimateAdjustment: input.microclimateAdjustment,
    usesModelFallback: false,
  };
}

export function buildDashboardCurrentTemperature(input: {
  localMode: "standard" | "local" | "ultra-local";
  temperature: number | null;
  stationCount: number;
  confidenceScore: number | null;
  observedAt: string | Date | null;
  officialTemperature: number | null;
  modelFallbackTemperature?: number | null;
  modelFallbackCount?: number;
}): DashboardCurrentTemperature | null {
  if (input.localMode === "standard") return null;
  const hasPhysicalStation = input.temperature != null && input.stationCount > 0;
  const hasModelFallback = !hasPhysicalStation && input.modelFallbackTemperature != null && (input.modelFallbackCount ?? 0) >= 2;
  if (!hasPhysicalStation && !hasModelFallback) return null;
  const temperature = hasPhysicalStation ? input.temperature! : input.modelFallbackTemperature!;
  const observedAt = input.observedAt ? new Date(input.observedAt) : null;
  return {
    temperature,
    stationCount: hasPhysicalStation ? input.stationCount : 0,
    confidenceScore: input.confidenceScore,
    source: hasPhysicalStation ? "local_validated" : "model_fallback",
    observedAt: observedAt && Number.isFinite(observedAt.getTime()) ? observedAt.toISOString() : null,
    deltaFromOfficialC: input.officialTemperature == null
      ? null
      : Math.round((temperature - input.officialTemperature) * 10) / 10,
  };
}

/**
 * Les identifiants Netatmo proviennent exclusivement de la session résolue côté
 * serveur. Aucun identifiant de compte ne doit être reçu depuis le navigateur.
 */
export function getDashboardNetatmoCollectionOptions(
  user: { id: number } | null | undefined,
  onNetatmoStatus?: (status: import("../netatmoService").NetatmoAvailability) => void,
) {
  return user?.id !== undefined
    ? { netatmoUserId: user.id, onNetatmoStatus }
    : { onNetatmoStatus };
}

/**
 * La trace de fusion doit respecter les mêmes limites que le mode présenté.
 * Le mode Standard conserve son horizon de comparaison plus large ; Local et
 * Ultra-local ne peuvent jamais réadmettre une station rejetée par leur mode.
 */
export function getModeAlignedFusionConstraints(mode: LocalMode) {
  const modeConfig = getUltraLocalConfig(mode).config;
  if (mode === "standard") {
    return { maxFreshnessMin: 180, maxTempDeviationC: 6, minReliabilityScore: 40, modelWeightFraction: 0.25 };
  }
  return {
    maxFreshnessMin: modeConfig.maxFreshnessMin,
    maxTempDeviationC: modeConfig.maxTempDeviation,
    minReliabilityScore: modeConfig.minReliability,
    modelWeightFraction: modeConfig.modelWeight,
  };
}

import { collectNearbyStations, rankStations, calculateGroundTruth, getPhysicalActiveStations, fetchCurrentModelReferences } from "../stationService";
import { collect15DayForecast, collectHourlyForecast } from "../weatherServices";
import { computeFusion, detectMultiRegime, EXTENDED_REGIME_INFO, type FusionSource } from "../fusionEngine";
import { calculateUltraLocal, getUltraLocalConfig, type LocalMode } from "../ultraLocalService";
import { getPreviousReadings, recordStationReadings } from "../stationReadingsCache";
import { getParisDate } from "../weatherTime";
import { buildOfficialModelFallback } from "../modelFallback";
import { resolveOfficialWeatherSnapshot } from "../officialWeatherSnapshot";

export const favoritesRouter = router({
  /**
   * Get all favorites for the current user (max 8).
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return getFavoriteLocations(ctx.user.id);
  }),

  /**
   * Add a new favorite location.
   */
  add: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(256),
      customName: z.string().max(256).optional(),
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      position: z.number().min(0).max(7).optional(),
      radiusKm: z.number().min(5).max(50).optional(),
      tempUnit: z.enum(["celsius", "fahrenheit"]).optional(),
      localMode: z.enum(["standard", "local", "ultra-local"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await addFavoriteLocation({
        userId: ctx.user.id,
        name: input.name,
        customName: input.customName ?? null,
        lat: input.lat,
        lon: input.lon,
        position: input.position ?? 0,
        radiusKm: input.radiusKm ?? 20,
        tempUnit: input.tempUnit ?? "celsius",
        localMode: input.localMode ?? "standard",
      });
      if (id === null) {
        throw new Error("Maximum 8 favoris atteint");
      }
      return { id };
    }),

  /**
   * Update a favorite location (name, settings, position).
   */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      customName: z.string().max(256).optional(),
      radiusKm: z.number().min(5).max(50).optional(),
      preferredModels: z.array(z.string()).optional(),
      tempUnit: z.enum(["celsius", "fahrenheit"]).optional(),
      localMode: z.enum(["standard", "local", "ultra-local"]).optional(),
      alertsEnabled: z.boolean().optional(),
      alertThresholds: z.object({
        precipMm: z.number().optional(),
        windKmh: z.number().optional(),
        tempMin: z.number().optional(),
        tempMax: z.number().optional(),
      }).optional(),
      position: z.number().min(0).max(7).optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const updateData: Record<string, unknown> = {};
      if (data.customName !== undefined) updateData.customName = data.customName;
      if (data.radiusKm !== undefined) updateData.radiusKm = data.radiusKm;
      if (data.preferredModels !== undefined) updateData.preferredModels = data.preferredModels;
      if (data.tempUnit !== undefined) updateData.tempUnit = data.tempUnit;
      if (data.localMode !== undefined) updateData.localMode = data.localMode;
      if (data.alertsEnabled !== undefined) updateData.alertsEnabled = data.alertsEnabled ? 1 : 0;
      if (data.alertThresholds !== undefined) updateData.alertThresholds = data.alertThresholds;
      if (data.position !== undefined) updateData.position = data.position;
      if (data.isDefault) {
        await setDefaultFavorite(id, ctx.user.id);
      }
      if (Object.keys(updateData).length > 0) {
        await updateFavoriteLocation(id, ctx.user.id, updateData as any);
      }
      return { success: true };
    }),

  /**
   * Delete a favorite location.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteFavoriteLocation(input.id, ctx.user.id);
      return { success: true };
    }),

  /**
   * Set a favorite as default (shown on app start).
   */
  setDefault: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await setDefaultFavorite(input.id, ctx.user.id);
      return { success: true };
    }),

  /**
   * Get Ultra-local mode configuration details.
   */
  getUltraLocalConfig: publicProcedure
    .input(z.object({
      mode: z.enum(["standard", "local", "ultra-local"]).default("standard"),
    }))
    .query(({ input }) => {
      return getUltraLocalConfig(input.mode);
    }),

  /**
   * Get full weather data for a specific location with Ultra-local mode support.
   * Returns: current conditions, hourly, 15-day, stations, AI scores, ultra-local details.
   */
  getLocationWeather: publicProcedure
    .input(z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      radiusKm: z.number().min(5).max(50).default(20),
      localMode: z.enum(["standard", "local", "ultra-local"]).default("standard"),
      name: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { lat, lon, radiusKm, localMode } = input;

      // Les deux modes ont des rayons explicites : Ultra-local ne mélange jamais
      // de station au-delà de 10 km, tandis que Local décrit le secteur élargi.
      const searchRadius = localMode === "ultra-local"
        ? 10
        : localMode === "local"
          ? 30
          : radiusKm;

      // Parallel fetch: 15-day, hourly, stations
      const todayDate = getParisDate();
      const coords = { lat, lon };
      const locationKey = makeLocationKey(lat, lon);
      let netatmoStatus: import("../netatmoService").NetatmoAvailability = ctx.user ? "temporarily_unavailable" : "not_connected";
      const [officialSnapshot, stations, currentModelReferences, meteoAI] = await Promise.all([
        resolveOfficialWeatherSnapshot(coords),
        collectNearbyStations(
          lat,
          lon,
          searchRadius,
          input.name ?? "Local",
          getDashboardNetatmoCollectionOptions(ctx.user, (status) => { netatmoStatus = status; }),
        ),
        fetchCurrentModelReferences(lat, lon),
        getMeteoAIForecastByDate(todayDate, locationKey),
      ]);
      const hourly = officialSnapshot.hourly;
      const forecast15d = officialSnapshot.daily;

      // Ultra-local calculation
      const ranked = rankStations(stations);
      const physicalStations = getPhysicalActiveStations(ranked);
      const nowHour = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).slice(0, 2) + ":00";
      const officialCurrentTemperature = hourly.find((hour) => hour.hour === nowHour)?.temp ?? hourly[0]?.temp ?? null;
      const modelFallback = buildOfficialModelFallback(currentModelReferences, meteoAI?.weights);
      const ultraLocalResult = calculateUltraLocal(physicalStations, localMode, lat, lon, null, officialCurrentTemperature);
      const modeFusionConstraints = getModeAlignedFusionConstraints(localMode);

      // ── Fusion avancée en production (IDW + qualité + fraîcheur + MAE + anomalies) ──
      // Les stations locales représentent la réalité observée ; la prévision horaire
      // Open-Meteo sert de contribution modèle limitée. L'historique est récupéré
      // avant le calcul, puis enrichi après celui-ci pour détecter les valeurs figées
      // ou les sauts brusques lors de l'appel suivant.
      const previousReadings = getPreviousReadings();
      const fusionSources: FusionSource[] = physicalStations
        .filter((station) => station.temperature != null)
        .map((station) => ({
          id: station.stationId,
          name: station.name,
          distanceKm: station.distanceKm,
          altitude: station.altitude,
          temperature: station.temperature,
          humidity: station.humidity,
          pressure: station.pressure,
          windSpeed: station.windSpeed,
          windGust: station.windGust,
          windDirection: station.windDirection,
          precipitation: station.precipitation,
          updatedAt: station.updatedAt,
          reliabilityScore: station.reliabilityScore,
          type: "station",
        }));

      // Le point de grille au lieu demandé demeure disponible lorsque les stations
      // sont rares, sans écraser leur contribution locale dans les modes Local/Ultra-local.
      if (hourly[0]) {
        fusionSources.push({
          id: "openmeteo_best_match",
          name: "Open-Meteo Best Match",
          distanceKm: 0,
          temperature: officialCurrentTemperature,
          apparentTemp: hourly[0].apparentTemp ?? null,
          humidity: hourly[0].humidity ?? null,
          pressure: hourly[0].pressure ?? null,
          windSpeed: hourly[0].windSpeed ?? null,
          windGust: hourly[0].windGust ?? null,
          windDirection: hourly[0].windDirection ?? null,
          precipitation: hourly[0].precipitation ?? null,
          cloudCover: hourly[0].cloudCover ?? null,
          updatedAt: new Date(),
          reliabilityScore: 75,
          type: "model",
        });
      }

      const advancedFusion = computeFusion(
        fusionSources,
        {
          idwExponent: 2,
          maxDistanceKm: searchRadius,
          maxFreshnessMin: modeFusionConstraints.maxFreshnessMin,
          maxTempDeviationC: modeFusionConstraints.maxTempDeviationC,
          minReliabilityScore: modeFusionConstraints.minReliabilityScore,
          altitudeCorrectionEnabled: true,
          anomalyDetectionEnabled: true,
          adaptiveWeightingEnabled: true,
          modelWeightFraction: modeFusionConstraints.modelWeightFraction,
        },
        previousReadings
      );

      recordStationReadings(
        ranked
          .filter((station) => station.isActive && station.temperature != null)
          .map((station) => ({ stationId: station.stationId, temperature: station.temperature! }))
      );

      // Standard ground truth (for comparison)
      const groundTruth = calculateGroundTruth(physicalStations);

      // Today's synthesis
      const todayForecast = forecast15d[0];
      // Regime detection using new multi-regime system
      const avgTemp = todayForecast?.tempMax != null && todayForecast?.tempMin != null
        ? (todayForecast.tempMax + todayForecast.tempMin) / 2
        : todayForecast?.tempMax ?? todayForecast?.tempMin ?? 15;
      const multiRegimeResult = detectMultiRegime({
        temperature: avgTemp,
        precipitation: todayForecast?.precipitation ?? 0,
        windSpeed: todayForecast?.windSpeed ?? 0,
        cloudCover: todayForecast?.cloudCover ?? null,
        humidity: null,
        visibility: null,
      });
      // Legacy compat
      const regimeInfo = {
        regime: multiRegimeResult.primaryRegime.id,
        label: multiRegimeResult.primaryRegime.label,
        emoji: multiRegimeResult.primaryRegime.emoji,
        description: multiRegimeResult.description,
        weights: multiRegimeResult.blendedWeights,
      };

      // Stabilité = dispersion entre modèles. La confiance locale suit les
      // stations effectivement admises par le mode affiché ; la fusion avancée
      // reste une trace de contrôle avec les mêmes seuils d’admission.
      const temps = forecast15d.map((forecast) => forecast.tempMax).filter((value): value is number => value != null);
      const divergence = temps.length > 1 ? Math.max(...temps) - Math.min(...temps) : 0;
      const modeUsesLocalStations = localMode !== "standard";
      const confidenceScore = modeUsesLocalStations ? ultraLocalResult.confidenceScore : advancedFusion.confidenceScore;
      const stabilityIndex = Math.max(0, Math.min(100, 100 - divergence * 4));
      const localTemperature = modeUsesLocalStations
        ? ultraLocalResult.temperature
        : advancedFusion.temperature ?? ultraLocalResult.temperature;
      const localStationCount = modeUsesLocalStations ? ultraLocalResult.stationCount : advancedFusion.stationCount;
      const localModeTemperature = resolveLocalModeTemperature({
        officialTemperature: officialCurrentTemperature,
        localTemperature,
        physicalStationCount: localStationCount,
        microclimateAdjustment: ultraLocalResult.microclimateAdjustment,
        modelFallbackTemperature: modelFallback?.temperature ?? null,
      });
      const usedLocalSourceIds = new Set(modeUsesLocalStations
        ? ultraLocalResult.stationsUsed.map((station) => station.stationId)
        : advancedFusion.usedSources.filter((source) => source.type === "station").map((source) => source.id));
      const latestLocalSourceAt = fusionSources
        .filter((source) => source.type === "station" && usedLocalSourceIds.has(source.id) && source.updatedAt)
        .map((source) => new Date(source.updatedAt!))
        .filter((date) => Number.isFinite(date.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      const currentObservation = buildDashboardCurrentTemperature({
        localMode,
        temperature: localModeTemperature.usesOfficialFallback ? null : localTemperature,
        stationCount: localStationCount,
        confidenceScore,
        observedAt: latestLocalSourceAt,
        officialTemperature: officialCurrentTemperature,
        modelFallbackTemperature: modelFallback?.temperature ?? null,
        modelFallbackCount: modelFallback?.modelCount ?? 0,
      });

      return {
        location: { lat, lon },
        officialSnapshot: {
          validAt: officialSnapshot.validAt,
          computedAt: officialSnapshot.computedAt,
          sourceKind: officialSnapshot.sourceKind,
          source: officialSnapshot.source,
        },
        localMode,
        netatmo: { status: netatmoStatus },
        today: todayForecast ? {
          tempMax: todayForecast.tempMax,
          tempMin: todayForecast.tempMin,
          precipitation: todayForecast.precipitation,
          windSpeed: todayForecast.windSpeed,
          cloudCover: todayForecast.cloudCover,
          condition: todayForecast.condition,
          apparentTemp: hourly[0]?.apparentTemp ?? null,
          uvIndex: hourly[0]?.uvIndex ?? null,
          windDirection: hourly[0]?.windDirection ?? null,
        } : null,
        hourly: hourly.slice(0, 24),
        forecast15d,
        stations: {
          active: stations.filter(s => s.isActive).length,
          total: stations.length,
          groundTruth: {
            temperature: groundTruth.temperature,
            windSpeed: groundTruth.windSpeed,
            precipitation: groundTruth.precipitation,
            stationCount: groundTruth.stationCount,
          },
        },
        ultraLocal: {
          // À zéro station physique, les modes locaux reprennent exactement la
          // température officielle, sans la présenter comme une observation locale.
          temperature: localModeTemperature.temperature,
          officialTemperature: officialCurrentTemperature,
          usesOfficialFallback: localModeTemperature.usesOfficialFallback,
          usesModelFallback: localModeTemperature.usesModelFallback,
          modelFallback,
          humidity: advancedFusion.humidity ?? ultraLocalResult.humidity,
          windSpeed: advancedFusion.windSpeed ?? ultraLocalResult.windSpeed,
          precipitation: advancedFusion.precipitation ?? ultraLocalResult.precipitation,
          stationsUsed: ultraLocalResult.stationsUsed.map(s => ({
            name: s.name,
            source: s.source,
            distanceKm: s.distanceKm,
            temperature: s.temperature,
            adjustedTemperature: s.adjustedTemperature,
            weight: s.weight,
            band: s.band,
            bandWeight: s.bandWeight,
            altitudeAdjustment: s.altitudeAdjustment,
            qualityChecks: s.qualityChecks,
          })),
          stationsIgnored: ultraLocalResult.stationsIgnored.map(s => ({
            name: s.name,
            source: s.source,
            distanceKm: s.distanceKm,
            temperature: s.temperature,
            reason: s.reason,
            checks: s.checks,
          })),
          bandBreakdown: ultraLocalResult.bandBreakdown,
          modelContribution: ultraLocalResult.modelContribution,
          modelWeight: localModeTemperature.usesOfficialFallback || localModeTemperature.usesModelFallback ? 0 : ultraLocalResult.modelWeight,
          microclimateAdjustment: localModeTemperature.microclimateAdjustment,
          microclimateFactors: localModeTemperature.usesOfficialFallback || localModeTemperature.usesModelFallback ? [] : ultraLocalResult.microclimateFactors,
          // Cette confiance et ce compteur décrivent la même sélection de
          // stations que la température locale affichée, et non la seule
          // trace de contrôle de fusion avancée.
          confidenceScore,
          explanation: localModeTemperature.usesModelFallback
            ? `Aucune station physique validée dans le rayon ${localMode === "ultra-local" ? "Ultra-local de 10 km" : localMode === "local" ? "Local de 30 km" : "recherché"}. Repli sur la fusion officielle de ${modelFallback?.modelCount ?? 0} modèles, pondérée par la trace de température appliquée ; aucun micro-ajustement local n’est appliqué.`
            : localModeTemperature.usesOfficialFallback
            ? "Aucune station physique validée dans le rayon de recherche. Les modes Local et Ultra-local reprennent exactement la prévision officielle ; aucun micro-ajustement ni poids local n’est appliqué."
            : `${ultraLocalResult.explanation} ${advancedFusion.validationNote}`,
          stationCount: localStationCount,
          advancedFusion: {
            methodUsed: advancedFusion.methodUsed,
            modelCount: advancedFusion.modelCount,
            altitudeAdjustmentC: advancedFusion.altitudeAdjustmentC,
            anomaliesDetected: advancedFusion.anomaliesDetected,
            excludedSources: advancedFusion.excludedSources,
            usedSources: advancedFusion.usedSources,
          },
        },
        currentObservation,
        scores: {
          confidenceScore,
          stabilityIndex,
          regime: regimeInfo.regime,
          regimeLabel: regimeInfo.label,
          regimeEmoji: regimeInfo.emoji,
          regimeDescription: regimeInfo.description,
          regimeWeights: regimeInfo.weights,
        },
        multiRegime: {
          activeRegimes: multiRegimeResult.activeRegimes,
          confidenceScore: multiRegimeResult.confidenceScore,
          blendedWeights: multiRegimeResult.blendedWeights,
          description: multiRegimeResult.description,
        },
      };
    }),

  /**
   * Get pre-loaded forecasts for all of the user's favorites (from 05h00 cron).
   * Returns null for favorites that haven't been collected yet.
   */
  getPreloadedForecasts: protectedProcedure.query(async ({ ctx }) => {
    const today = getParisDate();
    const favorites = await getFavoriteLocations(ctx.user.id);
    const forecasts = await getLocationForecastsForUser(ctx.user.id, today);

    // Map forecasts by favoriteLocationId for quick lookup
    const forecastMap = new Map(forecasts.map(f => [f.favoriteLocationId, f]));

    return favorites.map(fav => ({
      favoriteId: fav.id,
      name: fav.customName ?? fav.name,
      lat: fav.lat,
      lon: fav.lon,
      isDefault: fav.isDefault === 1,
      position: fav.position,
      forecast: forecastMap.get(fav.id) ?? null,
    }));
  }),
});
