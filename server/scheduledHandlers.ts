/**
 * Scheduled Handlers for MeteoAI
 * - /api/scheduled/collect-forecasts: Runs at 07h30 Paris time
 * - /api/scheduled/collect-observations: Runs at 20h00 Paris time
 */

import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { invokeLLM } from "./_core/llm";
import { collectExpertForecasts, collectObservations, collectHourlyForecastAllModels, WEATHER_SERVICES } from "./weatherServices";
import { fetchRealPublicForecasts } from "./realWeatherAPIs";
import { calculateStabilityIndex, generateMeteoAIForecast, calculateReliabilityScore } from "./statsEngine";
import { generateAdaptiveForecast, classifyLeadTime, type LeadTimeBucket } from "./fusionEngine";
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
  makeLocationKey,
  getAllFavoriteLocations,
  upsertLocationForecast,
  getCumulativeRankingForLocation,
  insertHourlyForecasts,
  insertLeadTimeScores,
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
      // Default location key for Hondeghem (legacy)
      const { HONDEGHEM } = await import("./weatherServices");
      const defaultLocKey = makeLocationKey(HONDEGHEM.lat, HONDEGHEM.lon);

      // Collect from Open-Meteo expert models
      const expertData = await collectExpertForecasts(today);

      // Insert forecasts into DB with locationKey
      const forecastRows = expertData.map((f) => ({
        locationKey: defaultLocKey,
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

      // Also insert public service entries
      const publicForecasts = await generatePublicServiceForecasts(expertData, today, defaultLocKey);
      if (publicForecasts.length > 0) {
        await insertForecasts(publicForecasts);
      }

      // Get all forecasts for today to compute MeteoAI synthesis
      const allForecasts = await getForecastsByDate(today, defaultLocKey);

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

        // Generate MeteoAI forecast — adaptive per-parameter MAE weighting if enough historical data
        const hasHistoricalData = ranking.some((r) => r.avgMaeTemp != null && Number(r.daysTracked) >= 3);
        const performanceMap: Record<string, { maeTemp?: number; maePrecip?: number; maeWind?: number; weightedScore?: number }> = {};
        ranking.forEach((r) => {
          performanceMap[r.serviceName] = {
            maeTemp: r.avgMaeTemp != null ? Number(r.avgMaeTemp) : undefined,
            maePrecip: r.avgMaePrecip != null ? Number(r.avgMaePrecip) : undefined,
            maeWind: r.avgMaeWind != null ? Number(r.avgMaeWind) : undefined,
            weightedScore: r.avgScore != null ? Number(r.avgScore) : 50,
          };
        });
        const meteoAI = hasHistoricalData
          ? generateAdaptiveForecast(
              allForecasts.map((f) => ({
                serviceName: f.serviceName,
                tempMax: f.tempMax,
                tempMin: f.tempMin,
                precipitation: f.precipitation,
                windSpeed: f.windSpeed,
                windGust: null,
                cloudCover: f.cloudCover ?? null,
              })),
              performanceMap
            )
          : generateMeteoAIForecast(
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

        // Compute true confidence score from model agreement (divergence)
        const allTemps = allForecasts.map((f: any) => f.tempMax).filter((v: any) => v != null) as number[];
        const modelDivergence = allTemps.length > 1 ? Math.max(...allTemps) - Math.min(...allTemps) : 0;
        const trueConfidenceScore = Math.max(0, Math.min(100, Math.round(100 - modelDivergence * 5)));

        // Save MeteoAI forecast with locationKey
        await upsertMeteoAIForecast({
          locationKey: defaultLocKey,
          date: today,
          tempMax: meteoAI.tempMax,
          tempMin: meteoAI.tempMin,
          precipitation: meteoAI.precipitation,
          windSpeed: meteoAI.windSpeed,
          condition,
          stabilityIndex: stability.index,
          stabilityLabel: stability.label,
          confidenceScore: trueConfidenceScore,
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
 * Handler: Collect observations and compute reliability scores for ALL favorite locations
 * Triggered daily at 00h30 Paris time (22h30 UTC)
 * Collects real observations for yesterday per location, then computes per-model scores
 */
export async function collectObservationsHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    // Collect observations for yesterday (full day data available at 00h30)
    const yesterday = getYesterdayParis();
    console.log(`[MeteoAI] Starting per-location observation collection for ${yesterday}`);

    const jobId = await createCollectionJob({
      jobType: "observation",
      status: "running",
      scheduleCronTaskUid: user.taskUid,
    });

    try {
      // Get all favorite locations across all users
      const allFavorites = await getAllFavoriteLocations();

      // Deduplicate by locationKey to avoid redundant API calls
      const seen = new Set<string>();
      const uniqueLocations: typeof allFavorites = [];
      for (const fav of allFavorites) {
        const key = makeLocationKey(fav.lat, fav.lon);
        if (!seen.has(key)) {
          seen.add(key);
          uniqueLocations.push(fav);
        }
      }

      // Also always include the default Hondeghem location
      const { HONDEGHEM } = await import("./weatherServices");
      const defaultKey = makeLocationKey(HONDEGHEM.lat, HONDEGHEM.lon);
      if (!seen.has(defaultKey)) {
        uniqueLocations.push({ id: 0, userId: 0, lat: HONDEGHEM.lat, lon: HONDEGHEM.lon, name: "Hondeghem", customName: null, localMode: "standard", isDefault: 1, position: 0, radiusKm: 20, preferredModels: null, tempUnit: "celsius", alertsEnabled: 1, alertThresholds: null, createdAt: new Date(), updatedAt: new Date() });
      }

      console.log(`[MeteoAI] Processing observations for ${uniqueLocations.length} unique locations`);

      let totalScores = 0;
      const locationSummaries: string[] = [];
      const errors: string[] = [];

      for (const loc of uniqueLocations) {
        const locKey = makeLocationKey(loc.lat, loc.lon);
        const locName = loc.customName ?? loc.name;

        try {
          console.log(`[MeteoAI] Collecting observations for ${locName} (${loc.lat}, ${loc.lon})`);

          // Collect real observations for this location
          const obsData = await collectObservations(yesterday, { lat: loc.lat, lon: loc.lon, name: locName });

          if (!obsData) {
            console.warn(`[MeteoAI] No observation data for ${locName}`);
            errors.push(`${locName}: aucune donnée d'observation`);
            continue;
          }

          // Store observation with locationKey
          await insertObservation({
            locationKey: locKey,
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

          // Get forecasts for yesterday at this locationKey
          const dayForecasts = await getForecastsByDate(yesterday, locKey);
          const observation = await getObservationByDate(yesterday, locKey);

          if (dayForecasts.length > 0 && observation) {
            // Calculate per-model reliability scores with multi-dimensional scoring
            const scoreRows = dayForecasts.map((f) => {
              const score = calculateReliabilityScore(
                [{ tempMax: f.tempMax, tempMin: f.tempMin, precipitation: f.precipitation, windSpeed: f.windSpeed, windGust: f.windGust, cloudCover: f.cloudCover }],
                [{ tempMax: observation.tempMax, tempMin: observation.tempMin, precipitation: observation.precipitation, windSpeed: observation.windSpeed, windGust: observation.windGust, cloudCover: observation.cloudCover }]
              );
              return {
                locationKey: locKey,
                date: yesterday,
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
                // Temperature dimension
                tempScore: score.dimensions.temperature.score,
                tempMaxError: score.dimensions.temperature.maxError,
                // Precipitation dimension
                precipScore: score.dimensions.precipitation.score,
                precipPod: score.dimensions.precipitation.pod,
                precipFar: score.dimensions.precipitation.far,
                precipCsi: score.dimensions.precipitation.csi,
                precipFalsePositives: score.dimensions.precipitation.falsePositives,
                precipFalseNegatives: score.dimensions.precipitation.falseNegatives,
                // Wind dimension
                windScore: score.dimensions.wind.score,
                windMaeGusts: isNaN(score.dimensions.wind.maeGusts) ? null : score.dimensions.wind.maeGusts,
                // Condition dimension
                condScore: score.dimensions.condition.score,
                condConcordance: score.dimensions.condition.concordance,
                condMaeCloud: score.dimensions.condition.maeCloudCover,
              };
            });

            await insertReliabilityScores(scoreRows);
            totalScores += scoreRows.length;

            // ─── Lead-time scoring per model ───────────────────────────────
            // For each forecast, compute which lead-time bucket it falls into
            // based on when it was collected (issueDate) vs the observation date
            for (const f of dayForecasts) {
              const issueDate = f.collectedAt
                ? new Date(f.collectedAt).toISOString().slice(0, 10)
                : f.date; // fallback: same day (bucket = 0-6h)
              const bucket = classifyLeadTime(yesterday, issueDate);

              // Compute errors for this forecast vs observation
              const tempErrors: number[] = [];
              if (f.tempMax != null && observation.tempMax != null) {
                tempErrors.push(f.tempMax - observation.tempMax);
              }
              if (f.tempMin != null && observation.tempMin != null) {
                tempErrors.push(f.tempMin - observation.tempMin);
              }
              const maeT = tempErrors.length > 0
                ? tempErrors.reduce((s, e) => s + Math.abs(e), 0) / tempErrors.length
                : null;
              const rmseT = tempErrors.length > 0
                ? Math.sqrt(tempErrors.reduce((s, e) => s + e * e, 0) / tempErrors.length)
                : null;
              const biasT = tempErrors.length > 0
                ? tempErrors.reduce((s, e) => s + e, 0) / tempErrors.length
                : null;
              const maeP = (f.precipitation != null && observation.precipitation != null)
                ? Math.abs(f.precipitation - observation.precipitation)
                : null;
              const maeW = (f.windSpeed != null && observation.windSpeed != null)
                ? Math.abs(f.windSpeed - observation.windSpeed)
                : null;

              await insertLeadTimeScores([{
                locationKey: locKey,
                date: yesterday,
                serviceName: f.serviceName,
                bucket,
                maeTemp: maeT != null ? Math.round(maeT * 100) / 100 : null,
                rmseTemp: rmseT != null ? Math.round(rmseT * 100) / 100 : null,
                biasTemp: biasT != null ? Math.round(biasT * 100) / 100 : null,
                maePrecip: maeP != null ? Math.round(maeP * 100) / 100 : null,
                maeWind: maeW != null ? Math.round(maeW * 100) / 100 : null,
                sampleSize: tempErrors.length,
              }]);
            }

            // Get top model for this location
            const locRanking = await getCumulativeRankingForLocation(locKey);
            const topModel = locRanking[0];
            if (topModel) {
              locationSummaries.push(
                `📍 ${locName}: ${scoreRows.length} scores — 🥇 ${topModel.serviceName} (${(topModel.avgScore ?? 0).toFixed(1)}/100)`
              );
            } else {
              locationSummaries.push(`📍 ${locName}: ${scoreRows.length} scores calculés`);
            }
          } else {
            locationSummaries.push(`📍 ${locName}: observation collectée, aucune prévision à comparer`);
          }

          // Rate limit between locations
          await new Promise((r) => setTimeout(r, 500));
        } catch (err: any) {
          console.error(`[MeteoAI] Error processing ${locName}:`, err.message);
          errors.push(`${locName}: ${err.message}`);
        }
      }

      await updateCollectionJob(jobId, {
        status: "completed",
        servicesCollected: totalScores,
        completedAt: new Date(),
      });

      // Send owner notification with per-location summary
      const notifContent = [
        `${uniqueLocations.length} lieu(x) traité(s), ${totalScores} scores calculés.`,
        "",
        ...locationSummaries,
        ...(errors.length > 0 ? ["", `⚠️ Erreurs: ${errors.slice(0, 3).join(", ")}`] : []),
      ].join("\n");

      res.json({
        ok: true,
        date: yesterday,
        locationsProcessed: uniqueLocations.length,
        totalScores,
        errors: errors.length > 0 ? errors : undefined,
      });
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
 * Generate public service forecasts.
 * - OpenWeatherMap et Météo-France : vraies APIs si clé présente, sinon simulation.
 * - Autres services publics : simulation basée sur Open-Meteo best_match.
 */
async function generatePublicServiceForecasts(
  expertData: any[],
  date: string,
  locationKey = "default",
  lat?: number,
  lon?: number
): Promise<any[]> {
  const bestMatch = expertData.find((d) => d.serviceName === "Open-Meteo");
  if (!bestMatch) return [];

  // Tenter les vraies APIs si coordonnées disponibles
  let realOwm: any = null;
  let realMf: any = null;
  if (lat !== undefined && lon !== undefined) {
    try {
      const real = await fetchRealPublicForecasts(date, lat, lon);
      realOwm = real.owm;
      realMf = real.mf;
      if (realOwm) console.log(`[MeteoAI] ✅ OpenWeatherMap real data for ${lat},${lon}`);
      if (realMf) console.log(`[MeteoAI] ✅ Météo-France real data for ${lat},${lon}`);
    } catch (e: any) {
      console.warn(`[MeteoAI] Real APIs fetch failed: ${e.message}`);
    }
  }

  const variation = () => (Math.random() - 0.5) * 2;
  const precipVar = () => Math.max(0, (Math.random() - 0.3) * 3);
  const windVar = () => (Math.random() - 0.5) * 6;

  return WEATHER_SERVICES.public.map((service) => {
    // OpenWeatherMap — utiliser les vraies données si disponibles
    if (service.name === "OpenWeatherMap" && realOwm) {
      return {
        locationKey,
        date,
        serviceName: service.name,
        serviceCategory: service.category,
        tempMax: realOwm.tempMax,
        tempMin: realOwm.tempMin,
        precipitation: realOwm.precipitation,
        windSpeed: realOwm.windSpeed,
        windGust: realOwm.windGust,
        humidity: realOwm.humidity,
        cloudCover: realOwm.cloudCover,
        condition: realOwm.condition,
        rawData: null, // ne pas stocker le payload complet
      };
    }

    // Météo-France — utiliser les vraies données si disponibles
    if ((service.name === "Météo-France" || service.name === "Meteo-France") && realMf) {
      return {
        locationKey,
        date,
        serviceName: service.name,
        serviceCategory: service.category,
        tempMax: realMf.tempMax,
        tempMin: realMf.tempMin,
        precipitation: realMf.precipitation,
        windSpeed: realMf.windSpeed,
        windGust: realMf.windGust,
        humidity: realMf.humidity,
        cloudCover: realMf.cloudCover,
        condition: realMf.condition,
        rawData: null,
      };
    }

    // Autres services publics — simulation basée sur Open-Meteo best_match
    return {
      locationKey,
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

/**
 * Handler: Collect forecasts for all registered favorite locations
 * Triggered daily at 05h00 Paris time (03h00 UTC summer)
 * Stores results in location_forecasts table for instant display
 */
export async function collectFavoritesForecastsHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const today = getTodayParis();
    console.log(`[MeteoAI] Starting favorites forecast collection for ${today}`);

    // Get all favorites across all users
    const allFavorites = await getAllFavoriteLocations();

    if (allFavorites.length === 0) {
      console.log("[MeteoAI] No favorite locations found, skipping.");
      return res.json({ ok: true, locationsProcessed: 0 });
    }

    // Deduplicate by lat/lon to avoid redundant API calls
    const seen = new Set<string>();
    const uniqueLocations: typeof allFavorites = [];
    for (const fav of allFavorites) {
      const key = `${fav.lat.toFixed(3)},${fav.lon.toFixed(3)}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueLocations.push(fav);
      }
    }

    console.log(`[MeteoAI] Processing ${uniqueLocations.length} unique locations (${allFavorites.length} total favorites)`);

    // Get cumulative ranking for model weights
    const ranking = await getCumulativeRanking();
    const reliabilityMap: Record<string, number> = {};
    ranking.forEach((r) => {
      reliabilityMap[r.serviceName] = r.avgScore ?? 50;
    });

    let locationsProcessed = 0;
    const errors: string[] = [];

    for (const fav of uniqueLocations) {
      try {
        console.log(`[MeteoAI] Collecting forecasts for ${fav.name} (${fav.lat}, ${fav.lon})`);

        // Compute locationKey for this favorite
        const locKey = makeLocationKey(fav.lat, fav.lon);

        // Get location-specific ranking (fallback to global)
        const locRanking = await getCumulativeRankingForLocation(locKey);
        const locReliabilityMap: Record<string, number> = {};
        (locRanking.length > 0 ? locRanking : ranking).forEach((r) => {
          locReliabilityMap[r.serviceName] = r.avgScore ?? 50;
        });

        // Collect expert forecasts for this location
        const expertData = await collectExpertForecasts(today, { lat: fav.lat, lon: fav.lon });

        if (expertData.length === 0) {
          console.warn(`[MeteoAI] No data for ${fav.name}`);
          continue;
        }

        // Calculate stability index
        const stability = calculateStabilityIndex(
          expertData.map((f) => ({
            tempMax: f.tempMax,
            tempMin: f.tempMin,
            precipitation: f.precipitation,
            windSpeed: f.windSpeed,
          }))
        );

        // Store all model forecasts in the main forecasts table with locationKey
        const forecastRowsForLoc = expertData.map((f) => ({
          locationKey: locKey,
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
        // Also add public service forecasts (real APIs when keys available, simulation otherwise)
        const publicRowsForLoc = await generatePublicServiceForecasts(expertData, today, locKey, fav.lat, fav.lon);
        await insertForecasts([...forecastRowsForLoc, ...publicRowsForLoc]);

        // Generate MeteoAI synthesis — adaptive per-parameter MAE weighting if enough historical data
        const locHasHistoricalData = locRanking.some((r) => r.avgMaeTemp != null && Number(r.daysTracked) >= 3);
        const locPerfMap: Record<string, { maeTemp?: number; maePrecip?: number; maeWind?: number; weightedScore?: number }> = {};
        (locRanking.length > 0 ? locRanking : ranking).forEach((r) => {
          locPerfMap[r.serviceName] = {
            maeTemp: r.avgMaeTemp != null ? Number(r.avgMaeTemp) : undefined,
            maePrecip: r.avgMaePrecip != null ? Number(r.avgMaePrecip) : undefined,
            maeWind: r.avgMaeWind != null ? Number(r.avgMaeWind) : undefined,
            weightedScore: r.avgScore != null ? Number(r.avgScore) : 50,
          };
        });
        const meteoAI = locHasHistoricalData
          ? generateAdaptiveForecast(
              expertData.map((f) => ({
                serviceName: f.serviceName,
                tempMax: f.tempMax,
                tempMin: f.tempMin,
                precipitation: f.precipitation,
                windSpeed: f.windSpeed,
                windGust: null,
                cloudCover: f.cloudCover ?? null,
              })),
              locPerfMap
            )
          : generateMeteoAIForecast(
              expertData.map((f) => ({
                tempMax: f.tempMax,
                tempMin: f.tempMin,
                precipitation: f.precipitation,
                windSpeed: f.windSpeed,
              })),
              expertData.map((f) => f.serviceName),
              locReliabilityMap
            );

        // Determine condition
        const avgPrecip = expertData.reduce((s, f) => s + (f.precipitation ?? 0), 0) / expertData.length;
        const avgCloud = expertData.reduce((s, f) => s + (f.cloudCover ?? 50), 0) / expertData.length;
        let condition = "Ensoleillé";
        if (avgPrecip > 5) condition = "Pluie";
        else if (avgPrecip > 1) condition = "Averses";
        else if (avgPrecip > 0.2) condition = "Pluie légère";
        else if (avgCloud > 80) condition = "Couvert";
        else if (avgCloud > 50) condition = "Nuageux";
        else if (avgCloud > 25) condition = "Partiellement nuageux";

        // Estimate current temperature (midpoint of min/max adjusted for time of day)
        const hour = new Date().getHours();
        const dayProgress = Math.max(0, Math.min(1, (hour - 6) / 12)); // 0 at 6h, 1 at 18h
        const tempCurrent = meteoAI.tempMin !== null && meteoAI.tempMax !== null
          ? Math.round((meteoAI.tempMin + (meteoAI.tempMax - meteoAI.tempMin) * Math.sin(dayProgress * Math.PI / 2)) * 10) / 10
          : null;

        // Generate AI explanation
        let explanation = `Prévision pour ${fav.customName ?? fav.name} — ${expertData.length} modèles consultés. Indice de stabilité: ${stability.index}/100.`;
        try {
          const { invokeLLM } = await import("./_core/llm");
          const llmResult = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `Tu es MeteoAI, un assistant météo expert. Génère une explication concise (2-3 phrases) de la prévision du jour pour ${fav.customName ?? fav.name} en français.`,
              },
              {
                role: "user",
                content: `Prévision MeteoAI pour ${today}:\n- Température: ${meteoAI.tempMin}°C à ${meteoAI.tempMax}°C\n- Précipitations: ${meteoAI.precipitation}mm\n- Vent: ${meteoAI.windSpeed} km/h\n- Stabilité: ${stability.index}/100 (${stability.label})\n- ${expertData.length} modèles consultés`,
              },
            ],
            maxTokens: 200,
          });
          const rawContent = llmResult.choices?.[0]?.message?.content;
          if (typeof rawContent === "string") explanation = rawContent;
        } catch (e) {
          console.warn(`[MeteoAI] LLM explanation failed for ${fav.name}:`, e);
        }

        // Find all favorites with this location (same lat/lon) and upsert for each
        const matchingFavorites = allFavorites.filter(
          (f) => Math.abs(f.lat - fav.lat) < 0.001 && Math.abs(f.lon - fav.lon) < 0.001
        );

        // Compute true confidence score from model agreement (divergence)
        const favTemps = expertData.map((f: any) => f.tempMax).filter((v: any) => v != null) as number[];
        const favDivergence = favTemps.length > 1 ? Math.max(...favTemps) - Math.min(...favTemps) : 0;
        const favConfidenceScore = Math.max(0, Math.min(100, Math.round(100 - favDivergence * 5)));

        // Also save MeteoAI forecast for this location
        await upsertMeteoAIForecast({
          locationKey: locKey,
          date: today,
          tempMax: meteoAI.tempMax,
          tempMin: meteoAI.tempMin,
          precipitation: meteoAI.precipitation,
          windSpeed: meteoAI.windSpeed,
          condition,
          stabilityIndex: stability.index,
          stabilityLabel: stability.label,
          confidenceScore: favConfidenceScore,
          weights: meteoAI.weights as any,
          explanation,
        });

        for (const matchFav of matchingFavorites) {
          await upsertLocationForecast({
            favoriteLocationId: matchFav.id,
            userId: matchFav.userId,
            lat: matchFav.lat,
            lon: matchFav.lon,
            date: today,
            tempMax: meteoAI.tempMax,
            tempMin: meteoAI.tempMin,
            tempCurrent,
            precipitation: meteoAI.precipitation,
            windSpeed: meteoAI.windSpeed,
            condition,
            aiScore: favConfidenceScore,
            confidenceScore: favConfidenceScore,
            stabilityIndex: stability.index,
            modelsData: expertData as any,
            explanation,
          });
        }

        // Collect hourly forecasts for all models for this location
        try {
          const hourlyAllModels = await collectHourlyForecastAllModels(today, { lat: fav.lat, lon: fav.lon });
          for (const { modelName, hours } of hourlyAllModels) {
            const rows = hours.map((h) => ({
              locationKey: locKey,
              date: today,
              hour: h.hour,
              modelName,
              temperature: h.temperature,
              apparentTemperature: h.apparentTemperature,
              precipitation: h.precipitation,
              windSpeed: h.windSpeed,
              windGusts: h.windGusts,
              windDirection: h.windDirection,
              humidity: h.humidity,
              cloudCover: h.cloudCover,
              weatherCode: h.weatherCode,
            }));
            await insertHourlyForecasts(rows);
          }
          console.log(`[HourlyAll] Stored ${hourlyAllModels.length} models for ${fav.name}`);
        } catch (hourlyErr: any) {
          console.warn(`[HourlyAll] Failed for ${fav.name}:`, hourlyErr.message);
        }

        locationsProcessed++;

        // Rate limit between locations
        await new Promise((r) => setTimeout(r, 500));
      } catch (err: any) {
        console.error(`[MeteoAI] Error collecting for ${fav.name}:`, err.message);
        errors.push(`${fav.name}: ${err.message}`);
      }
    }

    res.json({
      ok: true,
      date: today,
      locationsProcessed,
      totalFavorites: allFavorites.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("[MeteoAI] Favorites forecast collection error:", error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
