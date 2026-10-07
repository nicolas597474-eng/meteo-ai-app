/**
 * Scheduled Handlers for MeteoAI
 * - /api/scheduled/collect-forecasts: Runs at 07h30 Paris time
 * - /api/scheduled/collect-observations: Runs at 20h00 Paris time
 */

import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { sdk } from "./_core/sdk";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { WEATHER_SERVICES, OFFICIAL_HOURLY_MODELS, collectExpertForecasts, collectExpertForecastsWithDiagnostics, collectObservations, collectHourlyForecastAllModelsWithDiagnostics, collectValidationForecasts, collectValidationHourlyForecasts } from "./weatherServices";
import { buildHourlyModelCollectionCoverage, confirmDailyArchiveCoverage, HOURLY_FORECAST_VARIABLES, type DailyModelCollectionCoverage } from "./forecastVariableCoverage";
import { isHourlyForecastArchiveComplete, isHourlyForecastRunHealthy } from "./forecastHealth";
import { getParisDate, getParisDateDaysAgo, getParisForecastSlot, getParisHour, getParisHourlyTimestamps } from "./weatherTime";
import { getActiveParisForecastHours } from "./forecastScheduleConfig";
import { FAVORITES_FORECAST_SCHEDULER_LOCK_KEY, FORECAST_REFRESH_LOCK_LEASE_MS, getLocationForecastRefreshLockKey } from "./forecastRefreshLock";
import { aggregateForecastCondition } from "./weatherConditionAggregation";
import { isOperationalObservation } from "./observationProvenance";
import { buildQualifiedDailyObservation } from "./physicalObservationAggregation";
import { buildDailyForecastObservationComparisons, buildForecastRunArchiveRows } from "./dailyForecastPerformance";
import { buildMeteoAIDailyFusionArchiveRun } from "./dailyForecastVerification";
import { scoreQualifiedHourlyModels } from "./qualifiedHourlyScoring";
import { evaluateHourlyForecastRuns, normalizeHourlyForecastVariable } from "./hourlyForecastRunScoring";
import type { HourlyComparisonDiagnostic } from "./hourlyComparisonDiagnostics";
import { HOURLY_SCORING_VALIDATION_VERSION } from "../shared/hourlyScoringValidation";
import { evaluateProviderRunForecasts } from "./providerRunHorizon";
import { collectProviderRunBatch } from "./providerRunCollection";
import { computeOfficialDailyForecast } from "./officialForecast";
import { runOptionalBackgroundTask } from "./optionalBackgroundTask";
import { rebuildLocalTemperatureNowcastForSnapshot } from "./localTemperatureNowcastingShadow";
import { formatHourlyJournalWriteError } from "./hourlyJournalErrors";
import {
  evaluateLocalPrecipitationNowcastOutcomesForSnapshot,
  rebuildLocalPrecipitationNowcastForSnapshot,
} from "./localPrecipitationNowcastingShadow";
import { calculateReliabilityScore } from "./statsEngine";
import { legacyStabilityLabelForStorage } from "./legacyStabilityStorage";
import { collectNearbyStations, calculateGroundTruth, getCandidateStations, getPhysicalActiveStations } from "./stationService";
import {
  insertForecasts,
  insertForecastRuns,
  insertMeteoAIDailyFusionRun,
  HourlyForecastPersistenceError,
  upsertHourlyForecastCollectionResults,
  claimScheduledForecastCollectionJob,
  acquireForecastRefreshLock,
  releaseForecastRefreshLock,
  insertObservation,
  upsertHourlyCompatibilityReliabilityScores,
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
  getForecastRunsForValidDate,
  getDailyFusionPerformanceEvidence,
  upsertDailyForecastObservationComparisons,
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
  getHourlyForecastRunValues,
  persistHourlyForecastEvaluationScores,
  persistHourlyForecastExactComparisons,
  persistHourlyForecastExactEvaluationScores,
  getLatestHourlyProviderRunCaptures,
  persistHourlyProviderRunCaptureBatch,
  getHourlyProviderRunValues,
  upsertHourlyComparisonDiagnosticSnapshot,
  persistHourlyProviderRunEvaluation,
  getStationEvidenceSummary,
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

const OFFICIAL_HOURLY_COVERAGE_MODELS = OFFICIAL_HOURLY_MODELS.map((model) => model.name);
const OFFICIAL_HOURLY_COVERAGE_MODEL_SET = new Set<string>(OFFICIAL_HOURLY_COVERAGE_MODELS);
const OFFICIAL_DAILY_COVERAGE_MODELS = OFFICIAL_HOURLY_MODELS.map((model) => model.name);
const OFFICIAL_DAILY_COVERAGE_MODEL_SET = new Set<string>(OFFICIAL_DAILY_COVERAGE_MODELS);

export function getModelCoverage(
  receivedNames: string[],
  expectedNames = OFFICIAL_DAILY_COVERAGE_MODELS,
) {
  const received = new Set(receivedNames);
  return {
    expected: expectedNames,
    collected: expectedNames.filter((name) => received.has(name)),
    missing: expectedNames.filter((name) => !received.has(name)),
  };
}

export function getForecastCollectionJobStatus(locationsProcessed: number, errors: readonly string[]) {
  return errors.length > 0 && locationsProcessed === 0 ? "failed" as const : "completed" as const;
}

export function buildStationCollectionSnapshot(input: {
  locationKey: string;
  date: string;
  radiusKm: number;
  physicalStationCount: number;
  daily: ReturnType<typeof getModelCoverage>;
  hourly: ReturnType<typeof getModelCoverage>;
  dailyVariableCoverage?: DailyModelCollectionCoverage[];
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
    dailyVariableCoverage: input.dailyVariableCoverage ?? null,
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
      // Un passage normal peut rapprocher les émissions pending du snapshot
      // déjà archivé, sans nouvelle collecte ni réécriture de celui-ci.
      await runOptionalBackgroundTask(`local-precipitation-nowcast-outcome:${locationKey}:${date}:${hour}`, () =>
        evaluateLocalPrecipitationNowcastOutcomesForSnapshot({
          locationKey,
          observationDate: date,
          observationHour: hour,
        }),
      );
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
        const synthesis = calculateGroundTruth(physical);
        const measurementTimesByStationId = new Map(
          synthesis.stationsUsed.map((contribution) => [contribution.stationId, contribution.measurementTimes] as const),
        );
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
            measurementTimes: measurementTimesByStationId.get(station.stationId) ?? null,
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
        // Extension strictement shadow : toute indisponibilité du nowcasting ne
        // peut ni bloquer ni réécrire le snapshot physique ou la prévision publique.
        await runOptionalBackgroundTask(`local-temperature-nowcast:${locationKey}:${date}:${hour}`, () =>
          rebuildLocalTemperatureNowcastForSnapshot({
            locationKey,
            observationDate: date,
            observationHour: hour,
          }),
        );
        // Le signal précipitations reste catégoriel : il ne modifie aucun
        // montant officiel et toute indisponibilité reste non bloquante.
        await runOptionalBackgroundTask(`local-precipitation-nowcast:${locationKey}:${date}:${hour}`, async () => {
          await rebuildLocalPrecipitationNowcastForSnapshot({
            locationKey,
            observationDate: date,
            observationHour: hour,
          });
          await evaluateLocalPrecipitationNowcastOutcomesForSnapshot({
            locationKey,
            observationDate: date,
            observationHour: hour,
          });
        });
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
    }, { requireDatabase: true });
    if (jobId <= 0) throw new Error("Impossible de créer le journal de collecte quotidien.");

    try {
      // Default location key for Hondeghem (legacy)
      const { HONDEGHEM } = await import("./weatherServices");
      const defaultLocKey = makeLocationKey(HONDEGHEM.lat, HONDEGHEM.lon);

      // Collect from Open-Meteo expert models
      const { forecasts: expertData, availabilityReasonByModel } = await collectExpertForecastsWithDiagnostics(today);

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

      if (forecastRows.length === 0) {
        throw new Error("Aucune prévision quotidienne exploitable à persister.");
      }
      await insertForecasts(forecastRows, { requireDatabase: true });
      const issuedAt = Date.now();

      // Les sept modèles déterministes alimentent la fusion officielle. Best Match
      // reste archivé comme référence dérivée, séparée et non pondérée.
      const allForecasts = expertData;

      if (allForecasts.length > 0) {
        const rawForecastsForFusion = allForecasts.map((f) => ({ ...f, windGust: f.windGust ?? null }));

        await insertForecastRuns(buildForecastRunArchiveRows(expertData, defaultLocKey, today, issuedAt), { requireDatabase: true });
        const fusionEvidence = await getDailyFusionPerformanceEvidence(
          defaultLocKey,
          today,
          allForecasts.flatMap((forecast) => forecast.availableAt == null ? [] : [forecast.availableAt]),
        );
        const meteoAI = computeOfficialDailyForecast(rawForecastsForFusion, {
          locationKey: defaultLocKey,
          targetDate: today,
          issuedAt,
          referenceAt: issuedAt,
          evidenceStoreAvailable: fusionEvidence.available,
          evidence: fusionEvidence.evidence,
          availabilityReasonByModel,
        });

        // Do not ask the LLM to narrate an uncalibrated equal-source ensemble.
        let explanation = meteoAI.coreCalibrationComplete
          ? ""
          : `${meteoAI.methodNote} Les valeurs disponibles restent publiées avec un statut explicite de calibration robuste ou partielle.`;
        if (meteoAI.coreCalibrationComplete) {
          try {
            const llmResult = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content: "Tu es MeteoAI, un assistant météo expert pour Hondeghem (Nord). Génère une explication concise (3-4 phrases) de la prévision du jour en français, en citant les sources disponibles et sans inventer de note globale de confiance.",
                },
                {
                  role: "user",
                  content: `Prévision MeteoAI pour ${today}:\n- Température: ${meteoAI.tempMin}°C à ${meteoAI.tempMax}°C\n- Précipitations: ${meteoAI.precipitation}mm\n- Vent: ${meteoAI.windSpeed} km/h\n- ${allForecasts.filter((forecast) => OFFICIAL_DAILY_COVERAGE_MODEL_SET.has(forecast.serviceName)).length} modèles déterministes disponibles; Best Match est une référence dérivée non pondérée\n\nGénère une explication naturelle et concise, sans score global.`,
                },
              ],
              maxTokens: 300,
            });
            const rawContent = llmResult.choices?.[0]?.message?.content;
            explanation = typeof rawContent === "string" ? rawContent : "";
          } catch (e) {
            console.warn("[MeteoAI] LLM explanation failed:", e);
            explanation = `Prévision calculée à partir des preuves physiques disponibles. Aucun indice global de stabilité ou de confiance n’est publié.`;
          }
        }

        // Determine condition from majority
        const condition = meteoAI.coreCalibrationComplete ? determineMajorityCondition(allForecasts) : null;

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
          stabilityLabel: legacyStabilityLabelForStorage(allForecasts),
          weights: { version: 3, weightByService: meteoAI.weights, trace: meteoAI.trace } as any,
          explanation,
        }, { requireDatabase: true });
        const fusionAvailableAt = Date.now();
        const fusionArchive = buildMeteoAIDailyFusionArchiveRun({
          locationKey: defaultLocKey,
          targetDate: today,
          availableAt: fusionAvailableAt,
          forecast: { ...meteoAI, condition, weights: meteoAI.weights, trace: meteoAI.trace },
        });
        if (fusionArchive) await insertMeteoAIDailyFusionRun(fusionArchive, { requireDatabase: true });
      }

      // Update job as completed
      await updateCollectionJob(jobId, {
        status: "completed",
        servicesCollected: forecastRows.length,
        completedAt: new Date(),
      }, { requireDatabase: true });

      res.json({ ok: true, servicesCollected: forecastRows.length });
    } catch (err: any) {
      await updateCollectionJob(jobId, {
        status: "failed",
        errorMessage: err.message,
        completedAt: new Date(),
      }, { requireDatabase: true });
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

        const comparisonDiagnostics: HourlyComparisonDiagnostic[] = [];

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

          const dailyForecastRuns = await getForecastRunsForValidDate(locKey, yesterday);
          const dailyComparisons = buildDailyForecastObservationComparisons(locKey, yesterday, dailyForecastRuns, snapshots);
          if (dailyComparisons.length > 0) {
            const comparisonsStored = await upsertDailyForecastObservationComparisons(dailyComparisons);
            console.log(`[MeteoAI] ${locName}: ${dailyComparisons.length} comparaison(s) physique(s) ${comparisonsStored ? "archivée(s)" : "en attente de migration"}`);
          }

          // Separate provider-run lead metrics; the existing availability-time/bucket evaluator below is untouched.
          try {
            const providerRunArchive = await getHourlyProviderRunValues(locKey, yesterday);
            if (providerRunArchive.available && providerRunArchive.values.length > 0) {
              const providerRunEvaluation = evaluateProviderRunForecasts(snapshots, providerRunArchive.values);
              comparisonDiagnostics.push(...providerRunEvaluation.diagnostics);
              console.info(`[SingleRunComparisonDiagnostic] ${locName}: ${JSON.stringify(providerRunEvaluation.diagnostics)}`);
              const providerRunComparisons = providerRunEvaluation.comparisons.filter(
                (row): row is typeof row & { forecastRunValueId: number; observationSnapshotId: number } =>
                  row.forecastRunValueId != null && row.observationSnapshotId != null,
              );
              const providerRunSaved = await persistHourlyProviderRunEvaluation({
                comparisons: providerRunComparisons,
                scores: providerRunEvaluation.scores,
              });
              console.log(`[ProviderRunScore] ${locName}: ${providerRunEvaluation.scores.length} score(s), ${providerRunEvaluation.comparisons.length} comparaison(s) ${providerRunSaved ? "archivée(s)" : "en attente de migration"}`);
            } else if (providerRunArchive.available) {
              const emptyProviderRunEvaluation = evaluateProviderRunForecasts(snapshots, []);
              comparisonDiagnostics.push(...emptyProviderRunEvaluation.diagnostics);
              console.info(`[SingleRunComparisonDiagnostic] ${locName}: ${JSON.stringify(emptyProviderRunEvaluation.diagnostics)}`);
            }
          } catch {
            console.warn(`[ProviderRunScore] ${locName}: évaluation provider-run ignorée; scores de disponibilité historiques inchangés.`);
          }

          const hourlyForecastRuns = await getHourlyForecastRunValues(locKey, yesterday);
          if (hourlyForecastRuns.length === 0) {
            const emptyHourlyEvaluation = evaluateHourlyForecastRuns(snapshots, []);
            comparisonDiagnostics.push(...emptyHourlyEvaluation.diagnostics);
            console.info(`[HourlyComparisonDiagnostic] ${locName}: ${JSON.stringify(emptyHourlyEvaluation.diagnostics)}`);
            await upsertHourlyComparisonDiagnosticSnapshot({ locationKey: locKey, cycleDate: yesterday, diagnostics: comparisonDiagnostics });
            locationSummaries.push(`📍 ${locName}: observation qualifiée (${dailyObservation.coverageHours} h), mais aucune capture horaire vérifiable archivée; les anciennes séries mutables ne sont pas réutilisées`);
            continue;
          }
          const evaluation = evaluateHourlyForecastRuns(
            snapshots,
            hourlyForecastRuns.flatMap((run) => {
              const variable = normalizeHourlyForecastVariable(run.variable);
              return variable ? [{ ...run, variable }] : [];
            }),
          );
          comparisonDiagnostics.push(...evaluation.diagnostics);
          console.info(`[HourlyComparisonDiagnostic] ${locName}: ${JSON.stringify(evaluation.diagnostics)}`);
          await upsertHourlyComparisonDiagnosticSnapshot({ locationKey: locKey, cycleDate: yesterday, diagnostics: comparisonDiagnostics });
          const hourlyScores = evaluation.compatibilityScores;
          const validatedBucketScores = evaluation.scores.filter((score) => score.scoringValidationVersion === HOURLY_SCORING_VALIDATION_VERSION);
          if (validatedBucketScores.length > 0) {
            await persistHourlyForecastEvaluationScores(validatedBucketScores.map((score) => ({
              locationKey: score.locationKey,
              date: score.date,
              sourceName: score.sourceName,
              modelName: score.modelName,
              modelId: score.modelId,
              variable: score.variable,
              horizonBucket: score.horizonBucket,
              observationCount: score.observationCount,
              evaluableObservationCount: score.evaluableObservationCount,
              sampleSize: score.sampleSize,
              coverageRatio: score.coverageRatio,
              mae: score.mae,
              rmse: score.rmse,
              bias: score.bias,
              scoringValidationVersion: score.scoringValidationVersion,
            })));
          }
          const exactComparisonsStored = await persistHourlyForecastExactComparisons(evaluation.exactComparisons.flatMap((comparison) => {
            if (comparison.forecastRunValueId == null || comparison.observationSnapshotId == null) return [];
            return [{ ...comparison, forecastRunValueId: comparison.forecastRunValueId, observationSnapshotId: comparison.observationSnapshotId }];
          }));
          if (exactComparisonsStored) await persistHourlyForecastExactEvaluationScores(
            evaluation.exactScores.filter((score) => score.scoringValidationVersion === HOURLY_SCORING_VALIDATION_VERSION),
          );
          if (hourlyScores.length > 0) {
            await upsertHourlyCompatibilityReliabilityScores(hourlyScores.map((score) => ({
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
          }
          const coveredGroups = evaluation.scores.filter((score) => score.sampleSize > 0).length;
          const comparisonCount = evaluation.scores.reduce((total, score) => total + score.sampleSize, 0);
          totalScores += hourlyScores.length + evaluation.scores.length;
          locationSummaries.push(`📍 ${locName}: ${hourlyScores.length} score(s) agrégé(s) compatibles; ${coveredGroups}/${evaluation.scores.length} groupes détaillés modèle/variable/horizon couverts, ${comparisonCount} comparaison(s) physiques`);

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
 * Determine majority weather condition from forecasts
 */
function determineMajorityCondition(forecasts: any[]): string {
  return aggregateForecastCondition(forecasts);
}

/**
 * Handler: Collect forecasts for all registered favorite locations
 * Triggered at the active Europe/Paris forecast cadence; external Heartbeat is UTC.
 * Stores results in location_forecasts table for instant display
 */
export async function collectFavoritesForecastsHandler(req: Request, res: Response) {
  let jobId = -1;
  let hourlyBatchAttemptId = "";
  let scheduledLockOwnerToken: string | null = null;
  let today = "";
  let locationsProcessed = 0;
  let dailyModelsCollected = 0;
  let hourlyModelsCollected = 0;
  let dailyModelsExpected = 0;
  let hourlyModelsExpected = 0;
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }
    const activeHours = getActiveParisForecastHours();
    const slot = getParisForecastSlot(new Date(), activeHours);
    if (!slot) {
      return res.json({ ok: true, skipped: "outside-scheduled-paris-hours", parisHour: getParisHour() });
    }

    const lockOwnerToken = randomUUID();
    const scheduleLockAcquired = await acquireForecastRefreshLock(
      FAVORITES_FORECAST_SCHEDULER_LOCK_KEY,
      lockOwnerToken,
      new Date(),
      FORECAST_REFRESH_LOCK_LEASE_MS,
    );
    if (!scheduleLockAcquired) {
      return res.json({ ok: true, skipped: "collection-in-progress", slot: slot.key });
    }
    scheduledLockOwnerToken = lockOwnerToken;

    const jobClaim = await claimScheduledForecastCollectionJob(slot.key, user.taskUid);
    if (!jobClaim.claimed) {
      return res.json({ ok: true, skipped: jobClaim.reason, slot: slot.key });
    }
    jobId = jobClaim.jobId;
    hourlyBatchAttemptId = randomUUID();

    today = slot.date;
    console.log(`[MeteoAI] Starting favorites forecast collection for ${today}`);

    // Get all favorites across all users
    const allFavorites = await getAllFavoriteLocations();

    if (allFavorites.length === 0) {
      console.log("[MeteoAI] No favorite locations found, skipping.");
      await updateCollectionJob(jobId, {
        status: "completed",
        servicesCollected: 0,
        dailyModelsCollected: 0,
        dailyModelsExpected: 0,
        hourlyModelsCollected: 0,
        hourlyModelsExpected: 0,
        completedAt: new Date(),
      });
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
    const expectedModelsPerLocation = getModelCoverage([], OFFICIAL_DAILY_COVERAGE_MODELS).expected.length;
    dailyModelsExpected = uniqueLocations.length * expectedModelsPerLocation;
    hourlyModelsExpected = uniqueLocations.length * OFFICIAL_HOURLY_COVERAGE_MODELS.length;
    await updateCollectionJob(jobId, { dailyModelsExpected, hourlyModelsExpected });

    // Les relevés physiques ont leur propre tâche horaire : les exécuter ici
    // pouvait faire dépasser le délai d’un batch de prévisions favoris.
    const stationCollectionDeferred = true;
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
      const locKey = makeLocationKey(fav.lat, fav.lon);
      const locationLockKey = getLocationForecastRefreshLockKey(locKey);
      const locationLockOwnerToken = randomUUID();
      const locationLockAcquired = await acquireForecastRefreshLock(locationLockKey, locationLockOwnerToken);
      if (!locationLockAcquired) {
        errors.push(`${fav.name}: une collecte manuelle ou planifiée est déjà en cours pour ce lieu.`);
        return;
      }
      try {
       try {
        console.log(`[MeteoAI] Collecting forecasts for ${fav.name} (${fav.lat}, ${fav.lon})`);
        let physicalStationCount = 0;
        const radiusKm = Math.max(5, Math.min(50, fav.radiusKm ?? 20));

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

          const localSynthesis = calculateGroundTruth(physicalStations);
          const measurementTimesByStationId = new Map(
            localSynthesis.stationsUsed.map((contribution) => [contribution.stationId, contribution.measurementTimes] as const),
          );
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
              measurementTimes: measurementTimesByStationId.get(station.stationId) ?? null,
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
              measurementTimes: station.measurementTimes ?? null,
              temperature: station.temperature,
              humidity: station.humidity,
              pressure: station.pressure,
              windSpeed: station.windSpeed,
              windGust: station.windGust,
              windDirection: station.windDirection,
              precipitation: station.precipitation,
            });
          }

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

        // Collect expert forecasts for this location
        const dailyRequestStartedAt = Date.now();
        const dailyCollection = await collectExpertForecastsWithDiagnostics(today, { lat: fav.lat, lon: fav.lon });
        const expertData = dailyCollection.forecasts;
        const dailyDiagnostics = dailyCollection.diagnostics;
        let dailyVariableCoverage = confirmDailyArchiveCoverage(dailyDiagnostics, {
          targetDate: today,
          forecasts: expertData,
          archiveRows: [],
          archiveRowsWritten: 0,
        });
        const dailyReceivedAt = Date.now();
        const dailyCoverage = getModelCoverage(
          expertData.map((forecast) => forecast.serviceName),
          OFFICIAL_DAILY_COVERAGE_MODELS,
        );
        console.log(`[Models] ${fav.name}: quotidien ${dailyCoverage.collected.length}/${dailyCoverage.expected.length}`);
        if (dailyCoverage.missing.length > 0) {
          console.warn(`[Models] ${fav.name}: quotidien indisponible — ${dailyCoverage.missing.join(", ")}`);
          errors.push(`${fav.name}: couverture quotidienne partielle — modèles manquants : ${dailyCoverage.missing.join(", ")}.`);
        }
        let hourlyCoverage = getModelCoverage([], OFFICIAL_HOURLY_COVERAGE_MODELS);
        const archivedHourlyModelNames = new Set<string>();
        const journaledHourlyModelNames = new Set<string>();

        // Each scheduled attempt is recorded before its provider request. Best Match is
        // retained as an explicitly non-official reference; only these seven named
        // model ids are eligible for the official hourly engine.
        const hourlyRequestStartedAt = Date.now();
        const hourlyAttemptedAt = Date.now();
        const expectedHourlyValidTimes = getParisHourlyTimestamps(today);
        const expectedHourlyValueCount = expectedHourlyValidTimes.length * HOURLY_FORECAST_VARIABLES.length;
        const officialModelNames = new Set<string>(OFFICIAL_HOURLY_MODELS.map((model) => model.name));
        const hourlyCollectionCatalog = WEATHER_SERVICES.expert.map((service) => ({
          modelName: service.name === "Open-Meteo" ? "best_match" : service.name,
          modelId: service.name === "Open-Meteo" ? null : service.modelId ?? null,
        }));
        const initialHourlyResults = hourlyCollectionCatalog.map((model) => ({
          collectionJobId: jobId,
          scheduleRunKey: slot.key,
          batchAttemptId: hourlyBatchAttemptId,
          locationKey: locKey,
          targetDate: today,
          modelName: model.modelName,
          modelId: model.modelId,
          isOfficialModel: officialModelNames.has(model.modelName) ? 1 : 0,
          sourceName: "open-meteo",
          status: "attempting" as const,
          requestAttempts: 0,
          hoursReceived: 0,
          valuesReceived: 0,
          expectedValueCount: expectedHourlyValueCount,
          archiveRowsWritten: 0,
          projectionRowsWritten: 0,
          errorCode: null,
          attemptedAt: hourlyAttemptedAt,
          completedAt: null,
        }));
        try {
          await upsertHourlyForecastCollectionResults(initialHourlyResults);
        } catch {
          errors.push(`${fav.name}: journal des tentatives horaires indisponible.`);
          console.warn(`[HourlyAudit] ${fav.name}: could not persist provider-attempt start records.`);
        }

        try {
          const collection = await collectHourlyForecastAllModelsWithDiagnostics(today, { lat: fav.lat, lon: fav.lon });
          const hourlyAllModels = collection.forecasts;
          const hourlyReceivedAt = Date.now();
          const forecastsByModel = new Map(hourlyAllModels.map((forecast) => [forecast.modelName, forecast]));
          const diagnosticsByModel = new Map(collection.diagnostics.map((diagnostic) => [diagnostic.modelName, diagnostic]));

          for (const model of hourlyCollectionCatalog) {
            const diagnostic = diagnosticsByModel.get(model.modelName) ?? {
              modelName: model.modelName,
              modelId: model.modelId,
              status: "safe_error" as const,
              attemptCount: 0,
              hoursReceived: 0,
              valuesReceived: 0,
              expectedValueCount: expectedHourlyValueCount,
              expectedHoursCount: expectedHourlyValidTimes.length,
              projectionReady: false,
              errorCode: "collection_failed",
            };
            const forecast = forecastsByModel.get(model.modelName);
            let archiveRowsWritten = 0;
            let projectionRowsWritten = 0;
            let finalStatus: "succeeded" | "partial" | "failed" | "safe_error" = diagnostic.status;
            let errorCode = diagnostic.errorCode;

            if (forecast && forecast.hours.length > 0) {
              const captureRunId = forecast.captureRunId ?? randomUUID();
              const rows = forecast.hours.map((hour) => ({
                locationKey: locKey,
                date: today,
                hour: hour.hour,
                validTime: hour.validAt,
                captureRun: {
                  captureRunId,
                  sourceName: forecast.sourceName ?? "open-meteo",
                  modelId: forecast.modelId ?? null,
                  requestStartedAt: forecast.requestStartedAt ?? hourlyRequestStartedAt,
                  availableAt: forecast.availableAt ?? hourlyReceivedAt,
                  units: forecast.sourceMetadata?.units ?? {},
                },
                archiveValues: hour,
                modelName: forecast.modelName,
                temperature: hour.temperature,
                apparentTemperature: hour.apparentTemperature,
                precipitation: hour.precipitation,
                windSpeed: hour.windSpeed,
                windGusts: hour.windGusts,
                windDirection: hour.windDirection,
                humidity: hour.humidity,
                pressure: hour.pressure,
                cloudCover: hour.cloudCover,
                weatherCode: hour.weatherCode,
              }));
              try {
                const writeResult = await insertHourlyForecasts(rows, { refreshProjection: diagnostic.projectionReady });
                archiveRowsWritten = writeResult.archiveRowsWritten;
                projectionRowsWritten = writeResult.projectionRowsWritten;
                finalStatus = diagnostic.status === "failed" || diagnostic.status === "safe_error"
                  ? diagnostic.status
                  : diagnostic.status === "succeeded"
                    && archiveRowsWritten === diagnostic.expectedValueCount
                    && projectionRowsWritten === diagnostic.expectedHoursCount
                    ? "succeeded"
                    : "partial";
                if (finalStatus === "partial" && !errorCode) {
                  errorCode = diagnostic.projectionReady
                    ? "partial_archive_projection_published"
                    : "partial_projection_retained";
                }
              } catch (writeError) {
                if (writeError instanceof HourlyForecastPersistenceError) {
                  archiveRowsWritten = writeError.archiveRowsWritten;
                  projectionRowsWritten = writeError.projectionRowsWritten;
                  errorCode = writeError.errorCode;
                } else {
                  errorCode = "write_failed";
                }
                finalStatus = archiveRowsWritten > 0 ? "partial" : "safe_error";
                errors.push(`${fav.name}: archivage horaire de ${model.modelName} non confirmé (${errorCode}).`);
                console.warn(`[HourlyArchive] ${fav.name}/${model.modelName}: write not confirmed (${errorCode}).`);
              }
            }

            const variableCoverage = buildHourlyModelCollectionCoverage({
              modelName: model.modelName,
              modelId: model.modelId,
              isOfficialModel: officialModelNames.has(model.modelName),
              status: finalStatus,
              requestAttempts: diagnostic.attemptCount,
              errorCode: finalStatus === "succeeded" ? null : errorCode,
              requestedForecastDays: 2,
              expectedHoursCount: diagnostic.expectedHoursCount,
              expectedValidTimes: expectedHourlyValidTimes,
              projectionReady: diagnostic.projectionReady,
              variableDiagnostics: diagnostic.variableDiagnostics,
              hours: forecast?.hours ?? [],
              units: forecast?.sourceMetadata?.units,
              archiveRowsWritten,
              projectionRowsWritten,
            });

            if (OFFICIAL_HOURLY_COVERAGE_MODEL_SET.has(model.modelName)
              && isHourlyForecastArchiveComplete({ archiveRowsWritten, expectedValueCount: diagnostic.expectedValueCount })) {
              archivedHourlyModelNames.add(model.modelName);
            }
            let resultJournaled = false;
            try {
              await upsertHourlyForecastCollectionResults([{
                collectionJobId: jobId,
                scheduleRunKey: slot.key,
                batchAttemptId: hourlyBatchAttemptId,
                locationKey: locKey,
                targetDate: today,
                modelName: model.modelName,
                modelId: model.modelId,
                isOfficialModel: officialModelNames.has(model.modelName) ? 1 : 0,
                sourceName: "open-meteo",
                status: finalStatus,
                requestAttempts: diagnostic.attemptCount,
                hoursReceived: diagnostic.hoursReceived,
                valuesReceived: diagnostic.valuesReceived,
                expectedValueCount: diagnostic.expectedValueCount,
                archiveRowsWritten,
                projectionRowsWritten,
                variableCoverage: variableCoverage as any,
                errorCode: finalStatus === "succeeded" ? null : errorCode,
                attemptedAt: hourlyAttemptedAt,
                completedAt: Date.now(),
              }]);
              resultJournaled = true;
            } catch (error) {
              const errorDetails = formatHourlyJournalWriteError(error);
              errors.push(`${fav.name}: résultat horaire de ${model.modelName} non journalisé — ${errorDetails}.`);
              console.warn(`[HourlyAudit] ${fav.name}/${model.modelName}: could not persist final result — ${errorDetails}.`);
            }
            if (isHourlyForecastRunHealthy({
              isOfficialModel: OFFICIAL_HOURLY_COVERAGE_MODEL_SET.has(model.modelName),
              status: finalStatus,
              archiveRowsWritten,
              expectedValueCount: diagnostic.expectedValueCount,
              projectionRowsWritten,
              expectedHoursCount: diagnostic.expectedHoursCount,
              resultJournaled,
            }) && !journaledHourlyModelNames.has(model.modelName)) {
              journaledHourlyModelNames.add(model.modelName);
              hourlyModelsCollected++;
            }
          }

          hourlyCoverage = getModelCoverage(Array.from(archivedHourlyModelNames), OFFICIAL_HOURLY_COVERAGE_MODELS);
          console.log(`[Models] ${fav.name}: horaire archivé ${hourlyCoverage.collected.length}/${hourlyCoverage.expected.length}`);
          if (hourlyCoverage.missing.length > 0) {
            console.warn(`[Models] ${fav.name}: horaire indisponible — ${hourlyCoverage.missing.join(", ")}`);
          }
          try {
            const validationHourly = await collectValidationHourlyForecasts(today, { lat: fav.lat, lon: fav.lon });
            for (const forecast of validationHourly) {
              const { modelName, hours } = forecast;
              await insertHourlyForecasts(hours.map((hour) => ({
                locationKey: locKey,
                date: today,
                hour: hour.hour,
                validTime: hour.validAt,
                captureRun: {
                  captureRunId: forecast.captureRunId,
                  sourceName: forecast.sourceName,
                  modelId: forecast.modelId,
                  requestStartedAt: forecast.requestStartedAt,
                  availableAt: forecast.availableAt,
                },
                archiveValues: hour,
                modelName: `${modelName} · validation`,
                temperature: hour.temperature,
                apparentTemperature: hour.apparentTemperature,
                precipitation: hour.precipitation,
                windSpeed: hour.windSpeed,
                windGusts: hour.windGusts,
                windDirection: hour.windDirection,
                humidity: hour.humidity,
                cloudCover: hour.cloudCover,
                weatherCode: hour.weatherCode,
              })), { refreshProjection: false });
            }
            console.log(`[Validation] ${fav.name}: ${validationHourly.length} source(s) horaire(s) candidate(s)`);
          } catch {
            errors.push(`${fav.name}: collecte des modèles candidats partielle.`);
            console.warn(`[Validation] ${fav.name}: candidate hourly collection or write failed.`);
          }
          console.log(`[HourlyAll] Received ${hourlyAllModels.length} model response(s) for ${fav.name}`);
        } catch {
          errors.push(`${fav.name}: collecte horaire partielle; résultat non confirmé.`);
          console.warn(`[HourlyAll] ${fav.name}: collection failed before per-model completion.`);
          for (const model of hourlyCollectionCatalog) {
            try {
              await upsertHourlyForecastCollectionResults([{
                collectionJobId: jobId,
                scheduleRunKey: slot.key,
                batchAttemptId: hourlyBatchAttemptId,
                locationKey: locKey,
                targetDate: today,
                modelName: model.modelName,
                modelId: model.modelId,
                isOfficialModel: officialModelNames.has(model.modelName) ? 1 : 0,
                sourceName: "open-meteo",
                status: "safe_error",
                requestAttempts: 0,
                hoursReceived: 0,
                valuesReceived: 0,
                expectedValueCount: expectedHourlyValueCount,
                archiveRowsWritten: 0,
                projectionRowsWritten: 0,
                errorCode: "collection_failed",
                attemptedAt: hourlyAttemptedAt,
                completedAt: Date.now(),
              }]);
            } catch {
              // A failed audit write cannot suppress the other provider attempts.
            }
          }
          hourlyCoverage = getModelCoverage(Array.from(archivedHourlyModelNames), OFFICIAL_HOURLY_COVERAGE_MODELS);
        }
        // Isolated research sidecar: exact Single Runs evidence never feeds live forecasts or coverage counters.
        try {
          const providerRunArchiveState = await getLatestHourlyProviderRunCaptures(locKey);
          if (!providerRunArchiveState.available) {
            console.warn(`[ProviderRun] ${fav.name}: tables provider-run absentes; aucune requête Single Runs émise.`);
          } else {
            const providerRunBatch = await collectProviderRunBatch({
              targetDate: today,
              locationKey: locKey,
              latitude: fav.lat,
              longitude: fav.lon,
            });
            const persistedProviderRuns = await persistHourlyProviderRunCaptureBatch(providerRunBatch.captures, providerRunBatch.values);
            const capturedProviderModels = providerRunBatch.captures.filter((capture) => capture.status === "succeeded").length;
            if (persistedProviderRuns) {
              console.log(`[ProviderRun] ${fav.name}: ${capturedProviderModels}/${OFFICIAL_HOURLY_MODELS.length} captures Single Runs isolées`);
            } else {
              console.warn(`[ProviderRun] ${fav.name}: capture Single Runs non persistée; pipeline horaire inchangé.`);
            }
          }
        } catch {
          console.warn(`[ProviderRun] ${fav.name}: sidecar Single Runs indisponible; pipeline horaire inchangé.`);
        }
        if (hourlyCoverage.missing.length > 0) {
          errors.push(`${fav.name}: couverture horaire partielle — modèles manquants : ${hourlyCoverage.missing.join(", ")}.`);
        }
        if (expertData.length === 0) {
          console.warn(`[MeteoAI] No data for ${fav.name}`);
          errors.push(`${fav.name}: aucun modèle quotidien n'a fourni de prévision.`);
          await insertStationCollectionSnapshot(buildStationCollectionSnapshot({
            locationKey: locKey,
            date: today,
            radiusKm,
            physicalStationCount,
            daily: dailyCoverage,
            hourly: hourlyCoverage,
            dailyVariableCoverage,
            forceFailed: true,
          }));
          coverageByLocation.push({
            location: fav.customName ?? fav.name,
            daily: dailyCoverage,
            hourly: hourlyCoverage,
            physicalStationCount,
            stationCollectionDeferred,
            stations: stationEvidence,
          });
          return;
        }

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
        // Écriture strictement limitée aux sept modèles actifs et à Best Match.
        // Les archives publiques historiques ne sont ni supprimées ni réécrites.
        await insertForecasts(forecastRowsForLoc);
        dailyModelsCollected += dailyCoverage.collected.length;
        const issuedAt = Date.now();

        // Candidate outputs are archived independently and cannot enter the
        // forecasts table, official fusion or seven-model coverage counters.
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

        const rawLocForecasts = expertData.map((f) => ({ ...f, windGust: f.windGust ?? null }));

        const dailyArchiveRows = buildForecastRunArchiveRows(expertData, locKey, today, issuedAt);
        const dailyArchiveRowsWritten = await insertForecastRuns(dailyArchiveRows);
        dailyVariableCoverage = confirmDailyArchiveCoverage(dailyDiagnostics, {
          targetDate: today,
          forecasts: expertData,
          archiveRows: dailyArchiveRows,
          archiveRowsWritten: dailyArchiveRowsWritten,
        });
        const fusionEvidence = await getDailyFusionPerformanceEvidence(
          locKey,
          today,
          expertData.flatMap((forecast) => forecast.availableAt == null ? [] : [forecast.availableAt]),
        );
        const meteoAI = computeOfficialDailyForecast(rawLocForecasts, {
          locationKey: locKey,
          targetDate: today,
          issuedAt,
          referenceAt: issuedAt,
          evidenceStoreAvailable: fusionEvidence.available,
          evidence: fusionEvidence.evidence,
          availabilityReasonByModel: dailyCollection.availabilityReasonByModel,
        });

        // Cloud cover has no qualified physical daily evidence yet; do not infer a condition from an equal-source average.
        const condition = null;

        const explanation = meteoAI.coreCalibrationComplete
          ? `Prévision quotidienne calculée pour ${fav.customName ?? fav.name} : les quatre métriques principales disposent de preuves physiques récentes par modèle, variable et horizon. La température actuelle est résolue en direct lors de la consultation et n’est pas interpolée depuis Tmin/Tmax.`
          : `${meteoAI.methodNote} Pour ${fav.customName ?? fav.name}, les valeurs disponibles restent publiées avec un statut robuste ou partiellement calibré. La température actuelle reste résolue séparément en direct.`;

        // Find all favorites with this location (same lat/lon) and upsert for each
        const matchingFavorites = allFavorites.filter(
          (f) => Math.abs(f.lat - fav.lat) < 0.001 && Math.abs(f.lon - fav.lon) < 0.001
        );

        // Also save MeteoAI forecast for this location
        await upsertMeteoAIForecast({
          locationKey: locKey,
          date: today,
          tempMax: meteoAI.tempMax,
          tempMin: meteoAI.tempMin,
          precipitation: meteoAI.precipitation,
          windSpeed: meteoAI.windSpeed,
          condition,
          stabilityLabel: legacyStabilityLabelForStorage(expertData),
          weights: { version: 3, weightByService: meteoAI.weights, trace: meteoAI.trace } as any,
          explanation,
        }, { refreshComputedAt: true });
        const fusionAvailableAt = Date.now();
        const fusionArchive = buildMeteoAIDailyFusionArchiveRun({
          locationKey: locKey,
          targetDate: today,
          availableAt: fusionAvailableAt,
          forecast: { ...meteoAI, condition, weights: meteoAI.weights, trace: meteoAI.trace },
        });
        if (fusionArchive) await insertMeteoAIDailyFusionRun(fusionArchive, { requireDatabase: true });

        for (const matchFav of matchingFavorites) {
          await upsertLocationForecast({
            favoriteLocationId: matchFav.id,
            userId: matchFav.userId,
            lat: matchFav.lat,
            lon: matchFav.lon,
            date: today,
            tempMax: meteoAI.tempMax,
            tempMin: meteoAI.tempMin,
            precipitation: meteoAI.precipitation,
            windSpeed: meteoAI.windSpeed,
            condition,
            modelsData: expertData as any,
            explanation,
          });
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
          dailyVariableCoverage,
        }));

        locationsProcessed++;

      } catch (err: any) {
        console.error(`[MeteoAI] Error collecting for ${fav.name}:`, err.message);
        errors.push(`${fav.name}: ${err.message}`);
      }
      } finally {
        try {
          await releaseForecastRefreshLock(locationLockKey, locationLockOwnerToken);
        } catch (error) {
          console.warn(`[MeteoAI] Could not release forecast lease for ${locKey}:`, error);
        }
      }
    });

    await updateCollectionJob(jobId, {
      status: getForecastCollectionJobStatus(locationsProcessed, errors),
      servicesCollected: locationsProcessed,
      dailyModelsCollected,
      dailyModelsExpected,
      hourlyModelsCollected,
      hourlyModelsExpected,
      errorMessage: errors.length > 0 ? errors.join(" | ").slice(0, 4000) : undefined,
      completedAt: new Date(),
    });
    res.json({
      ok: true,
      date: today,
      locationsProcessed,
      totalFavorites: allFavorites.length,
      dailyModelCoverage: { collected: dailyModelsCollected, expected: dailyModelsExpected },
      hourlyModelCoverage: { collected: hourlyModelsCollected, expected: hourlyModelsExpected },
      coverageByLocation,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    if (jobId > 0) {
      try {
        await updateCollectionJob(jobId, {
          status: "failed",
          dailyModelsCollected,
          dailyModelsExpected,
          hourlyModelsCollected,
          hourlyModelsExpected,
          errorMessage: error.message,
          completedAt: new Date(),
        });
      } catch (updateError) {
        console.error("[MeteoAI] Could not persist failed collection status:", updateError);
      }
    }
    console.error("[MeteoAI] Favorites forecast collection error:", error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  } finally {
    if (scheduledLockOwnerToken) {
      try {
        await releaseForecastRefreshLock(FAVORITES_FORECAST_SCHEDULER_LOCK_KEY, scheduledLockOwnerToken);
      } catch (error) {
        console.error("[MeteoAI] Could not release favorites forecast scheduler lease:", error);
      }
    }
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
