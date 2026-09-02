import { and, desc, eq, inArray } from "drizzle-orm";
import {
  shadowWeatherIngestionRuns,
  shadowWeatherObservationDays,
  shadowWeatherValues,
  type InsertShadowWeatherObservationDay,
  type ShadowWeatherObservationDay,
} from "../drizzle/schema";
import {
  P1_OBSERVATION_THRESHOLDS,
  type P1ObservationVerdict,
} from "../shared/weatherDataHub";
import { getDb } from "./db";

export type P1ObservationMetrics = {
  observationDate: string;
  locationKey: string;
  dailySourceCount: number;
  hourlySourceCount: number;
  totalRunCount: number;
  successRunCount: number;
  partialRunCount: number;
  failedRunCount: number;
  totalValueCount: number;
  validValueCount: number;
  missingValueCount: number;
  duplicateRunGroupCount: number;
  nonShadowValueCount: number;
  appliedToProductionCount: number;
  contractCompliantValueCount: number;
};

export type P1ObservationEvaluation = P1ObservationMetrics & {
  expectedSourceCount: number;
  writeSuccessRate: number;
  contractIntegrityRate: number;
  coverageGatePassed: boolean;
  writeSuccessGatePassed: boolean;
  idempotenceGatePassed: boolean;
  isolationGatePassed: boolean;
  contractGatePassed: boolean;
  verdict: Exclude<P1ObservationVerdict, "OBSERVING">;
  reasons: string[];
};

export type P1ObservationWindow = {
  requiredDays: number;
  completedDays: number;
  remainingDays: number;
  verdict: P1ObservationVerdict;
  reasons: string[];
  history: ShadowWeatherObservationDay[];
};

export function evaluateP1ObservationMetrics(metrics: P1ObservationMetrics): P1ObservationEvaluation {
  const expectedSourceCount = P1_OBSERVATION_THRESHOLDS.expectedSources;
  const writeSuccessRate = metrics.totalRunCount > 0
    ? (metrics.successRunCount + metrics.partialRunCount) / metrics.totalRunCount
    : 0;
  const contractIntegrityRate = metrics.totalValueCount > 0
    ? metrics.contractCompliantValueCount / metrics.totalValueCount
    : 0;
  const coverageGatePassed = metrics.dailySourceCount === expectedSourceCount
    && metrics.hourlySourceCount === expectedSourceCount;
  const writeSuccessGatePassed = writeSuccessRate >= P1_OBSERVATION_THRESHOLDS.minimumWriteSuccessRate;
  const idempotenceGatePassed = metrics.duplicateRunGroupCount <= P1_OBSERVATION_THRESHOLDS.maximumDuplicateRunGroups;
  const isolationGatePassed = metrics.appliedToProductionCount <= P1_OBSERVATION_THRESHOLDS.maximumAppliedToProduction
    && metrics.nonShadowValueCount <= P1_OBSERVATION_THRESHOLDS.maximumNonShadowValues;
  const contractGatePassed = contractIntegrityRate >= P1_OBSERVATION_THRESHOLDS.minimumContractIntegrityRate;
  const reasons: string[] = [];

  if (!coverageGatePassed) reasons.push(`Couverture incomplète : ${metrics.dailySourceCount}/${expectedSourceCount} quotidien, ${metrics.hourlySourceCount}/${expectedSourceCount} horaire.`);
  if (!writeSuccessGatePassed) reasons.push(`Taux de runs SUCCESS insuffisant : ${(writeSuccessRate * 100).toFixed(1)}%.`);
  if (!idempotenceGatePassed) reasons.push(`${metrics.duplicateRunGroupCount} groupe(s) de runs dupliqués détecté(s).`);
  if (!isolationGatePassed) reasons.push(`Isolation rompue : ${metrics.appliedToProductionCount} run(s) appliqué(s), ${metrics.nonShadowValueCount} valeur(s) hors shadow.`);
  if (!contractGatePassed) reasons.push(`Intégrité canonique insuffisante : ${(contractIntegrityRate * 100).toFixed(1)}%.`);

  const hardFailure = !idempotenceGatePassed || !isolationGatePassed;
  const allGatesPassed = coverageGatePassed
    && writeSuccessGatePassed
    && idempotenceGatePassed
    && isolationGatePassed
    && contractGatePassed;

  return {
    ...metrics,
    expectedSourceCount,
    writeSuccessRate,
    contractIntegrityRate,
    coverageGatePassed,
    writeSuccessGatePassed,
    idempotenceGatePassed,
    isolationGatePassed,
    contractGatePassed,
    verdict: hardFailure ? "FAILED" : allGatesPassed ? "VALIDABLE" : "EXTEND",
    reasons,
  };
}

export function resolveP1ObservationWindow(history: ShadowWeatherObservationDay[]): P1ObservationWindow {
  const requiredDays = P1_OBSERVATION_THRESHOLDS.requiredDays;
  const ordered = [...history].sort((a, b) => b.observationDate.localeCompare(a.observationDate));
  const latestByDate = Array.from(new Map(ordered.map(row => [row.observationDate, row])).values());
  const completedDays = Math.min(requiredDays, latestByDate.length);
  const windowRows = latestByDate.slice(0, requiredDays);
  const reasons: string[] = [];

  if (completedDays < requiredDays) {
    reasons.push(`Observation en cours : ${completedDays}/${requiredDays} jours enregistrés.`);
    return {
      requiredDays,
      completedDays,
      remainingDays: requiredDays - completedDays,
      verdict: "OBSERVING",
      reasons,
      history: ordered,
    };
  }

  if (windowRows.some(row => row.verdict === "FAILED")) {
    reasons.push("Au moins un jour présente une rupture d’idempotence ou d’isolation.");
    return { requiredDays, completedDays, remainingDays: 0, verdict: "FAILED", reasons, history: ordered };
  }

  if (windowRows.every(row => row.verdict === "VALIDABLE")) {
    reasons.push("Les sept bilans quotidiens satisfont tous les critères P1.6.");
    return { requiredDays, completedDays, remainingDays: 0, verdict: "VALIDABLE", reasons, history: ordered };
  }

  reasons.push("La fenêtre est complète, mais au moins un critère récupérable reste insuffisant.");
  return { requiredDays, completedDays, remainingDays: 0, verdict: "EXTEND", reasons, history: ordered };
}

function isContractCompliantValue(value: {
  value: number | null;
  missingData: number;
  qualityStatus: string;
  shadowMode: number;
}) {
  if (value.shadowMode !== 1) return false;
  if (value.value == null) return value.missingData === 1 && value.qualityStatus === "MISSING";
  return value.missingData === 0 && value.qualityStatus !== "MISSING";
}

export async function recordP1ObservationDay(input: {
  observationDate: string;
  locationKey: string;
  evaluatedAt?: number;
}): Promise<P1ObservationEvaluation> {
  const db = await getDb();
  if (!db) throw new Error("shadow_database_unavailable");
  const cycleKeys = [`daily:${input.observationDate}:v1`, `hourly:${input.observationDate}:v1`];
  const runs = await db.select({
    id: shadowWeatherIngestionRuns.id,
    cycleKey: shadowWeatherIngestionRuns.cycleKey,
    sourceDefinitionId: shadowWeatherIngestionRuns.sourceDefinitionId,
    status: shadowWeatherIngestionRuns.status,
    appliedToProduction: shadowWeatherIngestionRuns.appliedToProduction,
  }).from(shadowWeatherIngestionRuns).where(and(
    eq(shadowWeatherIngestionRuns.locationKey, input.locationKey),
    inArray(shadowWeatherIngestionRuns.cycleKey, cycleKeys),
  ));

  const runIds = runs.map(run => run.id);
  const values = runIds.length === 0 ? [] : await db.select({
    value: shadowWeatherValues.value,
    missingData: shadowWeatherValues.missingData,
    qualityStatus: shadowWeatherValues.qualityStatus,
    shadowMode: shadowWeatherValues.shadowMode,
  }).from(shadowWeatherValues).where(inArray(shadowWeatherValues.ingestionRunId, runIds));

  const runUniquenessKeys = runs.map(run => `${run.cycleKey}|${run.sourceDefinitionId}|${input.locationKey}`);
  const duplicateRunGroupCount = Math.max(0, runUniquenessKeys.length - new Set(runUniquenessKeys).size);
  const evaluation = evaluateP1ObservationMetrics({
    observationDate: input.observationDate,
    locationKey: input.locationKey,
    dailySourceCount: new Set(runs.filter(run => run.cycleKey.startsWith("daily:")).map(run => run.sourceDefinitionId)).size,
    hourlySourceCount: new Set(runs.filter(run => run.cycleKey.startsWith("hourly:")).map(run => run.sourceDefinitionId)).size,
    totalRunCount: runs.length,
    successRunCount: runs.filter(run => run.status === "SUCCESS").length,
    partialRunCount: runs.filter(run => run.status === "PARTIAL").length,
    failedRunCount: runs.filter(run => run.status === "FAILED").length,
    totalValueCount: values.length,
    validValueCount: values.filter(value => value.value != null && value.missingData === 0).length,
    missingValueCount: values.filter(value => value.missingData === 1).length,
    duplicateRunGroupCount,
    nonShadowValueCount: values.filter(value => value.shadowMode !== 1).length,
    appliedToProductionCount: runs.filter(run => run.appliedToProduction === 1).length,
    contractCompliantValueCount: values.filter(isContractCompliantValue).length,
  });
  const evaluatedAt = input.evaluatedAt ?? Date.now();
  const row: InsertShadowWeatherObservationDay = {
    observationDate: input.observationDate,
    locationKey: input.locationKey,
    expectedSourceCount: evaluation.expectedSourceCount,
    dailySourceCount: evaluation.dailySourceCount,
    hourlySourceCount: evaluation.hourlySourceCount,
    totalRunCount: evaluation.totalRunCount,
    successRunCount: evaluation.successRunCount,
    partialRunCount: evaluation.partialRunCount,
    failedRunCount: evaluation.failedRunCount,
    totalValueCount: evaluation.totalValueCount,
    validValueCount: evaluation.validValueCount,
    missingValueCount: evaluation.missingValueCount,
    duplicateRunGroupCount: evaluation.duplicateRunGroupCount,
    nonShadowValueCount: evaluation.nonShadowValueCount,
    appliedToProductionCount: evaluation.appliedToProductionCount,
    writeSuccessRate: evaluation.writeSuccessRate,
    contractIntegrityRate: evaluation.contractIntegrityRate,
    coverageGatePassed: evaluation.coverageGatePassed ? 1 : 0,
    writeSuccessGatePassed: evaluation.writeSuccessGatePassed ? 1 : 0,
    idempotenceGatePassed: evaluation.idempotenceGatePassed ? 1 : 0,
    isolationGatePassed: evaluation.isolationGatePassed ? 1 : 0,
    contractGatePassed: evaluation.contractGatePassed ? 1 : 0,
    verdict: evaluation.verdict,
    reasons: evaluation.reasons,
    evaluatedAt,
  };

  await db.insert(shadowWeatherObservationDays).values(row).onDuplicateKeyUpdate({
    set: { ...row, updatedAt: new Date() },
  });
  return evaluation;
}

export async function getP1ObservationWindow(locationKey: string, historyDays = 14): Promise<P1ObservationWindow> {
  const db = await getDb();
  if (!db) return resolveP1ObservationWindow([]);
  const history = await db.select().from(shadowWeatherObservationDays)
    .where(eq(shadowWeatherObservationDays.locationKey, locationKey))
    .orderBy(desc(shadowWeatherObservationDays.observationDate))
    .limit(Math.max(P1_OBSERVATION_THRESHOLDS.requiredDays, historyDays));
  return resolveP1ObservationWindow(history);
}
