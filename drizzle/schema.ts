import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, float, json, bigint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Weather forecasts collected from various services/models.
 * Each row = one service's forecast for one date.
 */
export const forecasts = mysqlTable("forecasts", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  serviceName: varchar("serviceName", { length: 64 }).notNull(),
  serviceCategory: mysqlEnum("serviceCategory", ["public", "expert"]).notNull(),
  tempMax: float("tempMax"),
  tempMin: float("tempMin"),
  precipitation: float("precipitation"), // mm
  windSpeed: float("windSpeed"), // km/h
  windGust: float("windGust"), // km/h
  humidity: float("humidity"), // %
  cloudCover: float("cloudCover"), // %
  condition: varchar("condition", { length: 128 }),
  rawData: json("rawData"),
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
});

export type Forecast = typeof forecasts.$inferSelect;
export type InsertForecast = typeof forecasts.$inferInsert;

/**
 * Real weather observations from local stations.
 * Each row = one day's actual weather at Hondeghem.
 */
export const observations = mysqlTable("observations", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull().unique(), // YYYY-MM-DD
  tempMax: float("tempMax"),
  tempMin: float("tempMin"),
  precipitation: float("precipitation"), // mm
  windSpeed: float("windSpeed"), // km/h
  windGust: float("windGust"), // km/h
  humidity: float("humidity"), // %
  cloudCover: float("cloudCover"), // %
  condition: varchar("condition", { length: 128 }),
  source: varchar("source", { length: 128 }), // e.g. "Steenvoorde/Hazebrouck"
  rawData: json("rawData"),
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
});

export type Observation = typeof observations.$inferSelect;
export type InsertObservation = typeof observations.$inferInsert;

/**
 * Computed reliability scores per service per day.
 */
export const reliabilityScores = mysqlTable("reliability_scores", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  serviceName: varchar("serviceName", { length: 64 }).notNull(),
  maeTemp: float("maeTemp"),
  maePrecip: float("maePrecip"),
  maeWind: float("maeWind"),
  rmseTemp: float("rmseTemp"),
  rmsePrecip: float("rmsePrecip"),
  rmseWind: float("rmseWind"),
  biasTemp: float("biasTemp"),
  biasPrecip: float("biasPrecip"),
  biasWind: float("biasWind"),
  conditionAccuracy: float("conditionAccuracy"), // 0-1
  weightedScore: float("weightedScore"), // 0-100
  computedAt: timestamp("computedAt").defaultNow().notNull(),
});

export type ReliabilityScore = typeof reliabilityScores.$inferSelect;
export type InsertReliabilityScore = typeof reliabilityScores.$inferInsert;

/**
 * MeteoAI synthesized forecasts.
 * The AI-generated forecast combining all services with dynamic weights.
 */
export const meteoaiForecast = mysqlTable("meteoai_forecast", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull().unique(), // YYYY-MM-DD
  tempMax: float("tempMax"),
  tempMin: float("tempMin"),
  precipitation: float("precipitation"),
  windSpeed: float("windSpeed"),
  condition: varchar("condition", { length: 128 }),
  stabilityIndex: float("stabilityIndex"), // 0-100
  stabilityLabel: mysqlEnum("stabilityLabel", ["stable", "unstable"]).notNull(),
  confidenceScore: float("confidenceScore"), // 0-100
  weights: json("weights"), // { serviceName: weight% }
  explanation: text("explanation"), // AI-generated explanation
  computedAt: timestamp("computedAt").defaultNow().notNull(),
});

export type MeteoAIForecast = typeof meteoaiForecast.$inferSelect;
export type InsertMeteoAIForecast = typeof meteoaiForecast.$inferInsert;

/**
 * Collection jobs tracking (for heartbeat scheduling).
 */
export const collectionJobs = mysqlTable("collection_jobs", {
  id: int("id").autoincrement().primaryKey(),
  jobType: mysqlEnum("jobType", ["forecast", "observation"]).notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  servicesCollected: int("servicesCollected"),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type CollectionJob = typeof collectionJobs.$inferSelect;
export type InsertCollectionJob = typeof collectionJobs.$inferInsert;
