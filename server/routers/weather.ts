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
import { calculateStabilityIndex, generateMeteoAIForecast, calculateReliabilityScore, detectWeatherRegime, REGIME_DEFINITIONS, type WeatherRegime } from "../statsEngine";

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

    // Detect current weather regime from today's MeteoAI forecast
    const regimeInfo = detectWeatherRegime({
      precipitation: meteoAI?.precipitation ?? null,
      windSpeed: meteoAI?.windSpeed ?? null,
      tempMax: meteoAI?.tempMax ?? null,
      tempMin: meteoAI?.tempMin ?? null,
    });

    return {
      today,
      meteoAI,
      forecastCount: forecasts.length,
      topServices: ranking.slice(0, 5),
      recentForecasts,
      allServices: [...WEATHER_SERVICES.expert, ...WEATHER_SERVICES.public],
      regime: {
        id: regimeInfo.regime,
        label: regimeInfo.label,
        emoji: regimeInfo.emoji,
        description: regimeInfo.description,
        weights: regimeInfo.weights,
      },
    };
  }),

  /**
   * Full ranking of all services with cumulative scores
   */
  getRanking: publicProcedure.query(async () => {
    const ranking = await getCumulativeRanking();

    // Compute regime from the most recent observation available
    const recentObs = await getObservationsByDateRange(
      new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }),
      getTodayParis()
    );
    const latestObs = recentObs[recentObs.length - 1];
    const regimeInfo = detectWeatherRegime({
      precipitation: latestObs?.precipitation ?? null,
      windSpeed: latestObs?.windSpeed ?? null,
      tempMax: latestObs?.tempMax ?? null,
      tempMin: latestObs?.tempMin ?? null,
    });

    // All regime definitions for the UI selector
    const allRegimes = (Object.keys(REGIME_DEFINITIONS) as WeatherRegime[]).map(key => ({
      id: key,
      ...REGIME_DEFINITIONS[key],
    }));

    return {
      ranking,
      totalServices: WEATHER_SERVICES.expert.length + WEATHER_SERVICES.public.length,
      regime: {
        id: regimeInfo.regime,
        label: regimeInfo.label,
        emoji: regimeInfo.emoji,
        description: regimeInfo.description,
        weights: regimeInfo.weights,
      },
      allRegimes,
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

  /**
   * Weather AI Lab — Full transparency module
   * Returns all data needed to explain how MeteoAI computed today's forecast.
   */
  getAILab: publicProcedure
    .input(z.object({ date: z.string().optional() }))
    .query(async ({ input }) => {
      const today = getTodayParis();
      const date = input.date || today;

      // 1. Fetch raw forecasts for the date
      const forecasts = await getForecastsByDate(date);
      const meteoAI = await getMeteoAIForecastByDate(date);
      const observation = await getObservationByDate(date);
      const ranking = await getCumulativeRanking();
      const jobs = await getRecentCollectionJobs(5);

      // 2. Build reliability map from cumulative ranking
      const reliabilityMap: Record<string, number> = {};
      ranking.forEach((r) => { reliabilityMap[r.serviceName] = r.avgScore ?? 50; });

      // 3. Detect weather regime from today's data
      const regimeInfo = detectWeatherRegime({
        precipitation: meteoAI?.precipitation ?? null,
        windSpeed: meteoAI?.windSpeed ?? null,
        tempMax: meteoAI?.tempMax ?? null,
        tempMin: meteoAI?.tempMin ?? null,
      });

      // 4. Per-model details with weights and contributions
      const totalScore = forecasts.reduce((acc, f) => acc + (reliabilityMap[f.serviceName] || 50), 0);
      const modelDetails = forecasts.map((f) => {
        const score = reliabilityMap[f.serviceName] || 50;
        const weight = totalScore > 0 ? Math.round((score / totalScore) * 100) : 0;
        const rankEntry = ranking.find(r => r.serviceName === f.serviceName);
        const contribution = weight >= 25 ? "Élevée" : weight >= 15 ? "Moyenne" : "Faible";

        // Justification for why this model was chosen / penalized
        const reasons: string[] = [];
        if (rankEntry) {
          if ((rankEntry.avgTempScore ?? 0) >= 80) reasons.push("Excellent score température");
          else if ((rankEntry.avgTempScore ?? 0) < 50) reasons.push("Score température insuffisant");
          if ((rankEntry.avgPrecipCsi ?? 0) >= 0.7) reasons.push("Très bonne détection des pluies (CSI élevé)");
          else if ((rankEntry.avgPrecipCsi ?? 0) < 0.3) reasons.push("Détection des pluies faible (CSI bas)");
          if ((rankEntry.avgWindScore ?? 0) >= 80) reasons.push("Excellent score vent");
          if (Math.abs(rankEntry.avgTempBias ?? 0) < 0.3) reasons.push("Biais thermique très faible");
          else if (Math.abs(rankEntry.avgTempBias ?? 0) > 1.5) reasons.push("Biais thermique significatif");
          if ((rankEntry.daysTracked ?? 0) >= 10) reasons.push(`Suivi sur ${rankEntry.daysTracked} jours`);
        }
        if (reasons.length === 0) reasons.push("Modèle intégré — données en cours d'accumulation");

        return {
          serviceName: f.serviceName,
          serviceCategory: f.serviceCategory,
          tempMax: f.tempMax,
          tempMin: f.tempMin,
          precipitation: f.precipitation,
          windSpeed: f.windSpeed,
          humidity: f.humidity,
          cloudCover: f.cloudCover,
          condition: f.condition,
          historicScore: Math.round(score),
          weight,
          contribution,
          reasons,
          daysTracked: rankEntry?.daysTracked ?? 0,
          // Dimension scores from ranking
          tempScore: rankEntry?.avgTempScore ?? null,
          precipScore: rankEntry?.avgPrecipScore ?? null,
          windScore: rankEntry?.avgWindScore ?? null,
          condScore: rankEntry?.avgCondScore ?? null,
          precipCsi: rankEntry?.avgPrecipCsi ?? null,
          tempBias: rankEntry?.avgTempBias ?? null,
          tempMaxError: rankEntry?.avgTempMaxError ?? null,
        };
      });

      // 5. Divergence analysis
      const tempMaxValues = forecasts.map(f => f.tempMax).filter((v): v is number => v != null);
      const precipValues = forecasts.map(f => f.precipitation).filter((v): v is number => v != null);
      const windValues = forecasts.map(f => f.windSpeed).filter((v): v is number => v != null);

      const calcDivergence = (vals: number[]) => {
        if (vals.length < 2) return { max: 0, mean: 0, std: 0 };
        const mn = vals.reduce((a, b) => a + b, 0) / vals.length;
        const std = Math.sqrt(vals.reduce((a, v) => a + Math.pow(v - mn, 2), 0) / vals.length);
        return {
          max: Math.round((Math.max(...vals) - Math.min(...vals)) * 10) / 10,
          mean: Math.round(mn * 10) / 10,
          std: Math.round(std * 10) / 10,
        };
      };

      const tempDiv = calcDivergence(tempMaxValues);
      const precipDiv = calcDivergence(precipValues);
      const windDiv = calcDivergence(windValues);

      const getDivergenceLevel = (std: number, scale: number): string => {
        const ratio = std / scale;
        if (ratio < 0.05) return "Très faible";
        if (ratio < 0.10) return "Faible";
        if (ratio < 0.20) return "Moyenne";
        if (ratio < 0.35) return "Forte";
        return "Très forte";
      };

      const tempDivLevel = getDivergenceLevel(tempDiv.std, 10);
      const precipDivLevel = getDivergenceLevel(precipDiv.std, 5);
      const windDivLevel = getDivergenceLevel(windDiv.std, 20);

      // 6. Weather Confidence Score (0-100)
      const convergenceScore = Math.max(0, 100 - (tempDiv.std * 15 + precipDiv.std * 8 + windDiv.std * 2));
      const historyScore = ranking.length > 0
        ? ranking.slice(0, 5).reduce((a, r) => a + (r.avgScore ?? 50), 0) / Math.min(5, ranking.length)
        : 50;
      const modelCountScore = Math.min(100, (forecasts.length / 6) * 100);
      const stabilityScore = meteoAI?.stabilityIndex ?? 70;
      const confidenceScore = Math.round(
        convergenceScore * 0.35 +
        historyScore * 0.30 +
        stabilityScore * 0.20 +
        modelCountScore * 0.15
      );
      const confidenceLabel =
        confidenceScore >= 85 ? "Très fiable" :
        confidenceScore >= 70 ? "Fiable" :
        confidenceScore >= 50 ? "Incertain" : "Très incertain";
      const confidenceColor =
        confidenceScore >= 85 ? "green" :
        confidenceScore >= 70 ? "yellow" :
        confidenceScore >= 50 ? "orange" : "red";

      // 7. Weather AI Transparency Score
      const sourcesDocumented = forecasts.length;
      const calcVisible = true;
      const historyConsultable = ranking.length > 0;
      const transparencyScore = Math.round(
        (sourcesDocumented / 6) * 40 +
        (calcVisible ? 30 : 0) +
        (historyConsultable ? 30 : 0)
      );

      // 8. Weather AI Score (proprietary composite)
      const aiScore = Math.round(
        (historyScore * 0.35) +
        (stabilityScore * 0.25) +
        (confidenceScore * 0.25) +
        (transparencyScore * 0.15)
      );

      // 9. AI-generated analysis text
      const topModel = modelDetails.sort((a, b) => b.historicScore - a.historicScore)[0];
      const avgDivergence = (tempDiv.std + precipDiv.std + windDiv.std) / 3;
      let aiAnalysis = "";
      if (avgDivergence < 1) {
        aiAnalysis = `Les modèles sont fortement convergents aujourd'hui (divergence ${tempDivLevel.toLowerCase()} sur la température). ${topModel?.serviceName ?? "ECMWF"} présente les meilleures performances historiques sur Hondeghem. Ce faible écart entre les modèles explique le Weather Confidence Score élevé de ${confidenceScore}/100.`;
      } else if (avgDivergence < 3) {
        aiAnalysis = `Les modèles présentent une divergence ${tempDivLevel.toLowerCase()} aujourd'hui. ${topModel?.serviceName ?? "ECMWF"} domine le classement avec un score historique de ${topModel?.historicScore ?? 0}/100. La pondération contextuelle (régime : ${regimeInfo.label}) a été appliquée pour favoriser les variables les plus pertinentes.`;
      } else {
        aiAnalysis = `Forte divergence détectée entre les modèles (écart max température : ${tempDiv.max}°C). Cette incertitude se reflète dans le Weather Confidence Score de ${confidenceScore}/100. Il est conseillé de surveiller les mises à jour des prévisions dans les prochaines heures.`;
      }

      // 10. Sources with freshness info
      const lastForecastJob = jobs.find(j => j.jobType === "forecast");
      const lastObsJob = jobs.find(j => j.jobType === "observation");

      const sources = [
        { name: "Open-Meteo API", type: "API météo", models: ["ECMWF", "AROME", "ARPEGE", "ICON", "GFS", "Open-Meteo Best Match"], updateFrequency: "6h", lastSync: lastForecastJob?.startedAt ? new Date(lastForecastJob.startedAt).toISOString() : null, quality: "Haute" },
        { name: "Stations Météo-France", type: "Observations", models: [], updateFrequency: "1h", lastSync: lastObsJob?.startedAt ? new Date(lastObsJob.startedAt).toISOString() : null, quality: "Haute" },
        { name: "Open-Meteo ERA5", type: "Réanalyse", models: ["ERA5"], updateFrequency: "24h", lastSync: lastObsJob?.startedAt ? new Date(lastObsJob.startedAt).toISOString() : null, quality: "Très haute" },
      ];

      // 11. Calculation formula
      const formula = modelDetails
        .filter(m => m.weight > 0)
        .sort((a, b) => b.weight - a.weight)
        .map(m => ({ service: m.serviceName, weight: m.weight, tempMax: m.tempMax }));

      return {
        date,
        today,
        meteoAI,
        observation,
        regime: {
          id: regimeInfo.regime,
          label: regimeInfo.label,
          emoji: regimeInfo.emoji,
          description: regimeInfo.description,
          weights: regimeInfo.weights,
        },
        modelDetails,
        divergence: {
          temperature: { ...tempDiv, level: tempDivLevel },
          precipitation: { ...precipDiv, level: precipDivLevel },
          wind: { ...windDiv, level: windDivLevel },
        },
        confidenceScore,
        confidenceLabel,
        confidenceColor,
        stabilityScore: meteoAI?.stabilityIndex ?? 0,
        stabilityLabel: meteoAI?.stabilityLabel ?? "stable",
        aiScore,
        transparencyScore,
        aiAnalysis,
        sources,
        formula,
        engineVersion: "MeteoAI v2.0 — Multi-Dimension",
        calculatedAt: new Date().toISOString(),
        modelsUsed: forecasts.length,
      };
    }),
});
