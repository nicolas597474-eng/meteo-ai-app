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
  PHASE2_SHADOW_SOURCE_CLASSIFICATIONS,
  PHASE2_SOURCE_CATEGORIES,
  PHASE3_HORIZON_STRATEGY_VERSION,
  PHASE3_HORIZON_WINDOWS,
  PHASE4_NORMALIZATION_VERSION,
  PHASE5_QUALITY_CONTROL_VERSION,
  P1_SHADOW_SOURCE_DEFINITIONS,
  SHADOW_CANONICAL_VARIABLES,
  evaluatePhase5QualityControl,
  normalizePhase4WeatherValue,
  type Phase4NormalizationMetadata,
  type Phase5QualityControlMetadata,
  type ShadowCanonicalVariable,
  type ShadowFreshnessStatus,
  type ShadowProviderRunEvidence,
  type ShadowQualityStatus,
  type ShadowRunStatus,
} from "../shared/weatherDataHub";
import { getDb } from "./db";
import type { ForecastData, HourlyModelForecast } from "./weatherServices";
import {
  createUnknownRunEvidence,
  fetchProviderRunEvidenceMap,
} from "./weatherProviderRunEvidence";
import { getP1ObservationWindow } from "./weatherP1Observation";

export type ShadowHourlyForecast = HourlyModelForecast;

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
  forecastHorizonMinutes: number | null;
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
  normalizationMetadata: Phase4NormalizationMetadata;
  phase5QualityStatus: ShadowQualityStatus | null;
  phase5QualityMetadata: Phase5QualityControlMetadata | null;
  phase5EvaluatedAt: number | null;
  phase5AppliedToProduction: 0;
};

export type Phase3ShadowHorizonValue = {
  sourceKey: string;
  displayName: string;
  category: string | null;
  independenceClass: string;
  forecastHorizonMinutes: number | null;
  validTime?: number | null;
  receivedAt?: number | null;
  missingData: number;
  qualityStatus: string;
  appliedToProduction: number;
};

export function buildPhase3HorizonHierarchyReport(rows: Phase3ShadowHorizonValue[]) {
  const rowsWithResolvedHorizon = rows.map(row => {
    if (row.forecastHorizonMinutes != null) return row;
    if (row.validTime == null || row.receivedAt == null) return row;
    const derivedHorizonMinutes = Math.round((Number(row.validTime) - Number(row.receivedAt)) / 60_000);
    return {
      ...row,
      forecastHorizonMinutes: derivedHorizonMinutes >= 0 && derivedHorizonMinutes <= 21_600
        ? derivedHorizonMinutes
        : null,
    };
  });
  const appliedToProduction = rows.reduce((total, row) => total + Number(row.appliedToProduction === 1), 0);
  const windows = PHASE3_HORIZON_WINDOWS.map(window => {
    const windowRows = rowsWithResolvedHorizon.filter(row => {
      const horizon = row.forecastHorizonMinutes;
      if (horizon == null || !Number.isFinite(horizon)) return false;
      const isLastWindow = window.key === "7_15d";
      return horizon >= window.minMinutes && (isLastWindow ? horizon <= window.maxMinutes : horizon < window.maxMinutes);
    });
    const validSourceKeys = new Set(
      windowRows
        .filter(row => row.missingData === 0 && row.qualityStatus === "VALID")
        .map(row => row.sourceKey),
    );
    const availablePrioritySourceKeys = window.prioritySourceKeys.filter(sourceKey => validSourceKeys.has(sourceKey));
    const availableContextSourceKeys = window.contextSourceKeys.filter(sourceKey => validSourceKeys.has(sourceKey));
    const availableDerivedReferenceSourceKeys = window.derivedReferenceSourceKeys.filter(sourceKey => validSourceKeys.has(sourceKey));
    const availableCapabilities = new Set<string>();
    const availableIndependentSourceKeys = [...availablePrioritySourceKeys, ...availableContextSourceKeys];
    if (availableIndependentSourceKeys.length > 0) availableCapabilities.add("DETERMINISTIC");
    const missingCapabilities = window.requiredCapabilities.filter(capability => !availableCapabilities.has(capability));
    const availableRequiredCapabilityCount = window.requiredCapabilities.length - missingCapabilities.length;
    const status: "COMPLETE" | "PARTIAL" | "UNAVAILABLE" = availableRequiredCapabilityCount === 0
      ? "UNAVAILABLE"
      : missingCapabilities.length > 0
        ? "PARTIAL"
        : "COMPLETE";
    const sourceNames = new Map(
      rowsWithResolvedHorizon.map(row => [row.sourceKey, row.displayName]),
    );
    return {
      key: window.key,
      label: window.label,
      minMinutes: window.minMinutes,
      maxMinutes: window.maxMinutes,
      status,
      uncertaintyRequired: window.uncertaintyRequired,
      requiredCapabilities: [...window.requiredCapabilities],
      availableCapabilities: Array.from(availableCapabilities),
      missingCapabilities,
      availablePrioritySources: availablePrioritySourceKeys.map(sourceKey => ({
        sourceKey,
        displayName: sourceNames.get(sourceKey) ?? sourceKey,
      })),
      availableContextSources: availableContextSourceKeys.map(sourceKey => ({
        sourceKey,
        displayName: sourceNames.get(sourceKey) ?? sourceKey,
      })),
      derivedReferences: availableDerivedReferenceSourceKeys.map(sourceKey => ({
        sourceKey,
        displayName: sourceNames.get(sourceKey) ?? sourceKey,
        independent: false as const,
      })),
      validValueCount: windowRows.filter(row => row.missingData === 0 && row.qualityStatus === "VALID").length,
      appliedToProduction: 0 as const,
    };
  });
  const knownHorizonValueCount = rowsWithResolvedHorizon.filter(row => row.forecastHorizonMinutes != null).length;
  return {
    version: PHASE3_HORIZON_STRATEGY_VERSION,
    horizonBasis: "ingestion_received_at" as const,
    horizonBasisDetail: "Échéance calculée depuis la réception du payload, jamais présentée comme l’heure réelle du run fournisseur.",
    windowCount: windows.length,
    knownHorizonValueCount,
    unknownHorizonValueCount: rows.length - knownHorizonValueCount,
    appliedToProduction,
    productionReadsEnabled: false as const,
    valid: windows.length === 6
      && appliedToProduction === 0
      && windows.every(window => window.appliedToProduction === 0)
      && windows.every(window => window.derivedReferences.every(reference => reference.independent === false)),
    windows,
  };
}

export type Phase4ShadowNormalizationValue = {
  variable: string;
  unit: string;
  normalizationMetadata: unknown;
  missingData: number;
  shadowMode: number;
  appliedToProduction: number;
};

function parsePhase4NormalizationMetadata(value: unknown): Phase4NormalizationMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Partial<Phase4NormalizationMetadata>;
  if (metadata.version !== PHASE4_NORMALIZATION_VERSION) return null;
  if (!metadata.status || !Array.isArray(metadata.issues)) return null;
  return metadata as Phase4NormalizationMetadata;
}

export function buildPhase4NormalizationReport(rows: Phase4ShadowNormalizationValue[]) {
  const appliedToProduction = rows.reduce((total, row) => total + Number(row.appliedToProduction === 1), 0);
  const nonShadowValueCount = rows.filter(row => row.shadowMode !== 1).length;
  let normalizationAppliedToProduction = 0;
  const issueCounts = new Map<string, number>();
  const variables = Object.entries(SHADOW_CANONICAL_VARIABLES).map(([variable, definition]) => {
    const variableRows = rows.filter(row => row.variable === variable);
    const metadataRows = variableRows.map(row => ({ row, metadata: parsePhase4NormalizationMetadata(row.normalizationMetadata) }));
    const normalizedValueCount = metadataRows.filter(item => item.metadata?.status === "NORMALIZED").length;
    const missingValueCount = metadataRows.filter(item => item.metadata?.status === "MISSING").length;
    const issueValueCount = metadataRows.filter(item => item.metadata?.status === "ISSUES").length;
    const legacyValueCount = metadataRows.filter(item => item.metadata == null).length;
    const sourceUnits = new Set<string>();
    const conversions = new Map<string, number>();
    const variableIssues = new Map<string, number>();
    let canonicalUnitMismatchCount = 0;
    for (const { row, metadata } of metadataRows) {
      if (!metadata) continue;
      if (metadata.sourceUnit) sourceUnits.add(metadata.sourceUnit);
      conversions.set(metadata.conversion, (conversions.get(metadata.conversion) ?? 0) + 1);
      if (metadata.canonicalUnit !== definition.unit || row.unit !== definition.unit) canonicalUnitMismatchCount++;
      normalizationAppliedToProduction += Number(
        (metadata as unknown as { appliedToProduction?: number }).appliedToProduction === 1,
      );
      if (metadata.status === "ISSUES") {
        for (const issue of metadata.issues) {
          variableIssues.set(issue, (variableIssues.get(issue) ?? 0) + 1);
          issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
        }
      }
    }
    const status: "NORMALIZED" | "PARTIAL" | "LEGACY_ONLY" | "NO_INGESTION" = variableRows.length === 0
      ? "NO_INGESTION"
      : legacyValueCount === variableRows.length
        ? "LEGACY_ONLY"
        : legacyValueCount === 0 && issueValueCount === 0 && canonicalUnitMismatchCount === 0
          ? "NORMALIZED"
          : "PARTIAL";
    return {
      variable,
      canonicalUnit: definition.unit,
      levelKey: definition.levelKey,
      status,
      totalValueCount: variableRows.length,
      normalizedValueCount,
      missingValueCount,
      issueValueCount,
      legacyValueCount,
      canonicalUnitMismatchCount,
      sourceUnits: Array.from(sourceUnits).sort(),
      conversions: Array.from(conversions.entries())
        .map(([conversion, count]) => ({ conversion, count }))
        .sort((left, right) => right.count - left.count || left.conversion.localeCompare(right.conversion)),
      issues: Array.from(variableIssues.entries())
        .map(([issue, count]) => ({ issue, count }))
        .sort((left, right) => right.count - left.count || left.issue.localeCompare(right.issue)),
      appliedToProduction: 0 as const,
    };
  });
  const normalizedValueCount = variables.reduce((total, variable) => total + variable.normalizedValueCount, 0);
  const missingValueCount = variables.reduce((total, variable) => total + variable.missingValueCount, 0);
  const issueValueCount = variables.reduce((total, variable) => total + variable.issueValueCount, 0);
  const legacyValueCount = variables.reduce((total, variable) => total + variable.legacyValueCount, 0);
  const canonicalUnitMismatchCount = variables.reduce((total, variable) => total + variable.canonicalUnitMismatchCount, 0);
  return {
    version: PHASE4_NORMALIZATION_VERSION,
    expectedVariableCount: variables.length,
    ingestedVariableCount: variables.filter(variable => variable.totalValueCount > 0).length,
    normalizedValueCount,
    missingValueCount,
    issueValueCount,
    legacyValueCount,
    canonicalUnitMismatchCount,
    appliedToProduction,
    normalizationAppliedToProduction,
    nonShadowValueCount,
    productionReadsEnabled: false as const,
    valid: appliedToProduction === 0
      && normalizationAppliedToProduction === 0
      && nonShadowValueCount === 0
      && canonicalUnitMismatchCount === 0,
    issues: Array.from(issueCounts.entries())
      .map(([issue, count]) => ({ issue, count }))
      .sort((left, right) => right.count - left.count || left.issue.localeCompare(right.issue)),
    variables,
  };
}

export type Phase5ShadowQualityValue = {
  ingestionRunId: number;
  sourceKey: string;
  displayName: string;
  cycleKey: string;
  runStatus: ShadowRunStatus;
  receivedAt: number;
  latitude: number;
  longitude: number;
  validTime: number;
  variable: ShadowCanonicalVariable;
  value: number | null;
  levelKey: string;
  memberKey: string;
  missingData: number;
  normalizationMetadata: unknown;
  phase5QualityStatus: string | null;
  phase5QualityMetadata: unknown;
  phase5EvaluatedAt: number | null;
  phase5AppliedToProduction: number;
  shadowMode: number;
  runAppliedToProduction: number;
};

function parsePhase5QualityMetadata(value: unknown): Phase5QualityControlMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Partial<Phase5QualityControlMetadata>;
  if (metadata.version !== PHASE5_QUALITY_CONTROL_VERSION || !metadata.status || !Array.isArray(metadata.rules)) return null;
  return metadata as Phase5QualityControlMetadata;
}

function emptyPhase5StatusCounts() {
  return { VALID: 0, SUSPECT: 0, INVALID: 0, MISSING: 0, STALE: 0 };
}

export function buildPhase5QualityControlReport(rows: Phase5ShadowQualityValue[], evaluatedAt = Date.now()) {
  const duplicateCounts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.ingestionRunId}|${row.validTime}|${row.variable}|${row.levelKey}|${row.memberKey}`;
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  }
  const previousBySeries = new Map<string, Phase5ShadowQualityValue>();
  const evaluations = [...rows]
    .sort((left, right) => left.validTime - right.validTime || left.variable.localeCompare(right.variable))
    .map(row => {
      const key = `${row.ingestionRunId}|${row.validTime}|${row.variable}|${row.levelKey}|${row.memberKey}`;
      const seriesKey = `${row.ingestionRunId}|${row.variable}|${row.levelKey}|${row.memberKey}`;
      const previous = previousBySeries.get(seriesKey);
      const qc = evaluatePhase5QualityControl({
        variable: row.variable,
        value: row.value,
        missingData: row.missingData === 1 ? 1 : 0,
        validTime: row.validTime,
        receivedAt: row.receivedAt,
        evaluatedAt,
        latitude: row.latitude,
        longitude: row.longitude,
        aggregation: row.cycleKey.startsWith("daily:") ? "daily" : "hourly",
        runStatus: row.runStatus,
        duplicateCount: duplicateCounts.get(key) ?? 1,
        normalizationMetadata: parsePhase4NormalizationMetadata(row.normalizationMetadata),
        previousValue: previous?.value,
        previousValidTime: previous?.validTime,
      });
      if (row.value != null) previousBySeries.set(seriesKey, row);
      return { row, qc };
    });

  const counts = emptyPhase5StatusCounts();
  const freshnessCounts = { FRESH: 0, AGING: 0, STALE: 0, UNKNOWN: 0 };
  const ruleCounts = new Map<string, number>();
  for (const { qc } of evaluations) {
    counts[qc.status]++;
    freshnessCounts[qc.metadata.freshnessStatus]++;
    for (const rule of qc.metadata.rules) ruleCounts.set(rule, (ruleCounts.get(rule) ?? 0) + 1);
  }

  const byVariable = Array.from(new Set(rows.map(row => row.variable))).sort().map(variable => {
    const variableCounts = emptyPhase5StatusCounts();
    for (const { row, qc } of evaluations) if (row.variable === variable) variableCounts[qc.status]++;
    return { variable, total: Object.values(variableCounts).reduce((total, count) => total + count, 0), counts: variableCounts };
  });
  const sources = P1_SHADOW_SOURCE_DEFINITIONS.map(source => {
    const sourceEvaluations = evaluations.filter(item => item.row.sourceKey === source.sourceKey);
    const sourceCounts = emptyPhase5StatusCounts();
    for (const { qc } of sourceEvaluations) sourceCounts[qc.status]++;
    return {
      sourceKey: source.sourceKey,
      displayName: source.displayName,
      available: sourceEvaluations.length > 0,
      total: sourceEvaluations.length,
      counts: sourceCounts,
      latestReceivedAt: sourceEvaluations.reduce<number | null>((latest, item) => latest == null || item.row.receivedAt > latest ? item.row.receivedAt : latest, null),
    };
  });

  const duplicateGroupCount = Array.from(duplicateCounts.values()).filter(count => count > 1).length;
  const distinctRuns = new Map(rows.map(row => [row.ingestionRunId, row]));
  const partialRunCount = Array.from(distinctRuns.values()).filter(row => row.runStatus === "PARTIAL").length;
  const failedRunCount = Array.from(distinctRuns.values()).filter(row => row.runStatus === "FAILED").length;
  const storedPhase5ValueCount = rows.filter(row => parsePhase5QualityMetadata(row.phase5QualityMetadata) != null).length;
  const appliedToProduction = rows.filter(row => row.phase5AppliedToProduction === 1 || row.runAppliedToProduction === 1).length;
  const metadataAppliedToProduction = rows.filter(row => {
    const metadata = parsePhase5QualityMetadata(row.phase5QualityMetadata);
    return (metadata as unknown as { appliedToProduction?: number } | null)?.appliedToProduction === 1;
  }).length;
  const nonShadowValueCount = rows.filter(row => row.shadowMode !== 1).length;

  return {
    version: PHASE5_QUALITY_CONTROL_VERSION,
    evaluatedAt,
    totalValueCount: rows.length,
    dynamicallyEvaluatedValueCount: evaluations.length,
    storedPhase5ValueCount,
    legacyValueCount: rows.length - storedPhase5ValueCount,
    counts,
    freshnessCounts,
    usableInShadowCount: counts.VALID + counts.SUSPECT,
    excludedFromPhase5ShadowCount: counts.INVALID + counts.MISSING + counts.STALE,
    partialRunCount,
    failedRunCount,
    duplicateGroupCount,
    unavailableSourceCount: sources.filter(source => !source.available).length,
    appliedToProduction,
    metadataAppliedToProduction,
    nonShadowValueCount,
    productionReadsEnabled: false as const,
    valid: evaluations.length === rows.length
      && appliedToProduction === 0
      && metadataAppliedToProduction === 0
      && nonShadowValueCount === 0,
    rules: Array.from(ruleCounts.entries())
      .map(([rule, count]) => ({ rule, count }))
      .sort((left, right) => right.count - left.count || left.rule.localeCompare(right.rule)),
    byVariable,
    sources,
  };
}

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
  receivedAt: number,
  extraFlags: string[],
  sourceUnit: string | null,
  sourceTimezone: string | null,
  context: Pick<ShadowWriteContext, "latitude" | "longitude">,
): CanonicalShadowValue {
  const definition = SHADOW_CANONICAL_VARIABLES[variable];
  const normalization = normalizePhase4WeatherValue({
    variable,
    value,
    sourceUnit,
    sourceTimezone,
    latitude: context.latitude,
    longitude: context.longitude,
    validTime,
    nativeResolutionKm: null,
  });
  const normalizedValue = normalization.value;
  const rawHorizonMinutes = Math.round((validTime - receivedAt) / 60_000);
  const forecastHorizonMinutes = rawHorizonMinutes >= 0 && rawHorizonMinutes <= 21_600
    ? rawHorizonMinutes
    : null;
  return {
    validTime,
    forecastHorizonMinutes,
    variable,
    value: normalizedValue,
    unit: definition.unit,
    levelKey: definition.levelKey,
    memberKey: "deterministic",
    nativeResolutionKm: null,
    qualityStatus: normalizedValue == null ? "MISSING" : normalization.metadata.status === "NORMALIZED" ? "VALID" : "SUSPECT",
    freshnessStatus: "UNKNOWN",
    missingData: normalizedValue == null ? 1 : 0,
    confidence: null,
    qcFlags: [
      ...extraFlags,
      "provider_run_time_unknown",
      forecastHorizonMinutes == null ? "outside_phase3_horizon" : "horizon_from_ingestion_time",
      `phase4:${normalization.metadata.version}`,
      `phase4_status:${normalization.metadata.status}`,
      ...normalization.metadata.issues.map(issue => `phase4_issue:${issue}`),
    ],
    normalizationMetadata: normalization.metadata,
    phase5QualityStatus: null,
    phase5QualityMetadata: null,
    phase5EvaluatedAt: null,
    phase5AppliedToProduction: 0,
  };
}

function applyPhase5QualityControlToValues(
  values: CanonicalShadowValue[],
  context: ShadowWriteContext,
): CanonicalShadowValue[] {
  const runStatus = getRunStatus(values);
  const duplicateCounts = new Map<string, number>();
  for (const value of values) {
    const key = `${value.validTime}|${value.variable}|${value.levelKey}|${value.memberKey}`;
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  }
  const previousBySeries = new Map<string, CanonicalShadowValue>();
  return values.map(value => {
    const key = `${value.validTime}|${value.variable}|${value.levelKey}|${value.memberKey}`;
    const seriesKey = `${value.variable}|${value.levelKey}|${value.memberKey}`;
    const previous = previousBySeries.get(seriesKey);
    const qc = evaluatePhase5QualityControl({
      variable: value.variable,
      value: value.value,
      missingData: value.missingData,
      validTime: value.validTime,
      receivedAt: context.receivedAt,
      evaluatedAt: context.receivedAt,
      latitude: context.latitude,
      longitude: context.longitude,
      aggregation: value.qcFlags.includes("daily_aggregate") ? "daily" : "hourly",
      runStatus,
      duplicateCount: duplicateCounts.get(key) ?? 1,
      normalizationMetadata: value.normalizationMetadata,
      previousValue: previous?.value,
      previousValidTime: previous?.validTime,
    });
    if (value.value != null) previousBySeries.set(seriesKey, value);
    return {
      ...value,
      phase5QualityStatus: qc.status,
      phase5QualityMetadata: qc.metadata,
      phase5EvaluatedAt: qc.metadata.evaluatedAt,
      phase5AppliedToProduction: 0 as const,
      qcFlags: [
        ...value.qcFlags,
        `phase5:${PHASE5_QUALITY_CONTROL_VERSION}`,
        `phase5_status:${qc.status}`,
        ...qc.metadata.rules.map(rule => `phase5_rule:${rule}`),
      ],
    };
  });
}

function getDailyArrayValue(daily: Record<string, unknown>, key: string, index: number) {
  const values = daily[key];
  if (!Array.isArray(values)) return undefined;
  const value = values[index];
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function resolveP1ShadowSourceKey(collectorName: string): string | null {
  return SOURCE_KEY_BY_COLLECTOR_NAME.get(collectorName) ?? null;
}

export function normalizeDailyForecastToShadow(
  forecast: ForecastData,
  context: ShadowWriteContext,
): CanonicalShadowValue[] {
  const rawData = forecast.rawData && typeof forecast.rawData === "object"
    ? forecast.rawData as Record<string, unknown>
    : null;
  const daily = rawData?.daily && typeof rawData.daily === "object"
    ? rawData.daily as Record<string, unknown>
    : null;
  const dailyUnits = rawData?.daily_units && typeof rawData.daily_units === "object"
    ? rawData.daily_units as Record<string, unknown>
    : null;
  const sourceTimezone = typeof rawData?.timezone === "string" ? rawData.timezone : null;
  const sourceUnit = (key: string) => dailyUnits && typeof dailyUnits[key] === "string" ? dailyUnits[key] as string : null;
  const dates = daily && Array.isArray(daily.time)
    ? daily.time.filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    : [];
  const candidates = dates.length > 0
    ? dates.map((date, index) => ({
      date,
      tempMax: getDailyArrayValue(daily!, "temperature_2m_max", index),
      tempMin: getDailyArrayValue(daily!, "temperature_2m_min", index),
      precipitation: getDailyArrayValue(daily!, "precipitation_sum", index),
      windSpeed: getDailyArrayValue(daily!, "wind_speed_10m_max", index),
      windGust: getDailyArrayValue(daily!, "wind_gusts_10m_max", index),
      humidity: getDailyArrayValue(daily!, "relative_humidity_2m_mean", index),
      cloudCover: getDailyArrayValue(daily!, "cloud_cover_mean", index),
    }))
    : [{
      date: context.targetDate,
      tempMax: forecast.tempMax,
      tempMin: forecast.tempMin,
      precipitation: forecast.precipitation,
      windSpeed: forecast.windSpeed,
      windGust: forecast.windGust,
      humidity: forecast.humidity,
      cloudCover: forecast.cloudCover,
    }];
  const values: CanonicalShadowValue[] = [];
  for (const candidate of candidates) {
    const validTime = parisLocalDateTimeToEpochMs(candidate.date, 12);
    const horizonMinutes = Math.round((validTime - context.receivedAt) / 60_000);
    if (horizonMinutes < 0 || horizonMinutes > PHASE3_HORIZON_WINDOWS.at(-1)!.maxMinutes) continue;
    const flags = ["daily_aggregate", "timezone_europe_paris", "phase3_horizon"];
    values.push(
      toCanonicalValue("air_temperature_max", candidate.tempMax, validTime, context.receivedAt, flags, sourceUnit("temperature_2m_max"), sourceTimezone, context),
      toCanonicalValue("air_temperature_min", candidate.tempMin, validTime, context.receivedAt, flags, sourceUnit("temperature_2m_min"), sourceTimezone, context),
      toCanonicalValue("precipitation_amount", candidate.precipitation, validTime, context.receivedAt, flags, sourceUnit("precipitation_sum"), sourceTimezone, context),
      toCanonicalValue("wind_speed_10m", candidate.windSpeed, validTime, context.receivedAt, flags, sourceUnit("wind_speed_10m_max"), sourceTimezone, context),
      toCanonicalValue("wind_gust_10m", candidate.windGust, validTime, context.receivedAt, flags, sourceUnit("wind_gusts_10m_max"), sourceTimezone, context),
      toCanonicalValue("relative_humidity_2m", candidate.humidity, validTime, context.receivedAt, flags, sourceUnit("relative_humidity_2m_mean"), sourceTimezone, context),
      toCanonicalValue("cloud_cover_total", candidate.cloudCover, validTime, context.receivedAt, flags, sourceUnit("cloud_cover_mean"), sourceTimezone, context),
    );
  }
  return applyPhase5QualityControlToValues(values, context);
}

export function normalizeHourlyForecastToShadow(
  forecast: ShadowHourlyForecast,
  context: ShadowWriteContext,
): CanonicalShadowValue[] {
  const values: CanonicalShadowValue[] = [];
  const sourceTimezone = forecast.sourceMetadata?.timezone ?? null;
  const units = forecast.sourceMetadata?.units;
  for (const hour of forecast.hours) {
    const validTime = parisLocalDateTimeToEpochMs(context.targetDate, hour.hour);
    const flags = ["hourly_value", "timezone_europe_paris"];
    values.push(
      toCanonicalValue("air_temperature_2m", hour.temperature, validTime, context.receivedAt, flags, units?.temperature ?? null, sourceTimezone, context),
      toCanonicalValue("apparent_temperature", hour.apparentTemperature, validTime, context.receivedAt, flags, units?.apparentTemperature ?? null, sourceTimezone, context),
      toCanonicalValue("precipitation_amount", hour.precipitation, validTime, context.receivedAt, flags, units?.precipitation ?? null, sourceTimezone, context),
      toCanonicalValue("wind_speed_10m", hour.windSpeed, validTime, context.receivedAt, flags, units?.windSpeed ?? null, sourceTimezone, context),
      toCanonicalValue("wind_gust_10m", hour.windGusts, validTime, context.receivedAt, flags, units?.windGusts ?? null, sourceTimezone, context),
      toCanonicalValue("wind_direction_10m", hour.windDirection, validTime, context.receivedAt, flags, units?.windDirection ?? null, sourceTimezone, context),
      toCanonicalValue("relative_humidity_2m", hour.humidity, validTime, context.receivedAt, flags, units?.humidity ?? null, sourceTimezone, context),
      toCanonicalValue("air_pressure_surface", hour.pressure, validTime, context.receivedAt, flags, units?.pressure ?? null, sourceTimezone, context),
      toCanonicalValue("cloud_cover_total", hour.cloudCover, validTime, context.receivedAt, flags, units?.cloudCover ?? null, sourceTimezone, context),
      toCanonicalValue("weather_code", hour.weatherCode, validTime, context.receivedAt, flags, units?.weatherCode ?? null, sourceTimezone, context),
    );
  }
  return applyPhase5QualityControlToValues(values, context);
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

    const phase2BySourceKey = new Map(
      PHASE2_SHADOW_SOURCE_CLASSIFICATIONS.map(classification => [classification.sourceKey, classification]),
    );
    const classifiedAt = Date.now();
    for (const source of P1_SHADOW_SOURCE_DEFINITIONS) {
      const classification = phase2BySourceKey.get(source.sourceKey);
      if (!classification) throw new Error(`missing_phase2_classification:${source.sourceKey}`);
      await db.insert(shadowWeatherSourceDefinitions).values({
        ...source,
        shadowEnabled: 1,
        classificationCategory: classification.category,
        classificationRole: classification.role,
        classificationVersion: classification.evidence.version,
        classificationEvidence: classification.evidence,
        classificationAppliedToProduction: classification.appliedToProduction,
        classifiedAt,
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
          classificationCategory: classification.category,
          classificationRole: classification.role,
          classificationVersion: classification.evidence.version,
          classificationEvidence: classification.evidence,
          classificationAppliedToProduction: classification.appliedToProduction,
          classifiedAt,
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
      normalizationMetadata: value.normalizationMetadata,
      phase5QualityStatus: value.phase5QualityStatus,
      phase5QualityMetadata: value.phase5QualityMetadata,
      phase5EvaluatedAt: value.phase5EvaluatedAt,
      phase5AppliedToProduction: value.phase5AppliedToProduction,
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
          detail: `Aucune preuve de run Phase 17 reçue pour ${sourceKey}.`,
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
          detail: `Aucune preuve de run Phase 17 reçue pour ${sourceKey}.`,
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
  await ensureP1ShadowRegistry();
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

  const classifiedSources = await db.select({
    sourceKey: shadowWeatherSourceDefinitions.sourceKey,
    displayName: shadowWeatherSourceDefinitions.displayName,
    sourceFamily: shadowWeatherSourceDefinitions.sourceFamily,
    independenceClass: shadowWeatherSourceDefinitions.independenceClass,
    category: shadowWeatherSourceDefinitions.classificationCategory,
    role: shadowWeatherSourceDefinitions.classificationRole,
    version: shadowWeatherSourceDefinitions.classificationVersion,
    evidence: shadowWeatherSourceDefinitions.classificationEvidence,
    appliedToProduction: shadowWeatherSourceDefinitions.classificationAppliedToProduction,
    classifiedAt: shadowWeatherSourceDefinitions.classifiedAt,
  }).from(shadowWeatherSourceDefinitions)
    .where(eq(shadowWeatherSourceDefinitions.shadowEnabled, 1))
    .orderBy(shadowWeatherSourceDefinitions.displayName);

  const horizonValues = await db.select({
    ingestionRunId: shadowWeatherValues.ingestionRunId,
    sourceKey: shadowWeatherSourceDefinitions.sourceKey,
    displayName: shadowWeatherSourceDefinitions.displayName,
    category: shadowWeatherSourceDefinitions.classificationCategory,
    independenceClass: shadowWeatherSourceDefinitions.independenceClass,
    cycleKey: shadowWeatherIngestionRuns.cycleKey,
    runStatus: shadowWeatherIngestionRuns.status,
    latitude: shadowWeatherValues.latitude,
    longitude: shadowWeatherValues.longitude,
    variable: shadowWeatherValues.variable,
    value: shadowWeatherValues.value,
    unit: shadowWeatherValues.unit,
    levelKey: shadowWeatherValues.levelKey,
    memberKey: shadowWeatherValues.memberKey,
    normalizationMetadata: shadowWeatherValues.normalizationMetadata,
    phase5QualityStatus: shadowWeatherValues.phase5QualityStatus,
    phase5QualityMetadata: shadowWeatherValues.phase5QualityMetadata,
    phase5EvaluatedAt: shadowWeatherValues.phase5EvaluatedAt,
    phase5AppliedToProduction: shadowWeatherValues.phase5AppliedToProduction,
    forecastHorizonMinutes: shadowWeatherValues.forecastHorizonMinutes,
    validTime: shadowWeatherValues.validTime,
    receivedAt: shadowWeatherIngestionRuns.receivedAt,
    missingData: shadowWeatherValues.missingData,
    qualityStatus: shadowWeatherValues.qualityStatus,
    shadowMode: shadowWeatherValues.shadowMode,
    appliedToProduction: shadowWeatherIngestionRuns.appliedToProduction,
  }).from(shadowWeatherValues)
    .innerJoin(shadowWeatherIngestionRuns, eq(shadowWeatherValues.ingestionRunId, shadowWeatherIngestionRuns.id))
    .innerJoin(shadowWeatherSourceDefinitions, eq(shadowWeatherValues.sourceDefinitionId, shadowWeatherSourceDefinitions.id))
    .where(and(...runFilters, eq(shadowWeatherValues.shadowMode, 1)));
  const phase3HorizonHierarchy = buildPhase3HorizonHierarchyReport(horizonValues.map(value => ({
    ...value,
    forecastHorizonMinutes: value.forecastHorizonMinutes == null ? null : Number(value.forecastHorizonMinutes),
    validTime: Number(value.validTime),
    receivedAt: Number(value.receivedAt),
    missingData: Number(value.missingData),
    appliedToProduction: Number(value.appliedToProduction),
  })));
  const phase4Normalization = buildPhase4NormalizationReport(horizonValues.map(value => ({
    variable: value.variable,
    unit: value.unit,
    normalizationMetadata: value.normalizationMetadata,
    missingData: Number(value.missingData),
    shadowMode: Number(value.shadowMode),
    appliedToProduction: Number(value.appliedToProduction),
  })));

  const categoryCounts = new Map<string, number>();
  for (const source of classifiedSources) {
    if (source.category) categoryCounts.set(source.category, (categoryCounts.get(source.category) ?? 0) + 1);
  }
  const classificationsAppliedToProduction = classifiedSources.reduce(
    (total, source) => total + Number(source.appliedToProduction ?? 0),
    0,
  );
  const unclassifiedSourceCount = classifiedSources.filter(source => !source.category || !source.role).length;

  const firstReceivedAt = runSummary?.firstReceivedAt == null ? null : Number(runSummary.firstReceivedAt);
  const observationDaysElapsed = firstReceivedAt == null
    ? 0
    : Math.min(7, Math.max(1, Math.floor((Date.now() - firstReceivedAt) / 86_400_000) + 1));
  const observationWindow = locationKey
    ? await getP1ObservationWindow(locationKey, Math.max(14, lookbackDays))
    : null;
  const phase5QualityControl = buildPhase5QualityControlReport(horizonValues.map(value => ({
    ingestionRunId: Number(value.ingestionRunId),
    sourceKey: value.sourceKey,
    displayName: value.displayName,
    cycleKey: value.cycleKey,
    runStatus: value.runStatus as ShadowRunStatus,
    receivedAt: Number(value.receivedAt),
    latitude: Number(value.latitude),
    longitude: Number(value.longitude),
    validTime: Number(value.validTime),
    variable: value.variable as ShadowCanonicalVariable,
    value: value.value == null ? null : Number(value.value),
    levelKey: value.levelKey,
    memberKey: value.memberKey,
    missingData: Number(value.missingData),
    normalizationMetadata: value.normalizationMetadata,
    phase5QualityStatus: value.phase5QualityStatus,
    phase5QualityMetadata: value.phase5QualityMetadata,
    phase5EvaluatedAt: value.phase5EvaluatedAt == null ? null : Number(value.phase5EvaluatedAt),
    phase5AppliedToProduction: Number(value.phase5AppliedToProduction),
    shadowMode: Number(value.shadowMode),
    runAppliedToProduction: Number(value.appliedToProduction),
  })), Date.now());

  return {
    mode: "shadow" as const,
    productionReadsEnabled: false,
    sourceCount: P1_SHADOW_SOURCE_DEFINITIONS.length,
    phase2Classification: {
      version: "phase2-source-classification-v1" as const,
      sourceCount: classifiedSources.length,
      unclassifiedSourceCount,
      appliedToProduction: classificationsAppliedToProduction,
      valid: classifiedSources.length === 8
        && unclassifiedSourceCount === 0
        && categoryCounts.get("DETERMINISTIC") === 7
        && categoryCounts.get("DERIVED_AGGREGATOR") === 1
        && classificationsAppliedToProduction === 0,
      categories: PHASE2_SOURCE_CATEGORIES.map(category => ({
        category,
        count: categoryCounts.get(category) ?? 0,
        empty: (categoryCounts.get(category) ?? 0) === 0,
      })),
      sources: classifiedSources,
    },
    phase3HorizonHierarchy,
    phase4Normalization,
    phase5QualityControl: {
      ...phase5QualityControl,
      p1Observation: {
        completedDays: observationWindow?.completedDays ?? 0,
        requiredDays: observationWindow?.requiredDays ?? 7,
        verdict: observationWindow?.verdict ?? "OBSERVING",
        stillOpen: (observationWindow?.completedDays ?? 0) < (observationWindow?.requiredDays ?? 7),
      },
    },
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
    observationWindow,
    values: {
      total: Number(valueSummary?.totalValues ?? 0),
      valid: Number(valueSummary?.validValues ?? 0),
      missing: Number(valueSummary?.missingValues ?? 0),
    },
    latestRuns,
  };
}
