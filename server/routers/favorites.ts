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
} from "../db";

export type DashboardCurrentTemperature = {
  temperature: number;
  stationCount: number;
  confidenceScore: number;
  source: "local_validated";
};

export function buildDashboardCurrentTemperature(input: {
  localMode: "standard" | "local" | "ultra-local";
  temperature: number | null;
  stationCount: number;
  confidenceScore: number;
}): DashboardCurrentTemperature | null {
  if (input.localMode === "standard" || input.temperature == null || input.stationCount < 1) return null;
  return {
    temperature: input.temperature,
    stationCount: input.stationCount,
    confidenceScore: input.confidenceScore,
    source: "local_validated",
  };
}
import { collectNearbyStations, rankStations, calculateGroundTruth } from "../stationService";
import { collect15DayForecast, collectHourlyForecast } from "../weatherServices";
import { computeFusion, detectMultiRegime, EXTENDED_REGIME_INFO, type FusionSource } from "../fusionEngine";
import { calculateUltraLocal, getUltraLocalConfig, type LocalMode } from "../ultraLocalService";
import { getPreviousReadings, recordStationReadings } from "../stationReadingsCache";
import { getParisDate } from "../weatherTime";

export const favoritesRouter = router({
  /**
   * Get all favorites for the current user (max 5).
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
      position: z.number().min(0).max(4).optional(),
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
        throw new Error("Maximum 5 favoris atteint");
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
      position: z.number().min(0).max(4).optional(),
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
    .query(async ({ input }) => {
      const { lat, lon, radiusKm, localMode } = input;

      // For ultra-local, always search at least 20km to find all potential stations
      const searchRadius = localMode === "ultra-local" ? Math.max(radiusKm, 20) : radiusKm;

      // Parallel fetch: 15-day, hourly, stations
      const todayDate = getParisDate();
      const coords = { lat, lon };
      const [forecast15dResult, hourly, stations] = await Promise.all([
        collect15DayForecast(coords),
        collectHourlyForecast(todayDate, coords),
        collectNearbyStations(lat, lon, searchRadius, input.name ?? "Local"),
      ]);
      const forecast15d = forecast15dResult.days;

      // Ultra-local calculation
      const ranked = rankStations(stations);
      const modelTemp = hourly[0]?.temp ?? null;
      const ultraLocalResult = calculateUltraLocal(ranked, localMode, lat, lon, null, modelTemp);

      // ── Fusion avancée en production (IDW + qualité + fraîcheur + MAE + anomalies) ──
      // Les stations locales représentent la réalité observée ; la prévision horaire
      // Open-Meteo sert de contribution modèle limitée. L'historique est récupéré
      // avant le calcul, puis enrichi après celui-ci pour détecter les valeurs figées
      // ou les sauts brusques lors de l'appel suivant.
      const previousReadings = getPreviousReadings();
      const fusionSources: FusionSource[] = ranked
        .filter((station) => station.isActive && station.temperature != null)
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
          temperature: hourly[0].temp ?? null,
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
          maxFreshnessMin: 180,
          maxTempDeviationC: 6,
          minReliabilityScore: 40,
          altitudeCorrectionEnabled: true,
          anomalyDetectionEnabled: true,
          adaptiveWeightingEnabled: true,
          // Le modèle est davantage sollicité en mode Standard, prioritairement
          // local en mode Ultra-local.
          modelWeightFraction: localMode === "ultra-local" ? 0.10 : localMode === "local" ? 0.15 : 0.25,
        },
        previousReadings
      );

      recordStationReadings(
        ranked
          .filter((station) => station.isActive && station.temperature != null)
          .map((station) => ({ stationId: station.stationId, temperature: station.temperature! }))
      );

      // Standard ground truth (for comparison)
      const groundTruth = calculateGroundTruth(ranked);

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

      // Stabilité = dispersion entre modèles. Confiance = qualité, fraîcheur,
      // accord et anomalies des sources utilisées par la fusion avancée.
      const temps = forecast15d.map((forecast) => forecast.tempMax).filter((value): value is number => value != null);
      const divergence = temps.length > 1 ? Math.max(...temps) - Math.min(...temps) : 0;
      const confidenceScore = advancedFusion.confidenceScore;
      const stabilityIndex = Math.max(0, Math.min(100, 100 - divergence * 4));
      const localTemperature = advancedFusion.temperature ?? ultraLocalResult.temperature;
      const currentObservation = buildDashboardCurrentTemperature({
        localMode,
        temperature: localTemperature,
        stationCount: advancedFusion.stationCount,
        confidenceScore,
      });

      return {
        location: { lat, lon },
        localMode,
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
          // Valeurs affichées : fusion avancée validée, avec repli sur le moteur
          // ultra-local existant lorsque la donnée correspondante est indisponible.
          temperature: advancedFusion.temperature ?? ultraLocalResult.temperature,
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
          modelWeight: ultraLocalResult.modelWeight,
          microclimateAdjustment: ultraLocalResult.microclimateAdjustment,
          microclimateFactors: ultraLocalResult.microclimateFactors,
          confidenceScore: advancedFusion.confidenceScore,
          explanation: `${ultraLocalResult.explanation} ${advancedFusion.validationNote}`,
          stationCount: advancedFusion.stationCount,
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
