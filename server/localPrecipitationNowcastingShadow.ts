import { and, desc, eq, gte } from "drizzle-orm";
import {
  qualifiedObservationSnapshots,
  shadowLocalPrecipitationNowcasts,
} from "../drizzle/schema";
import {
  LOCAL_PRECIPITATION_NOWCASTING_SHADOW_VERSION,
  calculateLocalPrecipitationNowcast,
} from "../shared/localPrecipitationNowcastingShadow";
import { getDb, getHourlyForecastRunValues } from "./db";
import { reconstructOfficialHourlyModelsFromArchive } from "./officialHourlyForecast";
import { parisLocalHourToUniqueEpochMs } from "./parisHourlyTime";

const NOWCAST_HORIZONS = [0, 1, 2] as const;
const HOUR_MS = 60 * 60 * 1_000;

function timestampOf(value: Date | number | null | undefined): number | null {
  if (value == null) return null;
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parisDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(timestamp));
}

function median(values: readonly number[]): number | null {
  const ordered = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (ordered.length === 0) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

type PrecipitationForecastEvidence = {
  version: string;
  baseline: "seven_model_precipitation_median_shadow";
  baselineMode: "unavailable" | "seven_model_median_shadow";
  bestMatchIncluded: false;
  modelNames: string[];
  forecastAvailableAt: number | null;
  observationReferenceAt: number;
  amountAdjustment: "forbidden";
  stationIntervalSemantics: "not_normalized";
};

function emptyForecastEvidence(observationReferenceAt: number): PrecipitationForecastEvidence {
  return {
    version: LOCAL_PRECIPITATION_NOWCASTING_SHADOW_VERSION,
    baseline: "seven_model_precipitation_median_shadow",
    baselineMode: "unavailable",
    bestMatchIncluded: false,
    modelNames: [],
    forecastAvailableAt: null,
    observationReferenceAt,
    amountAdjustment: "forbidden",
    stationIntervalSemantics: "not_normalized",
  };
}

export type LocalPrecipitationNowcastRefreshResult = {
  locationKey: string;
  observationDate: string;
  observationHour: number;
  persistedCount: number;
  statuses: Record<string, number>;
  reason?: string;
  productionReadsEnabled: 0;
  appliedToProduction: 0;
};

/**
 * Rebuilds three occurrence-only precipitation candidates from one stored
 * physical snapshot. It uses only forecast archives present before the snapshot
 * reference time; no provider request, production reader or millimetre correction is used.
 */
export async function rebuildLocalPrecipitationNowcastForSnapshot(input: {
  locationKey: string;
  observationDate: string;
  observationHour: number;
  evaluatedAt?: number;
}): Promise<LocalPrecipitationNowcastRefreshResult> {
  const db = await getDb();
  const evaluatedAt = input.evaluatedAt ?? Date.now();
  const empty: LocalPrecipitationNowcastRefreshResult = {
    locationKey: input.locationKey,
    observationDate: input.observationDate,
    observationHour: input.observationHour,
    persistedCount: 0,
    statuses: {},
    productionReadsEnabled: 0,
    appliedToProduction: 0,
  };
  if (!db) return { ...empty, reason: "BASE_INDISPONIBLE" };

  const snapshots = await db.select().from(qualifiedObservationSnapshots).where(and(
    eq(qualifiedObservationSnapshots.locationKey, input.locationKey),
    eq(qualifiedObservationSnapshots.date, input.observationDate),
    eq(qualifiedObservationSnapshots.hour, input.observationHour),
  ));
  const snapshot = snapshots[0];
  if (!snapshot) return { ...empty, reason: "SNAPSHOT_PHYSIQUE_ABSENT" };

  const observationReferenceAt = parisLocalHourToUniqueEpochMs(snapshot.date, snapshot.hour);
  if (observationReferenceAt == null) return { ...empty, reason: "HEURE_PARIS_AMBIGUE_OU_INEXISTANTE" };
  const observationCollectedAt = timestampOf(snapshot.collectedAt) ?? evaluatedAt;
  const targetDates = Array.from(new Set(NOWCAST_HORIZONS.map((horizon) => parisDate(observationReferenceAt + horizon * HOUR_MS))));
  const archiveSets = await Promise.all(targetDates.map(async (targetDate) => ({
    targetDate,
    rows: await getHourlyForecastRunValues(input.locationKey, targetDate),
  })));

  const baselineByTime = new Map<number, number>();
  const evidenceByTime = new Map<number, PrecipitationForecastEvidence>();
  for (const { targetDate, rows } of archiveSets) {
    // Temporal firewall: any run archived after the physical observation is rejected.
    const availableRows = rows.filter((row) => {
      if (row.availableAt == null) return false;
      const availableAt = Number(row.availableAt);
      return Number.isFinite(availableAt) && availableAt <= observationReferenceAt;
    });
    const modelForecasts = reconstructOfficialHourlyModelsFromArchive(availableRows, targetDate)
      .filter((forecast) => forecast.modelName !== "best_match");
    for (const horizon of NOWCAST_HORIZONS) {
      const validTime = observationReferenceAt + horizon * HOUR_MS;
      const values = modelForecasts.flatMap((forecast) => forecast.hours.flatMap((hour) =>
        hour.validAt === validTime && typeof hour.precipitation === "number" && Number.isFinite(hour.precipitation)
          ? [{ modelName: forecast.modelName, precipitation: hour.precipitation, availableAt: forecast.availableAt }]
          : [],
      ));
      const baseline = median(values.map((value) => value.precipitation));
      if (baseline != null) baselineByTime.set(validTime, baseline);
      const availableAt = values.map((value) => value.availableAt)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      evidenceByTime.set(validTime, {
        version: LOCAL_PRECIPITATION_NOWCASTING_SHADOW_VERSION,
        baseline: "seven_model_precipitation_median_shadow",
        baselineMode: baseline == null ? "unavailable" : "seven_model_median_shadow",
        bestMatchIncluded: false,
        modelNames: values.map((value) => value.modelName),
        forecastAvailableAt: availableAt.length > 0 ? Math.max(...availableAt) : null,
        observationReferenceAt,
        amountAdjustment: "forbidden",
        stationIntervalSemantics: "not_normalized",
      });
    }
  }

  const statuses: Record<string, number> = {};
  let persistedCount = 0;
  for (const horizon of NOWCAST_HORIZONS) {
    const validTime = observationReferenceAt + horizon * HOUR_MS;
    const evidence = evidenceByTime.get(validTime) ?? emptyForecastEvidence(observationReferenceAt);
    const result = calculateLocalPrecipitationNowcast({
      baselinePrecipitation: baselineByTime.get(validTime) ?? null,
      observedPrecipitation: snapshot.precipitation == null ? null : Number(snapshot.precipitation),
      observationReferenceAt,
      forecastAvailableAt: evidence.forecastAvailableAt,
      validTime,
      evaluatedAt,
      stationCount: Number(snapshot.stationCount),
      confidenceScore: snapshot.confidenceScore == null ? null : Number(snapshot.confidenceScore),
    });
    statuses[result.status] = (statuses[result.status] ?? 0) + 1;
    await db.insert(shadowLocalPrecipitationNowcasts).values({
      locationKey: input.locationKey,
      observationDate: snapshot.date,
      observationHour: snapshot.hour,
      observationReferenceAt,
      observationCollectedAt,
      observedPrecipitation: snapshot.precipitation == null ? null : Number(snapshot.precipitation),
      stationCount: Number(snapshot.stationCount),
      confidenceScore: snapshot.confidenceScore == null ? null : Number(snapshot.confidenceScore),
      validTime,
      horizonMinutes: result.horizonMinutes,
      candidateStatus: result.status,
      baselinePrecipitation: result.baselinePrecipitation,
      baselineWet: result.baselineWet == null ? null : result.baselineWet ? 1 : 0,
      observedWet: result.observedWet == null ? null : result.observedWet ? 1 : 0,
      localWetSignal: result.localWetSignal ? 1 : 0,
      continuationFactor: result.continuationFactor,
      forecastAvailableAt: evidence.forecastAvailableAt,
      forecastEvidence: evidence,
      reasons: result.reasons,
      productionReadsEnabled: 0,
      shadowMode: 1,
      appliedToProduction: 0,
      evaluatedAt,
    }).onDuplicateKeyUpdate({
      set: {
        horizonMinutes: result.horizonMinutes,
        candidateStatus: result.status,
        baselinePrecipitation: result.baselinePrecipitation,
        baselineWet: result.baselineWet == null ? null : result.baselineWet ? 1 : 0,
        observedWet: result.observedWet == null ? null : result.observedWet ? 1 : 0,
        localWetSignal: result.localWetSignal ? 1 : 0,
        continuationFactor: result.continuationFactor,
        forecastAvailableAt: evidence.forecastAvailableAt,
        forecastEvidence: evidence,
        reasons: result.reasons,
        evaluatedAt,
      },
    });
    persistedCount += 1;
  }
  return { ...empty, persistedCount, statuses };
}

export async function buildLocalPrecipitationNowcastingReport(locationKey?: string, lookbackDays = 7) {
  const db = await getDb();
  const empty = {
    version: LOCAL_PRECIPITATION_NOWCASTING_SHADOW_VERSION,
    candidateCount: 0,
    statuses: { WET_SIGNAL: 0, BASELINE_WET: 0, BASELINE_DRY: 0, STALE_OBSERVATION: 0, UNAVAILABLE: 0, LEAKAGE_BLOCKED: 0 },
    productionReadsEnabled: 0,
    appliedToProduction: 0,
    shadowModeViolations: 0,
    valid: true,
    latest: null as null | {
      locationKey: string; observationDate: string; observationHour: number; observationReferenceAt: number;
      observedPrecipitation: number | null; stationCount: number; confidenceScore: number | null;
      validTime: number; horizonMinutes: number | null; candidateStatus: string;
      baselinePrecipitation: number | null; baselineWet: boolean | null; observedWet: boolean | null;
      localWetSignal: boolean; continuationFactor: number; forecastAvailableAt: number | null;
      forecastEvidence: unknown; reasons: unknown; evaluatedAt: number;
    },
  };
  if (!db) return empty;
  const filters = [gte(shadowLocalPrecipitationNowcasts.evaluatedAt, Date.now() - Math.max(1, lookbackDays) * 86_400_000)];
  if (locationKey) filters.push(eq(shadowLocalPrecipitationNowcasts.locationKey, locationKey));
  const rows = await db.select().from(shadowLocalPrecipitationNowcasts)
    .where(and(...filters))
    .orderBy(
      desc(shadowLocalPrecipitationNowcasts.observationReferenceAt),
      shadowLocalPrecipitationNowcasts.horizonMinutes,
      desc(shadowLocalPrecipitationNowcasts.evaluatedAt),
    );
  const statuses = { ...empty.statuses };
  let productionReadsEnabled = 0;
  let appliedToProduction = 0;
  let shadowModeViolations = 0;
  for (const row of rows) {
    if (row.candidateStatus in statuses) statuses[row.candidateStatus as keyof typeof statuses] += 1;
    productionReadsEnabled += Number(row.productionReadsEnabled);
    appliedToProduction += Number(row.appliedToProduction);
    if (Number(row.shadowMode) !== 1) shadowModeViolations += 1;
  }
  const row = rows[0];
  const latest = row ? {
    locationKey: row.locationKey,
    observationDate: row.observationDate,
    observationHour: Number(row.observationHour),
    observationReferenceAt: Number(row.observationReferenceAt),
    observedPrecipitation: row.observedPrecipitation == null ? null : Number(row.observedPrecipitation),
    stationCount: Number(row.stationCount),
    confidenceScore: row.confidenceScore == null ? null : Number(row.confidenceScore),
    validTime: Number(row.validTime),
    horizonMinutes: row.horizonMinutes == null ? null : Number(row.horizonMinutes),
    candidateStatus: row.candidateStatus,
    baselinePrecipitation: row.baselinePrecipitation == null ? null : Number(row.baselinePrecipitation),
    baselineWet: row.baselineWet == null ? null : Number(row.baselineWet) === 1,
    observedWet: row.observedWet == null ? null : Number(row.observedWet) === 1,
    localWetSignal: Number(row.localWetSignal) === 1,
    continuationFactor: Number(row.continuationFactor),
    forecastAvailableAt: row.forecastAvailableAt == null ? null : Number(row.forecastAvailableAt),
    forecastEvidence: row.forecastEvidence,
    reasons: row.reasons,
    evaluatedAt: Number(row.evaluatedAt),
  } : null;
  return {
    version: LOCAL_PRECIPITATION_NOWCASTING_SHADOW_VERSION,
    candidateCount: rows.length,
    statuses,
    productionReadsEnabled,
    appliedToProduction,
    shadowModeViolations,
    valid: productionReadsEnabled === 0 && appliedToProduction === 0 && shadowModeViolations === 0,
    latest,
  } as const;
}
