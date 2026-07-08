/**
 * Weather Router — tRPC procedures for MeteoAI
 */

import { z } from "zod";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import {
  getForecastsByDate,
  getForecastsByDateRange,
  getObservationByDate,
  getObservationsByDateRange,
  getMeteoAIForecastByDate,
  getLatestMeteoAIForecasts,
  getCumulativeRanking,
  getRecentCollectionJobs,
  insertForecasts,
  insertObservation,
  insertReliabilityScores,
  upsertMeteoAIForecast,
} from "../db";
import { collectExpertForecasts, collectObservations, collect15DayForecast, collectHourlyForecast, WEATHER_SERVICES } from "../weatherServices";
import { calculateStabilityIndex, generateMeteoAIForecast, calculateReliabilityScore } from "../statsEngine";

function getTodayParis(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

export const weatherRouter = router({
  /**
   * Dashboard: today's MeteoAI forecast + stability index + top services
   */
  getDashboard: publicProcedure.query(async () => {
    const today = getTodayParis();

    // Get MeteoAI forecast for today
    const meteoAI = await getMeteoAIForecastByDate(today);

    // Get all forecasts for today
    const forecasts = await getForecastsByDate(today);

    // Get ranking
    const ranking = await getCumulativeRanking();

    // Get recent forecasts if no today data
    const recentForecasts = await getLatestMeteoAIForecasts(7);

    return {
      today,
      meteoAI,
      forecastCount: forecasts.length,
      topServices: ranking.slice(0, 5),
      recentForecasts,
      allServices: [...WEATHER_SERVICES.expert, ...WEATHER_SERVICES.public],
    };
  }),

  /**
   * Full ranking of all services with cumulative scores
   */
  getRanking: publicProcedure.query(async () => {
    const ranking = await getCumulativeRanking();
    return {
      ranking,
      totalServices: WEATHER_SERVICES.expert.length + WEATHER_SERVICES.public.length,
    };
  }),

  /**
   * History: forecast vs observation comparison over date range
   */
  getHistory: publicProcedure
    .input(
      z.object({
        days: z.number().min(1).max(30).default(7),
      })
    )
    .query(async ({ input }) => {
      const endDate = getTodayParis();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.days);
      const startStr = startDate.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

      const forecasts = await getForecastsByDateRange(startStr, endDate);
      const observations = await getObservationsByDateRange(startStr, endDate);
      const meteoAIForecasts = await getLatestMeteoAIForecasts(input.days);

      return {
        forecasts,
        observations,
        meteoAIForecasts,
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
      })
    )
    .query(async ({ input }) => {
      const date = input.date || getTodayParis();

      const forecasts = await getForecastsByDate(date);
      const observation = await getObservationByDate(date);
      const meteoAI = await getMeteoAIForecastByDate(date);
      const ranking = await getCumulativeRanking();

      return {
        date,
        forecasts,
        observation,
        meteoAI,
        ranking,
      };
    }),

  /**
   * 15-day MeteoAI forecast from multiple models
   */
  get15DayForecast: publicProcedure.query(async () => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
    const { days, modelsUsed } = await collect15DayForecast();
    return { today, days, modelsUsed };
  }),

  /**
   * Hourly forecast for today
   */
  getHourlyForecast: publicProcedure.query(async () => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
    const hours = await collectHourlyForecast(today);
    return { today, hours };
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
        const expertData = await collectExpertForecasts(targetDate);
        const forecastRows = expertData.map((f) => ({
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
        const allForecasts = await getForecastsByDate(targetDate);
        const stability = calculateStabilityIndex(
          allForecasts.map((f) => ({
            tempMax: f.tempMax,
            tempMin: f.tempMin,
            precipitation: f.precipitation,
            windSpeed: f.windSpeed,
          }))
        );

        const ranking = await getCumulativeRanking();
        const reliabilityMap: Record<string, number> = {};
        ranking.forEach((r) => {
          reliabilityMap[r.serviceName] = r.avgScore ?? 50;
        });

        const meteoAI = generateMeteoAIForecast(
          allForecasts.map((f) => ({
            tempMax: f.tempMax,
            tempMin: f.tempMin,
            precipitation: f.precipitation,
            windSpeed: f.windSpeed,
          })),
          allForecasts.map((f) => f.serviceName),
          reliabilityMap
        );

        // Determine condition
        const avgPrecip = allForecasts.reduce((sum, f) => sum + (f.precipitation ?? 0), 0) / allForecasts.length;
        const avgCloud = allForecasts.reduce((sum, f) => sum + (f.cloudCover ?? 50), 0) / allForecasts.length;
        let condition = "Ensoleillé";
        if (avgPrecip > 5) condition = "Pluie";
        else if (avgPrecip > 1) condition = "Averses";
        else if (avgPrecip > 0.2) condition = "Pluie légère";
        else if (avgCloud > 80) condition = "Couvert";
        else if (avgCloud > 50) condition = "Nuageux";
        else if (avgCloud > 25) condition = "Partiellement nuageux";

        await upsertMeteoAIForecast({
          date: targetDate,
          tempMax: meteoAI.tempMax,
          tempMin: meteoAI.tempMin,
          precipitation: meteoAI.precipitation,
          windSpeed: meteoAI.windSpeed,
          condition,
          stabilityIndex: stability.index,
          stabilityLabel: stability.label,
          confidenceScore: stability.index,
          weights: meteoAI.weights as any,
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
          rawData: obsData.rawData as any,
        });

        // Compute reliability scores
        const dayForecasts = await getForecastsByDate(targetDate);
        const observation = await getObservationByDate(targetDate);

        if (dayForecasts.length > 0 && observation) {
          const scoreRows = dayForecasts.map((f) => {
            const score = calculateReliabilityScore(
              [{ tempMax: f.tempMax, tempMin: f.tempMin, precipitation: f.precipitation, windSpeed: f.windSpeed }],
              [{ tempMax: observation.tempMax, tempMin: observation.tempMin, precipitation: observation.precipitation, windSpeed: observation.windSpeed }]
            );
            return {
              date: targetDate,
              serviceName: f.serviceName,
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
});
