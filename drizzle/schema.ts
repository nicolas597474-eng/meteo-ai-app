import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, float, json, bigint, uniqueIndex, index } from "drizzle-orm/mysql-core";

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
}, (table) => [
  uniqueIndex("forecasts_location_date_service_unique").on(table.locationKey, table.date, table.serviceName),
]);

export type Forecast = typeof forecasts.$inferSelect;
export type InsertForecast = typeof forecasts.$inferInsert;

/**
 * Immutable archive of each provider/model forecast emission. Unlike `forecasts`,
 * these rows are never replaced and therefore preserve the issue time required
 * for reproducible lead-time evaluation.
 */
export const forecastRuns = mysqlTable("forecast_runs", {
  id: int("id").autoincrement().primaryKey(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  validDate: varchar("validDate", { length: 10 }).notNull(),
  serviceName: varchar("serviceName", { length: 64 }).notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  modelId: varchar("modelId", { length: 96 }),
  sourceKind: mysqlEnum("sourceKind", ["model_forecast", "service_forecast"]).notNull(),
  issuedAt: bigint("issuedAt", { mode: "number" }).notNull(),
  tempMax: float("tempMax"),
  tempMin: float("tempMin"),
  precipitation: float("precipitation"),
  windSpeed: float("windSpeed"),
  windGust: float("windGust"),
  humidity: float("humidity"),
  cloudCover: float("cloudCover"),
  condition: varchar("condition", { length: 128 }),
  rawData: json("rawData"),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("forecast_runs_unique_emission").on(table.locationKey, table.validDate, table.serviceName, table.issuedAt),
]);

export type ForecastRun = typeof forecastRuns.$inferSelect;
export type InsertForecastRun = typeof forecastRuns.$inferInsert;

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
  /** Explicitly differentiates a station-backed observation from a model reference. */
  provenanceType: mysqlEnum("provenanceType", ["physical_observation", "model_reference", "legacy_unqualified"]).notNull().default("legacy_unqualified"),
  /** Only qualified physical observations may be used by a future operational scorer. */
  isQualified: int("isQualified").notNull().default(0),
  rawData: json("rawData"),
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("observations_location_date_provenance_unique").on(table.locationKey, table.date, table.provenanceType),
]);

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
  /** Exact count of aligned forecast/physical-observation pairs used by this score. */
  sampleSize: int("sampleSize"),
  /** Laboratory score using the centralized six-variable weights, when all inputs exist. */
  normalizedScore: float("normalizedScore"),
  humidityScore: float("humidityScore"),
  humidityMae: float("humidityMae"),
  humidityRmse: float("humidityRmse"),
  humidityBias: float("humidityBias"),
  pressureScore: float("pressureScore"),
  pressureMae: float("pressureMae"),
  pressureRmse: float("pressureRmse"),
  pressureBias: float("pressureBias"),
  evidenceType: mysqlEnum("evidenceType", ["physical_observation", "model_reference", "legacy_unqualified"]).notNull().default("legacy_unqualified"),
  computedAt: timestamp("computedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("reliability_scores_location_date_service_evidence_unique").on(table.locationKey, table.date, table.serviceName, table.evidenceType),
]);

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
  /** Nullable for historical rows created before humidity joined the official fusion. */
  humidity: float("humidity"),
  condition: varchar("condition", { length: 128 }),
  stabilityIndex: float("stabilityIndex"), // 0-100
  stabilityLabel: mysqlEnum("stabilityLabel", ["stable", "unstable"]).notNull(),
  confidenceScore: float("confidenceScore"), // 0-100
  weights: json("weights"), // { serviceName: weight% }
  explanation: text("explanation"), // AI-generated explanation
  computedAt: timestamp("computedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("meteoai_forecast_location_date_unique").on(table.locationKey, table.date),
]);

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
  scheduleRunKey: varchar("scheduleRunKey", { length: 48 }),
  servicesCollected: int("servicesCollected"),
  dailyModelsCollected: int("dailyModelsCollected").default(0).notNull(),
  dailyModelsExpected: int("dailyModelsExpected").default(0).notNull(),
  hourlyModelsCollected: int("hourlyModelsCollected").default(0).notNull(),
  hourlyModelsExpected: int("hourlyModelsExpected").default(0).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => [uniqueIndex("collection_jobs_schedule_run_key_unique").on(table.scheduleRunKey)]);

/** Ephemeral compare-and-set leases; rows are removed on release and reused after expiry. */
export const forecastRefreshLocks = mysqlTable("forecast_refresh_locks", {
  lockKey: varchar("lockKey", { length: 64 }).primaryKey(),
  ownerToken: varchar("ownerToken", { length: 64 }).notNull(),
  leaseExpiresAt: timestamp("leaseExpiresAt").notNull(),
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
  qualificationStatus: varchar("qualificationStatus", { length: 24 }).notNull().default("validated"), // candidate, validated, excluded
  sourceTier: int("sourceTier"), // 1=très haute confiance, 2=haute confiance, 3=ultra local
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
 * Measured historical quality of a physical station. This profile documents
 * continuity and data quality; it never changes operational fusion weights by
 * itself. A status of "reliable" is therefore evidence metadata, not a new
 * source tier.
 */
export const stationQualityProfiles = mysqlTable("station_quality_profiles", {
  id: int("id").autoincrement().primaryKey(),
  stationId: varchar("stationId", { length: 128 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("en_observation"),
  observationCount: int("observationCount").notNull().default(0),
  temperatureObservationCount: int("temperatureObservationCount").notNull().default(0),
  continuityScore: float("continuityScore"),
  completenessScore: float("completenessScore"),
  stabilityScore: float("stabilityScore"),
  windowHours: int("windowHours").notNull().default(0),
  firstObservedAt: bigint("firstObservedAt", { mode: "number" }),
  lastObservedAt: bigint("lastObservedAt", { mode: "number" }),
  evaluatedAt: timestamp("evaluatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("station_quality_profile_station_unique").on(table.stationId)]);

export type StationQualityProfile = typeof stationQualityProfiles.$inferSelect;
export type InsertStationQualityProfile = typeof stationQualityProfiles.$inferInsert;

/**
 * Physical-station synthesis captured for one location and Paris hour.
 * It is separate from model references and is the sole eligible input for
 * a later daily observation used in model scoring.
 */
export const qualifiedObservationSnapshots = mysqlTable("qualified_observation_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  hour: int("hour").notNull(),
  stationCount: int("stationCount").notNull(),
  confidenceScore: float("confidenceScore"),
  temperature: float("temperature"),
  humidity: float("humidity"),
  pressure: float("pressure"),
  windSpeed: float("windSpeed"),
  windGust: float("windGust"),
  precipitation: float("precipitation"),
  stationsUsed: json("stationsUsed"),
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("qualified_observation_snapshot_location_date_hour_unique").on(table.locationKey, table.date, table.hour),
]);
export type QualifiedObservationSnapshot = typeof qualifiedObservationSnapshots.$inferSelect;
export type InsertQualifiedObservationSnapshot = typeof qualifiedObservationSnapshots.$inferInsert;

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
}, (table) => [
  uniqueIndex("station_collection_snapshots_location_date_unique").on(table.locationKey, table.date),
]);

export type StationCollectionSnapshot = typeof stationCollectionSnapshots.$inferSelect;
export type InsertStationCollectionSnapshot = typeof stationCollectionSnapshots.$inferInsert;

/**
 * Per-location, per-hour execution trace for the physical-station snapshot
 * collector. This additive table keeps future collection attempts explainable
 * without rewriting historical snapshots, observations, stations or scores.
 */
export const physicalSnapshotCollectionTraces = mysqlTable("physical_snapshot_collection_traces", {
  id: int("id").autoincrement().primaryKey(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  locationName: varchar("locationName", { length: 256 }),
  date: varchar("date", { length: 10 }).notNull(),
  hour: int("hour").notNull(),
  radiusKm: int("radiusKm").notNull(),
  status: mysqlEnum("status", ["stored", "no_station", "failed"]).notNull(),
  attempts: int("attempts").notNull(),
  stationCount: int("stationCount").notNull(),
  reason: text("reason"),
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("physical_snapshot_trace_location_date_hour_unique").on(table.locationKey, table.date, table.hour),
]);

export type PhysicalSnapshotCollectionTrace = typeof physicalSnapshotCollectionTraces.$inferSelect;
export type InsertPhysicalSnapshotCollectionTrace = typeof physicalSnapshotCollectionTraces.$inferInsert;

/**
 * OAuth Netatmo connection for a MeteoAI user. Only the refresh token is
 * retained, encrypted at rest; each access token is renewed server-side.
 */
export const netatmoOAuthTokens = mysqlTable("netatmo_oauth_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  encryptedRefreshToken: text("encryptedRefreshToken").notNull(),
  scopes: varchar("scopes", { length: 256 }).notNull().default("read_station"),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NetatmoOAuthToken = typeof netatmoOAuthTokens.$inferSelect;
export type InsertNetatmoOAuthToken = typeof netatmoOAuthTokens.$inferInsert;

/** One-time OAuth states prevent callback forgery without relying on mobile cookies. */
export const netatmoOAuthStates = mysqlTable("netatmo_oauth_states", {
  stateHash: varchar("stateHash", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * User favorite locations (max 8 per user).
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
  position: int("position").notNull().default(0), // ordering 0-7
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
 * Populated by the favorites forecast schedule (05:00 default; every 4h when enabled).
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
 * Populated by the favorites forecast schedule (05:00 default; every 4h when enabled).
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
  pressure: float("pressure"), // hPa
  cloudCover: float("cloudCover"), // %
  weatherCode: int("weatherCode"), // WMO code
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
});
export type HourlyForecast = typeof hourlyForecasts.$inferSelect;
export type InsertHourlyForecast = typeof hourlyForecasts.$inferInsert;

/** Immutable per-run, per-variable archive used for leakage-safe hourly verification. */
export const hourlyForecastRunValues = mysqlTable("hourly_forecast_run_values", {
  id: int("id").autoincrement().primaryKey(),
  captureRunId: varchar("captureRunId", { length: 36 }).notNull(), // Local capture UUID; not an upstream model-run identifier.
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  targetDate: varchar("targetDate", { length: 10 }).notNull(), // Europe/Paris calendar date for lookup only.
  sourceName: varchar("sourceName", { length: 64 }).notNull(),
  modelName: varchar("modelName", { length: 64 }).notNull(),
  modelId: varchar("modelId", { length: 96 }), // Null when the upstream aggregator does not expose a specific model ID.
  requestStartedAt: bigint("requestStartedAt", { mode: "number" }).notNull(),
  availableAt: bigint("availableAt", { mode: "number" }).notNull(), // Receipt time on this application host.
  validTime: bigint("validTime", { mode: "number" }).notNull(), // Absolute UTC epoch milliseconds.
  variable: varchar("variable", { length: 32 }).notNull(),
  value: float("value"),
  unit: varchar("unit", { length: 32 }),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("hourly_run_values_identity").on(table.captureRunId, table.locationKey, table.modelName, table.validTime, table.variable),
  index("hourly_run_values_location_target_idx").on(table.locationKey, table.targetDate),
  index("hourly_run_values_series_idx").on(table.locationKey, table.modelName, table.variable, table.validTime),
]);
export type HourlyForecastRunValue = typeof hourlyForecastRunValues.$inferSelect;
export type InsertHourlyForecastRunValue = typeof hourlyForecastRunValues.$inferInsert;

/** Idempotent daily verification output, split by source/model/variable/lead-time bucket. */
export const hourlyForecastEvaluationScores = mysqlTable("hourly_forecast_evaluation_scores", {
  id: int("id").autoincrement().primaryKey(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // Physical-observation date in Europe/Paris.
  sourceName: varchar("sourceName", { length: 64 }).notNull(),
  modelName: varchar("modelName", { length: 64 }).notNull(),
  modelId: varchar("modelId", { length: 96 }),
  variable: varchar("variable", { length: 32 }).notNull(),
  horizonBucket: varchar("horizonBucket", { length: 16 }).notNull(), // Shared Phase 3 horizon key.
  observationCount: int("observationCount").notNull().default(0),
  evaluableObservationCount: int("evaluableObservationCount").notNull().default(0),
  sampleSize: int("sampleSize").notNull().default(0),
  coverageRatio: float("coverageRatio").notNull().default(0), // sampleSize / evaluableObservationCount.
  mae: float("mae"),
  rmse: float("rmse"),
  bias: float("bias"), // Forecast minus observation.
  computedAt: timestamp("computedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("hourly_eval_score_day_model_variable_horizon_unique").on(table.locationKey, table.date, table.sourceName, table.modelName, table.variable, table.horizonBucket),
  index("hourly_eval_score_location_date_idx").on(table.locationKey, table.date),
]);
export type HourlyForecastEvaluationScore = typeof hourlyForecastEvaluationScores.$inferSelect;
export type InsertHourlyForecastEvaluationScore = typeof hourlyForecastEvaluationScores.$inferInsert;

/** Per-provider scheduled collection evidence; it never participates in scoring or fusion. */
export const hourlyForecastCollectionResults = mysqlTable("hourly_forecast_collection_results", {
  id: int("id").autoincrement().primaryKey(),
  collectionJobId: int("collectionJobId").notNull(),
  scheduleRunKey: varchar("scheduleRunKey", { length: 48 }).notNull(),
  batchAttemptId: varchar("batchAttemptId", { length: 36 }).notNull(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  targetDate: varchar("targetDate", { length: 10 }).notNull(),
  modelName: varchar("modelName", { length: 64 }).notNull(),
  modelId: varchar("modelId", { length: 96 }),
  isOfficialModel: int("isOfficialModel").notNull().default(0),
  sourceName: varchar("sourceName", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["attempting", "succeeded", "partial", "failed", "safe_error"]).notNull(),
  requestAttempts: int("requestAttempts").notNull().default(0),
  hoursReceived: int("hoursReceived").notNull().default(0),
  valuesReceived: int("valuesReceived").notNull().default(0),
  expectedValueCount: int("expectedValueCount").notNull().default(0),
  archiveRowsWritten: int("archiveRowsWritten").notNull().default(0),
  projectionRowsWritten: int("projectionRowsWritten").notNull().default(0),
  errorCode: varchar("errorCode", { length: 32 }),
  attemptedAt: bigint("attemptedAt", { mode: "number" }).notNull(),
  completedAt: bigint("completedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("hourly_collection_attempt_source_unique").on(table.batchAttemptId, table.locationKey, table.modelName),
  index("hourly_collection_location_time_idx").on(table.locationKey, table.attemptedAt),
  index("hourly_collection_schedule_slot_idx").on(table.scheduleRunKey, table.locationKey),
]);
export type HourlyForecastCollectionResult = typeof hourlyForecastCollectionResults.$inferSelect;
export type InsertHourlyForecastCollectionResult = typeof hourlyForecastCollectionResults.$inferInsert;

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
  evidenceType: mysqlEnum("evidenceType", ["physical_observation", "model_reference", "legacy_unqualified"]).notNull().default("legacy_unqualified"),
  computedAt: timestamp("computedAt").defaultNow().notNull(),
});
export type LeadTimeScore = typeof leadTimeScores.$inferSelect;
export type InsertLeadTimeScore = typeof leadTimeScores.$inferInsert;

/**
 * Observations renseignées par un utilisateur pour son lieu actif.
 * Elles sont une preuve complémentaire, distincte des stations physiques.
 */
export const personalWeatherObservations = mysqlTable("personal_weather_observations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  lat: float("lat").notNull(),
  lon: float("lon").notNull(),
  observedAt: bigint("observedAt", { mode: "number" }).notNull(),
  temperature: float("temperature"),
  condition: varchar("condition", { length: 32 }).notNull(),
  windSpeed: float("windSpeed"),
  precipitation: float("precipitation"), // mm observés durant le créneau en cours
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("personal_weather_observation_user_time_unique").on(table.userId, table.locationKey, table.observedAt),
]);
export type PersonalWeatherObservation = typeof personalWeatherObservations.$inferSelect;
export type InsertPersonalWeatherObservation = typeof personalWeatherObservations.$inferInsert;

/** Une trace par modèle permet d’expliquer chaque évolution de calibration. */
export const personalModelObservationScores = mysqlTable("personal_model_observation_scores", {
  id: int("id").autoincrement().primaryKey(),
  observationId: int("observationId").notNull(),
  modelName: varchar("modelName", { length: 64 }).notNull(),
  temperatureError: float("temperatureError"),
  temperatureScore: float("temperatureScore"),
  conditionScore: float("conditionScore"),
  precipitationError: float("precipitationError"),
  precipitationScore: float("precipitationScore"),
  windScore: float("windScore"),
  overallScore: float("overallScore").notNull(),
  forecastSnapshot: json("forecastSnapshot").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("personal_model_score_observation_model_unique").on(table.observationId, table.modelName)]);
export type PersonalModelObservationScore = typeof personalModelObservationScores.$inferSelect;
export type InsertPersonalModelObservationScore = typeof personalModelObservationScores.$inferInsert;

/** État lissé par modèle, lieu et utilisateur ; jamais promu sans preuve suffisante. */
export const personalModelCalibrations = mysqlTable("personal_model_calibrations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  modelName: varchar("modelName", { length: 64 }).notNull(),
  comparisonCount: int("comparisonCount").notNull().default(0),
  scoreEma: float("scoreEma"),
  temperatureMaeEma: float("temperatureMaeEma"),
  conditionScoreEma: float("conditionScoreEma"),
  precipitationScoreEma: float("precipitationScoreEma"),
  windScoreEma: float("windScoreEma"),
  weightMultiplier: float("weightMultiplier").notNull().default(1),
  evidenceState: varchar("evidenceState", { length: 24 }).notNull().default("insufficient"),
  lastObservationAt: bigint("lastObservationAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("personal_model_calibration_user_location_model_unique").on(table.userId, table.locationKey, table.modelName),
]);
export type PersonalModelCalibration = typeof personalModelCalibrations.$inferSelect;
export type InsertPersonalModelCalibration = typeof personalModelCalibrations.$inferInsert;

/**
 * P1 shadow-only licence registry. These rows document whether a source may be
 * observed by the canonical hub; they never grant access to production fusion.
 */
export const shadowWeatherLicenses = mysqlTable("shadow_weather_licenses", {
  licenseKey: varchar("licenseKey", { length: 64 }).primaryKey(),
  label: varchar("label", { length: 128 }).notNull(),
  termsUrl: varchar("termsUrl", { length: 512 }),
  usageStatus: varchar("usageStatus", { length: 32 }).notNull(),
  attributionText: text("attributionText"),
  redistributionAllowed: int("redistributionAllowed").notNull().default(0),
  reviewedAt: bigint("reviewedAt", { mode: "number" }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ShadowWeatherLicense = typeof shadowWeatherLicenses.$inferSelect;
export type InsertShadowWeatherLicense = typeof shadowWeatherLicenses.$inferInsert;

/** Stable metadata for each source observed by P1. */
export const shadowWeatherSourceDefinitions = mysqlTable("shadow_weather_source_definitions", {
  id: int("id").autoincrement().primaryKey(),
  sourceKey: varchar("sourceKey", { length: 96 }).notNull(),
  displayName: varchar("displayName", { length: 128 }).notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  sourceFamily: varchar("sourceFamily", { length: 64 }).notNull(),
  model: varchar("model", { length: 96 }).notNull(),
  modelVersion: varchar("modelVersion", { length: 64 }),
  sourceType: varchar("sourceType", { length: 32 }).notNull(),
  sourceRole: varchar("sourceRole", { length: 32 }).notNull(),
  independenceClass: varchar("independenceClass", { length: 32 }).notNull(),
  apiIdentifier: varchar("apiIdentifier", { length: 160 }).notNull(),
  sourceUrl: varchar("sourceUrl", { length: 512 }),
  licenseKey: varchar("licenseKey", { length: 64 }).notNull(),
  nativeResolutionKm: float("nativeResolutionKm"),
  expectedUpdateMinutes: int("expectedUpdateMinutes"),
  shadowEnabled: int("shadowEnabled").notNull().default(1),
  classificationCategory: varchar("classificationCategory", { length: 32 }),
  classificationRole: varchar("classificationRole", { length: 24 }),
  classificationVersion: varchar("classificationVersion", { length: 64 }),
  classificationEvidence: json("classificationEvidence"),
  classificationAppliedToProduction: int("classificationAppliedToProduction").notNull().default(0),
  classifiedAt: bigint("classifiedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("shadow_source_definition_key_unique").on(table.sourceKey),
  index("shadow_source_definition_provider_model_idx").on(table.provider, table.model),
  index("shadow_source_definition_family_independence_idx").on(table.sourceFamily, table.independenceClass),
  index("shadow_source_definition_phase2_category_idx").on(table.classificationCategory),
  index("shadow_source_definition_phase2_applied_idx").on(table.classificationAppliedToProduction),
]);

export type ShadowWeatherSourceDefinition = typeof shadowWeatherSourceDefinitions.$inferSelect;
export type InsertShadowWeatherSourceDefinition = typeof shadowWeatherSourceDefinitions.$inferInsert;

/** One logical ingestion attempt per source, location and collection cycle. */
export const shadowWeatherIngestionRuns = mysqlTable("shadow_weather_ingestion_runs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  cycleKey: varchar("cycleKey", { length: 128 }).notNull(),
  sourceDefinitionId: int("sourceDefinitionId").notNull(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  requestStartedAt: bigint("requestStartedAt", { mode: "number" }).notNull(),
  receivedAt: bigint("receivedAt", { mode: "number" }),
  providerRunTime: bigint("providerRunTime", { mode: "number" }),
  runTimeKnown: int("runTimeKnown").notNull().default(0),
  providerAvailableAt: bigint("providerAvailableAt", { mode: "number" }),
  providerModifiedAt: bigint("providerModifiedAt", { mode: "number" }),
  runEvidenceStatus: varchar("runEvidenceStatus", { length: 32 }).notNull().default("UNKNOWN"),
  runEvidenceScope: varchar("runEvidenceScope", { length: 32 }).notNull().default("none"),
  runEvidenceObservedAt: bigint("runEvidenceObservedAt", { mode: "number" }),
  runEvidenceSourceUrl: varchar("runEvidenceSourceUrl", { length: 512 }),
  runEvidenceHash: varchar("runEvidenceHash", { length: 64 }),
  runEvidenceDetail: text("runEvidenceDetail"),
  runEvidence: json("runEvidence"),
  status: varchar("status", { length: 16 }).notNull(),
  attempts: int("attempts").notNull().default(1),
  httpStatus: int("httpStatus"),
  durationMs: int("durationMs"),
  payloadHash: varchar("payloadHash", { length: 64 }),
  rawStorageKey: varchar("rawStorageKey", { length: 512 }),
  failureClass: varchar("failureClass", { length: 48 }),
  failureReason: text("failureReason"),
  shadowMode: int("shadowMode").notNull().default(1),
  appliedToProduction: int("appliedToProduction").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("shadow_ingestion_cycle_source_location_unique").on(table.cycleKey, table.sourceDefinitionId, table.locationKey),
  index("shadow_ingestion_location_created_idx").on(table.locationKey, table.createdAt),
  index("shadow_ingestion_source_status_idx").on(table.sourceDefinitionId, table.status),
]);

export type ShadowWeatherIngestionRun = typeof shadowWeatherIngestionRuns.$inferSelect;
export type InsertShadowWeatherIngestionRun = typeof shadowWeatherIngestionRuns.$inferInsert;

/** Canonical value store. No production query may read this table during P1. */
export const shadowWeatherValues = mysqlTable("shadow_weather_values", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  ingestionRunId: bigint("ingestionRunId", { mode: "number" }).notNull(),
  sourceDefinitionId: int("sourceDefinitionId").notNull(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  latitude: float("latitude").notNull(),
  longitude: float("longitude").notNull(),
  validTime: bigint("validTime", { mode: "number" }).notNull(),
  forecastHorizonMinutes: int("forecastHorizonMinutes"),
  variable: varchar("variable", { length: 48 }).notNull(),
  value: float("value"),
  unit: varchar("unit", { length: 16 }).notNull(),
  levelKey: varchar("levelKey", { length: 32 }).notNull(),
  memberKey: varchar("memberKey", { length: 32 }).notNull().default("deterministic"),
  nativeResolutionKm: float("nativeResolutionKm"),
  qualityStatus: varchar("qualityStatus", { length: 16 }).notNull(),
  freshnessStatus: varchar("freshnessStatus", { length: 16 }).notNull(),
  missingData: int("missingData").notNull().default(0),
  confidence: float("confidence"),
  qcFlags: json("qcFlags"),
  normalizationMetadata: json("normalizationMetadata"),
  phase5QualityStatus: varchar("phase5QualityStatus", { length: 16 }),
  phase5QualityMetadata: json("phase5QualityMetadata"),
  phase5EvaluatedAt: bigint("phase5EvaluatedAt", { mode: "number" }),
  phase5AppliedToProduction: int("phase5AppliedToProduction").notNull().default(0),
  ingestedAt: bigint("ingestedAt", { mode: "number" }).notNull(),
  shadowMode: int("shadowMode").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("shadow_value_run_valid_variable_level_member_unique").on(
    table.ingestionRunId,
    table.validTime,
    table.variable,
    table.levelKey,
    table.memberKey,
  ),
  index("shadow_value_location_valid_variable_idx").on(table.locationKey, table.validTime, table.variable),
  index("shadow_value_run_quality_idx").on(table.ingestionRunId, table.qualityStatus),
  index("shadow_value_source_valid_variable_idx").on(table.sourceDefinitionId, table.validTime, table.variable),
  index("shadow_value_quality_freshness_ingested_idx").on(table.qualityStatus, table.freshnessStatus, table.ingestedAt),
  index("shadow_value_phase5_status_evaluated_idx").on(table.phase5QualityStatus, table.phase5EvaluatedAt),
  index("shadow_value_phase5_applied_idx").on(table.phase5AppliedToProduction),
]);

export type ShadowWeatherValue = typeof shadowWeatherValues.$inferSelect;
export type InsertShadowWeatherValue = typeof shadowWeatherValues.$inferInsert;

/** Candidate fusion Phase 6. Shadow-only: production never reads or writes this table. */
export const shadowWeatherPhase6Candidates = mysqlTable("shadow_weather_phase6_candidates", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  cycleKey: varchar("cycleKey", { length: 128 }).notNull(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  validTime: bigint("validTime", { mode: "number" }).notNull(),
  variable: varchar("variable", { length: 48 }).notNull(),
  phase3WindowKey: varchar("phase3WindowKey", { length: 16 }).notNull(),
  candidateStatus: varchar("candidateStatus", { length: 16 }).notNull(),
  candidateValue: float("candidateValue"),
  contributingSourceCount: int("contributingSourceCount").notNull().default(0),
  independentSourceCount: int("independentSourceCount").notNull().default(0),
  weights: json("weights").notNull(),
  referenceValues: json("referenceValues").notNull(),
  productionReadsEnabled: int("productionReadsEnabled").notNull().default(0),
  shadowMode: int("shadowMode").notNull().default(1),
  appliedToProduction: int("appliedToProduction").notNull().default(0),
  evaluatedAt: bigint("evaluatedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("shadow_phase6_candidate_cycle_location_time_variable_unique").on(
    table.cycleKey,
    table.locationKey,
    table.validTime,
    table.variable,
  ),
  index("shadow_phase6_candidate_location_status_idx").on(table.locationKey, table.candidateStatus),
  index("shadow_phase6_candidate_applied_idx").on(table.appliedToProduction),
]);

export type ShadowWeatherPhase6Candidate = typeof shadowWeatherPhase6Candidates.$inferSelect;
export type InsertShadowWeatherPhase6Candidate = typeof shadowWeatherPhase6Candidates.$inferInsert;

/**
 * Série quotidienne candidate issue des sept modèles déterministes uniquement.
 * Cette table ne peut alimenter aucune prévision publique : Best Match y reste
 * une référence de comparaison et les détails par variable sont conservés en JSON.
 */
export const shadowWeatherDailyUnifiedCandidates = mysqlTable("shadow_weather_daily_unified_candidates", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  cycleKey: varchar("cycleKey", { length: 128 }).notNull(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  forecastDate: varchar("forecastDate", { length: 10 }).notNull(),
  validTime: bigint("validTime", { mode: "number" }).notNull(),
  candidateStatus: varchar("candidateStatus", { length: 16 }).notNull(),
  deterministicSourceCount: int("deterministicSourceCount").notNull().default(0),
  expectedDeterministicSourceCount: int("expectedDeterministicSourceCount").notNull().default(7),
  variableResults: json("variableResults").notNull(),
  legacyReference: json("legacyReference").notNull(),
  bestMatchReference: json("bestMatchReference").notNull(),
  missingEvidence: json("missingEvidence").notNull(),
  productionReadsEnabled: int("productionReadsEnabled").notNull().default(0),
  shadowMode: int("shadowMode").notNull().default(1),
  appliedToProduction: int("appliedToProduction").notNull().default(0),
  evaluatedAt: bigint("evaluatedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("shadow_daily_unified_cycle_location_date_uq").on(
    table.cycleKey,
    table.locationKey,
    table.forecastDate,
  ),
  index("shadow_daily_unified_location_status_idx").on(table.locationKey, table.candidateStatus),
  index("shadow_daily_unified_applied_idx").on(table.appliedToProduction),
]);
export type ShadowWeatherDailyUnifiedCandidate = typeof shadowWeatherDailyUnifiedCandidates.$inferSelect;
export type InsertShadowWeatherDailyUnifiedCandidate = typeof shadowWeatherDailyUnifiedCandidates.$inferInsert;
/** Local performance history for Phase 7. Shadow-only: no production reader may use this table. */
export const shadowWeatherPhase7LocalPerformance = mysqlTable("shadow_weather_phase7_local_performance", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  periodKey: varchar("periodKey", { length: 64 }).notNull(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  sourceKey: varchar("sourceKey", { length: 128 }).notNull(),
  variable: varchar("variable", { length: 48 }).notNull(),
  phase3WindowKey: varchar("phase3WindowKey", { length: 16 }).notNull(),
  evidenceType: varchar("evidenceType", { length: 32 }).notNull(),
  performanceStatus: varchar("performanceStatus", { length: 16 }).notNull(),
  comparisonCount: int("comparisonCount").notNull().default(0),
  evaluatedDays: int("evaluatedDays").notNull().default(0),
  physicalComparisonCount: int("physicalComparisonCount").notNull().default(0),
  legacyComparisonCount: int("legacyComparisonCount").notNull().default(0),
  mae: float("mae"),
  rmse: float("rmse"),
  bias: float("bias"),
  lastValidTime: bigint("lastValidTime", { mode: "number" }),
  missingEvidence: json("missingEvidence"),
  productionReadsEnabled: int("productionReadsEnabled").notNull().default(0),
  shadowMode: int("shadowMode").notNull().default(1),
  appliedToProduction: int("appliedToProduction").notNull().default(0),
  evaluatedAt: bigint("evaluatedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("shadow_p7_perf_period_loc_src_var_win_uq").on(
    table.periodKey,
    table.locationKey,
    table.sourceKey,
    table.variable,
    table.phase3WindowKey,
  ),
  index("shadow_phase7_local_performance_location_status_idx").on(table.locationKey, table.performanceStatus),
  index("shadow_phase7_local_performance_source_variable_idx").on(table.sourceKey, table.variable),
  index("shadow_phase7_local_performance_applied_idx").on(table.appliedToProduction),
]);

export type ShadowWeatherPhase7LocalPerformance = typeof shadowWeatherPhase7LocalPerformance.$inferSelect;
export type InsertShadowWeatherPhase7LocalPerformance = typeof shadowWeatherPhase7LocalPerformance.$inferInsert;

/** One idempotent daily acceptance snapshot per location during P1.6. */
export const shadowWeatherObservationDays = mysqlTable("shadow_weather_observation_days", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  observationDate: varchar("observationDate", { length: 10 }).notNull(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  expectedSourceCount: int("expectedSourceCount").notNull().default(8),
  dailySourceCount: int("dailySourceCount").notNull().default(0),
  hourlySourceCount: int("hourlySourceCount").notNull().default(0),
  totalRunCount: int("totalRunCount").notNull().default(0),
  successRunCount: int("successRunCount").notNull().default(0),
  partialRunCount: int("partialRunCount").notNull().default(0),
  failedRunCount: int("failedRunCount").notNull().default(0),
  totalValueCount: int("totalValueCount").notNull().default(0),
  validValueCount: int("validValueCount").notNull().default(0),
  missingValueCount: int("missingValueCount").notNull().default(0),
  duplicateRunGroupCount: int("duplicateRunGroupCount").notNull().default(0),
  nonShadowValueCount: int("nonShadowValueCount").notNull().default(0),
  appliedToProductionCount: int("appliedToProductionCount").notNull().default(0),
  writeSuccessRate: float("writeSuccessRate").notNull().default(0),
  contractIntegrityRate: float("contractIntegrityRate").notNull().default(0),
  coverageGatePassed: int("coverageGatePassed").notNull().default(0),
  writeSuccessGatePassed: int("writeSuccessGatePassed").notNull().default(0),
  idempotenceGatePassed: int("idempotenceGatePassed").notNull().default(0),
  isolationGatePassed: int("isolationGatePassed").notNull().default(0),
  contractGatePassed: int("contractGatePassed").notNull().default(0),
  verdict: varchar("verdict", { length: 16 }).notNull().default("OBSERVING"),
  reasons: json("reasons"),
  evaluatedAt: bigint("evaluatedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("shadow_observation_date_location_unique").on(table.observationDate, table.locationKey),
  index("shadow_observation_location_date_idx").on(table.locationKey, table.observationDate),
  index("shadow_observation_verdict_date_idx").on(table.verdict, table.observationDate),
]);

export type ShadowWeatherObservationDay = typeof shadowWeatherObservationDays.$inferSelect;
export type InsertShadowWeatherObservationDay = typeof shadowWeatherObservationDays.$inferInsert;
/** Immutable administrative closure; distinct from P1.6 daily evidence and weather verdicts. */
export const shadowWeatherObservationClosures = mysqlTable("shadow_weather_observation_closures", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  closureStatus: varchar("closureStatus", { length: 24 }).notNull().default("CLOSED"),
  validatedByUserId: int("validatedByUserId").notNull(),
  validatedAt: bigint("validatedAt", { mode: "number" }).notNull(),
  evidenceSnapshot: json("evidenceSnapshot").notNull(),
  evidenceHash: varchar("evidenceHash", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("shadow_observation_closure_location_unique").on(table.locationKey),
  index("shadow_observation_closure_validator_time_idx").on(table.validatedByUserId, table.validatedAt),
]);
export type ShadowWeatherObservationClosure = typeof shadowWeatherObservationClosures.$inferSelect;
export type InsertShadowWeatherObservationClosure = typeof shadowWeatherObservationClosures.$inferInsert;
/** Documented lineage used later by P15; it has no effect on current weights. */
export const shadowWeatherSourceRelations = mysqlTable("shadow_weather_source_relations", {
  id: int("id").autoincrement().primaryKey(),
  relationKey: varchar("relationKey", { length: 128 }).notNull(),
  parentSourceId: int("parentSourceId").notNull(),
  childSourceId: int("childSourceId"),
  relationType: varchar("relationType", { length: 32 }).notNull(),
  effectiveFrom: bigint("effectiveFrom", { mode: "number" }),
  effectiveTo: bigint("effectiveTo", { mode: "number" }),
  evidence: json("evidence"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("shadow_source_relation_key_unique").on(table.relationKey),
  index("shadow_source_relation_parent_type_idx").on(table.parentSourceId, table.relationType),
]);

export type ShadowWeatherSourceRelation = typeof shadowWeatherSourceRelations.$inferSelect;
export type InsertShadowWeatherSourceRelation = typeof shadowWeatherSourceRelations.$inferInsert;


/** Metrics Phase 8. Shadow-only: no production reader may use this table. */
export const shadowWeatherPhase8Metrics = mysqlTable("shadow_weather_phase8_metrics", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  periodKey: varchar("periodKey", { length: 64 }).notNull(),
  periodStart: bigint("periodStart", { mode: "number" }).notNull(),
  periodEnd: bigint("periodEnd", { mode: "number" }).notNull(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  sourceKey: varchar("sourceKey", { length: 128 }).notNull(),
  variable: varchar("variable", { length: 48 }).notNull(),
  phase3WindowKey: varchar("phase3WindowKey", { length: 16 }).notNull(),
  metricStatus: varchar("metricStatus", { length: 16 }).notNull(),
  comparisonCount: int("comparisonCount").notNull().default(0),
  evaluatedDays: int("evaluatedDays").notNull().default(0),
  physicalComparisonCount: int("physicalComparisonCount").notNull().default(0),
  legacyComparisonCount: int("legacyComparisonCount").notNull().default(0),
  mae: float("mae"),
  rmse: float("rmse"),
  bias: float("bias"),
  medianAbsoluteError: float("medianAbsoluteError"),
  rainHitRate: float("rainHitRate"),
  rainHits: int("rainHits").notNull().default(0),
  rainMisses: int("rainMisses").notNull().default(0),
  rainFalseAlarms: int("rainFalseAlarms").notNull().default(0),
  windDirectionMeanAbsoluteError: float("windDirectionMeanAbsoluteError"),
  brierScore: float("brierScore"),
  crps: float("crps"),
  calibrationError: float("calibrationError"),
  metricAvailability: varchar("metricAvailability", { length: 32 }).notNull().default("DETERMINISTIC_ONLY"),
  missingEvidence: json("missingEvidence"),
  productionReadsEnabled: int("productionReadsEnabled").notNull().default(0),
  shadowMode: int("shadowMode").notNull().default(1),
  appliedToProduction: int("appliedToProduction").notNull().default(0),
  evaluatedAt: bigint("evaluatedAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("shadow_p8_metric_period_loc_src_var_win_uq").on(
    table.periodKey,
    table.locationKey,
    table.sourceKey,
    table.variable,
    table.phase3WindowKey,
  ),
  index("shadow_p8_metric_location_status_idx").on(table.locationKey, table.metricStatus),
  index("shadow_p8_metric_source_variable_idx").on(table.sourceKey, table.variable),
  index("shadow_p8_metric_applied_idx").on(table.appliedToProduction),
]);

export type ShadowWeatherPhase8Metric = typeof shadowWeatherPhase8Metrics.$inferSelect;
export type InsertShadowWeatherPhase8Metric = typeof shadowWeatherPhase8Metrics.$inferInsert;

/** Une ligne auditable par comparaison Phase 8, issue uniquement d’une preuve physique qualifiée. */
export const shadowWeatherPhase8Comparisons = mysqlTable("shadow_weather_phase8_comparisons", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  comparisonKey: varchar("comparisonKey", { length: 160 }).notNull(),
  locationKey: varchar("locationKey", { length: 32 }).notNull(),
  sourceKey: varchar("sourceKey", { length: 128 }).notNull(),
  variable: varchar("variable", { length: 48 }).notNull(),
  phase3WindowKey: varchar("phase3WindowKey", { length: 16 }).notNull(),
  forecastRunId: bigint("forecastRunId", { mode: "number" }).notNull(),
  forecastIssuedAt: bigint("forecastIssuedAt", { mode: "number" }).notNull(),
  forecastValidTime: bigint("forecastValidTime", { mode: "number" }).notNull(),
  forecastHorizonMinutes: int("forecastHorizonMinutes").notNull(),
  observationId: int("observationId").notNull(),
  observationDate: varchar("observationDate", { length: 10 }).notNull(),
  observationHour: int("observationHour").notNull(),
  observationAt: bigint("observationAt", { mode: "number" }).notNull(),
  observationCollectedAt: timestamp("observationCollectedAt").notNull(),
  forecastValue: float("forecastValue").notNull(),
  observedValue: float("observedValue").notNull(),
  error: float("error").notNull(),
  absoluteError: float("absoluteError").notNull(),
  observationQualityStatus: varchar("observationQualityStatus", { length: 24 }).notNull(),
  observationStationCount: int("observationStationCount").notNull(),
  observationConfidence: float("observationConfidence"),
  observationProvenance: json("observationProvenance").notNull(),
  forecastProvenance: json("forecastProvenance").notNull(),
  shadowMode: int("shadowMode").notNull().default(1),
  appliedToProduction: int("appliedToProduction").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("shadow_p8_comparison_key_uq").on(table.comparisonKey),
  index("shadow_p8_comparison_group_idx").on(table.locationKey, table.sourceKey, table.variable, table.phase3WindowKey),
  index("shadow_p8_comparison_observation_idx").on(table.observationId, table.observationAt),
  index("shadow_p8_comparison_applied_idx").on(table.appliedToProduction),
]);

export type ShadowWeatherPhase8Comparison = typeof shadowWeatherPhase8Comparisons.$inferSelect;
export type InsertShadowWeatherPhase8Comparison = typeof shadowWeatherPhase8Comparisons.$inferInsert;
