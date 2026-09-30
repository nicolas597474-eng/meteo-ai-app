import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  shadowWeatherIngestionRuns,
  shadowWeatherLicenses,
  shadowWeatherSourceDefinitions,
  shadowWeatherSourceRelations,
  shadowWeatherValues,
  shadowWeatherPhase6Candidates,
  shadowWeatherPhase7LocalPerformance,
  shadowWeatherPhase8Metrics,
  shadowWeatherPhase8Comparisons,
  qualifiedObservationSnapshots,
  type InsertShadowWeatherIngestionRun,
  type InsertShadowWeatherValue,
  type InsertShadowWeatherPhase8Comparison,
} from "../drizzle/schema";
import {
  PHASE2_SHADOW_SOURCE_CLASSIFICATIONS,
  PHASE2_SOURCE_CATEGORIES,
  PHASE3_HORIZON_STRATEGY_VERSION,
  PHASE3_HORIZON_WINDOWS,
  PHASE4_NORMALIZATION_VERSION,
  PHASE5_QUALITY_CONTROL_VERSION,
  PHASE6_FUSION_VARIABLES,
  PHASE6_SMART_FUSION_VERSION,
  PHASE7_LOCAL_PERFORMANCE_VERSION,
  PHASE8_METRICS_VERSION,
  PHASE8_METRIC_VARIABLES,
  calculatePhase8Metrics,
  type Phase8MetricInput,
  type Phase8MetricResult,
  type Phase8MetricVariable,
  P1_SHADOW_SOURCE_DEFINITIONS,
  calculatePhase6ShadowCandidate,
  calculatePhase7LocalPerformance,
  getPhase3HorizonWindow,
  SHADOW_CANONICAL_VARIABLES,
  evaluatePhase5QualityControl,
  normalizePhase4WeatherValue,
  type Phase4NormalizationMetadata,
  type Phase5QualityControlMetadata,
  type Phase6ShadowFusionSource,
  type Phase6ShadowFusionInput,
  type Phase6FusionVariable,
  type Phase3HorizonWindow,
  type Phase7LocalPerformanceInput,
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
import { parisLocalHourToUniqueEpochMs } from "./parisHourlyTime";

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
      const storedMetadata = parsePhase5QualityMetadata(row.phase5QualityMetadata);
      const qc = storedMetadata
        ? { status: storedMetadata.status, metadata: storedMetadata }
        : evaluatePhase5QualityControl({
          variable: row.variable,
          value: row.value,
          missingData: row.missingData === 1 ? 1 : 0,
          validTime: row.validTime,
          receivedAt: row.receivedAt,
          // A legacy row without a persisted QC timestamp is evaluated at
          // ingestion time, never against the current wall clock. Otherwise
          // every historical value would become STALE merely because the
          // administrator opened the report later.
          evaluatedAt: row.phase5EvaluatedAt ?? row.receivedAt,
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
    const validTime = hour.validAt ?? parisLocalHourToUniqueEpochMs(context.targetDate, hour.hour);
    if (validTime == null) continue;
    const availableAt = forecast.availableAt ?? context.receivedAt;
    const horizonMinutes = Math.round((validTime - availableAt) / 60_000);
    if (horizonMinutes < 0 || horizonMinutes > PHASE3_HORIZON_WINDOWS.at(-1)!.maxMinutes) continue;
    const flags = ["hourly_value", "timezone_europe_paris"];
    values.push(
      toCanonicalValue("air_temperature_2m", hour.temperature, validTime, availableAt, flags, units?.temperature ?? null, sourceTimezone, context),
      toCanonicalValue("apparent_temperature", hour.apparentTemperature, validTime, availableAt, flags, units?.apparentTemperature ?? null, sourceTimezone, context),
      toCanonicalValue("precipitation_amount", hour.precipitation, validTime, availableAt, flags, units?.precipitation ?? null, sourceTimezone, context),
      toCanonicalValue("wind_speed_10m", hour.windSpeed, validTime, availableAt, flags, units?.windSpeed ?? null, sourceTimezone, context),
      toCanonicalValue("wind_gust_10m", hour.windGusts, validTime, availableAt, flags, units?.windGusts ?? null, sourceTimezone, context),
      toCanonicalValue("wind_direction_10m", hour.windDirection, validTime, availableAt, flags, units?.windDirection ?? null, sourceTimezone, context),
      toCanonicalValue("relative_humidity_2m", hour.humidity, validTime, availableAt, flags, units?.humidity ?? null, sourceTimezone, context),
      toCanonicalValue("air_pressure_surface", hour.pressure, validTime, availableAt, flags, units?.pressure ?? null, sourceTimezone, context),
      toCanonicalValue("cloud_cover_total", hour.cloudCover, validTime, availableAt, flags, units?.cloudCover ?? null, sourceTimezone, context),
      toCanonicalValue("weather_code", hour.weatherCode, validTime, availableAt, flags, units?.weatherCode ?? null, sourceTimezone, context),
    );
  }
  return applyPhase5QualityControlToValues(values, context);
}

export function getRunStatus(values: CanonicalShadowValue[], cycleKey?: string): ShadowRunStatus {
  if (values.length === 0 || values.every(value => value.missingData === 1)) return "FAILED";

  // P1 mesure la réception d'un payload exploitable, pas la disponibilité
  // uniforme de chaque variable facultative. Les champs absents restent
  // conservés comme MISSING et continuent d'être traités par P4/P5.
  // La température est le minimum commun aux deux granularités :
  // température max/min pour le quotidien, température à 2 m pour l'horaire.
  const requiredVariables = cycleKey?.startsWith("daily:")
    ? ["air_temperature_max", "air_temperature_min"]
    : ["air_temperature_2m"];
  const hasUsableCore = requiredVariables.every(variable =>
    values.some(value => value.variable === variable && value.missingData === 0 && value.value != null),
  );
  if (!hasUsableCore) return "PARTIAL";
  return "SUCCESS";
}

/** Recalcule les statuts P1 des runs déjà archivés, uniquement depuis le shadow. */
export async function repairPersistedP1RunStatuses(): Promise<{ inspected: number; updated: number; metadataUpdated: number; productionWrites: number }> {
  const db = await getDb();
  if (!db) return { inspected: 0, updated: 0, metadataUpdated: 0, productionWrites: 0 };
  const runs = await db.select({
    id: shadowWeatherIngestionRuns.id,
    cycleKey: shadowWeatherIngestionRuns.cycleKey,
    status: shadowWeatherIngestionRuns.status,
    shadowMode: shadowWeatherIngestionRuns.shadowMode,
    appliedToProduction: shadowWeatherIngestionRuns.appliedToProduction,
  }).from(shadowWeatherIngestionRuns);
  let updated = 0;
  let metadataUpdated = 0;
  for (const run of runs) {
    const rows = await db.select({
      id: shadowWeatherValues.id,
      variable: shadowWeatherValues.variable,
      value: shadowWeatherValues.value,
      missingData: shadowWeatherValues.missingData,
      phase5QualityStatus: shadowWeatherValues.phase5QualityStatus,
      phase5QualityMetadata: shadowWeatherValues.phase5QualityMetadata,
    }).from(shadowWeatherValues).where(eq(shadowWeatherValues.ingestionRunId, run.id));
    const values = rows.map(row => ({
      variable: row.variable as CanonicalShadowValue["variable"],
      value: row.value == null ? null : Number(row.value),
      missingData: Number(row.missingData),
    })) as CanonicalShadowValue[];
    const nextStatus = getRunStatus(values, run.cycleKey);
    if (nextStatus !== run.status) {
      await db.update(shadowWeatherIngestionRuns).set({
        status: nextStatus,
        failureClass: nextStatus === "FAILED" ? "empty_payload" : null,
        failureReason: nextStatus === "FAILED" ? "Aucune valeur centrale exploitable" : null,
        shadowMode: 1,
        appliedToProduction: 0,
        updatedAt: new Date(),
      }).where(eq(shadowWeatherIngestionRuns.id, run.id));
      updated++;
    }
    if (nextStatus === "SUCCESS") {
      for (const row of rows) {
        const metadata = row.phase5QualityMetadata as (Phase5QualityControlMetadata & { rules?: string[] }) | null;
        if (!metadata || !Array.isArray(metadata.rules) || !metadata.rules.includes("RUN_INCOMPLETE")) continue;
        const rules = metadata.rules.filter(rule => rule !== "RUN_INCOMPLETE");
        const nextQualityStatus = row.phase5QualityStatus === "SUSPECT" && rules.length === 0
          ? (row.missingData === 1 ? "MISSING" : "VALID")
          : row.phase5QualityStatus;
        await db.update(shadowWeatherValues).set({
          phase5QualityStatus: nextQualityStatus,
          phase5QualityMetadata: {
            ...metadata,
            status: nextQualityStatus,
            runStatus: "SUCCESS",
            rules,
            usableInShadow: nextQualityStatus === "VALID" || nextQualityStatus === "SUSPECT",
            excludedFromPhase5Shadow: nextQualityStatus !== "VALID" && nextQualityStatus !== "SUSPECT",
          },
        }).where(eq(shadowWeatherValues.id, row.id));
        metadataUpdated++;
      }
    }
  }
  return { inspected: runs.length, updated, metadataUpdated, productionWrites: 0 };
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
  const status = getRunStatus(input.values, input.cycleKey);
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

async function persistPhase6ShadowCandidates(input: {
  cycleKey: string;
  locationKey: string;
  evaluatedAt: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const rows = await db.select({
    sourceKey: shadowWeatherSourceDefinitions.sourceKey,
    sourceType: shadowWeatherSourceDefinitions.sourceType,
    independenceClass: shadowWeatherSourceDefinitions.independenceClass,
    variable: shadowWeatherValues.variable,
    validTime: shadowWeatherValues.validTime,
    forecastHorizonMinutes: shadowWeatherValues.forecastHorizonMinutes,
    value: shadowWeatherValues.value,
    phase5QualityStatus: shadowWeatherValues.phase5QualityStatus,
    freshnessStatus: shadowWeatherValues.freshnessStatus,
    nativeResolutionKm: shadowWeatherValues.nativeResolutionKm,
  })
    .from(shadowWeatherValues)
    .innerJoin(shadowWeatherIngestionRuns, eq(shadowWeatherValues.ingestionRunId, shadowWeatherIngestionRuns.id))
    .innerJoin(shadowWeatherSourceDefinitions, eq(shadowWeatherValues.sourceDefinitionId, shadowWeatherSourceDefinitions.id))
    .where(and(
      eq(shadowWeatherIngestionRuns.cycleKey, input.cycleKey),
      eq(shadowWeatherValues.locationKey, input.locationKey),
    ));

  const grouped = new Map<string, {
    variable: Phase6FusionVariable;
    validTime: number;
    phase3WindowKey: Phase3HorizonWindow["key"];
    sources: Phase6ShadowFusionSource[];
  }>();

  for (const row of rows) {
    if (!PHASE6_FUSION_VARIABLES.includes(row.variable as Phase6FusionVariable)) continue;
    const phase3Window = getPhase3HorizonWindow(row.forecastHorizonMinutes);
    if (!phase3Window) continue;
    const variable = row.variable as Phase6FusionVariable;
    const groupKey = `${row.validTime}:${variable}:${phase3Window.key}`;
    const group = grouped.get(groupKey) ?? {
      variable,
      validTime: row.validTime,
      phase3WindowKey: phase3Window.key,
      sources: [],
    };
    group.sources.push({
      sourceKey: row.sourceKey,
      sourceType: row.sourceType as Phase6ShadowFusionSource["sourceType"],
      independenceClass: row.independenceClass as Phase6ShadowFusionSource["independenceClass"],
      value: row.value,
      available: row.value != null,
      phase5Status: (row.phase5QualityStatus ?? "MISSING") as ShadowQualityStatus,
      freshnessStatus: (row.freshnessStatus ?? "UNKNOWN") as ShadowFreshnessStatus,
      nativeResolutionKm: row.nativeResolutionKm,
      isDerived: row.independenceClass !== "independent_model",
    });
    grouped.set(groupKey, group);
  }

  let persisted = 0;
  for (const group of Array.from(grouped.values())) {
    const result = calculatePhase6ShadowCandidate({
      variable: group.variable,
      sources: group.sources,
      phase3WindowKey: group.phase3WindowKey,
      evaluatedAt: input.evaluatedAt,
    });
    await db.insert(shadowWeatherPhase6Candidates).values({
      cycleKey: input.cycleKey,
      locationKey: input.locationKey,
      validTime: group.validTime,
      variable: group.variable,
      phase3WindowKey: group.phase3WindowKey,
      candidateStatus: result.status,
      candidateValue: result.candidateValue,
      contributingSourceCount: result.contributingSourceCount,
      independentSourceCount: result.independentSourceCount,
      weights: result.weights,
      referenceValues: result.referenceValues,
      productionReadsEnabled: 0,
      shadowMode: 1,
      appliedToProduction: 0,
      evaluatedAt: result.evaluatedAt,
    }).onDuplicateKeyUpdate({
      set: {
        candidateStatus: result.status,
        candidateValue: result.candidateValue,
        contributingSourceCount: result.contributingSourceCount,
        independentSourceCount: result.independentSourceCount,
        weights: result.weights,
        referenceValues: result.referenceValues,
        productionReadsEnabled: 0,
        shadowMode: 1,
        appliedToProduction: 0,
        evaluatedAt: result.evaluatedAt,
        updatedAt: new Date(),
      },
    });
    persisted += 1;
  }
    return persisted;
}

/**
 * Rejoue uniquement les valeurs déjà présentes dans le Data Hub shadow.
 * Ce helper ne lit ni n’écrit aucune table de production et reste idempotent
 * grâce à la clé unique du candidat Phase 6.
 */
export async function rebuildPhase6ShadowCandidatesFromExistingValues(input?: {
  locationKeys?: readonly string[];
  cycleKeys?: readonly string[];
}): Promise<{ cycleCount: number; candidateCount: number }> {
  const db = await getDb();
  if (!db) return { cycleCount: 0, candidateCount: 0 };
  const cycles = await db.select({
    cycleKey: shadowWeatherIngestionRuns.cycleKey,
    locationKey: shadowWeatherIngestionRuns.locationKey,
    evaluatedAt: sql<number>`max(${shadowWeatherIngestionRuns.receivedAt})`,
  })
    .from(shadowWeatherIngestionRuns)
    .innerJoin(shadowWeatherValues, eq(shadowWeatherValues.ingestionRunId, shadowWeatherIngestionRuns.id))
    .groupBy(shadowWeatherIngestionRuns.cycleKey, shadowWeatherIngestionRuns.locationKey);
  const locationFilter = input?.locationKeys ? new Set(input.locationKeys) : null;
  const cycleFilter = input?.cycleKeys ? new Set(input.cycleKeys) : null;
  let cycleCount = 0;
  let candidateCount = 0;
  for (const cycle of cycles) {
    if (locationFilter && !locationFilter.has(cycle.locationKey)) continue;
    if (cycleFilter && !cycleFilter.has(cycle.cycleKey)) continue;
    const evaluatedAt = Number(cycle.evaluatedAt ?? Date.now());
    candidateCount += await persistPhase6ShadowCandidates({
      cycleKey: cycle.cycleKey,
      locationKey: cycle.locationKey,
      evaluatedAt: Number.isFinite(evaluatedAt) ? evaluatedAt : Date.now(),
    });
    cycleCount += 1;
  }
  return { cycleCount, candidateCount };
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
  try {
    await persistPhase6ShadowCandidates({
      cycleKey: `daily:${context.targetDate}:v1`,
      locationKey: context.locationKey,
      evaluatedAt: context.receivedAt,
    });
  } catch (error) {
    errors.push(`phase6:${error instanceof Error ? error.message : String(error)}`);
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
      const runContext: ShadowWriteContext = {
        ...context,
        requestStartedAt: forecast.requestStartedAt ?? context.requestStartedAt,
        receivedAt: forecast.availableAt ?? context.receivedAt,
      };
      valueCount += await persistOneShadowRun({
        cycleKey: `hourly:${context.targetDate}:v2:${forecast.captureRunId ?? randomUUID()}`,
        sourceKey,
        context: runContext,
        values: normalizeHourlyForecastToShadow(forecast, runContext),
        runEvidence: runEvidenceBySource.get(sourceKey) ?? createUnknownRunEvidence({
          observedAt: runContext.receivedAt,
          detail: `Aucune preuve de run Phase 17 reçue pour ${sourceKey}.`,
        }),
      });
      sourceCount++;
    } catch (error) {
      errors.push(`${forecast.modelName}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    await persistPhase6ShadowCandidates({
      cycleKey: `hourly:${context.targetDate}:v1`,
      locationKey: context.locationKey,
      evaluatedAt: context.receivedAt,
    });
  } catch (error) {
    errors.push(`phase6:${error instanceof Error ? error.message : String(error)}`);
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

async function buildPhase6FusionReport(locationKey?: string) {
  const db = await getDb();
  if (!db) {
    return {
      version: PHASE6_SMART_FUSION_VERSION,
      candidateCount: 0,
      statuses: { SHADOW_READY: 0, PARTIAL: 0, UNAVAILABLE: 0 },
      byVariable: [],
      byWindow: [],
      productionReadsEnabled: 0,
      appliedToProduction: 0,
      shadowModeViolations: 0,
      valid: false,
    } as const;
  }
  const filters = locationKey ? [eq(shadowWeatherPhase6Candidates.locationKey, locationKey)] : [];
  const rows = await db.select({
    candidateStatus: shadowWeatherPhase6Candidates.candidateStatus,
    variable: shadowWeatherPhase6Candidates.variable,
    phase3WindowKey: shadowWeatherPhase6Candidates.phase3WindowKey,
    productionReadsEnabled: shadowWeatherPhase6Candidates.productionReadsEnabled,
    shadowMode: shadowWeatherPhase6Candidates.shadowMode,
    appliedToProduction: shadowWeatherPhase6Candidates.appliedToProduction,
    independentSourceCount: shadowWeatherPhase6Candidates.independentSourceCount,
  }).from(shadowWeatherPhase6Candidates).where(and(...filters));
  const statuses = { SHADOW_READY: 0, PARTIAL: 0, UNAVAILABLE: 0 };
  const variables = new Map<string, number>();
  const windows = new Map<string, number>();
  let productionReadsEnabled = 0;
  let appliedToProduction = 0;
  let shadowModeViolations = 0;
  for (const row of rows) {
    if (row.candidateStatus in statuses) {
      statuses[row.candidateStatus as keyof typeof statuses] += 1;
    }
    variables.set(row.variable, (variables.get(row.variable) ?? 0) + 1);
    windows.set(row.phase3WindowKey, (windows.get(row.phase3WindowKey) ?? 0) + 1);
    productionReadsEnabled += Number(row.productionReadsEnabled ?? 0);
    appliedToProduction += Number(row.appliedToProduction ?? 0);
    if (Number(row.shadowMode ?? 0) !== 1 || Number(row.independentSourceCount ?? 0) < 0) shadowModeViolations += 1;
  }
  return {
    version: PHASE6_SMART_FUSION_VERSION,
    candidateCount: rows.length,
    statuses,
    byVariable: Array.from(variables.entries()).map(([variable, count]) => ({ variable, count })),
    byWindow: Array.from(windows.entries()).map(([window, count]) => ({ window, count })),
    productionReadsEnabled,
    appliedToProduction,
    shadowModeViolations,
    valid: rows.length === 0
      ? true
      : productionReadsEnabled === 0 && appliedToProduction === 0 && shadowModeViolations === 0,
  } as const;
}

export type Phase8MetricReportRow = {
  periodKey: string; periodStart: number; periodEnd: number; locationKey: string; sourceKey: string;
  variable: string; horizonKey: string; status: string; comparisonCount: number; evaluatedDays: number;
  physicalComparisonCount: number; legacyComparisonCount: number; mae: number | null; rmse: number | null;
  bias: number | null; medianAbsoluteError: number | null; rainHitRate: number | null; rainHits: number;
  rainMisses: number; rainFalseAlarms: number; windDirectionMeanAbsoluteError: number | null;
  brierScore: number | null; crps: number | null; calibrationError: number | null; metricAvailability: string;
  missingEvidence: unknown; productionReadsEnabled: number; appliedToProduction: number; evaluatedAt: number;
};
export function buildPhase8MetricsReport(rows: Phase8MetricReportRow[]) {
  const statuses = { INSUFFICIENT: 0, OBSERVING: 0, VALIDABLE: 0, INVALID: 0 };
  let productionReadsEnabled = 0, appliedToProduction = 0, shadowModeViolations = 0;
  let probabilisticRecordCount = 0;
  for (const row of rows) {
    if (row.status in statuses) statuses[row.status as keyof typeof statuses] += 1;
    productionReadsEnabled += Number(row.productionReadsEnabled ?? 0);
    appliedToProduction += Number(row.appliedToProduction ?? 0);
    if (row.metricAvailability === "PROBABILISTIC_AVAILABLE") probabilisticRecordCount += 1;
    if (Number(row.productionReadsEnabled ?? 0) !== 0 || Number(row.appliedToProduction ?? 0) !== 0) shadowModeViolations += 1;
  }
  return { version: PHASE8_METRICS_VERSION, metricCount: rows.length, statuses, variables: [...PHASE8_METRIC_VARIABLES],
    physicalEvidenceComparisons: rows.reduce((n, row) => n + Number(row.physicalComparisonCount ?? 0), 0),
    legacyEvidenceComparisons: rows.reduce((n, row) => n + Number(row.legacyComparisonCount ?? 0), 0),
    productionReadsEnabled, appliedToProduction, shadowModeViolations,
    probabilisticMetrics: {
      status: probabilisticRecordCount > 0 ? "PARTIAL" as const : "UNAVAILABLE" as const,
      brierRecordCount: rows.filter(row => row.brierScore != null).length,
      crpsRecordCount: rows.filter(row => row.crps != null).length,
      calibrationRecordCount: rows.filter(row => row.calibrationError != null).length,
      evidenceRecordCount: probabilisticRecordCount,
      reasons: probabilisticRecordCount > 0
        ? ["Une preuve de probabilité est présente pour une partie des comparaisons ; CRPS et calibration restent indisponibles sans distribution prédictive complète."]
        : ["Aucune probabilité d’événement, distribution d’ensemble ou issue binaire traçable n’est ingérée.", "Brier, CRPS et calibration restent non calculés ; aucune valeur zéro ne représente une performance."],
    },
    valid: productionReadsEnabled === 0 && appliedToProduction === 0 && shadowModeViolations === 0, records: rows } as const;
}
type Phase8ReplayOptions = {
  locationKey?: string;
  sinceMs?: number;
  untilMs?: number;
  dryRun?: boolean;
};

type Phase8ReplayCandidate = {
  valueId: number;
  ingestionRunId: number;
  sourceDefinitionId: number;
  sourceKey: string;
  displayName: string;
  provider: string;
  model: string;
  sourceUrl: string | null;
  locationKey: string;
  variable: Phase8MetricVariable;
  value: number;
  validTime: number;
  forecastHorizonMinutes: number;
  receivedAt: number;
  runEvidenceStatus: string;
  runEvidenceSourceUrl: string | null;
  payloadHash: string | null;
  runStatus: string;
};

type Phase8ReplaySnapshot = typeof qualifiedObservationSnapshots.$inferSelect;

function phase8ParisWallClockToUtc(date: string, hour: number): number | null {
  return parisLocalHourToUniqueEpochMs(date, hour);
}

/** Select the latest run received before the observation independently per source. */
export function selectLatestAdmissiblePhase8Candidates<T extends {
  valueId: number;
  sourceKey: string;
  locationKey: string;
  variable: string;
  validTime: number;
  receivedAt: number;
}>(
  candidates: readonly T[],
  target: { locationKey: string; variable: string; validTime: number; observationAt: number },
): T[] {
  const latestBySource = new Map<string, T>();
  for (const candidate of candidates) {
    if (candidate.locationKey !== target.locationKey
      || candidate.variable !== target.variable
      || candidate.validTime !== target.validTime
      || candidate.receivedAt >= target.observationAt) continue;
    const previous = latestBySource.get(candidate.sourceKey);
    if (!previous || candidate.receivedAt > previous.receivedAt
      || (candidate.receivedAt === previous.receivedAt && candidate.valueId > previous.valueId)) {
      latestBySource.set(candidate.sourceKey, candidate);
    }
  }
  return Array.from(latestBySource.values()).sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

function phase8ObservationValue(snapshot: Phase8ReplaySnapshot, variable: Phase8MetricVariable): number | null {
  const values: Partial<Record<Phase8MetricVariable, number | null>> = {
    air_temperature_2m: snapshot.temperature,
    precipitation_amount: snapshot.precipitation,
    wind_speed_10m: snapshot.windSpeed,
    wind_gust_10m: snapshot.windGust,
    // qualified_observation_snapshots ne conserve pas de direction de vent.
    wind_direction_10m: null,
    air_pressure_msl: snapshot.pressure,
  };
  const observed = values[variable];
  return observed != null && Number.isFinite(observed) ? Number(observed) : null;
}

function phase8ReplayPeriodKey(start: number, end: number, locationKey: string, variable: string, horizonKey: string) {
  return `p8-${createHash("sha256").update(`${start}|${end}|${locationKey}|${variable}|${horizonKey}`).digest("hex").slice(0, 28)}`;
}

export type Phase8ControlledReplayReport = {
  version: typeof PHASE8_METRICS_VERSION;
  dryRun: boolean;
  sinceMs: number;
  untilMs: number;
  snapshotCount: number;
  candidateCount: number;
  eligibleComparisonCount: number;
  persistedComparisonCount: number;
  rejected: Record<string, number>;
  groups: Array<{ locationKey: string; sourceKey: string; variable: Phase8MetricVariable; horizonKey: string; comparisons: number; status: string; mae: number | null; rmse: number | null; bias: number | null }>;
  productionReadsEnabled: false;
  appliedToProduction: 0;
};

/**
 * Replay historique Phase 8 : seules les valeurs shadow émises avant l’instant
 * d’observation et les synthèses physiques qualifiées sont admissibles.
 * La fonction ne lit ni n’écrit aucune table de production et est idempotente.
 */
export async function replayPhase8Controlled(options: Phase8ReplayOptions = {}): Promise<Phase8ControlledReplayReport | null> {
  const db = await getDb();
  if (!db) return null;
  const untilMs = options.untilMs ?? Date.now();
  const sinceMs = options.sinceMs ?? (untilMs - 45 * 86_400_000);
  const rejected: Record<string, number> = {};
  const reject = (reason: string) => { rejected[reason] = (rejected[reason] ?? 0) + 1; };
  const snapshotFilters = [gte(qualifiedObservationSnapshots.collectedAt, new Date(sinceMs))];
  if (options.locationKey) snapshotFilters.push(eq(qualifiedObservationSnapshots.locationKey, options.locationKey));
  const snapshots = await db.select().from(qualifiedObservationSnapshots).where(and(...snapshotFilters));
  const valueRows = await db.select({
    value: shadowWeatherValues,
    run: shadowWeatherIngestionRuns,
    source: shadowWeatherSourceDefinitions,
  }).from(shadowWeatherValues)
    .innerJoin(shadowWeatherIngestionRuns, eq(shadowWeatherIngestionRuns.id, shadowWeatherValues.ingestionRunId))
    .innerJoin(shadowWeatherSourceDefinitions, eq(shadowWeatherSourceDefinitions.id, shadowWeatherValues.sourceDefinitionId))
    .where(and(eq(shadowWeatherValues.shadowMode, 1), eq(shadowWeatherIngestionRuns.shadowMode, 1), eq(shadowWeatherValues.missingData, 0)));

  const candidates: Phase8ReplayCandidate[] = [];
  for (const row of valueRows) {
    const value = row.value;
    const variable = PHASE8_METRIC_VARIABLES.includes(value.variable as Phase8MetricVariable) ? value.variable as Phase8MetricVariable : null;
    if (!variable) { reject("variable_non_phase8"); continue; }
    if (options.locationKey && value.locationKey !== options.locationKey) { reject("location_filter"); continue; }
    if (value.value == null || !Number.isFinite(value.value)) { reject("forecast_value_missing"); continue; }
    if (value.qualityStatus !== "VALID" || value.phase5QualityStatus !== "VALID") { reject("forecast_quality_not_valid"); continue; }
    if (row.run.status !== "SUCCESS" || row.run.receivedAt == null) { reject("run_not_successfully_received"); continue; }
    if (value.validTime < sinceMs || value.validTime > untilMs) { reject("forecast_outside_period"); continue; }
    const horizon = value.forecastHorizonMinutes;
    if (horizon == null || getPhase3HorizonWindow(horizon) == null || horizon < 0) { reject("horizon_unresolved"); continue; }
    candidates.push({
      valueId: value.id, ingestionRunId: value.ingestionRunId, sourceDefinitionId: value.sourceDefinitionId,
      sourceKey: row.source.sourceKey, displayName: row.source.displayName, provider: row.source.provider,
      model: row.source.model, sourceUrl: row.source.sourceUrl, locationKey: value.locationKey,
      variable, value: Number(value.value), validTime: value.validTime, forecastHorizonMinutes: horizon,
      receivedAt: Number(row.run.receivedAt), runEvidenceStatus: row.run.runEvidenceStatus,
      runEvidenceSourceUrl: row.run.runEvidenceSourceUrl, payloadHash: row.run.payloadHash, runStatus: row.run.status,
    });
  }
  const candidatesByObservation = new Map<string, Phase8ReplayCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.locationKey}|${candidate.validTime}|${candidate.variable}`;
    const aligned = candidatesByObservation.get(key) ?? [];
    aligned.push(candidate);
    candidatesByObservation.set(key, aligned);
  }
  const groups = new Map<string, { candidate: Phase8ReplayCandidate; snapshot: Phase8ReplaySnapshot; observedValue: number; observationAt: number }[]>();
  for (const snapshot of snapshots) {
    if (snapshot.stationCount <= 0 || snapshot.confidenceScore == null || !Number.isFinite(snapshot.confidenceScore)) { reject("observation_not_qualified"); continue; }
    const observationAt = phase8ParisWallClockToUtc(snapshot.date, snapshot.hour);
    if (observationAt == null) { reject("observation_time_ambiguous_or_nonexistent"); continue; }
    if (observationAt < sinceMs || observationAt > untilMs || observationAt > Date.now()) { reject("observation_outside_period"); continue; }
    for (const variable of PHASE8_METRIC_VARIABLES) {
      const observedValue = phase8ObservationValue(snapshot, variable);
      if (observedValue == null) { reject(`observation_missing_${variable}`); continue; }
      // The physical hour is conservatively represented by the start of its Paris wall-clock hour.
      const aligned = candidatesByObservation.get(`${snapshot.locationKey}|${observationAt}|${variable}`) ?? [];
      const matching = selectLatestAdmissiblePhase8Candidates(aligned, {
        locationKey: snapshot.locationKey,
        variable,
        validTime: observationAt,
        observationAt,
      });
      if (matching.length === 0) {
        reject(aligned.some(candidate => candidate.receivedAt >= observationAt)
          ? "forecast_received_after_observation"
          : `no_aligned_forecast_${variable}`);
        continue;
      }
      for (const candidate of matching) {
        const window = getPhase3HorizonWindow(candidate.forecastHorizonMinutes);
        if (!window) { reject("horizon_unresolved_after_alignment"); continue; }
        const key = `${candidate.locationKey}|${candidate.sourceKey}|${candidate.variable}|${window.key}`;
        const group = groups.get(key) ?? [];
        group.push({ candidate, snapshot, observedValue, observationAt });
        groups.set(key, group);
      }
    }
  }
  const reportGroups: Phase8ControlledReplayReport["groups"] = [];
  let persistedComparisonCount = 0;
  for (const [groupKey, entries] of Array.from(groups.entries())) {
    const [locationKey, sourceKey, variable, horizonKey] = groupKey.split("|") as [string, string, Phase8MetricVariable, string];
    const samples = entries.map(entry => ({ forecastValue: entry.candidate.value, observedValue: entry.observedValue, validTime: entry.observationAt, evidenceType: "physical_observation" as const, qualityStatus: "VALID" as const }));
    const periodStart = Math.min(...entries.map(entry => entry.observationAt));
    const periodEnd = Math.max(...entries.map(entry => entry.observationAt));
    const metric = calculatePhase8Metrics({ locationKey, sourceKey, variable, horizonKey: horizonKey as Phase8MetricInput["horizonKey"], periodStart, periodEnd, samples, evaluatedAt: untilMs });
    reportGroups.push({ locationKey, sourceKey, variable, horizonKey, comparisons: metric.comparisonCount, status: metric.status, mae: metric.mae, rmse: metric.rmse, bias: metric.bias });
    if (options.dryRun) continue;
    const periodKey = phase8ReplayPeriodKey(periodStart, periodEnd, locationKey, variable, horizonKey);
    for (const entry of entries) {
      const error = entry.candidate.value - entry.observedValue;
      const comparison: InsertShadowWeatherPhase8Comparison = {
        comparisonKey: `${periodKey}|${entry.candidate.sourceKey}|${variable}|${entry.observationAt}`,
        locationKey, sourceKey: entry.candidate.sourceKey, variable, phase3WindowKey: horizonKey,
        forecastRunId: entry.candidate.ingestionRunId, forecastIssuedAt: entry.candidate.receivedAt,
        forecastValidTime: entry.candidate.validTime, forecastHorizonMinutes: entry.candidate.forecastHorizonMinutes,
        observationId: entry.snapshot.id, observationDate: entry.snapshot.date, observationHour: entry.snapshot.hour,
        observationAt: entry.observationAt, observationCollectedAt: new Date(entry.snapshot.collectedAt),
        forecastValue: entry.candidate.value, observedValue: entry.observedValue, error, absoluteError: Math.abs(error),
        observationQualityStatus: "VALID", observationStationCount: entry.snapshot.stationCount,
        observationConfidence: entry.snapshot.confidenceScore,
        observationProvenance: { table: "qualified_observation_snapshots", id: entry.snapshot.id, locationKey: entry.snapshot.locationKey, date: entry.snapshot.date, hour: entry.snapshot.hour, observedAt: entry.observationAt, stationCount: entry.snapshot.stationCount, confidenceScore: entry.snapshot.confidenceScore, stationsUsed: entry.snapshot.stationsUsed, collectedAt: new Date(entry.snapshot.collectedAt).toISOString() },
        forecastProvenance: { table: "shadow_weather_values", valueId: entry.candidate.valueId, ingestionRunId: entry.candidate.ingestionRunId, sourceDefinitionId: entry.candidate.sourceDefinitionId, sourceKey: entry.candidate.sourceKey, displayName: entry.candidate.displayName, provider: entry.candidate.provider, model: entry.candidate.model, forecastIssuedAt: entry.candidate.receivedAt, forecastValidTime: entry.candidate.validTime, forecastHorizonMinutes: entry.candidate.forecastHorizonMinutes, runEvidenceStatus: entry.candidate.runEvidenceStatus, runEvidenceSourceUrl: entry.candidate.runEvidenceSourceUrl, payloadHash: entry.candidate.payloadHash },
        shadowMode: 1, appliedToProduction: 0,
      };
      await db.insert(shadowWeatherPhase8Comparisons).values(comparison).onDuplicateKeyUpdate({ set: comparison });
      persistedComparisonCount++;
    }
    await persistPhase8Metrics({ locationKey, sourceKey, variable, horizonKey: horizonKey as Phase8MetricInput["horizonKey"], periodStart, periodEnd, samples, evaluatedAt: untilMs, periodKey } as Phase8MetricInput & { periodKey: string });
  }
  return { version: PHASE8_METRICS_VERSION, dryRun: options.dryRun === true, sinceMs, untilMs, snapshotCount: snapshots.length, candidateCount: candidates.length, eligibleComparisonCount: reportGroups.reduce((total, group) => total + group.comparisons, 0), persistedComparisonCount, rejected, groups: reportGroups, productionReadsEnabled: false, appliedToProduction: 0 };
}

export async function persistPhase8Metrics(input: Phase8MetricInput & { periodKey: string }): Promise<boolean> {
  const db = await getDb(); if (!db) return false;
  const result = calculatePhase8Metrics(input);
  const values = { periodKey: input.periodKey, periodStart: result.periodStart, periodEnd: result.periodEnd,
    locationKey: result.locationKey, sourceKey: result.sourceKey, variable: result.variable,
    phase3WindowKey: result.horizonKey, metricStatus: result.status, comparisonCount: result.comparisonCount,
    evaluatedDays: result.evaluatedDays, physicalComparisonCount: result.physicalComparisonCount,
    legacyComparisonCount: result.legacyComparisonCount, mae: result.mae, rmse: result.rmse, bias: result.bias,
    medianAbsoluteError: result.medianAbsoluteError, rainHitRate: result.rainHitRate, rainHits: result.rainHits,
    rainMisses: result.rainMisses, rainFalseAlarms: result.rainFalseAlarms,
    windDirectionMeanAbsoluteError: result.windDirectionMeanAbsoluteError, brierScore: result.brierScore,
    crps: result.crps, calibrationError: result.calibrationError, metricAvailability: result.metricAvailability,
    missingEvidence: result.missingEvidence, productionReadsEnabled: 0, shadowMode: 1,
    appliedToProduction: 0, evaluatedAt: result.evaluatedAt, updatedAt: new Date() };
  await db.insert(shadowWeatherPhase8Metrics).values(values).onDuplicateKeyUpdate({ set: values });
  return true;
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
    locationKey: shadowWeatherValues.locationKey,
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

  const coverageByLocation = new Map<string, { daily: Set<string>; hourly: Set<string> }>();
  for (const value of horizonValues) {
    const coverage = coverageByLocation.get(value.locationKey) ?? { daily: new Set<string>(), hourly: new Set<string>() };
    const target = value.cycleKey.startsWith("daily:") ? coverage.daily : coverage.hourly;
    target.add(value.sourceKey);
    coverageByLocation.set(value.locationKey, coverage);
  }
  const observedCoverage = Array.from(coverageByLocation.entries())
    .map(([observedLocationKey, coverage]) => ({
      locationKey: observedLocationKey,
      dailySourceCount: coverage.daily.size,
      hourlySourceCount: coverage.hourly.size,
      expectedSourceCount: P1_SHADOW_SOURCE_DEFINITIONS.length,
      dailyCoverageRate: coverage.daily.size / P1_SHADOW_SOURCE_DEFINITIONS.length,
      hourlyCoverageRate: coverage.hourly.size / P1_SHADOW_SOURCE_DEFINITIONS.length,
    }))
    .sort((left, right) => left.locationKey.localeCompare(right.locationKey));

  const firstReceivedAt = runSummary?.firstReceivedAt == null ? null : Number(runSummary.firstReceivedAt);
  const observationDaysElapsed = firstReceivedAt == null
    ? 0
    : Math.min(7, Math.max(1, Math.floor((Date.now() - firstReceivedAt) / 86_400_000) + 1));
  const observationWindow = locationKey
    ? await getP1ObservationWindow(locationKey, Math.max(14, lookbackDays))
    : null;
  const phase6Fusion = await buildPhase6FusionReport(locationKey);
  const phase7LocalPerformance = await buildPhase7LocalPerformanceReport(locationKey);
  const phase8Filters = locationKey ? [eq(shadowWeatherPhase8Metrics.locationKey, locationKey)] : [];
  const phase8Rows = await db.select().from(shadowWeatherPhase8Metrics).where(and(...phase8Filters,
    gte(shadowWeatherPhase8Metrics.periodEnd, Date.now() - Math.max(1, lookbackDays) * 86_400_000)));
  const phase8Metrics = buildPhase8MetricsReport(phase8Rows.map(row => ({ ...row,
    periodStart: Number(row.periodStart), periodEnd: Number(row.periodEnd), evaluatedAt: Number(row.evaluatedAt),
    horizonKey: row.phase3WindowKey, status: row.metricStatus })));
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
    phase1Coverage: {
      configuredSourceCount: P1_SHADOW_SOURCE_DEFINITIONS.length,
      observedLocationCount: observedCoverage.length,
      locations: observedCoverage,
      shadowOnly: true as const,
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
    phase6Fusion,
    phase7LocalPerformance,
    phase8Metrics,
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

async function buildPhase7LocalPerformanceReport(locationKey?: string) {
  const db = await getDb();
  if (!db) {
    return {
      version: PHASE7_LOCAL_PERFORMANCE_VERSION,
      recordCount: 0,
      statuses: { INSUFFICIENT: 0, OBSERVING: 0, VALIDABLE: 0, INVALID: 0 },
      locations: [],
      bySource: [],
      physicalEvidenceComparisons: 0,
      legacyEvidenceComparisons: 0,
      productionReadsEnabled: 0,
      appliedToProduction: 0,
      shadowModeViolations: 0,
      readyForPromotion: false,
      valid: false,
    } as const;
  }
  const filters = locationKey ? [eq(shadowWeatherPhase7LocalPerformance.locationKey, locationKey)] : [];
  const rows = await db.select({
    locationKey: shadowWeatherPhase7LocalPerformance.locationKey,
    sourceKey: shadowWeatherPhase7LocalPerformance.sourceKey,
    variable: shadowWeatherPhase7LocalPerformance.variable,
    phase3WindowKey: shadowWeatherPhase7LocalPerformance.phase3WindowKey,
    evidenceType: shadowWeatherPhase7LocalPerformance.evidenceType,
    performanceStatus: shadowWeatherPhase7LocalPerformance.performanceStatus,
    comparisonCount: shadowWeatherPhase7LocalPerformance.comparisonCount,
    evaluatedDays: shadowWeatherPhase7LocalPerformance.evaluatedDays,
    physicalComparisonCount: shadowWeatherPhase7LocalPerformance.physicalComparisonCount,
    legacyComparisonCount: shadowWeatherPhase7LocalPerformance.legacyComparisonCount,
    mae: shadowWeatherPhase7LocalPerformance.mae,
    rmse: shadowWeatherPhase7LocalPerformance.rmse,
    bias: shadowWeatherPhase7LocalPerformance.bias,
    productionReadsEnabled: shadowWeatherPhase7LocalPerformance.productionReadsEnabled,
    shadowMode: shadowWeatherPhase7LocalPerformance.shadowMode,
    appliedToProduction: shadowWeatherPhase7LocalPerformance.appliedToProduction,
  }).from(shadowWeatherPhase7LocalPerformance).where(and(...filters));
  const statuses = { INSUFFICIENT: 0, OBSERVING: 0, VALIDABLE: 0, INVALID: 0 };
  const locations = new Set<string>();
  const sourceCounts = new Map<string, number>();
  let physicalEvidenceComparisons = 0;
  let legacyEvidenceComparisons = 0;
  let productionReadsEnabled = 0;
  let appliedToProduction = 0;
  let shadowModeViolations = 0;
  for (const row of rows) {
    if (row.performanceStatus in statuses) statuses[row.performanceStatus as keyof typeof statuses] += 1;
    locations.add(row.locationKey);
    sourceCounts.set(row.sourceKey, (sourceCounts.get(row.sourceKey) ?? 0) + 1);
    physicalEvidenceComparisons += Number(row.physicalComparisonCount ?? 0);
    legacyEvidenceComparisons += Number(row.legacyComparisonCount ?? 0);
    productionReadsEnabled += Number(row.productionReadsEnabled ?? 0);
    appliedToProduction += Number(row.appliedToProduction ?? 0);
    if (Number(row.shadowMode ?? 0) !== 1) shadowModeViolations += 1;
  }
  return {
    version: PHASE7_LOCAL_PERFORMANCE_VERSION,
    recordCount: rows.length,
    statuses,
    locations: Array.from(locations),
    bySource: Array.from(sourceCounts.entries()).map(([sourceKey, count]) => ({ sourceKey, count })),
    physicalEvidenceComparisons,
    legacyEvidenceComparisons,
    productionReadsEnabled,
    appliedToProduction,
    shadowModeViolations,
    readyForPromotion: statuses.VALIDABLE > 0 && physicalEvidenceComparisons > 0,
    valid: productionReadsEnabled === 0 && appliedToProduction === 0 && shadowModeViolations === 0,
    records: rows,
  } as const;
}

/**
 * Persiste une performance locale calculée à partir d’une preuve explicitement fournie.
 * Cette fonction est shadow-only et n’est appelée que lorsqu’une branche d’observation
 * apporte des valeurs physiques ; elle ne lit aucune table de production.
 */
export async function persistPhase7LocalPerformanceShadow(input: Phase7LocalPerformanceInput & { periodKey: string }): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = calculatePhase7LocalPerformance(input);
  await db.insert(shadowWeatherPhase7LocalPerformance).values({
    periodKey: input.periodKey,
    locationKey: result.locationKey,
    sourceKey: result.sourceKey,
    variable: result.variable,
    phase3WindowKey: result.horizonKey,
    evidenceType: result.physicalComparisonCount > 0 ? "physical_observation" : "legacy_unqualified",
    performanceStatus: result.status,
    comparisonCount: result.comparisonCount,
    evaluatedDays: result.evaluatedDays,
    physicalComparisonCount: result.physicalComparisonCount,
    legacyComparisonCount: result.legacyComparisonCount,
    mae: result.mae,
    rmse: result.rmse,
    bias: result.bias,
    lastValidTime: result.lastValidTime,
    missingEvidence: result.missingEvidence,
    productionReadsEnabled: 0,
    shadowMode: 1,
    appliedToProduction: 0,
    evaluatedAt: result.evaluatedAt,
  }).onDuplicateKeyUpdate({
    set: {
      evidenceType: result.physicalComparisonCount > 0 ? "physical_observation" : "legacy_unqualified",
      performanceStatus: result.status,
      comparisonCount: result.comparisonCount,
      evaluatedDays: result.evaluatedDays,
      physicalComparisonCount: result.physicalComparisonCount,
      legacyComparisonCount: result.legacyComparisonCount,
      mae: result.mae,
      rmse: result.rmse,
      bias: result.bias,
      lastValidTime: result.lastValidTime,
      missingEvidence: result.missingEvidence,
      productionReadsEnabled: 0,
      shadowMode: 1,
      appliedToProduction: 0,
      evaluatedAt: result.evaluatedAt,
      updatedAt: new Date(),
    },
  });
  return true;
}
