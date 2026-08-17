import { eq, desc, and, gte, lte, sql, isNull, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  forecasts,
  forecastRuns,
  observations,
  reliabilityScores,
  meteoaiForecast,
  collectionJobs,
  favoriteLocations,
  locationForecasts,
  hourlyForecasts,
  leadTimeScores,
  InsertForecast,
  InsertForecastRun,
  InsertObservation,
  InsertReliabilityScore,
  InsertMeteoAIForecast,
  InsertCollectionJob,
  InsertFavoriteLocation,
  InsertLocationForecast,
  InsertHourlyForecast,
  InsertLeadTimeScore,
  weatherStations,
  stationObservations,
  stationQualityProfiles,
  groundTruth,
  stationCollectionSnapshots,
  qualifiedObservationSnapshots,
  netatmoOAuthTokens,
  netatmoOAuthStates,
  personalWeatherObservations,
  personalModelObservationScores,
  personalModelCalibrations,
  InsertWeatherStation,
  InsertStationObservation,
  InsertStationQualityProfile,
  InsertGroundTruth,
  InsertStationCollectionSnapshot,
  InsertQualifiedObservationSnapshot,
  InsertPersonalWeatherObservation,
  InsertPersonalModelObservationScore,
  InsertPersonalModelCalibration,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { selectLatestForecasts } from "./forecastSelection";
import { buildForecastUpdateSet } from "./forecastWrite";
import { deriveStationQualityProfile } from "./stationQualityService";
import { getGroundTruthReferenceBounds } from "./groundTruthReference";

let _db: ReturnType<typeof drizzle> | null = null;

export const REFERENCE_COORDINATE_TOLERANCE = 0.0001;

export function referenceCoordinateBounds(value: number) {
  return {
    min: value - REFERENCE_COORDINATE_TOLERANCE,
    max: value + REFERENCE_COORDINATE_TOLERANCE,
  };
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── USER HELPERS ───────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── FORECAST HELPERS ───────────────────────────────────────────────────────

// ─── LOCATION KEY HELPERS ──────────────────────────────────────────────────

/** Make a stable location key from lat/lon (3dp precision ≈ 111m). */
export function makeLocationKey(lat: number, lon: number): string {
  const latR = Math.round(lat * 1000) / 1000;
  const lonR = Math.round(lon * 1000) / 1000;
  return `${latR}_${lonR}`;
}

// ─── FORECAST HELPERS ───────────────────────────────────────────────────────

export async function insertForecasts(data: InsertForecast[]): Promise<void> {
  const db = await getDb();
  if (!db || data.length === 0) return;
  await db.transaction(async (tx) => {
    for (const row of data) {
      await tx.insert(forecasts).values(row).onDuplicateKeyUpdate({
        set: buildForecastUpdateSet(row, new Date()),
      });
    }
  });
}

/** Persist an immutable forecast emission for reproducible lead-time scoring. */
export async function insertForecastRuns(data: InsertForecastRun[]): Promise<void> {
  const db = await getDb();
  if (!db || data.length === 0) return;
  for (const row of data) {
    await db.insert(forecastRuns).values(row).onDuplicateKeyUpdate({
      set: { capturedAt: new Date() },
    });
  }
}

export async function getForecastsByDate(date: string, locationKey = "default") {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(forecasts).where(
    and(eq(forecasts.date, date), eq(forecasts.locationKey, locationKey))
  );
  return selectLatestForecasts(rows);
}

export async function getForecastsByDateRange(startDate: string, endDate: string, locationKey = "default") {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(forecasts)
    .where(and(gte(forecasts.date, startDate), lte(forecasts.date, endDate), eq(forecasts.locationKey, locationKey)))
    .orderBy(forecasts.date);
  return selectLatestForecasts(rows);
}

export async function getForecastsByService(serviceName: string, limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(forecasts)
    .where(eq(forecasts.serviceName, serviceName))
    .orderBy(desc(forecasts.date))
    .limit(limit);
}

// ─── OBSERVATION HELPERS ────────────────────────────────────────────────────

export async function insertObservation(data: InsertObservation): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Upsert: if observation for this date+location exists, update it
  await db.insert(observations).values(data).onDuplicateKeyUpdate({
    set: {
      tempMax: data.tempMax,
      tempMin: data.tempMin,
      precipitation: data.precipitation,
      windSpeed: data.windSpeed,
      windGust: data.windGust,
      humidity: data.humidity,
      cloudCover: data.cloudCover,
      condition: data.condition,
      source: data.source,
      provenanceType: data.provenanceType,
      isQualified: data.isQualified,
      rawData: data.rawData,
    },
  });
}

export async function getObservationByDate(date: string, locationKey = "default") {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(observations).where(
    and(eq(observations.date, date), eq(observations.locationKey, locationKey))
  ).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getObservationsByDateRange(startDate: string, endDate: string, locationKey = "default") {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(observations)
    .where(and(gte(observations.date, startDate), lte(observations.date, endDate), eq(observations.locationKey, locationKey)))
    .orderBy(observations.date);
}

// ─── RELIABILITY SCORE HELPERS ──────────────────────────────────────────────

export async function insertReliabilityScores(data: InsertReliabilityScore[]): Promise<void> {
  const db = await getDb();
  if (!db || data.length === 0) return;
  await db.insert(reliabilityScores).values(data);
}

export async function getLatestReliabilityScores(locationKey = "default") {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(reliabilityScores)
    .where(eq(reliabilityScores.locationKey, locationKey))
    .orderBy(desc(reliabilityScores.date), desc(reliabilityScores.weightedScore));
}

export async function getReliabilityScoresByService(serviceName: string, limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(reliabilityScores)
    .where(eq(reliabilityScores.serviceName, serviceName))
    .orderBy(desc(reliabilityScores.date))
    .limit(limit);
}

export async function getCumulativeRanking() {
  const db = await getDb();
  if (!db) return [];
  // Average weighted score per service across all dates
  const result = await db
    .select({
      serviceName: reliabilityScores.serviceName,
      avgScore: sql<number>`AVG(${reliabilityScores.weightedScore})`,
      // Legacy flat metrics
      avgMaeTemp: sql<number>`AVG(${reliabilityScores.maeTemp})`,
      avgMaePrecip: sql<number>`AVG(${reliabilityScores.maePrecip})`,
      avgMaeWind: sql<number>`AVG(${reliabilityScores.maeWind})`,
      avgRmseTemp: sql<number>`AVG(${reliabilityScores.rmseTemp})`,
      avgBiasTemp: sql<number>`AVG(${reliabilityScores.biasTemp})`,
      avgBiasPrecip: sql<number>`AVG(${reliabilityScores.biasPrecip})`,
      daysTracked: sql<number>`COUNT(*)`,
      latestScoreDate: sql<string>`MAX(${reliabilityScores.date})`,
      // 🌡️ Temperature dimension
      avgTempScore: sql<number>`AVG(${reliabilityScores.tempScore})`,
      avgTempMae: sql<number>`AVG(${reliabilityScores.maeTemp})`,
      avgTempBias: sql<number>`AVG(${reliabilityScores.biasTemp})`,
      avgTempMaxError: sql<number>`AVG(${reliabilityScores.tempMaxError})`,
      // 🌧️ Precipitation dimension
      avgPrecipScore: sql<number>`AVG(${reliabilityScores.precipScore})`,
      avgPrecipPod: sql<number>`AVG(${reliabilityScores.precipPod})`,
      avgPrecipFar: sql<number>`AVG(${reliabilityScores.precipFar})`,
      avgPrecipCsi: sql<number>`AVG(${reliabilityScores.precipCsi})`,
      totalPrecipFalsePos: sql<number>`SUM(${reliabilityScores.precipFalsePositives})`,
      totalPrecipFalseNeg: sql<number>`SUM(${reliabilityScores.precipFalseNegatives})`,
      // 💨 Wind dimension
      avgWindScore: sql<number>`AVG(${reliabilityScores.windScore})`,
      avgWindMaeGusts: sql<number>`AVG(${reliabilityScores.windMaeGusts})`,
      // ☁️ Condition dimension
      avgCondScore: sql<number>`AVG(${reliabilityScores.condScore})`,
      avgCondConcordance: sql<number>`AVG(${reliabilityScores.condConcordance})`,
      avgCondMaeCloud: sql<number>`AVG(${reliabilityScores.condMaeCloud})`,
    })
    .from(reliabilityScores)
    .groupBy(reliabilityScores.serviceName)
    .orderBy(sql`AVG(${reliabilityScores.weightedScore}) DESC`);
  return result;
}

export async function getCumulativeRankingForLocation(locationKey = "default") {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .select({
      serviceName: reliabilityScores.serviceName,
      avgScore: sql<number>`AVG(${reliabilityScores.weightedScore})`,
      avgMaeTemp: sql<number>`AVG(${reliabilityScores.maeTemp})`,
      avgMaePrecip: sql<number>`AVG(${reliabilityScores.maePrecip})`,
      avgMaeWind: sql<number>`AVG(${reliabilityScores.maeWind})`,
      avgRmseTemp: sql<number>`AVG(${reliabilityScores.rmseTemp})`,
      avgBiasTemp: sql<number>`AVG(${reliabilityScores.biasTemp})`,
      avgBiasPrecip: sql<number>`AVG(${reliabilityScores.biasPrecip})`,
      daysTracked: sql<number>`COUNT(*)`,
      latestScoreDate: sql<string>`MAX(${reliabilityScores.date})`,
      avgTempScore: sql<number>`AVG(${reliabilityScores.tempScore})`,
      avgTempMae: sql<number>`AVG(${reliabilityScores.maeTemp})`,
      avgTempBias: sql<number>`AVG(${reliabilityScores.biasTemp})`,
      avgTempMaxError: sql<number>`AVG(${reliabilityScores.tempMaxError})`,
      avgPrecipScore: sql<number>`AVG(${reliabilityScores.precipScore})`,
      avgPrecipPod: sql<number>`AVG(${reliabilityScores.precipPod})`,
      avgPrecipFar: sql<number>`AVG(${reliabilityScores.precipFar})`,
      avgPrecipCsi: sql<number>`AVG(${reliabilityScores.precipCsi})`,
      totalPrecipFalsePos: sql<number>`SUM(${reliabilityScores.precipFalsePositives})`,
      totalPrecipFalseNeg: sql<number>`SUM(${reliabilityScores.precipFalseNegatives})`,
      avgWindScore: sql<number>`AVG(${reliabilityScores.windScore})`,
      avgWindMaeGusts: sql<number>`AVG(${reliabilityScores.windMaeGusts})`,
      avgCondScore: sql<number>`AVG(${reliabilityScores.condScore})`,
      avgCondConcordance: sql<number>`AVG(${reliabilityScores.condConcordance})`,
      avgCondMaeCloud: sql<number>`AVG(${reliabilityScores.condMaeCloud})`,
    })
    .from(reliabilityScores)
    .where(eq(reliabilityScores.locationKey, locationKey))
    .groupBy(reliabilityScores.serviceName)
    .orderBy(sql`AVG(${reliabilityScores.weightedScore}) DESC`);
  return result;
}

/** Les poids opérationnels exigent une observation physique explicitement qualifiée. */
export async function getQualifiedCumulativeRankingForLocation(locationKey = "default") {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      serviceName: reliabilityScores.serviceName,
      avgScore: sql<number>`AVG(${reliabilityScores.weightedScore})`,
      avgMaeTemp: sql<number>`AVG(${reliabilityScores.maeTemp})`,
      avgMaePrecip: sql<number>`AVG(${reliabilityScores.maePrecip})`,
      avgMaeWind: sql<number>`AVG(${reliabilityScores.maeWind})`,
      avgBiasTemp: sql<number>`AVG(${reliabilityScores.biasTemp})`,
      avgBiasPrecip: sql<number>`AVG(${reliabilityScores.biasPrecip})`,
      daysTracked: sql<number>`COUNT(*)`,
      latestScoreDate: sql<string>`MAX(${reliabilityScores.date})`,
      avgCondMaeCloud: sql<number>`AVG(${reliabilityScores.condMaeCloud})`,
    })
    .from(reliabilityScores)
    .where(and(
      eq(reliabilityScores.locationKey, locationKey),
      eq(reliabilityScores.evidenceType, "physical_observation"),
    ))
    .groupBy(reliabilityScores.serviceName)
    .orderBy(sql`AVG(${reliabilityScores.weightedScore}) DESC`);
}

// ─── METEOAI FORECAST HELPERS ───────────────────────────────────────────────

export async function upsertMeteoAIForecast(data: InsertMeteoAIForecast): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Note: unique constraint was dropped; use locationKey+date as logical key
  await db.insert(meteoaiForecast).values(data).onDuplicateKeyUpdate({
    set: {
      tempMax: data.tempMax,
      tempMin: data.tempMin,
      precipitation: data.precipitation,
      windSpeed: data.windSpeed,
      condition: data.condition,
      stabilityIndex: data.stabilityIndex,
      stabilityLabel: data.stabilityLabel,
      confidenceScore: data.confidenceScore,
      weights: data.weights,
      explanation: data.explanation,
    },
  });
}

export async function getMeteoAIForecastByDate(date: string, locationKey = "default") {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(meteoaiForecast)
    .where(and(eq(meteoaiForecast.date, date), eq(meteoaiForecast.locationKey, locationKey)))
    .orderBy(desc(meteoaiForecast.computedAt))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getLatestMeteoAIForecasts(limit = 7, locationKey = "default") {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(meteoaiForecast)
    .where(eq(meteoaiForecast.locationKey, locationKey))
    .orderBy(desc(meteoaiForecast.date))
    .limit(limit);
}

/** Get successive MeteoAI snapshots for trace and weight comparisons. */
export async function getMeteoAIForecastHistory(locationKey = "default", limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(meteoaiForecast)
    .where(eq(meteoaiForecast.locationKey, locationKey))
    .orderBy(desc(meteoaiForecast.computedAt))
    .limit(limit);
}

/**
 * Get daily weighted scores per service for the last N days (for AI Lab historical chart)
 */
export async function getHistoricalScoreTimeSeries(days = 14, locationKey = "default") {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      date: reliabilityScores.date,
      serviceName: reliabilityScores.serviceName,
      weightedScore: reliabilityScores.weightedScore,
      tempScore: reliabilityScores.tempScore,
      precipScore: reliabilityScores.precipScore,
      windScore: reliabilityScores.windScore,
      condScore: reliabilityScores.condScore,
    })
    .from(reliabilityScores)
    .where(
      and(
        eq(reliabilityScores.locationKey, locationKey),
        sql`${reliabilityScores.date} >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)`
      )
    )
    .orderBy(desc(reliabilityScores.date), reliabilityScores.serviceName)
    .limit(days * 20); // up to 20 services per day
}

// ─── COLLECTION JOB HELPERS ─────────────────────────────────────────────────

export async function createCollectionJob(data: InsertCollectionJob): Promise<number> {
  const db = await getDb();
  if (!db) return -1;
  const result = await db.insert(collectionJobs).values(data);
  return (result as any)[0]?.insertId ?? -1;
}

export async function updateCollectionJob(
  id: number,
  updates: Partial<Pick<InsertCollectionJob, "status" | "servicesCollected" | "errorMessage" | "completedAt">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(collectionJobs).set(updates).where(eq(collectionJobs.id, id));
}

export async function getRecentCollectionJobs(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(collectionJobs)
    .orderBy(desc(collectionJobs.startedAt))
    .limit(limit);
}


// ─── Favorite Locations ──────────────────────────────────────────────────────

/**
 * Get ALL favorite locations across all users (used by cron jobs for bulk collection)
 */
export async function getAllFavoriteLocations() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(favoriteLocations)
    .orderBy(favoriteLocations.userId, favoriteLocations.position);
}

export async function getFavoriteLocations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(favoriteLocations)
    .where(eq(favoriteLocations.userId, userId))
    .orderBy(favoriteLocations.position);
}

const MAX_FAVORITE_LOCATIONS = 8;

export async function addFavoriteLocation(data: InsertFavoriteLocation) {
  const db = await getDb();
  if (!db) return null;
  // Check max 8
  const existing = await db
    .select({ count: sql<number>`count(*)` })
    .from(favoriteLocations)
    .where(eq(favoriteLocations.userId, data.userId));
  if (existing[0]?.count >= MAX_FAVORITE_LOCATIONS) return null;
  const result = await db.insert(favoriteLocations).values(data);
  return result[0].insertId;
}

export async function updateFavoriteLocation(id: number, userId: number, data: Partial<InsertFavoriteLocation>) {
  const db = await getDb();
  if (!db) return false;
  await db
    .update(favoriteLocations)
    .set(data)
    .where(and(eq(favoriteLocations.id, id), eq(favoriteLocations.userId, userId)));
  return true;
}

export async function deleteFavoriteLocation(id: number, userId: number) {
  const db = await getDb();
  if (!db) return false;
  await db
    .delete(favoriteLocations)
    .where(and(eq(favoriteLocations.id, id), eq(favoriteLocations.userId, userId)));
  return true;
}

export async function setDefaultFavorite(id: number, userId: number) {
  const db = await getDb();
  if (!db) return false;
  // Clear all defaults for this user
  await db
    .update(favoriteLocations)
    .set({ isDefault: 0 })
    .where(eq(favoriteLocations.userId, userId));
  // Set the new default
  await db
    .update(favoriteLocations)
    .set({ isDefault: 1 })
    .where(and(eq(favoriteLocations.id, id), eq(favoriteLocations.userId, userId)));
  return true;
}

// ─── Physical station snapshots ─────────────────────────────────────────────

/** Upsert the immutable identity and latest metadata of a station candidate or validated. */
export async function upsertWeatherStation(data: InsertWeatherStation): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(weatherStations).values(data).onDuplicateKeyUpdate({
    set: {
      source: data.source,
      name: data.name,
      lat: data.lat,
      lon: data.lon,
      altitude: data.altitude ?? null,
      refLat: data.refLat,
      refLon: data.refLon,
      distanceKm: data.distanceKm,
      reliabilityScore: data.reliabilityScore ?? null,
      updateFrequencyMin: data.updateFrequencyMin ?? null,
      dataAvailability: data.dataAvailability ?? null,
      isActive: data.isActive ?? 1,
      exclusionReason: data.exclusionReason ?? null,
      qualificationStatus: data.qualificationStatus ?? "validated",
      sourceTier: data.sourceTier ?? null,
      lastSeen: new Date(),
    },
  });
}

/**
 * Idempotent station reading write. The station timestamp is the natural key so
 * cron retries refresh the same reading rather than creating duplicate evidence.
 */
export async function upsertStationObservation(data: InsertStationObservation): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ id: stationObservations.id })
    .from(stationObservations)
    .where(and(
      eq(stationObservations.stationId, data.stationId),
      eq(stationObservations.observedAt, data.observedAt),
    ))
    .limit(1);

  if (existing[0]) {
    await db.update(stationObservations).set({ ...data, collectedAt: new Date() }).where(eq(stationObservations.id, existing[0].id));
    return;
  }
  await db.insert(stationObservations).values(data);
}

/**
 * Rebuild quality metadata from archived observations. The profile is evidence
 * only: it never writes reliabilityScore, qualificationStatus or isActive.
 */
export async function refreshStationQualityProfiles(stationIds: string[], nowMs = Date.now()): Promise<void> {
  const db = await getDb();
  const uniqueIds = Array.from(new Set(stationIds));
  if (!db || uniqueIds.length === 0) return;
  const sinceMs = nowMs - 30 * 24 * 60 * 60 * 1000;
  const readings = await db.select().from(stationObservations).where(and(
    inArray(stationObservations.stationId, uniqueIds),
    gte(stationObservations.observedAt, sinceMs),
  )).orderBy(stationObservations.observedAt);
  const byStation = new Map<string, typeof readings>();
  for (const reading of readings) byStation.set(reading.stationId, [...(byStation.get(reading.stationId) ?? []), reading]);

  for (const stationId of uniqueIds) {
    const profile = deriveStationQualityProfile({ stationId, nowMs, observations: byStation.get(stationId) ?? [] });
    const data: InsertStationQualityProfile = { ...profile, firstObservedAt: profile.firstObservedAt ?? null, lastObservedAt: profile.lastObservedAt ?? null };
    const existing = await db.select({ id: stationQualityProfiles.id }).from(stationQualityProfiles).where(eq(stationQualityProfiles.stationId, stationId)).limit(1);
    if (existing[0]) await db.update(stationQualityProfiles).set(data).where(eq(stationQualityProfiles.id, existing[0].id));
    else await db.insert(stationQualityProfiles).values(data);
  }
}

export async function getStationQualityProfiles(stationIds: string[]) {
  const db = await getDb();
  const uniqueIds = Array.from(new Set(stationIds));
  if (!db || uniqueIds.length === 0) return [];
  return db.select().from(stationQualityProfiles).where(inArray(stationQualityProfiles.stationId, uniqueIds));
}

/**
 * Read the latest fresh, explicitly validated Netatmo observations without
 * exposing OAuth credentials. Used only when Netatmo's public endpoint is
 * temporarily unavailable to the Dashboard.
 */
export async function getRecentValidatedNetatmoObservations(sinceMs: number) {
  const db = await getDb();
  if (!db) return [];
  const stations = await db
    .select()
    .from(weatherStations)
    .where(and(
      eq(weatherStations.source, "netatmo"),
      eq(weatherStations.isActive, 1),
      eq(weatherStations.qualificationStatus, "validated"),
    ));
  if (stations.length === 0) return [];

  const readings = await db
    .select()
    .from(stationObservations)
    .where(and(
      inArray(stationObservations.stationId, stations.map((station) => station.stationId)),
      gte(stationObservations.observedAt, sinceMs),
    ))
    .orderBy(desc(stationObservations.observedAt));

  const latestByStation = new Map<number | string, typeof readings[number]>();
  for (const reading of readings) {
    if (!latestByStation.has(reading.stationId)) latestByStation.set(reading.stationId, reading);
  }
  return stations.flatMap((station) => {
    const observation = latestByStation.get(station.stationId);
    return observation ? [{ station, observation }] : [];
  });
}

/** Idempotent physical synthesis for one location and Paris hour. */
export async function upsertQualifiedObservationSnapshot(data: InsertQualifiedObservationSnapshot): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ id: qualifiedObservationSnapshots.id })
    .from(qualifiedObservationSnapshots)
    .where(and(
      eq(qualifiedObservationSnapshots.locationKey, data.locationKey),
      eq(qualifiedObservationSnapshots.date, data.date),
      eq(qualifiedObservationSnapshots.hour, data.hour),
    ))
    .limit(1);
  if (existing[0]) {
    await db.update(qualifiedObservationSnapshots).set({ ...data, collectedAt: new Date() }).where(eq(qualifiedObservationSnapshots.id, existing[0].id));
    return;
  }
  await db.insert(qualifiedObservationSnapshots).values(data);
}

export async function getQualifiedObservationSnapshotsForDate(locationKey: string, date: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(qualifiedObservationSnapshots).where(and(
    eq(qualifiedObservationSnapshots.locationKey, locationKey),
    eq(qualifiedObservationSnapshots.date, date),
  )).orderBy(qualifiedObservationSnapshots.hour);
}

export async function getQualifiedEvidenceStatus(locationKey: string) {
  const db = await getDb();
  if (!db) return { date: null, coverageHours: 0, lastCollectedAt: null, qualifiedScoreCount: 0, lastQualifiedScoreAt: null };
  const latest = await db.select().from(qualifiedObservationSnapshots)
    .where(eq(qualifiedObservationSnapshots.locationKey, locationKey))
    .orderBy(desc(qualifiedObservationSnapshots.date), desc(qualifiedObservationSnapshots.hour))
    .limit(1);
  if (!latest[0]) return { date: null, coverageHours: 0, lastCollectedAt: null, qualifiedScoreCount: 0, lastQualifiedScoreAt: null };
  const date = latest[0].date;
  const snapshots = await getQualifiedObservationSnapshotsForDate(locationKey, date);
  const scores = await db.select().from(reliabilityScores).where(and(
    eq(reliabilityScores.locationKey, locationKey),
    eq(reliabilityScores.date, date),
    eq(reliabilityScores.evidenceType, "physical_observation"),
  ));
  return {
    date,
    coverageHours: snapshots.length,
    lastCollectedAt: latest[0].collectedAt,
    qualifiedScoreCount: scores.length,
    lastQualifiedScoreAt: scores.reduce<Date | null>((current, score) => !current || score.computedAt > current ? score.computedAt : current, null),
  };
}

/** Immutable forecast emissions targeting one daily observation. */
export async function getForecastRunsForValidDate(locationKey: string, validDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(forecastRuns).where(and(
    eq(forecastRuns.locationKey, locationKey),
    eq(forecastRuns.validDate, validDate),
  )).orderBy(desc(forecastRuns.issuedAt));
}

/** Upsert the daily local synthesis for one reference location. */
export async function upsertGroundTruthSnapshot(data: InsertGroundTruth): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ id: groundTruth.id })
    .from(groundTruth)
    .where(and(
      eq(groundTruth.date, data.date),
      eq(groundTruth.refLat, data.refLat),
      eq(groundTruth.refLon, data.refLon),
    ))
    .limit(1);

  if (existing[0]) {
    await db.update(groundTruth).set({ ...data, computedAt: new Date() }).where(eq(groundTruth.id, existing[0].id));
    return;
  }
  await db.insert(groundTruth).values(data);
}

/**
 * Read physical station evidence collected for one reference location. Each
 * station keeps its own history so the UI can disclose freshness and compare
 * observations to the official forecast without inventing measurements.
 */
export async function getPhysicalStationHistory(
  refLat: number,
  refLon: number,
  sinceMs: number,
) {
  const db = await getDb();
  if (!db) return { stations: [], latestGroundTruth: null };
  const latBounds = referenceCoordinateBounds(refLat);
  const lonBounds = referenceCoordinateBounds(refLon);
  const groundTruthLatBounds = getGroundTruthReferenceBounds(refLat);
  const groundTruthLonBounds = getGroundTruthReferenceBounds(refLon);

  const stations = await db
    .select()
    .from(weatherStations)
    .where(and(
      gte(weatherStations.refLat, latBounds.min),
      lte(weatherStations.refLat, latBounds.max),
      gte(weatherStations.refLon, lonBounds.min),
      lte(weatherStations.refLon, lonBounds.max),
      eq(weatherStations.isActive, 1),
    ))
    .orderBy(desc(weatherStations.reliabilityScore));

  const stationSeries = await Promise.all(stations.map(async (station) => {
    const readings = await db
      .select()
      .from(stationObservations)
      .where(and(
        eq(stationObservations.stationId, station.stationId),
        gte(stationObservations.observedAt, sinceMs),
      ))
      .orderBy(stationObservations.observedAt);
    return { ...station, readings };
  }));

  const latestGroundTruth = await db
    .select()
    .from(groundTruth)
    .where(and(
      gte(groundTruth.refLat, groundTruthLatBounds.min),
      lte(groundTruth.refLat, groundTruthLatBounds.max),
      gte(groundTruth.refLon, groundTruthLonBounds.min),
      lte(groundTruth.refLon, groundTruthLonBounds.max),
    ))
    .orderBy(desc(groundTruth.computedAt))
    .limit(1);

  return { stations: stationSeries, latestGroundTruth: latestGroundTruth[0] ?? null };
}

/** Persist one collection coverage result, including a zero-station discovery. */
export async function insertStationCollectionSnapshot(data: InsertStationCollectionSnapshot): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(stationCollectionSnapshots).values(data).onDuplicateKeyUpdate({
    set: { ...data, collectedAt: new Date() },
  });
}

/** Read latest availability/coverage attempts for a reference location. */
export async function getStationCollectionSnapshots(locationKey: string, limit = 14) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(stationCollectionSnapshots)
    .where(eq(stationCollectionSnapshots.locationKey, locationKey))
    .orderBy(desc(stationCollectionSnapshots.collectedAt))
    .limit(limit);
}

// ─── Netatmo OAuth tokens ───────────────────────────────────────────────────

export async function upsertNetatmoOAuthToken(userId: number, encryptedRefreshToken: string, scopes = "read_station") {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for Netatmo OAuth connection");
  await db.insert(netatmoOAuthTokens).values({ userId, encryptedRefreshToken, scopes }).onDuplicateKeyUpdate({
    set: { encryptedRefreshToken, scopes, updatedAt: new Date() },
  });
}

export async function getNetatmoOAuthToken(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(netatmoOAuthTokens).where(eq(netatmoOAuthTokens.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function createNetatmoOAuthState(stateHash: string, userId: number, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for Netatmo OAuth state");
  await db.insert(netatmoOAuthStates).values({ stateHash, userId, expiresAt });
}

export async function hasActiveNetatmoOAuthState(stateHash: string, now = new Date()) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ stateHash: netatmoOAuthStates.stateHash })
    .from(netatmoOAuthStates)
    .where(and(
      eq(netatmoOAuthStates.stateHash, stateHash),
      gte(netatmoOAuthStates.expiresAt, now),
      isNull(netatmoOAuthStates.consumedAt),
    ))
    .limit(1);
  return Boolean(rows[0]);
}

/**
 * Consume an OAuth state by its unguessable signed-state hash.
 * The callback already verifies the signed user ID before this write; adding a
 * second user ID predicate here can reject a valid round trip if authentication
 * context changes between authorization and the provider callback.
 */
export async function consumeNetatmoOAuthState(stateHash: string, now = new Date()) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(netatmoOAuthStates)
    .set({ consumedAt: now })
    .where(and(
      eq(netatmoOAuthStates.stateHash, stateHash),
      gte(netatmoOAuthStates.expiresAt, now),
      isNull(netatmoOAuthStates.consumedAt),
    ));
  return (result as unknown as { affectedRows?: number }).affectedRows === 1;
}

// ─── Location Forecasts (pre-fetched per favorite) ───────────────────────────

/**
 * Upsert a pre-fetched forecast for a favorite location.
 * If a row for (favoriteLocationId, date) already exists, update it.
 */
export async function upsertLocationForecast(data: InsertLocationForecast) {
  const db = await getDb();
  if (!db) return;
  // Try update first
  const existing = await db
    .select({ id: locationForecasts.id })
    .from(locationForecasts)
    .where(
      and(
        eq(locationForecasts.favoriteLocationId, data.favoriteLocationId),
        eq(locationForecasts.date, data.date)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(locationForecasts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(locationForecasts.id, existing[0].id));
  } else {
    await db.insert(locationForecasts).values(data);
  }
}

/**
 * Get the latest pre-fetched forecast for a favorite location.
 */
export async function getLocationForecast(favoriteLocationId: number, date: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(locationForecasts)
    .where(
      and(
        eq(locationForecasts.favoriteLocationId, favoriteLocationId),
        eq(locationForecasts.date, date)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get all pre-fetched forecasts for a user's favorite locations (latest date).
 */
export async function getLocationForecastsForUser(userId: number, date: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(locationForecasts)
    .where(
      and(
        eq(locationForecasts.userId, userId),
        eq(locationForecasts.date, date)
      )
    );
}

// ─── HOURLY FORECASTS HELPERS ────────────────────────────────────────────────

/**
 * Insert a batch of hourly forecast rows for a location/date/model.
 * Replaces existing rows for the same locationKey+date+modelName combination.
 */
export async function insertHourlyForecasts(rows: InsertHourlyForecast[]): Promise<void> {
  if (!rows.length) return;
  const db = await getDb();
  if (!db) return;
  // Delete existing rows for this locationKey + date + modelName before inserting
  const { locationKey, date, modelName } = rows[0];
  await db
    .delete(hourlyForecasts)
    .where(
      and(
        eq(hourlyForecasts.locationKey, locationKey),
        eq(hourlyForecasts.date, date),
        eq(hourlyForecasts.modelName, modelName)
      )
    );
  // Insert in batches of 50 to avoid query size limits
  for (let i = 0; i < rows.length; i += 50) {
    await db.insert(hourlyForecasts).values(rows.slice(i, i + 50));
  }
}

/**
 * Get stored hourly forecasts for a location and date (all models).
 */
export async function getStoredHourlyForecasts(locationKey: string, date: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(hourlyForecasts)
    .where(
      and(
        eq(hourlyForecasts.locationKey, locationKey),
        eq(hourlyForecasts.date, date)
      )
    )
    .orderBy(hourlyForecasts.modelName, hourlyForecasts.hour);
}

// ─── OBSERVATIONS PERSONNELLES ET CALIBRATION ──────────────────────────────

export async function insertPersonalWeatherObservation(data: InsertPersonalWeatherObservation): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(personalWeatherObservations).values(data);
  return Number((result as any)[0]?.insertId ?? 0) || null;
}

export async function insertPersonalModelObservationScores(rows: InsertPersonalModelObservationScore[]): Promise<void> {
  const db = await getDb();
  if (!db || rows.length === 0) return;
  await db.insert(personalModelObservationScores).values(rows);
}

export async function upsertPersonalModelCalibration(data: InsertPersonalModelCalibration): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(personalModelCalibrations).values(data).onDuplicateKeyUpdate({
    set: {
      comparisonCount: data.comparisonCount,
      scoreEma: data.scoreEma,
      temperatureMaeEma: data.temperatureMaeEma,
      conditionScoreEma: data.conditionScoreEma,
      precipitationScoreEma: data.precipitationScoreEma,
      windScoreEma: data.windScoreEma,
      weightMultiplier: data.weightMultiplier,
      evidenceState: data.evidenceState,
      lastObservationAt: data.lastObservationAt,
    },
  });
}

export async function getPersonalModelCalibrations(userId: number, locationKey: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(personalModelCalibrations)
    .where(and(eq(personalModelCalibrations.userId, userId), eq(personalModelCalibrations.locationKey, locationKey)))
    .orderBy(desc(personalModelCalibrations.scoreEma), personalModelCalibrations.modelName);
}

export async function getRecentPersonalWeatherObservations(userId: number, locationKey: string, limit = 5) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(personalWeatherObservations)
    .where(and(eq(personalWeatherObservations.userId, userId), eq(personalWeatherObservations.locationKey, locationKey)))
    .orderBy(desc(personalWeatherObservations.observedAt))
    .limit(limit);
}

export async function getAllPersonalWeatherObservations(userId: number, locationKey: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(personalWeatherObservations)
    .where(and(eq(personalWeatherObservations.userId, userId), eq(personalWeatherObservations.locationKey, locationKey)))
    .orderBy(personalWeatherObservations.observedAt);
}

export async function getPersonalWeatherObservationById(userId: number, id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(personalWeatherObservations)
    .where(and(eq(personalWeatherObservations.userId, userId), eq(personalWeatherObservations.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updatePersonalWeatherObservation(userId: number, id: number, data: Pick<InsertPersonalWeatherObservation, "temperature" | "condition" | "windSpeed" | "precipitation">) {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .update(personalWeatherObservations)
    .set(data)
    .where(and(eq(personalWeatherObservations.userId, userId), eq(personalWeatherObservations.id, id)));
  return Number((result as any)[0]?.affectedRows ?? 0) > 0;
}

export async function deletePersonalWeatherObservation(userId: number, id: number) {
  const db = await getDb();
  if (!db) return false;
  await db.delete(personalModelObservationScores).where(eq(personalModelObservationScores.observationId, id));
  const result = await db
    .delete(personalWeatherObservations)
    .where(and(eq(personalWeatherObservations.userId, userId), eq(personalWeatherObservations.id, id)));
  return Number((result as any)[0]?.affectedRows ?? 0) > 0;
}

export async function getPersonalModelObservationScores(observationIds: number[]) {
  const db = await getDb();
  if (!db || observationIds.length === 0) return [];
  return db.select().from(personalModelObservationScores).where(inArray(personalModelObservationScores.observationId, observationIds));
}

export async function replacePersonalModelObservationScores(observationIds: number[], rows: InsertPersonalModelObservationScore[]) {
  const db = await getDb();
  if (!db || observationIds.length === 0) return;
  await db.delete(personalModelObservationScores).where(inArray(personalModelObservationScores.observationId, observationIds));
  if (rows.length > 0) await db.insert(personalModelObservationScores).values(rows);
}

export async function clearPersonalModelCalibrations(userId: number, locationKey: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(personalModelCalibrations).where(and(eq(personalModelCalibrations.userId, userId), eq(personalModelCalibrations.locationKey, locationKey)));
}

// ─── LEAD TIME SCORES HELPERS ────────────────────────────────────────────────

/**
 * Insert a batch of lead-time score rows.
 * Replaces existing rows for the same locationKey+date+serviceName combination.
 */
export async function insertLeadTimeScores(rows: InsertLeadTimeScore[]): Promise<void> {
  if (!rows.length) return;
  const db = await getDb();
  if (!db) return;
  // Delete existing rows for this locationKey + date + serviceName
  const locKey = rows[0].locationKey ?? "default";
  const dt = rows[0].date;
  const svc = rows[0].serviceName;
  await db
    .delete(leadTimeScores)
    .where(
      and(
        eq(leadTimeScores.locationKey, locKey),
        eq(leadTimeScores.date, dt),
        eq(leadTimeScores.serviceName, svc)
      )
    );
  await db.insert(leadTimeScores).values(rows);
}

/**
 * Get lead-time scores for a location over the last N days.
 * Returns per-service, per-bucket averages.
 */
export async function getLeadTimeScoresForLocation(locationKey: string, days = 14) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      serviceName: leadTimeScores.serviceName,
      bucket: leadTimeScores.bucket,
      avgMaeTemp: sql<number>`AVG(${leadTimeScores.maeTemp})`.as("avgMaeTemp"),
      avgRmseTemp: sql<number>`AVG(${leadTimeScores.rmseTemp})`.as("avgRmseTemp"),
      avgBiasTemp: sql<number>`AVG(${leadTimeScores.biasTemp})`.as("avgBiasTemp"),
      avgMaePrecip: sql<number>`AVG(${leadTimeScores.maePrecip})`.as("avgMaePrecip"),
      avgRmsePrecip: sql<number>`SQRT(AVG(POWER(${leadTimeScores.rmsePrecip}, 2)))`.as("avgRmsePrecip"),
      avgMaeWind: sql<number>`AVG(${leadTimeScores.maeWind})`.as("avgMaeWind"),
      avgRmseWind: sql<number>`SQRT(AVG(POWER(${leadTimeScores.rmseWind}, 2)))`.as("avgRmseWind"),
      totalSamples: sql<number>`SUM(${leadTimeScores.sampleSize})`.as("totalSamples"),
      latestScoreDate: sql<string>`MAX(${leadTimeScores.date})`.as("latestScoreDate"),
    })
    .from(leadTimeScores)
    .where(
      and(
        eq(leadTimeScores.locationKey, locationKey),
        sql`${leadTimeScores.date} >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)`
      )
    )
    .groupBy(sql`${leadTimeScores.serviceName}`, sql`${leadTimeScores.bucket}`)
    .orderBy(sql`${leadTimeScores.serviceName}`, sql`${leadTimeScores.bucket}`);
}

export async function getQualifiedLeadTimeScoresForLocation(locationKey: string, days = 14) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      serviceName: leadTimeScores.serviceName,
      bucket: leadTimeScores.bucket,
      avgMaeTemp: sql<number>`AVG(${leadTimeScores.maeTemp})`.as("avgMaeTemp"),
      avgMaePrecip: sql<number>`AVG(${leadTimeScores.maePrecip})`.as("avgMaePrecip"),
      avgMaeWind: sql<number>`AVG(${leadTimeScores.maeWind})`.as("avgMaeWind"),
      totalSamples: sql<number>`SUM(${leadTimeScores.sampleSize})`.as("totalSamples"),
      latestScoreDate: sql<string>`MAX(${leadTimeScores.date})`.as("latestScoreDate"),
    })
    .from(leadTimeScores)
    .where(and(
      eq(leadTimeScores.locationKey, locationKey),
      eq(leadTimeScores.evidenceType, "physical_observation"),
      sql`${leadTimeScores.date} >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)`,
    ))
    .groupBy(sql`${leadTimeScores.serviceName}`, sql`${leadTimeScores.bucket}`)
    .orderBy(sql`${leadTimeScores.serviceName}`, sql`${leadTimeScores.bucket}`);
}

// ─── Reliability laboratory read models ──────────────────────────────────────

/**
 * Aggregate only score rows based on explicitly qualified physical observations.
 * Legacy and model-reference rows are intentionally excluded from the laboratory.
 */
export async function getLaboratoryModelAggregates(locationKey: string, startDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      serviceName: reliabilityScores.serviceName,
      evaluatedDays: sql<number>`COUNT(DISTINCT ${reliabilityScores.date})`.as("evaluatedDays"),
      scoreRows: sql<number>`COUNT(*)`.as("scoreRows"),
      comparisons: sql<number>`SUM(COALESCE(${reliabilityScores.sampleSize}, 0))`.as("comparisons"),
      latestScoreDate: sql<string>`MAX(${reliabilityScores.date})`.as("latestScoreDate"),
      averageNormalizedScore: sql<number>`AVG(${reliabilityScores.normalizedScore})`.as("averageNormalizedScore"),
      averageOperationalScore: sql<number>`AVG(${reliabilityScores.weightedScore})`.as("averageOperationalScore"),
      averageMaeTemp: sql<number>`AVG(${reliabilityScores.maeTemp})`.as("averageMaeTemp"),
      averageRmseTemp: sql<number>`AVG(${reliabilityScores.rmseTemp})`.as("averageRmseTemp"),
      averageBiasTemp: sql<number>`AVG(${reliabilityScores.biasTemp})`.as("averageBiasTemp"),
      averagePrecipScore: sql<number>`AVG(${reliabilityScores.precipScore})`.as("averagePrecipScore"),
      averagePrecipPod: sql<number>`AVG(${reliabilityScores.precipPod})`.as("averagePrecipPod"),
      averagePrecipFar: sql<number>`AVG(${reliabilityScores.precipFar})`.as("averagePrecipFar"),
      falsePositives: sql<number>`SUM(COALESCE(${reliabilityScores.precipFalsePositives}, 0))`.as("falsePositives"),
      falseNegatives: sql<number>`SUM(COALESCE(${reliabilityScores.precipFalseNegatives}, 0))`.as("falseNegatives"),
      averageMaeWind: sql<number>`AVG(${reliabilityScores.maeWind})`.as("averageMaeWind"),
      averageMaeGusts: sql<number>`AVG(${reliabilityScores.windMaeGusts})`.as("averageMaeGusts"),
      averageHumidityScore: sql<number>`AVG(${reliabilityScores.humidityScore})`.as("averageHumidityScore"),
      averagePressureScore: sql<number>`AVG(${reliabilityScores.pressureScore})`.as("averagePressureScore"),
    })
    .from(reliabilityScores)
    .where(and(
      eq(reliabilityScores.locationKey, locationKey),
      eq(reliabilityScores.evidenceType, "physical_observation"),
      gte(reliabilityScores.date, startDate),
    ))
    .groupBy(reliabilityScores.serviceName)
    .orderBy(sql`AVG(${reliabilityScores.normalizedScore}) DESC`);
}

/** Daily qualified score points for the evolution chart, without legacy evidence. */
export async function getLaboratoryScoreTimeline(locationKey: string, startDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      date: reliabilityScores.date,
      serviceName: reliabilityScores.serviceName,
      comparisons: reliabilityScores.sampleSize,
      normalizedScore: reliabilityScores.normalizedScore,
      operationalScore: reliabilityScores.weightedScore,
      maeTemp: reliabilityScores.maeTemp,
      rmseTemp: reliabilityScores.rmseTemp,
      maeWind: reliabilityScores.maeWind,
    })
    .from(reliabilityScores)
    .where(and(
      eq(reliabilityScores.locationKey, locationKey),
      eq(reliabilityScores.evidenceType, "physical_observation"),
      gte(reliabilityScores.date, startDate),
    ))
    .orderBy(reliabilityScores.date, reliabilityScores.serviceName);
}

/** Immutable emissions are the factual archive used to disclose model coverage. */
export async function getLaboratoryModelArchive(locationKey: string, startDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      serviceName: forecastRuns.serviceName,
      provider: forecastRuns.provider,
      modelId: forecastRuns.modelId,
      archivedRuns: sql<number>`COUNT(*)`.as("archivedRuns"),
      firstValidDate: sql<string>`MIN(${forecastRuns.validDate})`.as("firstValidDate"),
      latestValidDate: sql<string>`MAX(${forecastRuns.validDate})`.as("latestValidDate"),
    })
    .from(forecastRuns)
    .where(and(
      eq(forecastRuns.locationKey, locationKey),
      eq(forecastRuns.sourceKind, "model_forecast"),
      gte(forecastRuns.validDate, startDate),
    ))
    .groupBy(forecastRuns.serviceName, forecastRuns.provider, forecastRuns.modelId)
    .orderBy(forecastRuns.serviceName);
}
