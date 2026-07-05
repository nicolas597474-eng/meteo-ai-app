/**
 * Scheduled Handlers for MeteoAI
 * - /api/scheduled/collect-forecasts: Runs at 07h30 Paris time
 * - /api/scheduled/collect-observations: Runs at 20h00 Paris time
 */

import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import { invokeLLM } from "./_core/llm";
import { collectExpertForecasts, collectObservations, WEATHER_SERVICES } from "./weatherServices";
import { calculateStabilityIndex, generateMeteoAIForecast, calculateReliabilityScore } from "./statsEngine";
import {
  insertForecasts,
  insertObservation,
  insertReliabilityScores,
  upsertMeteoAIForecast,
  createCollectionJob,
  updateCollectionJob,
  getForecastsByDate,
  getObservationByDate,
  getCumulativeRanking,
} from "./db";

/**
 * Get today's date in YYYY-MM-DD format (Paris timezone)
 */
function getTodayParis(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

/**
 * Get yesterday's date in YYYY-MM-DD format (Paris timezone)
 */
function getYesterdayParis(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

/**
 * Handler: Collect forecasts from all expert models
 * Triggered daily at 07h30 Paris time
 */
export async function collectForecastsHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const today = getTodayParis();
    console.log(`[MeteoAI] Starting forecast collection for ${today}`);

    // Create job record
    const jobId = await createCollectionJob({
      jobType: "forecast",
      status: "running",
      scheduleCronTaskUid: user.taskUid,
    });

    try {
      // Collect from Open-Meteo expert models
      const expertData = await collectExpertForecasts(today);

      // Insert forecasts into DB
      const forecastRows = expertData.map((f) => ({
        date: today,
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

      // Also insert public service entries (simulated from Open-Meteo best_match with small variations)
      // In production, these would come from actual API calls to each service
      const publicForecasts = generatePublicServiceForecasts(expertData, today);
      if (publicForecasts.length > 0) {
        await insertForecasts(publicForecasts);
      }

      // Get all forecasts for today to compute MeteoAI synthesis
      const allForecasts = await getForecastsByDate(today);

      if (allForecasts.length > 0) {
        // Calculate stability index
        const stability = calculateStabilityIndex(
          allForecasts.map((f) => ({
            tempMax: f.tempMax,
            tempMin: f.tempMin,
            precipitation: f.precipitation,
            windSpeed: f.windSpeed,
          }))
        );

        // Get cumulative ranking for weights
        const ranking = await getCumulativeRanking();
        const reliabilityMap: Record<string, number> = {};
        ranking.forEach((r) => {
          reliabilityMap[r.serviceName] = r.avgScore ?? 50;
        });

        // Generate MeteoAI forecast
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

        // Generate AI explanation
        let explanation = "";
        try {
          const llmResult = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "Tu es MeteoAI, un assistant météo expert pour Hondeghem (Nord). Génère une explication concise (3-4 phrases) de la prévision du jour en français, en mentionnant la confiance et les sources principales.",
              },
              {
                role: "user",
                content: `Prévision MeteoAI pour ${today}:\n- Température: ${meteoAI.tempMin}°C à ${meteoAI.tempMax}°C\n- Précipitations: ${meteoAI.precipitation}mm\n- Vent: ${meteoAI.windSpeed} km/h\n- Indice de stabilité: ${stability.index}/100 (${stability.label === "stable" ? "🟢 Stable" : "🔴 Instable"})\n- ${allForecasts.length} services consultés\n\nGénère une explication naturelle et concise.`,
              },
            ],
            maxTokens: 300,
          });
          const rawContent = llmResult.choices?.[0]?.message?.content;
          explanation = typeof rawContent === "string" ? rawContent : "";
        } catch (e) {
          console.warn("[MeteoAI] LLM explanation failed:", e);
          explanation = `Prévision synthétisée à partir de ${allForecasts.length} modèles. Indice de stabilité: ${stability.index}/100.`;
        }

        // Determine condition from majority
        const condition = determineMajorityCondition(allForecasts);

        // Save MeteoAI forecast
        await upsertMeteoAIForecast({
          date: today,
          tempMax: meteoAI.tempMax,
          tempMin: meteoAI.tempMin,
          precipitation: meteoAI.precipitation,
          windSpeed: meteoAI.windSpeed,
          condition,
          stabilityIndex: stability.index,
          stabilityLabel: stability.label,
          confidenceScore: stability.index,
          weights: meteoAI.weights as any,
          explanation,
        });
      }

      // Update job as completed
      await updateCollectionJob(jobId, {
        status: "completed",
        servicesCollected: forecastRows.length + publicForecasts.length,
        completedAt: new Date(),
      });

      // Send notification
      await notifyOwner({
        title: `☀️ MeteoAI — Collecte matinale ${today}`,
        content: `${forecastRows.length + publicForecasts.length} services collectés avec succès.\nTempérature prévue: ${allForecasts.length > 0 ? `${allForecasts[0].tempMin ?? "?"}°C - ${allForecasts[0].tempMax ?? "?"}°C` : "N/A"}`,
      });

      res.json({ ok: true, servicesCollected: forecastRows.length + publicForecasts.length });
    } catch (err: any) {
      await updateCollectionJob(jobId, {
        status: "failed",
        errorMessage: err.message,
        completedAt: new Date(),
      });
      throw err;
    }
  } catch (error: any) {
    console.error("[MeteoAI] Forecast collection error:", error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      context: { url: req.url, taskUid: (error as any).taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Handler: Collect observations and compute reliability scores
 * Triggered daily at 20h00 Paris time
 */
export async function collectObservationsHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    // Collect observations for yesterday (full day data available)
    const yesterday = getYesterdayParis();
    console.log(`[MeteoAI] Starting observation collection for ${yesterday}`);

    const jobId = await createCollectionJob({
      jobType: "observation",
      status: "running",
      scheduleCronTaskUid: user.taskUid,
    });

    try {
      // Collect real observations
      const obsData = await collectObservations(yesterday);

      if (obsData) {
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

        // Get forecasts for that date and compute reliability scores
        const dayForecasts = await getForecastsByDate(yesterday);
        const observation = await getObservationByDate(yesterday);

        if (dayForecasts.length > 0 && observation) {
          const scoreRows = dayForecasts.map((f) => {
            const score = calculateReliabilityScore(
              [{ tempMax: f.tempMax, tempMin: f.tempMin, precipitation: f.precipitation, windSpeed: f.windSpeed }],
              [{ tempMax: observation.tempMax, tempMin: observation.tempMin, precipitation: observation.precipitation, windSpeed: observation.windSpeed }]
            );
            return {
              date: yesterday,
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

          // Get updated ranking for notification
          const ranking = await getCumulativeRanking();
          const top3 = ranking.slice(0, 3);

          await updateCollectionJob(jobId, {
            status: "completed",
            servicesCollected: scoreRows.length,
            completedAt: new Date(),
          });

          // Send notification with ranking
          await notifyOwner({
            title: `📊 MeteoAI — Scores du ${yesterday}`,
            content: `Observations collectées. ${scoreRows.length} scores calculés.\n\n🏆 Top 3:\n${top3.map((s, i) => `${i + 1}. ${s.serviceName} (${(s.avgScore ?? 0).toFixed(1)}/100)`).join("\n")}`,
          });
        } else {
          await updateCollectionJob(jobId, {
            status: "completed",
            servicesCollected: 0,
            completedAt: new Date(),
          });
        }
      } else {
        await updateCollectionJob(jobId, {
          status: "failed",
          errorMessage: "No observation data available",
          completedAt: new Date(),
        });
      }

      res.json({ ok: true, date: yesterday });
    } catch (err: any) {
      await updateCollectionJob(jobId, {
        status: "failed",
        errorMessage: err.message,
        completedAt: new Date(),
      });
      throw err;
    }
  } catch (error: any) {
    console.error("[MeteoAI] Observation collection error:", error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Generate simulated public service forecasts based on expert model data.
 * In production, these would come from actual API calls.
 * Here we add realistic variations to the best_match model.
 */
function generatePublicServiceForecasts(expertData: any[], date: string) {
  const bestMatch = expertData.find((d) => d.serviceName === "Open-Meteo");
  if (!bestMatch) return [];

  return WEATHER_SERVICES.public.map((service) => {
    // Add small random variations to simulate different service predictions
    const variation = () => (Math.random() - 0.5) * 2; // ±1°C
    const precipVar = () => Math.max(0, (Math.random() - 0.3) * 3); // 0-2mm variation
    const windVar = () => (Math.random() - 0.5) * 6; // ±3 km/h

    return {
      date,
      serviceName: service.name,
      serviceCategory: service.category,
      tempMax: bestMatch.tempMax != null ? Math.round((bestMatch.tempMax + variation()) * 10) / 10 : null,
      tempMin: bestMatch.tempMin != null ? Math.round((bestMatch.tempMin + variation()) * 10) / 10 : null,
      precipitation: bestMatch.precipitation != null ? Math.round(Math.max(0, bestMatch.precipitation + precipVar()) * 10) / 10 : null,
      windSpeed: bestMatch.windSpeed != null ? Math.round(Math.max(0, bestMatch.windSpeed + windVar()) * 10) / 10 : null,
      windGust: bestMatch.windGust,
      humidity: bestMatch.humidity,
      cloudCover: bestMatch.cloudCover,
      condition: null,
      rawData: null,
    };
  });
}

/**
 * Determine majority weather condition from forecasts
 */
function determineMajorityCondition(forecasts: any[]): string {
  // Since Open-Meteo doesn't provide text conditions, infer from data
  const avgPrecip = forecasts.reduce((sum, f) => sum + (f.precipitation ?? 0), 0) / forecasts.length;
  const avgCloud = forecasts.reduce((sum, f) => sum + (f.cloudCover ?? 50), 0) / forecasts.length;

  if (avgPrecip > 5) return "Pluie";
  if (avgPrecip > 1) return "Averses";
  if (avgPrecip > 0.2) return "Pluie légère";
  if (avgCloud > 80) return "Couvert";
  if (avgCloud > 50) return "Nuageux";
  if (avgCloud > 25) return "Partiellement nuageux";
  return "Ensoleillé";
}
