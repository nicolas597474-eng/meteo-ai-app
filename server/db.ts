import { eq, desc, and, gte, lte, sql, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  forecasts,
  observations,
  reliabilityScores,
  meteoaiForecast,
  collectionJobs,
  favoriteLocations,
  locationForecasts,
  hourlyForecasts,
  leadTimeScores,
  InsertForecast,
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
  groundTruth,
  stationCollectionSnapshots,
  netatmoOAuthTokens,
  netatmoOAuthStates,
  InsertWeatherStation,
  InsertStationObservation,
  InsertGroundTruth,
  InsertStationCollectionSnapshot,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { selectLatestForecasts } from "./forecastSelection";

let _db: ReturnType<typeof drizzle> | null = null;

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
  await db.insert(forecasts).values(data);
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

export async function addFavoriteLocation(data: InsertFavoriteLocation) {
  const db = await getDb();
  if (!db) return null;
  // Check max 5
  const existing = await db
    .select({ count: sql<number>`count(*)` })
    .from(favoriteLocations)
    .where(eq(favoriteLocations.userId, data.userId));
  if (existing[0]?.count >= 5) return null;
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

/** Upsert the immutable identity and latest metadata of a physical station. */
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

  const stations = await db
    .select()
    .from(weatherStations)
    .where(and(
      eq(weatherStations.refLat, refLat),
      eq(weatherStations.refLon, refLon),
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
    .where(and(eq(groundTruth.refLat, refLat), eq(groundTruth.refLon, refLon)))
    .orderBy(desc(groundTruth.computedAt))
    .limit(1);

  return { stations: stationSeries, latestGroundTruth: latestGroundTruth[0] ?? null };
}

/** Persist one collection coverage result, including a zero-station discovery. */
export async function insertStationCollectionSnapshot(data: InsertStationCollectionSnapshot): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(stationCollectionSnapshots).values(data);
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

export async function consumeNetatmoOAuthState(stateHash: string, userId: number, now = new Date()) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(netatmoOAuthStates)
    .set({ consumedAt: now })
    .where(and(
      eq(netatmoOAuthStates.stateHash, stateHash),
      eq(netatmoOAuthStates.userId, userId),
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
