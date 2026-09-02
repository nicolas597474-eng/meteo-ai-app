import { createHash } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  shadowWeatherIngestionRuns,
  shadowWeatherLicenses,
  shadowWeatherSourceDefinitions,
  shadowWeatherSourceRelations,
  shadowWeatherValues,
  type InsertShadowWeatherIngestionRun,
  type InsertShadowWeatherValue,
} from "../drizzle/schema";
import {
  P1_SHADOW_SOURCE_DEFINITIONS,
  SHADOW_CANONICAL_VARIABLES,
  type ShadowCanonicalVariable,
  type ShadowFreshnessStatus,
  type ShadowProviderRunEvidence,
  type ShadowQualityStatus,
  type ShadowRunStatus,
} from "../shared/weatherDataHub";
import { getDb } from "./db";
import type { ForecastData } from "./weatherServices";
import {
  createUnknownRunEvidence,
  fetchProviderRunEvidenceMap,
} from "./weatherProviderRunEvidence";

export type ShadowHourlyForecast = {
  modelName: string;
  hours: Array<{
    hour: number;
    temperature: number | null;
    apparentTemperature: number | null;
    precipitation: number | null;
    windSpeed: number | null;
    windGusts: number | null;
    windDirection: number | null;
    humidity: number | null;
    pressure: number | null;
    cloudCover: number | null;
    weatherCode: number | null;
  }>;
};

export type ShadowWriteContext = {
  locationKey: string;
  latitude: number;
  longitude: number;
  targetDate: string;
  requestStartedAt: number;
  receivedAt: number;
};

export type CanonicalShadowValue = {
  validTime: number;
  forecastHorizonMinutes: null;
  variable: ShadowCanonicalVariable;
  value: number | null;
  unit: string;
  levelKey: string;
  memberKey: "deterministic";
  nativeResolutionKm: null;
  qualityStatus: ShadowQualityStatus;
  freshnessStatus: ShadowFreshnessStatus;
  missingData: 0 | 1;
  confidence: null;
  qcFlags: string[];
};

const SOURCE_KEY_BY_COLLECTOR_NAME = new Map<string, string>([
  ["AROME", "openmeteo_arome_france_hd"],
  ["ARPEGE", "openmeteo_arpege_europe"],
  ["ICON", "openmeteo_icon_eu"],
  ["ECMWF", "openmeteo_ecmwf_ifs025"],
  ["GFS", "openmeteo_gfs_seamless"],
  ["GEM", "openmeteo_gem_seamless"],
  ["UKMET", "openmeteo_ukmo_seamless"],
  ["Open-Meteo", "openmeteo_best_match"],
  ["best_match", "openmeteo_best_match"],
]);

const parisPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function getParisOffsetMs(utcGuess: number) {
  const parts = Object.fromEntries(
    parisPartsFormatter
      .formatToParts(new Date(utcGuess))
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)]),
  );
  const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return representedAsUtc - utcGuess;
}

/** Convertit un horaire civil Europe/Paris sans dépendre du fuseau du serveur. */
export function parisLocalDateTimeToEpochMs(date: string, hour: number, minute = 0): number {
  const [year, month, day] = date.split("-").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) {
    throw new Error(`Invalid Europe/Paris date-time: ${date} ${hour}:${minute}`);
  }
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let resolved = utcGuess - getParisOffsetMs(utcGuess);
  resolved = utcGuess - getParisOffsetMs(resolved);
  return resolved;
}

function toCanonicalValue(
  variable: ShadowCanonicalVariable,
  value: number | null | undefined,
  validTime: number,
  extraFlags: string[],
): CanonicalShadowValue {
  const definition = SHADOW_CANONICAL_VARIABLES[variable];
  const normalizedValue = value != null && Number.isFinite(value) ? Number(value) : null;
  return {
    validTime,
    forecastHorizonMinutes: null,
    variable,
    value: normalizedValue,
    unit: definition.unit,
    levelKey: definition.levelKey,
    memberKey: "deterministic",
    nativeResolutionKm: null,
    qualityStatus: normalizedValue == null ? "MISSING" : "VALID",
    freshnessStatus: "UNKNOWN",
    missingData: normalizedValue == null ? 1 : 0,
    confidence: null,
    qcFlags: [...extraFlags, "provider_run_time_unknown"],
  };
}

export function resolveP1ShadowSourceKey(collectorName: string): string | null {
  return SOURCE_KEY_BY_COLLECTOR_NAME.get(collectorName) ?? null;
}

export function normalizeDailyForecastToShadow(
  forecast: ForecastData,
  context: ShadowWriteContext,
): CanonicalShadowValue[] {
  const validTime = parisLocalDateTimeToEpochMs(context.targetDate, 12);
  const flags = ["daily_aggregate", "timezone_europe_paris"];
  return [
    toCanonicalValue("air_temperature_max", forecast.tempMax, validTime, flags),
    toCanonicalValue("air_temperature_min", forecast.tempMin, validTime, flags),
    toCanonicalValue("precipitation_amount", forecast.precipitation, validTime, flags),
    toCanonicalValue("wind_speed_10m", forecast.windSpeed, validTime, flags),
    toCanonicalValue("wind_gust_10m", forecast.windGust, validTime, flags),
    toCanonicalValue("relative_humidity_2m", forecast.humidity, validTime, flags),
    toCanonicalValue("cloud_cover_total", forecast.cloudCover, validTime, flags),
  ];
}

export function normalizeHourlyForecastToShadow(
  forecast: ShadowHourlyForecast,
  context: ShadowWriteContext,
): CanonicalShadowValue[] {
  const values: CanonicalShadowValue[] = [];
  for (const hour of forecast.hours) {
    const validTime = parisLocalDateTimeToEpochMs(context.targetDate, hour.hour);
    const flags = ["hourly_value", "timezone_europe_paris"];
    values.push(
      toCanonicalValue("air_temperature_2m", hour.temperature, validTime, flags),
      toCanonicalValue("apparent_temperature", hour.apparentTemperature, validTime, flags),
      toCanonicalValue("precipitation_amount", hour.precipitation, validTime, flags),
      toCanonicalValue("wind_speed_10m", hour.windSpeed, validTime, flags),
      toCanonicalValue("wind_gust_10m", hour.windGusts, validTime, flags),
      toCanonicalValue("wind_direction_10m", hour.windDirection, validTime, flags),
      toCanonicalValue("relative_humidity_2m", hour.humidity, validTime, flags),
      toCanonicalValue("air_pressure_msl", hour.pressure, validTime, [...flags, "provider_field_surface_pressure"]),
      toCanonicalValue("cloud_cover_total", hour.cloudCover, validTime, flags),
      toCanonicalValue("weather_code", hour.weatherCode, validTime, flags),
    );
  }
  return values;
}

function getRunStatus(values: CanonicalShadowValue[]): ShadowRunStatus {
  if (values.length === 0 || values.every(value => value.missingData === 1)) return "FAILED";
  if (values.some(value => value.missingData === 1)) return "PARTIAL";
  return "SUCCESS";
}

function buildPayloadHash(values: CanonicalShadowValue[]) {
  return createHash("sha256")
    .update(JSON.stringify(values.map(value => [value.validTime, value.variable, value.levelKey, value.value])))
    .digest("hex");
}

let sourceRegistryPromise: Promise<Map<string, number>> | null = null;

async function ensureP1ShadowRegistry(): Promise<Map<string, number>> {
  if (sourceRegistryPromise) return sourceRegistryPromise;
  sourceRegistryPromise = (async () => {
    const db = await getDb();
    if (!db) throw new Error("shadow_database_unavailable");
    await db.insert(shadowWeatherLicenses).values({
      licenseKey: "open_meteo_current",
      label: "Open-Meteo — attribution requise",
      termsUrl: "https://open-meteo.com/en/terms",
      usageStatus: "attribution_required",
      attributionText: "Données météorologiques fournies via Open-Meteo",
      redistributionAllowed: 1,
      reviewedAt: Date.now(),
      notes: "Registre P1 shadow uniquement; aucune promotion de données",
    }).onDuplicateKeyUpdate({
      set: { updatedAt: new Date() },
    });

    for (const source of P1_SHADOW_SOURCE_DEFINITIONS) {
      await db.insert(shadowWeatherSourceDefinitions).values({
        ...source,
        shadowEnabled: 1,
      }).onDuplicateKeyUpdate({
        set: {
          displayName: source.displayName,
          sourceFamily: source.sourceFamily,
          model: source.model,
          sourceType: source.sourceType,
          sourceRole: source.sourceRole,
          independenceClass: source.independenceClass,
          apiIdentifier: source.apiIdentifier,
          sourceUrl: source.sourceUrl,
          licenseKey: source.licenseKey,
          shadowEnabled: 1,
          updatedAt: new Date(),
        },
      });
    }

    const definitions = await db.select({
      id: shadowWeatherSourceDefinitions.id,
      sourceKey: shadowWeatherSourceDefinitions.sourceKey,
    }).from(shadowWeatherSourceDefinitions).where(eq(shadowWeatherSourceDefinitions.shadowEnabled, 1));
    const registry = new Map(definitions.map(definition => [definition.sourceKey, definition.id]));
    const bestMatchId = registry.get("openmeteo_best_match");
    if (bestMatchId) {
      await db.insert(shadowWeatherSourceRelations).values({
        relationKey: "openmeteo_best_match_unknown_lineage",
        parentSourceId: bestMatchId,
        childSourceId: null,
        relationType: "unknown_lineage",
        evidence: { reason: "Le modèle sous-jacent exact n’est pas attribué de façon certaine pour chaque lieu et chaque run" },
      }).onDuplicateKeyUpdate({
        set: { parentSourceId: bestMatchId },
      });
    }
    return registry;
  })().catch(error => {
    sourceRegistryPromise = null;
    throw error;
  });
  return sourceRegistryPromise;
}

async function persistOneShadowRun(input: {
  cycleKey: string;
  sourceKey: string;
  context: ShadowWriteContext;
  values: CanonicalShadowValue[];
  runEvidence: ShadowProviderRunEvidence;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("shadow_database_unavailable");
  const registry = await ensureP1ShadowRegistry();
  const sourceDefinitionId = registry.get(input.sourceKey);
  if (!sourceDefinitionId) throw new Error(`shadow_source_not_registered:${input.sourceKey}`);
  const status = getRunStatus(input.values);
  const runTimeKnown = input.runEvidence.status === "PROVIDER_REPORTED" ? 1 : 0;
  const run: InsertShadowWeatherIngestionRun = {
    cycleKey: input.cycleKey,
    sourceDefinitionId,
    locationKey: input.context.locationKey,
    requestStartedAt: input.context.requestStartedAt,
    receivedAt: input.context.receivedAt,
    providerRunTime: input.runEvidence.providerRunTime,
    runTimeKnown,
    providerAvailableAt: input.runEvidence.providerAvailableAt,
    providerModifiedAt: input.runEvidence.providerModifiedAt,
    runEvidenceStatus: input.runEvidence.status,
    runEvidenceScope: input.runEvidence.scope,
    runEvidenceObservedAt: input.runEvidence.observedAt,
    runEvidenceSourceUrl: input.runEvidence.sourceUrl,
    runEvidenceHash: input.runEvidence.evidenceHash,
    runEvidenceDetail: input.runEvidence.detail,
    runEvidence: input.runEvidence.evidence,
    status,
    attempts: 1,
    httpStatus: null,
    durationMs: Math.max(0, input.context.receivedAt - input.context.requestStartedAt),
    payloadHash: buildPayloadHash(input.values),
    rawStorageKey: null,
    failureClass: status === "FAILED" ? "empty_payload" : null,
    failureReason: status === "FAILED" ? "Aucune valeur canonique exploitable" : null,
    shadowMode: 1,
    appliedToProduction: 0,
  };

  return db.transaction(async tx => {
    await tx.insert(shadowWeatherIngestionRuns).values(run).onDuplicateKeyUpdate({
      set: {
        requestStartedAt: run.requestStartedAt,
        receivedAt: run.receivedAt,
        providerRunTime: run.providerRunTime,
        runTimeKnown,
        providerAvailableAt: run.providerAvailableAt,
        providerModifiedAt: run.providerModifiedAt,
        runEvidenceStatus: run.runEvidenceStatus,
        runEvidenceScope: run.runEvidenceScope,
        runEvidenceObservedAt: run.runEvidenceObservedAt,
        runEvidenceSourceUrl: run.runEvidenceSourceUrl,
        runEvidenceHash: run.runEvidenceHash,
        runEvidenceDetail: run.runEvidenceDetail,
        runEvidence: run.runEvidence,
        status: run.status,
        durationMs: run.durationMs,
        payloadHash: run.payloadHash,
        failureClass: run.failureClass,
        failureReason: run.failureReason,
        shadowMode: 1,
        appliedToProduction: 0,
        updatedAt: new Date(),
      },
    });
    const [savedRun] = await tx.select({ id: shadowWeatherIngestionRuns.id })
      .from(shadowWeatherIngestionRuns)
      .where(and(
        eq(shadowWeatherIngestionRuns.cycleKey, input.cycleKey),
        eq(shadowWeatherIngestionRuns.sourceDefinitionId, sourceDefinitionId),
        eq(shadowWeatherIngestionRuns.locationKey, input.context.locationKey),
      ))
      .limit(1);
    if (!savedRun) throw new Error("shadow_run_not_persisted");

    await tx.delete(shadowWeatherValues).where(eq(shadowWeatherValues.ingestionRunId, savedRun.id));
    const rows: InsertShadowWeatherValue[] = input.values.map(value => ({
      ingestionRunId: savedRun.id,
      sourceDefinitionId,
      locationKey: input.context.locationKey,
      latitude: input.context.latitude,
      longitude: input.context.longitude,
      validTime: value.validTime,
      forecastHorizonMinutes: value.forecastHorizonMinutes,
      variable: value.variable,
      value: value.value,
      unit: value.unit,
      levelKey: value.levelKey,
      memberKey: value.memberKey,
      nativeResolutionKm: value.nativeResolutionKm,
      qualityStatus: value.qualityStatus,
      freshnessStatus: value.freshnessStatus,
      missingData: value.missingData,
      confidence: value.confidence,
      qcFlags: value.qcFlags,
      ingestedAt: input.context.receivedAt,
      shadowMode: 1,
    }));
    for (let index = 0; index < rows.length; index += 100) {
      await tx.insert(shadowWeatherValues).values(rows.slice(index, index + 100));
    }
    return rows.length;
  });
}

export async function persistDailyForecastsToShadow(
  forecasts: ForecastData[],
  context: ShadowWriteContext,
): Promise<{ ok: boolean; sourceCount: number; valueCount: number; errors: string[] }> {
  const errors: string[] = [];
  let sourceCount = 0;
  let valueCount = 0;
  const sourceKeys = forecasts
    .map(forecast => resolveP1ShadowSourceKey(forecast.serviceName))
    .filter((sourceKey): sourceKey is string => sourceKey != null);
  const runEvidenceBySource = await fetchProviderRunEvidenceMap(sourceKeys, context.receivedAt);
  for (const forecast of forecasts) {
    const sourceKey = resolveP1ShadowSourceKey(forecast.serviceName);
    if (!sourceKey) continue;
    try {
      valueCount += await persistOneShadowRun({
        cycleKey: `daily:${context.targetDate}:v1`,
        sourceKey,
        context,
        values: normalizeDailyForecastToShadow(forecast, context),
        runEvidence: runEvidenceBySource.get(sourceKey) ?? createUnknownRunEvidence({
          observedAt: context.receivedAt,
          detail: `Aucune preuve P2 reçue pour ${sourceKey}.`,
        }),
      });
      sourceCount++;
    } catch (error) {
      errors.push(`${forecast.serviceName}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: errors.length === 0, sourceCount, valueCount, errors };
}

export async function persistHourlyForecastsToShadow(
  forecasts: ShadowHourlyForecast[],
  context: ShadowWriteContext,
): Promise<{ ok: boolean; sourceCount: number; valueCount: number; errors: string[] }> {
  const errors: string[] = [];
  let sourceCount = 0;
  let valueCount = 0;
  const sourceKeys = forecasts
    .map(forecast => resolveP1ShadowSourceKey(forecast.modelName))
    .filter((sourceKey): sourceKey is string => sourceKey != null);
  const runEvidenceBySource = await fetchProviderRunEvidenceMap(sourceKeys, context.receivedAt);
  for (const forecast of forecasts) {
    const sourceKey = resolveP1ShadowSourceKey(forecast.modelName);
    if (!sourceKey) continue;
    try {
      valueCount += await persistOneShadowRun({
        cycleKey: `hourly:${context.targetDate}:v1`,
        sourceKey,
        context,
        values: normalizeHourlyForecastToShadow(forecast, context),
        runEvidence: runEvidenceBySource.get(sourceKey) ?? createUnknownRunEvidence({
          observedAt: context.receivedAt,
          detail: `Aucune preuve P2 reçue pour ${sourceKey}.`,
        }),
      });
      sourceCount++;
    } catch (error) {
      errors.push(`${forecast.modelName}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: errors.length === 0, sourceCount, valueCount, errors };
}

/**
 * P1 invariant: a shadow failure is observable but can never interrupt the
 * existing forecast collection, persistence or fusion path.
 */
export async function executeShadowWriteSafely<T>(label: string, operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    console.warn(`[DataHubShadow] ${label} failed without affecting production:`, error);
    return null;
  }
}

export async function getShadowDataHubObservability(locationKey?: string, lookbackDays = 7) {
  const db = await getDb();
  if (!db) return null;
  const since = new Date(Date.now() - Math.max(1, lookbackDays) * 86_400_000);
  const runFilters = [gte(shadowWeatherIngestionRuns.createdAt, since)];
  if (locationKey) runFilters.push(eq(shadowWeatherIngestionRuns.locationKey, locationKey));

  const [runSummary] = await db.select({
    totalRuns: sql<number>`count(*)`,
    successRuns: sql<number>`sum(case when ${shadowWeatherIngestionRuns.status} = 'SUCCESS' then 1 else 0 end)`,
    partialRuns: sql<number>`sum(case when ${shadowWeatherIngestionRuns.status} = 'PARTIAL' then 1 else 0 end)`,
    failedRuns: sql<number>`sum(case when ${shadowWeatherIngestionRuns.status} = 'FAILED' then 1 else 0 end)`,
    appliedToProduction: sql<number>`sum(case when ${shadowWeatherIngestionRuns.appliedToProduction} = 1 then 1 else 0 end)`,
    knownProviderRuns: sql<number>`sum(case when ${shadowWeatherIngestionRuns.runTimeKnown} = 1 then 1 else 0 end)`,
    metadataEvidenceRuns: sql<number>`sum(case when ${shadowWeatherIngestionRuns.runEvidenceStatus} = 'OPEN_METEO_METADATA' then 1 else 0 end)`,
    scheduleDerivedRuns: sql<number>`sum(case when ${shadowWeatherIngestionRuns.runEvidenceStatus} = 'SCHEDULE_DERIVED' then 1 else 0 end)`,
    unknownEvidenceRuns: sql<number>`sum(case when ${shadowWeatherIngestionRuns.runEvidenceStatus} = 'UNKNOWN' then 1 else 0 end)`,
    averageDurationMs: sql<number>`avg(${shadowWeatherIngestionRuns.durationMs})`,
    firstReceivedAt: sql<number>`min(${shadowWeatherIngestionRuns.receivedAt})`,
    lastReceivedAt: sql<number>`max(${shadowWeatherIngestionRuns.receivedAt})`,
  }).from(shadowWeatherIngestionRuns).where(and(...runFilters));

  const valueRunFilter = db.select({ id: shadowWeatherIngestionRuns.id })
    .from(shadowWeatherIngestionRuns)
    .where(and(...runFilters));
  const [valueSummary] = await db.select({
    totalValues: sql<number>`count(*)`,
    validValues: sql<number>`sum(case when ${shadowWeatherValues.qualityStatus} = 'VALID' then 1 else 0 end)`,
    missingValues: sql<number>`sum(case when ${shadowWeatherValues.missingData} = 1 then 1 else 0 end)`,
  }).from(shadowWeatherValues).where(sql`${shadowWeatherValues.ingestionRunId} in (${valueRunFilter})`);

  const latestRuns = await db.select({
    sourceKey: shadowWeatherSourceDefinitions.sourceKey,
    displayName: shadowWeatherSourceDefinitions.displayName,
    sourceType: shadowWeatherSourceDefinitions.sourceType,
    status: shadowWeatherIngestionRuns.status,
    locationKey: shadowWeatherIngestionRuns.locationKey,
    cycleKey: shadowWeatherIngestionRuns.cycleKey,
    receivedAt: shadowWeatherIngestionRuns.receivedAt,
    durationMs: shadowWeatherIngestionRuns.durationMs,
    runTimeKnown: shadowWeatherIngestionRuns.runTimeKnown,
    providerRunTime: shadowWeatherIngestionRuns.providerRunTime,
    providerAvailableAt: shadowWeatherIngestionRuns.providerAvailableAt,
    providerModifiedAt: shadowWeatherIngestionRuns.providerModifiedAt,
    runEvidenceStatus: shadowWeatherIngestionRuns.runEvidenceStatus,
    runEvidenceScope: shadowWeatherIngestionRuns.runEvidenceScope,
    runEvidenceObservedAt: shadowWeatherIngestionRuns.runEvidenceObservedAt,
    runEvidenceSourceUrl: shadowWeatherIngestionRuns.runEvidenceSourceUrl,
    runEvidenceDetail: shadowWeatherIngestionRuns.runEvidenceDetail,
    appliedToProduction: shadowWeatherIngestionRuns.appliedToProduction,
  }).from(shadowWeatherIngestionRuns)
    .innerJoin(shadowWeatherSourceDefinitions, eq(shadowWeatherIngestionRuns.sourceDefinitionId, shadowWeatherSourceDefinitions.id))
    .where(and(...runFilters))
    .orderBy(desc(shadowWeatherIngestionRuns.createdAt))
    .limit(64);

  const firstReceivedAt = runSummary?.firstReceivedAt == null ? null : Number(runSummary.firstReceivedAt);
  const observationDaysElapsed = firstReceivedAt == null
    ? 0
    : Math.min(7, Math.max(1, Math.floor((Date.now() - firstReceivedAt) / 86_400_000) + 1));

  return {
    mode: "shadow" as const,
    productionReadsEnabled: false,
    sourceCount: P1_SHADOW_SOURCE_DEFINITIONS.length,
    lookbackDays: Math.max(1, lookbackDays),
    runs: {
      total: Number(runSummary?.totalRuns ?? 0),
      success: Number(runSummary?.successRuns ?? 0),
      partial: Number(runSummary?.partialRuns ?? 0),
      failed: Number(runSummary?.failedRuns ?? 0),
      appliedToProduction: Number(runSummary?.appliedToProduction ?? 0),
      knownProviderRuns: Number(runSummary?.knownProviderRuns ?? 0),
      metadataEvidenceRuns: Number(runSummary?.metadataEvidenceRuns ?? 0),
      scheduleDerivedRuns: Number(runSummary?.scheduleDerivedRuns ?? 0),
      unknownEvidenceRuns: Number(runSummary?.unknownEvidenceRuns ?? 0),
      averageDurationMs: runSummary?.averageDurationMs == null ? null : Number(runSummary.averageDurationMs),
      firstReceivedAt,
      lastReceivedAt: runSummary?.lastReceivedAt == null ? null : Number(runSummary.lastReceivedAt),
    },
    observation: {
      requiredDays: 7,
      elapsedDays: observationDaysElapsed,
      remainingDays: Math.max(0, 7 - observationDaysElapsed),
      complete: observationDaysElapsed >= 7,
    },
    values: {
      total: Number(valueSummary?.totalValues ?? 0),
      valid: Number(valueSummary?.validValues ?? 0),
      missing: Number(valueSummary?.missingValues ?? 0),
    },
    latestRuns,
  };
}
