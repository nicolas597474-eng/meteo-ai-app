/**
 * Scheduled Handlers for MeteoAI
 * - /api/scheduled/collect-forecasts: Runs at 07h30 Paris time
 * - /api/scheduled/collect-observations: Runs at 20h00 Paris time
 */

import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { WEATHER_SERVICES, collectExpertForecasts, collectObservations, collectHourlyForecastAllModels, collectValidationForecasts, collectValidationHourlyForecasts } from "./weatherServices";
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
  insertStationObservationIfMissing,
  refreshStationQualityProfiles,
  upsertGroundTruthSnapshot,
  upsertQualifiedObservationSnapshot,
  insertQualifiedObservationSnapshotIfMissing,
  insertStationCollectionSnapshot,
  upsertPhysicalSnapshotCollectionTrace,
  insertPhysicalSnapshotCollectionTraceIfMissing,
  getQualifiedObservationSnapshotsForDate,
  getPhysicalSnapshotCollectionTracesByDateRange,
  getStoredHourlyForecasts,
  getStationEvidenceSummary,
  upsertPublicForecastProvenanceSnapshot,
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

export const HOURLY_SNAPSHOT_MAX_ATTEMPTS = 5;
export const HOURLY_SNAPSHOT_RETRY_DELAY_MS = 1_200;
export const TECHNICAL_FAILURE_ALERT_THRESHOLD = 3;
export const PHYSICAL_STATION_WRITE_CONCURRENCY = 8;

export function shouldRetryHourlyFavorite(attempt: number): boolean {
  return attempt + 1 < HOURLY_SNAPSHOT_MAX_ATTEMPTS;
}

export function countConsecutiveTechnicalFailures(traces: Array<{ status: string }>): number {
  let count = 0;
  for (const trace of traces) {
    if (trace.status !== "failed") break;
    count++;
  }
  return count;
}

/** Une seule alerte est demandée au franchissement exact du seuil, sans répétition. */
export function shouldNotifyOwnerForTechnicalFailures(streak: number): boolean {
  return streak === TECHNICAL_FAILURE_ALERT_THRESHOLD;
}

type PhysicalSnapshotFavorite = Awaited<ReturnType<typeof getAllFavoriteLocations>>[number];

export type PhysicalSnapshotCollectionTrigger = "scheduled" | "manual" | "recovery";

export type PhysicalSnapshotCollectionLocationResult = {
  locationKey: string;
  stationCount: number;
  stored: boolean;
  attempts: number;
  skipped?: boolean;
  directReadingsAdded?: number;
  snapshotPreserved?: boolean;
  durationMs?: number;
  reason?: string;
};

/**
 * Collecte les observations physiques pour un ensemble de favoris. Les modes
 * manuel et de reprise restent strictement additifs : un relevé, snapshot ou
 * trace déjà archivé pour l’heure de Paris en cours n’est jamais réécrit.
 */
export async function collectPhysicalObservationSnapshotsForFavorites(
  favorites: readonly PhysicalSnapshotFavorite[],
  trigger: PhysicalSnapshotCollectionTrigger,
) {
  const collectionStartedAt = Date.now();
  const unique = new Map<string, PhysicalSnapshotFavorite>();
  for (const favorite of favorites) unique.set(makeLocationKey(favorite.lat, favorite.lon), favorite);

  const date = getTodayParis();
  const hour = getParisHour();
  const results: PhysicalSnapshotCollectionLocationResult[] = [];
  const preserveArchivedEvidence = trigger === "manual" || trigger === "recovery";
  const recoveryOnly = trigger === "recovery";

  // Deux lieux sont collectés en parallèle, comme la collecte de prévisions.
  // Cela conserve les écritures indépendantes par lieu tout en évitant que deux
  // appels fournisseurs successifs dépassent le délai du callback Heartbeat.
  await processWithConcurrency(Array.from(unique.values()), 2, async (favorite) => {
    const locationKey = makeLocationKey(favorite.lat, favorite.lon);
    const locationStartedAt = Date.now();
    const radiusKm = Math.max(5, Math.min(50, favorite.radiusKm ?? 20));
    let snapshotAlreadyArchived = false;
    let traceForHour: Awaited<ReturnType<typeof getPhysicalSnapshotCollectionTracesByDateRange>>[number] | null = null;

    if (preserveArchivedEvidence || trigger === "scheduled") {
      const [snapshots, traces] = await Promise.all([
        getQualifiedObservationSnapshotsForDate(locationKey, date),
        getPhysicalSnapshotCollectionTracesByDateRange(locationKey, date, date),
      ]);
      snapshotAlreadyArchived = snapshots.some((snapshot) => snapshot.hour === hour);
      traceForHour = traces.find((trace) => trace.hour === hour) ?? null;
    }

    // La principale comme la reprise s'arrêtent immédiatement lorsqu'une preuve
    // réussie existe déjà pour le créneau. Une ancienne trace no_station/failed
    // n'empêche pas la reprise de tenter de produire le snapshot manquant.
    const successfulEvidenceAlreadyArchived = snapshotAlreadyArchived || traceForHour?.status === "stored";
    if ((trigger === "scheduled" || recoveryOnly) && successfulEvidenceAlreadyArchived) {
      results.push({
        locationKey,
        stationCount: 0,
        stored: false,
        attempts: 0,
        skipped: true,
        snapshotPreserved: true,
        reason: trigger === "recovery"
          ? "Créneau déjà archivé par le passage horaire principal ; reprise ignorée."
          : "Créneau déjà archivé ; nouvelle exécution planifiée ignorée.",
        durationMs: Date.now() - locationStartedAt,
      });
      return;
    }

    let locationResult: PhysicalSnapshotCollectionLocationResult | null = null;
    let directReadingsAdded = 0;
    for (let attempt = 0; attempt < HOURLY_SNAPSHOT_MAX_ATTEMPTS; attempt++) {
      try {
        const discovered = await collectNearbyStations(
          favorite.lat,
          favorite.lon,
          radiusKm,
          favorite.customName ?? favorite.name,
          { netatmoUserId: favorite.userId },
        );
        const physical = getPhysicalActiveStations(discovered);
        await processWithConcurrency(physical, PHYSICAL_STATION_WRITE_CONCURRENCY, async (station) => {
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
          if (!Number.isFinite(observedAt)) return;
          const observation = {
            stationId: station.stationId,
            observedAt,
            temperature: station.temperature,
            humidity: station.humidity,
            pressure: station.pressure,
            windSpeed: station.windSpeed,
            windGust: station.windGust,
            windDirection: station.windDirection,
            precipitation: station.precipitation,
          };
          if (await insertStationObservationIfMissing(observation)) directReadingsAdded++;
        });

        await refreshStationQualityProfiles(physical.map((station) => station.stationId));
        const synthesis = calculateGroundTruth(physical);
        if (preserveArchivedEvidence && successfulEvidenceAlreadyArchived) {
          locationResult = {
            locationKey,
            stationCount: synthesis.stationCount,
            stored: false,
            attempts: attempt + 1,
            directReadingsAdded,
            snapshotPreserved: true,
            reason: "Le snapshot horaire déjà archivé est conservé ; seuls les nouveaux relevés directs ont été ajoutés.",
          };
          results.push(locationResult);
          break;
        }
        if (synthesis.stationCount < 1 || synthesis.temperature == null) {
          if (shouldRetryHourlyFavorite(attempt)) {
            console.warn(
              `[MeteoAI] No qualified physical station for ${favorite.customName ?? favorite.name}; retrying (${attempt + 2}/${HOURLY_SNAPSHOT_MAX_ATTEMPTS}):`,
              { stationCount: synthesis.stationCount, hasTemperature: synthesis.temperature != null, attempt: attempt + 1 },
            );
            await new Promise<void>((resolve) => setTimeout(resolve, HOURLY_SNAPSHOT_RETRY_DELAY_MS));
            continue;
          }
          locationResult = {
            locationKey,
            stationCount: synthesis.stationCount,
            stored: false,
            attempts: attempt + 1,
            directReadingsAdded,
            reason: "Aucune station physique qualifiée",
          };
          results.push(locationResult);
          break;
        }

        const snapshot = {
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
        };
        const snapshotCreated = await insertQualifiedObservationSnapshotIfMissing(snapshot);
        locationResult = snapshotCreated
          ? {
              locationKey,
              stationCount: synthesis.stationCount,
              stored: true,
              attempts: attempt + 1,
              directReadingsAdded,
              reason: trigger === "recovery"
                ? "Archivé via la reprise automatique après l’absence de trace du passage principal."
                : undefined,
            }
          : {
              locationKey,
              stationCount: synthesis.stationCount,
              stored: false,
              attempts: attempt + 1,
              directReadingsAdded,
              snapshotPreserved: true,
              reason: "Le snapshot horaire a été archivé entre-temps ; les nouveaux relevés directs ont été conservés sans le remplacer.",
            };
        results.push(locationResult);
        break;
      } catch (error: any) {
        const message = error instanceof Error ? error.message : "Erreur de collecte inconnue";
        if (shouldRetryHourlyFavorite(attempt)) {
          console.warn(`[MeteoAI] Physical snapshot collection failed for ${favorite.customName ?? favorite.name}; retrying (${attempt + 2}/${HOURLY_SNAPSHOT_MAX_ATTEMPTS}):`, message);
          await new Promise<void>((resolve) => setTimeout(resolve, HOURLY_SNAPSHOT_RETRY_DELAY_MS));
          continue;
        }
        console.error(`[MeteoAI] Physical snapshot collection failed after ${HOURLY_SNAPSHOT_MAX_ATTEMPTS} attempts for ${favorite.customName ?? favorite.name}:`, message);
        locationResult = { locationKey, stationCount: 0, stored: false, attempts: attempt + 1, directReadingsAdded, reason: `Erreur de collecte après relance : ${message}` };
        results.push(locationResult);
      }
    }

    if (locationResult) {
      locationResult.durationMs = Date.now() - locationStartedAt;
      const status: "stored" | "failed" | "no_station" = locationResult.stored
        ? "stored"
        : locationResult.reason?.startsWith("Erreur de collecte")
          ? "failed"
          : "no_station";
      const trace = {
        locationKey,
        locationName: favorite.customName ?? favorite.name,
        date,
        hour,
        radiusKm,
        status,
        attempts: locationResult.attempts,
        stationCount: locationResult.stationCount,
        reason: locationResult.reason ?? null,
      };
      if (!traceForHour) {
        await insertPhysicalSnapshotCollectionTraceIfMissing(trace);
      } else if (status === "stored" && traceForHour.status !== "stored") {
        await upsertPhysicalSnapshotCollectionTrace({
          ...trace,
          reason: trigger === "recovery"
            ? "Snapshot archivé par la reprise automatique après un passage principal sans preuve réussie."
            : "Snapshot archivé par une nouvelle exécution planifiée après une trace initiale sans preuve réussie.",
        });
      } else {
        console.info(`[MeteoAI] Physical trace preserved for ${locationKey} at ${date} ${hour}h (${traceForHour.status}).`);
      }
    }
  });

  const collectionErrors = results.filter((result) => result.reason?.startsWith("Erreur de collecte"));
  const collectedResults = results.filter((result) => !result.skipped);
  const allLocationsFailed = collectedResults.length > 0 && collectionErrors.length === collectedResults.length;
  if (trigger === "scheduled" && collectionErrors.length > 0) {
    const thresholdBreaches = await Promise.all(collectionErrors.map(async (failure) => {
      const traces = await getPhysicalSnapshotCollectionTracesByDateRange(failure.locationKey, getParisDateDaysAgo(1), getTodayParis());
      const streak = countConsecutiveTechnicalFailures(traces);
      return { ...failure, streak };
    }));
    const newlyAlertableFailures = thresholdBreaches.filter((failure) => shouldNotifyOwnerForTechnicalFailures(failure.streak));
    if (newlyAlertableFailures.length > 0) {
    const parisTime = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
      const failedList = newlyAlertableFailures.map((failure) => `• ${failure.locationKey} — ${failure.reason ?? "raison inconnue"} (${failure.streak} échecs techniques consécutifs)`).join("\n");
    try {
      await notifyOwner({
          title: "MeteoAI · Échecs techniques horaires répétés",
          content: `Au moins ${TECHNICAL_FAILURE_ALERT_THRESHOLD} collectes physiques consécutives ont échoué à ${parisTime} (heure de Paris).\n\nLieux concernés :\n${failedList}\n\nLes créneaux « aucune station qualifiée » ne déclenchent pas cette alerte. Les prévisions et archives existantes ne sont pas modifiées.`,
      });
    } catch (notifError) {
        console.warn("[MeteoAI] Owner notification failed after repeated technical collection failures:", notifError);
      }
    }
  }

  return {
    ok: !allLocationsFailed,
    status: allLocationsFailed ? "failed" : collectionErrors.length > 0 ? "partial" : "completed",
    trigger,
    date,
    hour,
    timeZone: "Europe/Paris",
    durationMs: Date.now() - collectionStartedAt,
    locations: results,
    errors: collectionErrors.length > 0 ? collectionErrors.map((result) => ({ locationKey: result.locationKey, attempts: result.attempts, reason: result.reason })) : undefined,
  };
}

/**
 * Exécute chaque lieu une seule fois, avec une concurrence bornée. La collecte
 * reste donc complète pour tous les favoris, sans sérialiser inutilement les
 * appels indépendants ni surcharger le fournisseur météo.
 */
export async function processWithConcurrency<T>(
  items: readonly T[],
  maxConcurrency: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  const workerCount = Math.min(Math.max(1, maxConcurrency), items.length);
  let nextIndex = 0;

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await work(item);
    }
  }));
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
          humidity: f.humidity ?? null,
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
        const performanceMap: Record<string, { maeTemp?: number; maePrecip?: number; maeWind?: number; maeHumidity?: number; maeCloud?: number; weightedScore?: number }> = {};
        ranking.filter((r) => isEligibleGlobalReliabilityScore(Number(r.daysTracked ?? 0), r.latestScoreDate ?? null)).forEach((r) => {
          const ltw = leadTimeWeights[r.serviceName];
          performanceMap[r.serviceName] = {
            // Lead-time MAE takes priority over global MAE if available
            maeTemp: ltw?.maeTemp ?? (r.avgMaeTemp != null ? Number(r.avgMaeTemp) : undefined),
            maePrecip: ltw?.maePrecip ?? (r.avgMaePrecip != null ? Number(r.avgMaePrecip) : undefined),
            maeWind: ltw?.maeWind ?? (r.avgMaeWind != null ? Number(r.avgMaeWind) : undefined),
            maeHumidity: r.avgMaeHumidity != null ? Number(r.avgMaeHumidity) : undefined,
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
          humidity: meteoAI.humidity,
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
            sampleSize: score.sampleSize,
            maeTemp: score.maeTemp,
            maePrecip: score.maePrecip,
            maeWind: score.maeWind,
            rmseTemp: score.rmseTemp,
            rmsePrecip: score.rmsePrecip,
            rmseWind: score.rmseWind,
            biasTemp: score.biasTemp,
            precipScore: score.precipScore,
            precipPod: score.precipPod,
            precipFar: score.precipFar,
            precipCsi: score.precipCsi,
            precipFalsePositives: score.precipFalsePositives,
            precipFalseNegatives: score.precipFalseNegatives,
            windScore: score.windScore,
            windMaeGusts: score.windMaeGusts,
            weightedScore: score.weightedScore,
            normalizedScore: score.normalizedScore,
            humidityScore: score.humidityScore,
            humidityMae: score.humidityMae,
            humidityRmse: score.humidityRmse,
            humidityBias: score.humidityBias,
            pressureScore: score.pressureScore,
            pressureMae: score.pressureMae,
            pressureRmse: score.pressureRmse,
            pressureBias: score.pressureBias,
            evidenceType: "physical_observation",
            regime: null,
          })));
          totalScores += hourlyScores.length;
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
    try {
      await upsertPublicForecastProvenanceSnapshot({
        locationKey,
        date,
        serviceName: "Météo-France",
        status: real.mfProvenance.status,
        provider: real.mfProvenance.provider,
        upstreamModels: real.mfProvenance.upstreamModels,
        fallbackReason: real.mfProvenance.fallbackReason,
        officialConfigured: real.mfProvenance.officialConfigured ? 1 : 0,
        shadowMode: 1,
        appliedToProduction: 0,
        checkedAt: new Date(real.mfProvenance.checkedAt),
      });
    } catch (provenanceError: any) {
      // La traçabilité shadow ne doit jamais bloquer le flux public historique.
      console.warn(`[MeteoAI] Météo-France provenance shadow unavailable: ${provenanceError.message}`);
    }
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
        cloudCover: real.mf.cloudCover, condition: real.mf.condition,
        rawData: {
          provenance: real.mfProvenance,
          shadowMode: true,
          provenanceAppliedToProduction: false,
        },
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
  let jobId = -1;
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }
    // Le déclencheur teste 03h00 et 04h00 UTC afin de couvrir les changements
    // d'heure. Une seule exécution est admise : exactement 05h00 Europe/Paris.
    const parisHour = getParisHour();
    if (parisHour !== 5) {
      return res.json({ ok: true, skipped: "outside-05h00-paris", parisHour });
    }

    jobId = await createCollectionJob({
      jobType: "forecast",
      status: "running",
      scheduleCronTaskUid: user.taskUid,
    });

    const today = getTodayParis();
    console.log(`[MeteoAI] Starting favorites forecast collection for ${today}`);

    // Get all favorites across all users
    const allFavorites = await getAllFavoriteLocations();

    if (allFavorites.length === 0) {
      console.log("[MeteoAI] No favorite locations found, skipping.");
      await updateCollectionJob(jobId, { status: "completed", servicesCollected: 0, completedAt: new Date() });
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

    // Les relevés physiques ont leur propre tâche horaire : les exécuter ici
    // pouvait faire dépasser le délai de la collecte de prévisions de 05h00.
    const stationCollectionDeferred = true;
    let locationsProcessed = 0;
    const errors: string[] = [];
    const coverageByLocation: Array<{
      location: string;
      daily: ReturnType<typeof getModelCoverage>;
      hourly: ReturnType<typeof getModelCoverage>;
      physicalStationCount: number;
      stationCollectionDeferred: boolean;
      stations: Awaited<ReturnType<typeof getStationEvidenceSummary>>;
    }> = [];

    // Deux lieux sont traités en parallèle. À l'heure actuelle, cela permet
    // d'achever les deux favoris avant le délai du callback, tout en bornant
    // les appels réseau et les écritures en base lorsque la liste grandit.
    await processWithConcurrency(uniqueLocations, 2, async (fav) => {
      try {
        console.log(`[MeteoAI] Collecting forecasts for ${fav.name} (${fav.lat}, ${fav.lon})`);
        let physicalStationCount = 0;
        const radiusKm = Math.max(5, Math.min(50, fav.radiusKm ?? 20));

        // Compute locationKey for this favorite
        const locKey = makeLocationKey(fav.lat, fav.lon);
        const stationEvidence = await getStationEvidenceSummary(locKey, fav.lat, fav.lon);

        // Collect physical station evidence once per unique location. Proxy
        // networks/model grid points are deliberately excluded from persistence
        // as station observations (see stationService.PHYSICAL_STATION_SOURCES).
        if (!stationCollectionDeferred) try {
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
        if (stationCollectionDeferred) {
          console.log(`[Stations] ${fav.name}: relevés physiques confiés à la collecte horaire dédiée`);
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
          return;
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
            provider: f.serviceName === "OpenWeatherMap"
              ? "openweathermap"
              : ((f.rawData as any)?.provenance?.provider ?? "meteofrance-provenance-unknown"),
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

        // Candidate outputs are archived independently and cannot enter the
        // forecasts table, official fusion or eight-model coverage counters.
        const validationDaily = await collectValidationForecasts(today, { lat: fav.lat, lon: fav.lon });
        if (validationDaily.length > 0) {
          await insertForecastRuns(validationDaily.map((f) => ({
            locationKey: locKey,
            validDate: today,
            serviceName: f.serviceName,
            provider: "open-meteo",
            modelId: f.modelId,
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
            rawData: { validationStatus: f.validationStatus, forecast: f.rawData } as any,
          })));
        }

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

        const explanation = `Prévision officielle pour ${fav.customName ?? fav.name}, fusionnée à partir de ${dailyCoverage.collected.length}/${dailyCoverage.expected.length} modèles experts disponibles. Indice de stabilité : ${stability.index}/100. La température actuelle est résolue en direct lors de la consultation et n’est pas interpolée depuis Tmin/Tmax.`;

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
            tempCurrent: null,
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
              pressure: h.pressure,
              cloudCover: h.cloudCover,
              weatherCode: h.weatherCode,
            }));
            await insertHourlyForecasts(rows);
          }
          const validationHourly = await collectValidationHourlyForecasts(today, { lat: fav.lat, lon: fav.lon });
          for (const { modelName, hours } of validationHourly) {
            await insertHourlyForecasts(hours.map((h) => ({
              locationKey: locKey,
              date: today,
              hour: h.hour,
              modelName: `${modelName} · validation`,
              temperature: h.temperature,
              apparentTemperature: h.apparentTemperature,
              precipitation: h.precipitation,
              windSpeed: h.windSpeed,
              windGusts: h.windGusts,
              windDirection: h.windDirection,
              humidity: h.humidity,
              cloudCover: h.cloudCover,
              weatherCode: h.weatherCode,
            })));
          }
          console.log(`[Validation] ${fav.name}: ${validationDaily.length} quotidien(s), ${validationHourly.length} horaire(s) candidat(s)`);
          console.log(`[HourlyAll] Stored ${hourlyAllModels.length} models for ${fav.name}`);
        } catch (hourlyErr: any) {
          console.warn(`[HourlyAll] Failed for ${fav.name}:`, hourlyErr.message);
        }

        coverageByLocation.push({
          location: fav.customName ?? fav.name,
          daily: dailyCoverage,
          hourly: hourlyCoverage,
          physicalStationCount,
          stationCollectionDeferred,
          stations: stationEvidence,
        });

        // Le bilan des modèles doit être écrit même lorsque les snapshots physiques
        // sont collectés par la tâche horaire dédiée. Les deux flux restent séparés.
        await insertStationCollectionSnapshot(buildStationCollectionSnapshot({
          locationKey: locKey,
          date: today,
          radiusKm,
          physicalStationCount,
          daily: dailyCoverage,
          hourly: hourlyCoverage,
        }));

        locationsProcessed++;

      } catch (err: any) {
        console.error(`[MeteoAI] Error collecting for ${fav.name}:`, err.message);
        errors.push(`${fav.name}: ${err.message}`);
      }
    });

    await updateCollectionJob(jobId, {
      status: errors.length > 0 && locationsProcessed === 0 ? "failed" : "completed",
      servicesCollected: locationsProcessed,
      errorMessage: errors.length > 0 ? errors.join(" | ").slice(0, 4000) : undefined,
      completedAt: new Date(),
    });
    res.json({
      ok: true,
      date: today,
      locationsProcessed,
      totalFavorites: allFavorites.length,
      coverageByLocation,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    if (jobId > 0) {
      await updateCollectionJob(jobId, {
        status: "failed",
        errorMessage: error.message,
        completedAt: new Date(),
      });
    }
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
    const trigger: PhysicalSnapshotCollectionTrigger = req.body?.snapshotMode === "recovery" ? "recovery" : "scheduled";
    res.json(await collectPhysicalObservationSnapshotsForFavorites(favorites, trigger));
  } catch (error: any) {
    console.error("[MeteoAI] Physical snapshot collection error:", error);
    res.status(500).json({ error: error.message, stack: error.stack, context: { url: req.url }, timestamp: new Date().toISOString() });
  }
}
