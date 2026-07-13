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
  getHistoricalScoreTimeSeries,
} from "../db";
import { collectExpertForecasts, collectObservations, collect15DayForecast, collectHourlyForecast, WEATHER_SERVICES } from "../weatherServices";
import { collectNearbyStations, rankStations, calculateGroundTruth, haversineKm, HONDEGHEM } from "../stationService";
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
    const today = getTodayParis();

    // Use today's MeteoAI forecast for regime detection (same source as Dashboard)
    // Fall back to most recent observation if no forecast available
    const meteoAI = await getMeteoAIForecastByDate(today);
    let regimeSource: { precipitation: number | null; windSpeed: number | null; tempMax: number | null; tempMin: number | null };
    if (meteoAI) {
      regimeSource = {
        precipitation: meteoAI.precipitation ?? null,
        windSpeed: meteoAI.windSpeed ?? null,
        tempMax: meteoAI.tempMax ?? null,
        tempMin: meteoAI.tempMin ?? null,
      };
    } else {
      // Fallback: use most recent observation
      const recentObs = await getObservationsByDateRange(
        new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }),
        today
      );
      const latestObs = recentObs[recentObs.length - 1];
      regimeSource = {
        precipitation: latestObs?.precipitation ?? null,
        windSpeed: latestObs?.windSpeed ?? null,
        tempMax: latestObs?.tempMax ?? null,
        tempMin: latestObs?.tempMin ?? null,
      };
    }
    const regimeInfo = detectWeatherRegime(regimeSource);

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
   * Weather AI Lab — full transparency data for the AI Lab page
   */
  getAILab: publicProcedure.query(async () => {
    const today = getTodayParis();
    const forecasts = await getForecastsByDate(today);
    const observation = await getObservationByDate(today);
    const meteoAI = await getMeteoAIForecastByDate(today);
    const ranking = await getCumulativeRanking();
    const jobs = await getRecentCollectionJobs(5);

    // 1. Detect current regime
    const regimeInfo = detectWeatherRegime({
      precipitation: observation?.precipitation ?? (meteoAI?.precipitation ?? 0),
      windSpeed: observation?.windSpeed ?? (meteoAI?.windSpeed ?? 0),
      tempMax: observation?.tempMax ?? (meteoAI?.tempMax ?? 15),
      tempMin: observation?.tempMin ?? (meteoAI?.tempMin ?? 5),
    });
    const regime = regimeInfo.regime;
    const regimeDef = REGIME_DEFINITIONS[regime];
    const weights = regimeDef.weights;

    // 2. Build model details from today's forecasts
    const allServicesList = [...WEATHER_SERVICES.expert, ...WEATHER_SERVICES.public];
    const modelDetails = forecasts.map(f => {
      const service = allServicesList.find((s: { name: string }) => s.name === f.serviceName);
      return {
        name: f.serviceName,
        label: service?.name ?? f.serviceName,
        tempMax: f.tempMax,
        tempMin: f.tempMin,
        precipitation: f.precipitation,
        windSpeed: f.windSpeed,
        cloudCover: f.cloudCover,
        condition: f.condition,
      };
    });

    // 3. Compute divergence between models
    const tempValues = forecasts.map(f => f.tempMax ?? 0).filter(v => v > 0);
    const precipValues = forecasts.map(f => f.precipitation ?? 0);
    const windValues = forecasts.map(f => f.windSpeed ?? 0).filter(v => v > 0);
    const divergence = {
      tempRange: tempValues.length > 1 ? Math.round((Math.max(...tempValues) - Math.min(...tempValues)) * 10) / 10 : 0,
      precipRange: precipValues.length > 1 ? Math.round((Math.max(...precipValues) - Math.min(...precipValues)) * 10) / 10 : 0,
      windRange: windValues.length > 1 ? Math.round((Math.max(...windValues) - Math.min(...windValues)) * 10) / 10 : 0,
      tempMean: tempValues.length > 0 ? Math.round(tempValues.reduce((a, b) => a + b, 0) / tempValues.length * 10) / 10 : 0,
      precipMean: precipValues.length > 0 ? Math.round(precipValues.reduce((a, b) => a + b, 0) / precipValues.length * 10) / 10 : 0,
    };

    // 4. Confidence score (0-100): based on model agreement
    const tempCV = tempValues.length > 1 ? (Math.sqrt(tempValues.reduce((s, v) => s + Math.pow(v - divergence.tempMean, 2), 0) / tempValues.length) / (divergence.tempMean || 1)) * 100 : 0;
    const confidenceScore = Math.max(0, Math.min(100, Math.round(100 - tempCV * 2 - divergence.tempRange * 3)));

    // 5. Stability score from MeteoAI
    const stabilityScore = meteoAI?.stabilityIndex ?? 0;

    // 6. Transparency score (always high — we expose everything)
    const transparencyScore = 95;

    // 7. AI Analysis text
    const modelCount = forecasts.length;
    const topModel = ranking.length > 0 ? ranking[0].serviceName : "ECMWF";
    const convergenceLevel = divergence.tempRange < 2 ? "excellente" : divergence.tempRange < 4 ? "bonne" : "modérée";
    const aiAnalysis = [
      `MeteoAI synthétise ${modelCount} modèles numériques pour Hondeghem (50.76°N, 2.52°E).`,
      `La convergence entre les modèles est ${convergenceLevel} aujourd'hui (écart max temp : ${divergence.tempRange}°C).`,
      `Le régime détecté est "${regimeDef.label}" ${regimeDef.emoji} — les précipitations sont pondérées à ${Math.round(weights.precip * 100)}%, la température à ${Math.round(weights.temp * 100)}%.`,
      `Le modèle historiquement le plus fiable sur ce site est ${topModel}.`,
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
    const rawTimeSeries = await getHistoricalScoreTimeSeries(14);
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
      { name: "Open-Meteo API", type: "API météo", models: ["ECMWF", "AROME", "ARPEGE", "ICON", "GFS", "Open-Meteo Best Match"], updateFrequency: "6h", lastSync: lastForecastJob?.startedAt ? new Date(lastForecastJob.startedAt).toISOString() : null, quality: "Haute" },
      { name: "Stations Météo-France", type: "Observations", models: [], updateFrequency: "1h", lastSync: lastObsJob?.startedAt ? new Date(lastObsJob.startedAt).toISOString() : null, quality: "Haute" },
      { name: "Open-Meteo ERA5", type: "Réanalyse", models: ["ERA5"], updateFrequency: "24h", lastSync: lastObsJob?.startedAt ? new Date(lastObsJob.startedAt).toISOString() : null, quality: "Très haute" },
    ];

    return {
      date: today,
      regime,
      regimeLabel: regimeDef.label,
      regimeEmoji: regimeDef.emoji,
      regimeDescription: regimeDef.description,
      weights,
      allRegimes: REGIME_DEFINITIONS,
      modelDetails,
      divergence,
      confidenceScore,
      stabilityScore,
      transparencyScore,
      aiAnalysis,
      formula,
      replaySteps,
      sources,
      engineVersion: "MeteoAI v2.0 — Multi-Dimension",
      calculatedAt: new Date().toISOString(),
      modelsUsed: forecasts.length,
      historicalTimeSeries,
      historicalServices: allServices,
    };
  }),

  /**
   * Search nearby weather stations from all sources within a configurable radius.
   */
  searchStations: publicProcedure
    .input(z.object({
      lat: z.number().optional(),
      lon: z.number().optional(),
      radiusKm: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const lat = input.lat ?? HONDEGHEM.lat;
      const lon = input.lon ?? HONDEGHEM.lon;
      const radiusKm = input.radiusKm;

      const stations = await collectNearbyStations(lat, lon, radiusKm);
      const ranked = rankStations(stations);
      const groundTruth = calculateGroundTruth(ranked);

      return {
        lat,
        lon,
        radiusKm,
        stations: ranked.map(s => ({
          stationId: s.stationId,
          source: s.source,
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
        })),
        groundTruth,
        totalFound: stations.length,
        activeCount: stations.filter(s => s.isActive).length,
        ignoredCount: stations.filter(s => !s.isActive).length,
        fetchedAt: new Date().toISOString(),
      };
    }),

  /**
   * Get ground truth for a location (weighted average from nearby stations).
   */
  getGroundTruth: publicProcedure
    .input(z.object({
      lat: z.number().optional(),
      lon: z.number().optional(),
      radiusKm: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const lat = input.lat ?? HONDEGHEM.lat;
      const lon = input.lon ?? HONDEGHEM.lon;

      const stations = await collectNearbyStations(lat, lon, input.radiusKm);
      const ranked = rankStations(stations);
      return calculateGroundTruth(ranked);
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
      lat: z.number().optional(),
      lon: z.number().optional(),
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
          const gt = calculateGroundTruth(ranked);
          const used = gt.stationsUsed.find(s => s.stationId === input.stationId);
          return used ? { weight: used.weight, distanceWeight: used.distanceWeight, qualityWeight: used.qualityWeight, freshnessWeight: used.freshnessWeight } : null;
        })(),
      };
    }),
});
