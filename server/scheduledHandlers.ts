/**
 * Scheduled Handlers for MeteoAI
 * - /api/scheduled/collect-forecasts: Runs at 07h30 Paris time
 * - /api/scheduled/collect-observations: Runs at 20h00 Paris time
 */

import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { invokeLLM } from "./_core/llm";
import { WEATHER_SERVICES, collectExpertForecasts, collectObservations, collectHourlyForecastAllModels } from "./weatherServices";
import { fetchRealPublicForecasts } from "./realWeatherAPIs";
import { getParisDate, getParisDateDaysAgo, getParisHour } from "./weatherTime";
import { conditionFromWeatherValues } from "./weatherConditionLabels";
import { isOperationalObservation } from "./observationProvenance";
import { buildQualifiedDailyObservation } from "./physicalObservationAggregation";
import { scoreQualifiedHourlyModels } from "./qualifiedHourlyScoring";
import { computeOfficialDailyForecast } from "./officialForecast";
import { calculateStabilityIndex, calculateReliabilityScore } from "./statsEngine";
import { collectNearbyStations, calculateGroundTruth, getCandidateStations, getPhysicalActiveStations } from "./stationService";
import {
  classifyLeadTime,
  applyBiasCorrection,
  computeConfidenceScore,
  isEligibleGlobalReliabilityScore,
  getLeadTimeWeights,
  type LeadTimeBucket,
  type ServiceBias,
  type LeadTimePerf,
} from "./fusionEngine";
import {
  insertForecasts,
  insertForecastRuns,
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
  getLeadTimeScoresForLocation,
  getQualifiedCumulativeRankingForLocation,
  getQualifiedLeadTimeScoresForLocation,
  upsertWeatherStation,
  upsertStationObservation,
  upsertGroundTruthSnapshot,
  upsertQualifiedObservationSnapshot,
  insertStationCollectionSnapshot,
  getQualifiedObservationSnapshotsForDate,
  getStoredHourlyForecasts,
} from "./db";

/**
 * Get today's date in YYYY-MM-DD format (Paris timezone)
 */
function getTodayParis(): string {
  return getParisDate();
}

/**
 * Get yesterday's date in YYYY-MM-DD format (Paris timezone)
 */
function getYesterdayParis(): string {
  return getParisDateDaysAgo(1);
}

export function getModelCoverage(receivedNames: string[]) {
  const expectedNames = WEATHER_SERVICES.expert.map((service) => service.name);
  const received = new Set(receivedNames);
  return {
    expected: expectedNames,
    collected: expectedNames.filter((name) => received.has(name)),
    missing: expectedNames.filter((name) => !received.has(name)),
  };
}

export function buildStationCollectionSnapshot(input: {
  locationKey: string;
  date: string;
  radiusKm: number;
  physicalStationCount: number;
  daily: ReturnType<typeof getModelCoverage>;
  hourly: ReturnType<typeof getModelCoverage>;
  forceFailed?: boolean;
}) {
  const status = input.forceFailed
    ? "failed" as const
    : input.daily.missing.length === 0 && input.hourly.missing.length === 0
      ? "completed" as const
      : "partial" as const;
  return {
    locationKey: input.locationKey,
    date: input.date,
    radiusKm: input.radiusKm,
    physicalStationCount: input.physicalStationCount,
    dailyModelCount: input.daily.collected.length,
    hourlyModelCount: input.hourly.collected.length,
    dailyMissingModels: input.daily.missing,
    hourlyMissingModels: input.hourly.missing,
    status,
  };
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
      const issuedAt = Date.now();
      await insertForecastRuns(expertData.map((f) => ({
        locationKey: defaultLocKey,
        validDate: today,
        serviceName: f.serviceName,
        provider: "open-meteo",
        modelId: WEATHER_SERVICES.expert.find((service) => service.name === f.serviceName)?.modelId ?? null,
        sourceKind: "model_forecast" as const,
        issuedAt,
        tempMax: f.tempMax,
        tempMin: f.tempMin,
        precipitation: f.precipitation,
        windSpeed: f.windSpeed,
        windGust: f.windGust,
        humidity: f.humidity,
        cloudCover: f.cloudCover,
        condition: f.condition,
        rawData: f.rawData as any,
      })));

      // Also insert public service entries
      const publicForecasts = await generatePublicServiceForecasts(
        today,
        defaultLocKey,
        HONDEGHEM.lat,
        HONDEGHEM.lon
      );
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
        const ranking = await getQualifiedCumulativeRankingForLocation(defaultLocKey);
        const reliabilityMap: Record<string, number> = {};
        ranking.forEach((r) => {
          reliabilityMap[r.serviceName] = r.avgScore ?? 50;
        });

        // ── Correction automatique des biais ─────────────────────────────────
        // Récupérer les biais historiques par modèle et les appliquer avant fusion
        const biases: ServiceBias[] = ranking
          .filter((r) => r.avgBiasTemp != null || r.avgBiasPrecip != null)
          .map((r) => ({
            serviceName: r.serviceName,
            biasTemp: r.avgBiasTemp != null ? Number(r.avgBiasTemp) : null,
            biasPrecip: r.avgBiasPrecip != null ? Number(r.avgBiasPrecip) : null,
            biasWind: null, // avgBiasWind not in getCumulativeRanking yet
          }));

        const rawForecastsForFusion = allForecasts.map((f) => ({
          serviceName: f.serviceName,
          tempMax: f.tempMax,
          tempMin: f.tempMin,
          precipitation: f.precipitation,
          windSpeed: f.windSpeed,
          windGust: null as number | null,
          cloudCover: f.cloudCover ?? null,
        }));

        const biasCorrectedForecasts = biases.length > 0
          ? applyBiasCorrection(rawForecastsForFusion, biases)
          : rawForecastsForFusion;

        // ── Scoring par échéance (lead-time) ──────────────────────────────────
        // Utiliser les scores par horizon pour pondérer les modèles selon J+0
        const leadTimeData = await getQualifiedLeadTimeScoresForLocation(defaultLocKey, 14);
        const leadTimePerfs: LeadTimePerf[] = leadTimeData.map((d) => ({
          serviceName: d.serviceName,
          bucket: d.bucket as LeadTimeBucket,
          avgMaeTemp: d.avgMaeTemp != null ? Number(d.avgMaeTemp) : null,
          avgMaePrecip: d.avgMaePrecip != null ? Number(d.avgMaePrecip) : null,
          avgMaeWind: d.avgMaeWind != null ? Number(d.avgMaeWind) : null,
          sampleSize: d.totalSamples != null ? Number(d.totalSamples) : 0,
          latestScoreDate: d.latestScoreDate ?? null,
        }));

        // Merge lead-time weights with global performance map (lead-time takes priority)
        const leadTimeWeights = getLeadTimeWeights(leadTimePerfs, "6-24h"); // today = 6-24h horizon
        const performanceMap: Record<string, { maeTemp?: number; maePrecip?: number; maeWind?: number; maeCloud?: number; weightedScore?: number }> = {};
        ranking.filter((r) => isEligibleGlobalReliabilityScore(Number(r.daysTracked ?? 0), r.latestScoreDate ?? null)).forEach((r) => {
          const ltw = leadTimeWeights[r.serviceName];
          performanceMap[r.serviceName] = {
            // Lead-time MAE takes priority over global MAE if available
            maeTemp: ltw?.maeTemp ?? (r.avgMaeTemp != null ? Number(r.avgMaeTemp) : undefined),
            maePrecip: ltw?.maePrecip ?? (r.avgMaePrecip != null ? Number(r.avgMaePrecip) : undefined),
            maeWind: ltw?.maeWind ?? (r.avgMaeWind != null ? Number(r.avgMaeWind) : undefined),
            maeCloud: r.avgCondMaeCloud != null ? Number(r.avgCondMaeCloud) : undefined,
            weightedScore: r.avgScore != null ? Number(r.avgScore) : 50,
          };
        });

        const meteoAI = computeOfficialDailyForecast(biasCorrectedForecasts, performanceMap);

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

        // Compute true confidence score (accord modèles + performances historiques + échéance)
        const bestModelScore = ranking.length > 0 ? Number(ranking[0].avgScore ?? 60) : 60;
        const trueConfidenceScore = computeConfidenceScore({
          forecasts: biasCorrectedForecasts,
          bestModelScore,
          leadTimeBucket: "6-24h",
        });

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
          weights: { version: 1, weightByService: meteoAI.weights, trace: meteoAI.trace } as any,
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

          const snapshots = await getQualifiedObservationSnapshotsForDate(locKey, yesterday);
          const dailyObservation = buildQualifiedDailyObservation(snapshots);
          if (!dailyObservation.isQualified) {
            locationSummaries.push(`📍 ${locName}: ${dailyObservation.reason} — score opérationnel non mis à jour`);
            continue;
          }

          await insertObservation({
            locationKey: locKey,
            date: yesterday,
            tempMax: dailyObservation.tempMax,
            tempMin: dailyObservation.tempMin,
            precipitation: dailyObservation.precipitation,
            windSpeed: dailyObservation.windSpeed,
            windGust: dailyObservation.windGust,
            humidity: null,
            cloudCover: null,
            condition: "Observation physique agrégée",
            source: "Stations physiques qualifiées",
            provenanceType: "physical_observation",
            isQualified: 1,
            rawData: { coverageHours: dailyObservation.coverageHours, aggregation: dailyObservation.reason } as any,
          });

          const hourlyForecasts = await getStoredHourlyForecasts(locKey, yesterday);
          const hourlyScores = scoreQualifiedHourlyModels(snapshots, hourlyForecasts);
          if (hourlyScores.length === 0) {
            locationSummaries.push(`📍 ${locName}: observation qualifiée (${dailyObservation.coverageHours} h), mais aucune prévision horaire alignée`);
            continue;
          }
          await insertReliabilityScores(hourlyScores.map((score) => ({
            locationKey: locKey,
            date: yesterday,
            serviceName: score.serviceName,
            maeTemp: score.maeTemp,
            maePrecip: score.maePrecip,
            maeWind: score.maeWind,
            rmseTemp: score.rmseTemp,
            rmsePrecip: score.rmsePrecip,
            rmseWind: score.rmseWind,
            biasTemp: score.biasTemp,
            weightedScore: score.weightedScore,
            evidenceType: "physical_observation",
            regime: null,
          })));
          locationSummaries.push(`📍 ${locName}: ${hourlyScores.length} score(s) calculé(s) sur ${dailyObservation.coverageHours} h physiques qualifiées`);

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
 * Generate public service forecasts from real provider responses only.
 * Aucune donnée synthétique ou aléatoire ne peut alimenter les prévisions,
 * les scores de fiabilité ou la fusion officielle.
 */
async function generatePublicServiceForecasts(
  date: string,
  locationKey = "default",
  lat?: number,
  lon?: number
): Promise<any[]> {
  if (lat === undefined || lon === undefined) return [];

  try {
    const real = await fetchRealPublicForecasts(date, lat, lon);
    const rows: any[] = [];
    if (real.owm) {
      rows.push({
        locationKey, date, serviceName: "OpenWeatherMap", serviceCategory: "public",
        tempMax: real.owm.tempMax, tempMin: real.owm.tempMin,
        precipitation: real.owm.precipitation, windSpeed: real.owm.windSpeed,
        windGust: real.owm.windGust, humidity: real.owm.humidity,
        cloudCover: real.owm.cloudCover, condition: real.owm.condition, rawData: null,
      });
    }
    if (real.mf) {
      rows.push({
        locationKey, date, serviceName: "Météo-France", serviceCategory: "public",
        tempMax: real.mf.tempMax, tempMin: real.mf.tempMin,
        precipitation: real.mf.precipitation, windSpeed: real.mf.windSpeed,
        windGust: real.mf.windGust, humidity: real.mf.humidity,
        cloudCover: real.mf.cloudCover, condition: real.mf.condition, rawData: null,
      });
    }
    return rows;
  } catch (e: any) {
    console.warn(`[MeteoAI] Real public APIs unavailable: ${e.message}`);
    return [];
  }
}

/**
 * Determine majority weather condition from forecasts
 */
function determineMajorityCondition(forecasts: any[]): string {
  // Since Open-Meteo doesn't provide text conditions, infer from data
  const avgPrecip = forecasts.reduce((sum, f) => sum + (f.precipitation ?? 0), 0) / forecasts.length;
  const avgCloud = forecasts.reduce((sum, f) => sum + (f.cloudCover ?? 50), 0) / forecasts.length;
  return conditionFromWeatherValues(avgPrecip, avgCloud);
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

    // Get only qualified evidence for operational model weights.
    const ranking = await getQualifiedCumulativeRankingForLocation("default");
    const reliabilityMap: Record<string, number> = {};
    ranking.forEach((r) => {
      reliabilityMap[r.serviceName] = r.avgScore ?? 50;
    });

    let locationsProcessed = 0;
    const errors: string[] = [];
    const coverageByLocation: Array<{
      location: string;
      daily: ReturnType<typeof getModelCoverage>;
      hourly: ReturnType<typeof getModelCoverage>;
      physicalStationCount: number;
    }> = [];

    for (const fav of uniqueLocations) {
      try {
        console.log(`[MeteoAI] Collecting forecasts for ${fav.name} (${fav.lat}, ${fav.lon})`);
        let physicalStationCount = 0;
        const radiusKm = Math.max(5, Math.min(50, fav.radiusKm ?? 20));

        // Compute locationKey for this favorite
        const locKey = makeLocationKey(fav.lat, fav.lon);

        // Collect physical station evidence once per unique location. Proxy
        // networks/model grid points are deliberately excluded from persistence
        // as station observations (see stationService.PHYSICAL_STATION_SOURCES).
        try {
          const discoveredStations = await collectNearbyStations(fav.lat, fav.lon, radiusKm, fav.customName ?? fav.name, { netatmoUserId: fav.userId });
          const physicalStations = getPhysicalActiveStations(discoveredStations);
          physicalStationCount = physicalStations.length;

          if (physicalStations.length === 0) {
            console.warn(`[Stations] ${fav.name}: aucune station physique officielle disponible dans le rayon de ${radiusKm} km`);
          }

          for (const station of physicalStations) {
            await upsertWeatherStation({
              stationId: station.stationId,
              source: station.source,
              name: station.name,
              lat: station.lat,
              lon: station.lon,
              altitude: station.altitude,
              refLat: fav.lat,
              refLon: fav.lon,
              distanceKm: station.distanceKm,
              reliabilityScore: station.reliabilityScore,
              updateFrequencyMin: station.updateFrequencyMin,
              dataAvailability: station.dataAvailability,
              isActive: station.isActive ? 1 : 0,
              exclusionReason: station.exclusionReason ?? null,
              qualificationStatus: station.qualificationStatus ?? "validated",
              sourceTier: station.sourceTier ?? null,
            });

            const observedAt = station.updatedAt ? Date.parse(station.updatedAt) : NaN;
            if (!Number.isFinite(observedAt)) continue;
            await upsertStationObservation({
              stationId: station.stationId,
              observedAt,
              temperature: station.temperature,
              humidity: station.humidity,
              pressure: station.pressure,
              windSpeed: station.windSpeed,
              windGust: station.windGust,
              windDirection: station.windDirection,
              precipitation: station.precipitation,
            });
          }

          // Citizen sensors are persisted as candidates for history and later quality
          // evaluation, but are deliberately excluded from the local ground truth.
          const candidateStations = getCandidateStations(discoveredStations);
          for (const station of candidateStations) {
            await upsertWeatherStation({
              stationId: station.stationId,
              source: station.source,
              name: station.name,
              lat: station.lat,
              lon: station.lon,
              altitude: station.altitude,
              refLat: fav.lat,
              refLon: fav.lon,
              distanceKm: station.distanceKm,
              reliabilityScore: station.reliabilityScore,
              updateFrequencyMin: station.updateFrequencyMin,
              dataAvailability: station.dataAvailability,
              isActive: 0,
              exclusionReason: station.exclusionReason ?? "Capteur citoyen en validation — non utilisé dans la température locale",
              qualificationStatus: "candidate",
              sourceTier: station.sourceTier ?? 3,
            });

            const observedAt = station.updatedAt ? Date.parse(station.updatedAt) : NaN;
            if (!Number.isFinite(observedAt)) continue;
            await upsertStationObservation({
              stationId: station.stationId,
              observedAt,
              temperature: station.temperature,
              humidity: station.humidity,
              pressure: station.pressure,
              windSpeed: station.windSpeed,
              windGust: station.windGust,
              windDirection: station.windDirection,
              precipitation: station.precipitation,
            });
          }

          const localSynthesis = calculateGroundTruth(physicalStations);
          await upsertGroundTruthSnapshot({
            date: today,
            refLat: fav.lat,
            refLon: fav.lon,
            radiusKm,
            stationsUsed: localSynthesis.stationsUsed as any,
            stationsIgnored: localSynthesis.stationsIgnored as any,
            temperature: localSynthesis.temperature,
            humidity: localSynthesis.humidity,
            pressure: localSynthesis.pressure,
            windSpeed: localSynthesis.windSpeed,
            windGust: localSynthesis.windGust,
            precipitation: localSynthesis.precipitation,
            stationCount: localSynthesis.stationCount,
            confidenceScore: localSynthesis.confidenceScore,
          });
          console.log(`[Stations] ${fav.name}: ${physicalStations.length} station(s) physique(s) stockée(s)`);
        } catch (stationError: any) {
          console.warn(`[Stations] Collection échouée pour ${fav.name}:`, stationError.message);
        }

        // Get location-specific ranking (fallback to global)
        const locRanking = await getQualifiedCumulativeRankingForLocation(locKey);
        const locReliabilityMap: Record<string, number> = {};
        (locRanking.length > 0 ? locRanking : ranking).forEach((r) => {
          locReliabilityMap[r.serviceName] = r.avgScore ?? 50;
        });

        // Collect expert forecasts for this location
        const expertData = await collectExpertForecasts(today, { lat: fav.lat, lon: fav.lon });
        const dailyCoverage = getModelCoverage(expertData.map((forecast) => forecast.serviceName));
        console.log(`[Models] ${fav.name}: quotidien ${dailyCoverage.collected.length}/${dailyCoverage.expected.length}`);
        if (dailyCoverage.missing.length > 0) {
          console.warn(`[Models] ${fav.name}: quotidien indisponible — ${dailyCoverage.missing.join(", ")}`);
        }

        if (expertData.length === 0) {
          console.warn(`[MeteoAI] No data for ${fav.name}`);
          await insertStationCollectionSnapshot(buildStationCollectionSnapshot({
            locationKey: locKey,
            date: today,
            radiusKm,
            physicalStationCount,
            daily: dailyCoverage,
            hourly: dailyCoverage,
            forceFailed: true,
          }));
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
        const publicRowsForLoc = await generatePublicServiceForecasts(today, locKey, fav.lat, fav.lon);
        await insertForecasts([...forecastRowsForLoc, ...publicRowsForLoc]);
        const issuedAt = Date.now();
        await insertForecastRuns([
          ...expertData.map((f) => ({
            locationKey: locKey,
            validDate: today,
            serviceName: f.serviceName,
            provider: "open-meteo",
            modelId: WEATHER_SERVICES.expert.find((service) => service.name === f.serviceName)?.modelId ?? null,
            sourceKind: "model_forecast" as const,
            issuedAt,
            tempMax: f.tempMax,
            tempMin: f.tempMin,
            precipitation: f.precipitation,
            windSpeed: f.windSpeed,
            windGust: f.windGust,
            humidity: f.humidity,
            cloudCover: f.cloudCover,
            condition: f.condition,
            rawData: f.rawData as any,
          })),
          ...publicRowsForLoc.map((f) => ({
            locationKey: locKey,
            validDate: today,
            serviceName: f.serviceName,
            provider: f.serviceName === "OpenWeatherMap" ? "openweathermap" : "meteofrance-or-open-meteo",
            modelId: null,
            sourceKind: "service_forecast" as const,
            issuedAt,
            tempMax: f.tempMax,
            tempMin: f.tempMin,
            precipitation: f.precipitation,
            windSpeed: f.windSpeed,
            windGust: f.windGust,
            humidity: f.humidity,
            cloudCover: f.cloudCover,
            condition: f.condition,
            rawData: f.rawData as any,
          })),
        ]);

        // ── Correction automatique des biais (favoris) ──────────────────────────────
        const activeRanking = locRanking.length > 0 ? locRanking : ranking;
        const locBiases: ServiceBias[] = activeRanking
          .filter((r) => r.avgBiasTemp != null || r.avgBiasPrecip != null)
          .map((r) => ({
            serviceName: r.serviceName,
            biasTemp: r.avgBiasTemp != null ? Number(r.avgBiasTemp) : null,
            biasPrecip: r.avgBiasPrecip != null ? Number(r.avgBiasPrecip) : null,
            biasWind: null,
          }));

        const rawLocForecasts = expertData.map((f) => ({
          serviceName: f.serviceName,
          tempMax: f.tempMax,
          tempMin: f.tempMin,
          precipitation: f.precipitation,
          windSpeed: f.windSpeed,
          windGust: null as number | null,
          cloudCover: f.cloudCover ?? null,
        }));

        const biasCorrectedLocForecasts = locBiases.length > 0
          ? applyBiasCorrection(rawLocForecasts, locBiases)
          : rawLocForecasts;

        // ── Scoring par échéance (favoris) ─────────────────────────────────────
        const locLeadTimeData = await getQualifiedLeadTimeScoresForLocation(locKey, 14);
        const locLeadTimePerfs: LeadTimePerf[] = locLeadTimeData.map((d) => ({
          serviceName: d.serviceName,
          bucket: d.bucket as LeadTimeBucket,
          avgMaeTemp: d.avgMaeTemp != null ? Number(d.avgMaeTemp) : null,
          avgMaePrecip: d.avgMaePrecip != null ? Number(d.avgMaePrecip) : null,
          avgMaeWind: d.avgMaeWind != null ? Number(d.avgMaeWind) : null,
          sampleSize: d.totalSamples != null ? Number(d.totalSamples) : 0,
          latestScoreDate: d.latestScoreDate ?? null,
        }));

        const locLeadTimeWeights = getLeadTimeWeights(locLeadTimePerfs, "6-24h");
        const locPerfMap: Record<string, { maeTemp?: number; maePrecip?: number; maeWind?: number; maeCloud?: number; weightedScore?: number }> = {};
        activeRanking.filter((r) => isEligibleGlobalReliabilityScore(Number(r.daysTracked ?? 0), r.latestScoreDate ?? null)).forEach((r) => {
          const ltw = locLeadTimeWeights[r.serviceName];
          locPerfMap[r.serviceName] = {
            maeTemp: ltw?.maeTemp ?? (r.avgMaeTemp != null ? Number(r.avgMaeTemp) : undefined),
            maePrecip: ltw?.maePrecip ?? (r.avgMaePrecip != null ? Number(r.avgMaePrecip) : undefined),
            maeWind: ltw?.maeWind ?? (r.avgMaeWind != null ? Number(r.avgMaeWind) : undefined),
            maeCloud: r.avgCondMaeCloud != null ? Number(r.avgCondMaeCloud) : undefined,
            weightedScore: r.avgScore != null ? Number(r.avgScore) : 50,
          };
        });

        const meteoAI = computeOfficialDailyForecast(biasCorrectedLocForecasts, locPerfMap);

        // Determine condition
        const avgPrecip = expertData.reduce((s, f) => s + (f.precipitation ?? 0), 0) / expertData.length;
        const avgCloud = expertData.reduce((s, f) => s + (f.cloudCover ?? 50), 0) / expertData.length;
        const condition = conditionFromWeatherValues(avgPrecip, avgCloud);

        // Estimate current temperature (midpoint of min/max adjusted for time of day)
        const hour = getParisHour();
        const dayProgress = Math.max(0, Math.min(1, (hour - 6) / 12)); // 0 at 6h, 1 at 18h
        const tempCurrent = meteoAI.tempMin !== null && meteoAI.tempMax !== null
          ? Math.round((meteoAI.tempMin + (meteoAI.tempMax - meteoAI.tempMin) * Math.sin(dayProgress * Math.PI / 2)) * 10) / 10
          : null;

        const explanation = `Prévision officielle pour ${fav.customName ?? fav.name}, fusionnée à partir de ${dailyCoverage.collected.length}/${dailyCoverage.expected.length} modèles experts disponibles. Indice de stabilité : ${stability.index}/100.`;

        // Find all favorites with this location (same lat/lon) and upsert for each
        const matchingFavorites = allFavorites.filter(
          (f) => Math.abs(f.lat - fav.lat) < 0.001 && Math.abs(f.lon - fav.lon) < 0.001
        );

        // Compute true confidence score (accord modèles + performances historiques + échéance)
        const locBestModelScore = activeRanking.length > 0 ? Number(activeRanking[0].avgScore ?? 60) : 60;
        const favConfidenceScore = computeConfidenceScore({
          forecasts: biasCorrectedLocForecasts,
          bestModelScore: locBestModelScore,
          leadTimeBucket: "6-24h",
        });

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
          weights: { version: 1, weightByService: meteoAI.weights, trace: meteoAI.trace } as any,
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
        let hourlyCoverage = getModelCoverage([]);
        try {
          const hourlyAllModels = await collectHourlyForecastAllModels(today, { lat: fav.lat, lon: fav.lon });
          hourlyCoverage = getModelCoverage(hourlyAllModels.map((forecast) => forecast.modelName === "best_match" ? "Open-Meteo" : forecast.modelName));
          console.log(`[Models] ${fav.name}: horaire ${hourlyCoverage.collected.length}/${hourlyCoverage.expected.length}`);
          if (hourlyCoverage.missing.length > 0) {
            console.warn(`[Models] ${fav.name}: horaire indisponible — ${hourlyCoverage.missing.join(", ")}`);
          }
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

        coverageByLocation.push({
          location: fav.customName ?? fav.name,
          daily: dailyCoverage,
          hourly: hourlyCoverage,
          physicalStationCount,
        });

        await insertStationCollectionSnapshot(buildStationCollectionSnapshot({
          locationKey: locKey,
          date: today,
          radiusKm,
          physicalStationCount,
          daily: dailyCoverage,
          hourly: hourlyCoverage,
        }));

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
      coverageByLocation,
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

/**
 * Hourly physical evidence collection. Candidate sensors and model references
 * are excluded before the location synthesis is persisted.
 */
export async function collectPhysicalObservationSnapshotsHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });

    const favorites = await getAllFavoriteLocations();
    const unique = new Map<string, typeof favorites[number]>();
    for (const favorite of favorites) unique.set(makeLocationKey(favorite.lat, favorite.lon), favorite);

    const date = getTodayParis();
    const hour = getParisHour();
    const results: Array<{ locationKey: string; stationCount: number; stored: boolean; reason?: string }> = [];
    for (const favorite of Array.from(unique.values())) {
      const locationKey = makeLocationKey(favorite.lat, favorite.lon);
      const radiusKm = Math.max(5, Math.min(50, favorite.radiusKm ?? 20));
      const discovered = await collectNearbyStations(favorite.lat, favorite.lon, radiusKm, favorite.customName ?? favorite.name, { netatmoUserId: favorite.userId });
      const physical = getPhysicalActiveStations(discovered);
      for (const station of physical) {
        await upsertWeatherStation({
          stationId: station.stationId,
          source: station.source,
          name: station.name,
          lat: station.lat,
          lon: station.lon,
          altitude: station.altitude,
          refLat: favorite.lat,
          refLon: favorite.lon,
          distanceKm: station.distanceKm,
          reliabilityScore: station.reliabilityScore,
          updateFrequencyMin: station.updateFrequencyMin,
          dataAvailability: station.dataAvailability,
          isActive: station.isActive ? 1 : 0,
          exclusionReason: station.exclusionReason ?? null,
          qualificationStatus: station.qualificationStatus ?? "validated",
          sourceTier: station.sourceTier ?? null,
        });
        const observedAt = station.updatedAt ? Date.parse(station.updatedAt) : NaN;
        if (!Number.isFinite(observedAt)) continue;
        await upsertStationObservation({
          stationId: station.stationId,
          observedAt,
          temperature: station.temperature,
          humidity: station.humidity,
          pressure: station.pressure,
          windSpeed: station.windSpeed,
          windGust: station.windGust,
          windDirection: station.windDirection,
          precipitation: station.precipitation,
        });
      }
      const synthesis = calculateGroundTruth(physical);
      if (synthesis.stationCount < 1 || synthesis.temperature == null) {
        results.push({ locationKey, stationCount: synthesis.stationCount, stored: false, reason: "Aucune station physique qualifiée" });
        continue;
      }
      await upsertQualifiedObservationSnapshot({
        locationKey,
        date,
        hour,
        stationCount: synthesis.stationCount,
        confidenceScore: synthesis.confidenceScore,
        temperature: synthesis.temperature,
        humidity: synthesis.humidity,
        pressure: synthesis.pressure,
        windSpeed: synthesis.windSpeed,
        windGust: synthesis.windGust,
        precipitation: synthesis.precipitation,
        stationsUsed: synthesis.stationsUsed as any,
      });
      results.push({ locationKey, stationCount: synthesis.stationCount, stored: true });
    }
    // date/hour are deliberately Paris business time: raw station observedAt stays UTC milliseconds.
    res.json({ ok: true, date, hour, timeZone: "Europe/Paris", locations: results });
  } catch (error: any) {
    console.error("[MeteoAI] Physical snapshot collection error:", error);
    res.status(500).json({ error: error.message, stack: error.stack, context: { url: req.url }, timestamp: new Date().toISOString() });
  }
}
