import { z } from "zod";
import { publicProcedure, protectedProcedure } from "../_core/trpc";
import { router } from "../_core/trpc";
import {
  getFavoriteLocations,
  addFavoriteLocation,
  updateFavoriteLocation,
  deleteFavoriteLocation,
  setDefaultFavorite,
} from "../db";
import { collectNearbyStations, rankStations, calculateGroundTruth } from "../stationService";
import { collect15DayForecast, collectHourlyForecast } from "../weatherServices";
import { generateMeteoAIForecast, detectWeatherRegime } from "../statsEngine";
import { calculateUltraLocal, getUltraLocalConfig, type LocalMode } from "../ultraLocalService";

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
    }))
    .query(async ({ input }) => {
      const { lat, lon, radiusKm, localMode } = input;

      // For ultra-local, always search at least 20km to find all potential stations
      const searchRadius = localMode === "ultra-local" ? Math.max(radiusKm, 20) : radiusKm;

      // Parallel fetch: 15-day, hourly, stations
      const todayDate = new Date().toISOString().split("T")[0];
      const [forecast15dResult, hourly, stations] = await Promise.all([
        collect15DayForecast(),
        collectHourlyForecast(todayDate),
        collectNearbyStations(lat, lon, searchRadius),
      ]);
      const forecast15d = forecast15dResult.days;

      // Ultra-local calculation
      const ranked = rankStations(stations);
      const modelTemp = hourly[0]?.temp ?? null;
      const ultraLocalResult = calculateUltraLocal(ranked, localMode, lat, lon, null, modelTemp);

      // Standard ground truth (for comparison)
      const groundTruth = calculateGroundTruth(ranked);

      // Today's synthesis
      const todayForecast = forecast15d[0];
      const forecastRows = forecast15d.slice(0, 6).map((f: { tempMax: number | null; tempMin: number | null; precipitation: number | null; windSpeed: number | null; cloudCover: number | null; condition: string | null }) => ({
        tempMax: f.tempMax, tempMin: f.tempMin, precipitation: f.precipitation,
        windSpeed: f.windSpeed, cloudCover: f.cloudCover, condition: f.condition,
      }));
      const serviceNames = ["ECMWF", "GFS", "ICON", "Meteoblue", "Open-Meteo", "JMA"];
      const defaultScores: Record<string, number> = {};
      serviceNames.forEach(n => { defaultScores[n] = 50; });
      const meteoAI = forecastRows.length > 0 ? generateMeteoAIForecast(forecastRows, serviceNames, defaultScores) : null;

      // Regime detection
      const regimeInfo = detectWeatherRegime({
        precipitation: todayForecast?.precipitation ?? 0,
        windSpeed: todayForecast?.windSpeed ?? 0,
        tempMax: todayForecast?.tempMax ?? 15,
        tempMin: todayForecast?.tempMin ?? 10,
      });

      // Confidence & stability — derive from model divergence
      const temps = forecastRows.map((f: { tempMax: number | null }) => f.tempMax).filter(Boolean) as number[];
      const divergence = temps.length > 1 ? Math.max(...temps) - Math.min(...temps) : 0;
      const confidenceScore = Math.max(0, Math.min(100, 100 - divergence * 5));
      const stabilityIndex = Math.max(0, Math.min(100, 100 - divergence * 4));

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
          temperature: ultraLocalResult.temperature,
          humidity: ultraLocalResult.humidity,
          windSpeed: ultraLocalResult.windSpeed,
          precipitation: ultraLocalResult.precipitation,
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
          confidenceScore: ultraLocalResult.confidenceScore,
          explanation: ultraLocalResult.explanation,
          stationCount: ultraLocalResult.stationCount,
        },
        scores: {
          confidenceScore,
          stabilityIndex,
          regime: regimeInfo.regime,
          regimeLabel: regimeInfo.label,
          regimeEmoji: regimeInfo.emoji,
        },
      };
    }),
});
