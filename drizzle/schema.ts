import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, float, json, bigint, uniqueIndex } from "drizzle-orm/mysql-core";

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
  locationKey: varchar("locationKey", { length: 32 }).notNull().default("default"), // "lat_lon" rounded to 3dp, e.g. "50.781_2.544"
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
  locationKey: varchar("locationKey", { length: 32 }).notNull().default("default"), // "lat_lon" rounded to 3dp
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
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
  locationKey: varchar("locationKey", { length: 32 }).notNull().default("default"), // "lat_lon" rounded to 3dp
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
  regime: varchar("regime", { length: 32 }), // detected weather regime
  // 🌡️ Temperature dimension
  tempScore: float("tempScore"),
  tempMaxError: float("tempMaxError"),
  // 🌧️ Precipitation dimension
  precipScore: float("precipScore"),
  precipPod: float("precipPod"),    // Probability of Detection
  precipFar: float("precipFar"),    // False Alarm Rate
  precipCsi: float("precipCsi"),    // Critical Success Index
  precipFalsePositives: int("precipFalsePositives"),
  precipFalseNegatives: int("precipFalseNegatives"),
  // 💨 Wind dimension
  windScore: float("windScore"),
  windMaeGusts: float("windMaeGusts"),
  // ☁️ Condition dimension
  condScore: float("condScore"),
  condConcordance: float("condConcordance"),
  condMaeCloud: float("condMaeCloud"),
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
  locationKey: varchar("locationKey", { length: 32 }).notNull().default("default"), // "lat_lon" rounded to 3dp
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
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

/**
 * Weather stations discovered near a location.
 * Multi-source: Open-Meteo, Météo-France, Netatmo, WUnderground, CWOP, NOAA, etc.
 */
export const weatherStations = mysqlTable("weather_stations", {
  id: int("id").autoincrement().primaryKey(),
  stationId: varchar("stationId", { length: 128 }).notNull().unique(), // external ID (e.g. "MF-07690", "LFQQ")
  source: varchar("source", { length: 64 }).notNull(), // "meteofrance", "netatmo", "wunderground", "cwop", "noaa", "openmeteo"
  name: varchar("name", { length: 256 }).notNull(),
  lat: float("lat").notNull(),
  lon: float("lon").notNull(),
  altitude: float("altitude"), // meters
  // Reference location (user's chosen position)
  refLat: float("refLat").notNull(),
  refLon: float("refLon").notNull(),
  distanceKm: float("distanceKm").notNull(), // km from reference
  // Quality metrics
  reliabilityScore: float("reliabilityScore").default(50), // 0-100
  updateFrequencyMin: int("updateFrequencyMin"), // typical update interval in minutes
  dataAvailability: float("dataAvailability").default(1), // 0-1 fraction of expected updates received
  // Status
  isActive: int("isActive").default(1), // 1=active, 0=excluded
  exclusionReason: varchar("exclusionReason", { length: 256 }), // reason if excluded
  firstSeen: timestamp("firstSeen").defaultNow().notNull(),
  lastSeen: timestamp("lastSeen").defaultNow().notNull(),
});

export type WeatherStation = typeof weatherStations.$inferSelect;
export type InsertWeatherStation = typeof weatherStations.$inferInsert;

/**
 * Observations collected from individual weather stations.
 * Each row = one station's reading at a given timestamp.
 */
export const stationObservations = mysqlTable("station_observations", {
  id: int("id").autoincrement().primaryKey(),
  stationId: varchar("stationId", { length: 128 }).notNull(), // FK to weatherStations.stationId
  observedAt: bigint("observedAt", { mode: "number" }).notNull(), // UTC ms timestamp
  temperature: float("temperature"), // °C
  humidity: float("humidity"), // %
  pressure: float("pressure"), // hPa
  windSpeed: float("windSpeed"), // km/h
  windGust: float("windGust"), // km/h
  windDirection: float("windDirection"), // degrees
  precipitation: float("precipitation"), // mm
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("station_observations_station_time_unique").on(table.stationId, table.observedAt),
]);

export type StationObservation = typeof stationObservations.$inferSelect;
export type InsertStationObservation = typeof stationObservations.$inferInsert;

/**
 * Ground truth computed from multiple nearby stations (weighted average).
 * Stored per location + date for use in forecast accuracy scoring.
 */
export const groundTruth = mysqlTable("ground_truth", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  refLat: float("refLat").notNull(),
  refLon: float("refLon").notNull(),
  radiusKm: float("radiusKm").notNull(),
  stationsUsed: json("stationsUsed"), // array of { stationId, name, distance, weight, contribution }
  stationsIgnored: json("stationsIgnored"), // array of { stationId, name, reason }
  // Weighted average values
  temperature: float("temperature"),
  humidity: float("humidity"),
  pressure: float("pressure"),
  windSpeed: float("windSpeed"),
  windGust: float("windGust"),
  precipitation: float("precipitation"),
  // Quality
  stationCount: int("stationCount").notNull(),
  confidenceScore: float("confidenceScore"), // 0-100
  computedAt: timestamp("computedAt").defaultNow().notNull(),
});

export type GroundTruth = typeof groundTruth.$inferSelect;
export type InsertGroundTruth = typeof groundTruth.$inferInsert;

/**
 * Availability and coverage record for a physical-station and model collection
 * cycle. Empty station discoveries are recorded explicitly.
 */
export const stationCollectionSnapshots = mysqlTable("station_collection_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  radiusKm: int("radiusKm").notNull(),
  physicalStationCount: int("physicalStationCount").notNull(),
  dailyModelCount: int("dailyModelCount").notNull(),
  hourlyModelCount: int("hourlyModelCount").notNull(),
  dailyMissingModels: json("dailyMissingModels"),
  hourlyMissingModels: json("hourlyMissingModels"),
  status: mysqlEnum("status", ["completed", "partial", "failed"]).notNull(),
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
});

export type StationCollectionSnapshot = typeof stationCollectionSnapshots.$inferSelect;
export type InsertStationCollectionSnapshot = typeof stationCollectionSnapshots.$inferInsert;

/**
 * User favorite locations (max 5 per user).
 * Each location stores coordinates, custom settings, and display preferences.
 */
export const favoriteLocations = mysqlTable("favorite_locations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // FK to users.id
  name: varchar("name", { length: 256 }).notNull(), // geocoded name
  customName: varchar("customName", { length: 256 }), // user-defined label
  lat: float("lat").notNull(),
  lon: float("lon").notNull(),
  isDefault: int("isDefault").default(0), // 1 = default location on app start
  position: int("position").notNull().default(0), // ordering 0-4
  // Per-location settings
  localMode: mysqlEnum("localMode", ["standard", "local", "ultra-local"]).default("standard"),
  radiusKm: int("radiusKm").default(20), // station search radius
  preferredModels: json("preferredModels"), // array of model names
  tempUnit: mysqlEnum("tempUnit", ["celsius", "fahrenheit"]).default("celsius"),
  alertsEnabled: int("alertsEnabled").default(1), // 1=on, 0=off
  alertThresholds: json("alertThresholds"), // { precipMm, windKmh, tempMin, tempMax }
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FavoriteLocation = typeof favoriteLocations.$inferSelect;
export type InsertFavoriteLocation = typeof favoriteLocations.$inferInsert;

/**
 * Pre-fetched forecasts for each favorite location.
 * Populated daily at 05h00 by the heartbeat cron.
 * Allows instant display without waiting for API calls.
 */
export const locationForecasts = mysqlTable("location_forecasts", {
  id: int("id").autoincrement().primaryKey(),
  favoriteLocationId: int("favoriteLocationId").notNull(), // FK to favorite_locations.id
  userId: int("userId").notNull(),
  lat: float("lat").notNull(),
  lon: float("lon").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  // MeteoAI synthesized values
  tempMax: float("tempMax"),
  tempMin: float("tempMin"),
  tempCurrent: float("tempCurrent"),
  precipitation: float("precipitation"),
  windSpeed: float("windSpeed"),
  condition: varchar("condition", { length: 128 }),
  // AI scores
  aiScore: float("aiScore"),       // Weather AI Score 0-100
  confidenceScore: float("confidenceScore"), // Weather Confidence Score 0-100
  stabilityIndex: float("stabilityIndex"),
  // Raw forecast data per model (JSON array)
  modelsData: json("modelsData"),
  // Explanation
  explanation: text("explanation"),
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LocationForecast = typeof locationForecasts.$inferSelect;
export type InsertLocationForecast = typeof locationForecasts.$inferInsert;

/**
 * Hourly forecasts collected per location per model.
 * Populated daily at 05h00 by the heartbeat cron.
 * Stores 24h of hourly data per model per location.
 */
export const hourlyForecasts = mysqlTable("hourly_forecasts", {
  id: int("id").autoincrement().primaryKey(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD (forecast day)
  hour: int("hour").notNull(), // 0-23
  modelName: varchar("modelName", { length: 64 }).notNull(), // e.g. "AROME", "ECMWF", "best_match"
  temperature: float("temperature"), // °C
  apparentTemperature: float("apparentTemperature"), // °C ressenti
  precipitation: float("precipitation"), // mm
  windSpeed: float("windSpeed"), // km/h
  windGusts: float("windGusts"), // km/h
  windDirection: int("windDirection"), // degrees 0-360
  humidity: float("humidity"), // %
  cloudCover: float("cloudCover"), // %
  weatherCode: int("weatherCode"), // WMO code
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
});
export type HourlyForecast = typeof hourlyForecasts.$inferSelect;
export type InsertHourlyForecast = typeof hourlyForecasts.$inferInsert;

/**
 * Lead-time scoring — per-model, per-location, per-horizon error metrics.
 * Populated during observation collection by comparing forecasts issued N days
 * before the observation date with the actual observation.
 * Buckets: 0-6h, 6-24h, 1-3d, 4-7d, 8-15d
 */
export const leadTimeScores = mysqlTable("lead_time_scores", {
  id: int("id").autoincrement().primaryKey(),
  locationKey: varchar("locationKey", { length: 32 }).notNull().default("default"),
  date: varchar("date", { length: 10 }).notNull(), // observation date YYYY-MM-DD
  serviceName: varchar("serviceName", { length: 64 }).notNull(),
  bucket: varchar("bucket", { length: 10 }).notNull(), // "0-6h", "6-24h", "1-3d", "4-7d", "8-15d"
  maeTemp: float("maeTemp"),
  rmseTemp: float("rmseTemp"),
  biasTemp: float("biasTemp"),
  maePrecip: float("maePrecip"),
  rmsePrecip: float("rmsePrecip"),
  maeWind: float("maeWind"),
  rmseWind: float("rmseWind"),
  sampleSize: int("sampleSize").notNull().default(0),
  computedAt: timestamp("computedAt").defaultNow().notNull(),
});
export type LeadTimeScore = typeof leadTimeScores.$inferSelect;
export type InsertLeadTimeScore = typeof leadTimeScores.$inferInsert;
