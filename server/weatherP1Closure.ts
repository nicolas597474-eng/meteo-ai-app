import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import {
  shadowWeatherObservationClosures,
  shadowWeatherObservationDays,
  type InsertShadowWeatherObservationClosure,
  type ShadowWeatherObservationClosure,
  type ShadowWeatherObservationDay,
} from "../drizzle/schema";
import { P1_OBSERVATION_THRESHOLDS } from "../shared/weatherDataHub";
import { getDb } from "./db";

export type P1ObservationClosureDayEvidence = {
  id: number;
  observationDate: string;
  locationKey: string;
  expectedSourceCount: number;
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
  writeSuccessRate: number;
  recalculatedWriteSuccessRate: number;
  contractIntegrityRate: number;
  coverageGatePassed: number;
  writeSuccessGatePassed: number;
  idempotenceGatePassed: number;
  isolationGatePassed: number;
  contractGatePassed: number;
  storedVerdict: string;
  reasons: unknown;
  evaluatedAt: number;
  createdAt: string;
  updatedAt: string;
  revalidatedCriteria: {
    coverage: boolean;
    writeSuccess: boolean;
    idempotence: boolean;
    productionIsolation: boolean;
    contractIntegrity: boolean;
  };
};

export type P1ObservationClosureEvidence = {
  version: "p1.6-admin-closure-v1";
  locationKey: string;
  capturedAt: number;
  requiredDays: number;
  completedDistinctDays: number;
  oldestObservationDate: string;
  newestObservationDate: string;
  thresholds: typeof P1_OBSERVATION_THRESHOLDS;
  days: P1ObservationClosureDayEvidence[];
};

export type P1ObservationClosureDecision = {
  closure: ShadowWeatherObservationClosure;
  repeated: boolean;
};

export type P1ObservationClosureInsert = Omit<
  InsertShadowWeatherObservationClosure,
  "id" | "createdAt"
>;

export interface P1ObservationClosureRepository {
  getClosure(
    locationKey: string,
    forUpdate?: boolean
  ): Promise<ShadowWeatherObservationClosure | null>;
  getLatestDays(
    locationKey: string,
    limit: number
  ): Promise<ShadowWeatherObservationDay[]>;
  insertClosureIfAbsent(input: P1ObservationClosureInsert): Promise<{
    created: boolean;
    closure: ShadowWeatherObservationClosure;
  }>;
}

export class P1ObservationClosureRejectedError extends Error {
  constructor(readonly reasons: string[]) {
    super(reasons.join(" "));
    this.name = "P1ObservationClosureRejectedError";
  }
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

function finiteNonNegative(values: number[]): boolean {
  return values.every(value => Number.isFinite(value) && value >= 0);
}

function dateValue(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function revalidateDay(row: ShadowWeatherObservationDay) {
  const numericCounts = [
    row.expectedSourceCount,
    row.dailySourceCount,
    row.hourlySourceCount,
    row.totalRunCount,
    row.successRunCount,
    row.partialRunCount,
    row.failedRunCount,
    row.totalValueCount,
    row.validValueCount,
    row.missingValueCount,
    row.duplicateRunGroupCount,
    row.nonShadowValueCount,
    row.appliedToProductionCount,
  ];
  const countDataValid = finiteNonNegative(numericCounts);
  const validRunTotal =
    countDataValid &&
    row.totalRunCount > 0 &&
    row.successRunCount + row.partialRunCount + row.failedRunCount <=
      row.totalRunCount;
  const recalculatedWriteSuccessRate = validRunTotal
    ? (row.successRunCount + row.partialRunCount) / row.totalRunCount
    : 0;
  const checks = {
    coverage:
      countDataValid &&
      row.expectedSourceCount === P1_OBSERVATION_THRESHOLDS.expectedSources &&
      row.dailySourceCount === P1_OBSERVATION_THRESHOLDS.expectedSources &&
      row.hourlySourceCount === P1_OBSERVATION_THRESHOLDS.expectedSources,
    writeSuccess:
      validRunTotal &&
      recalculatedWriteSuccessRate >=
        P1_OBSERVATION_THRESHOLDS.minimumWriteSuccessRate,
    idempotence:
      countDataValid &&
      row.duplicateRunGroupCount <=
        P1_OBSERVATION_THRESHOLDS.maximumDuplicateRunGroups,
    productionIsolation:
      countDataValid &&
      row.appliedToProductionCount <=
        P1_OBSERVATION_THRESHOLDS.maximumAppliedToProduction &&
      row.nonShadowValueCount <=
        P1_OBSERVATION_THRESHOLDS.maximumNonShadowValues,
    contractIntegrity:
      Number.isFinite(row.contractIntegrityRate) &&
      row.contractIntegrityRate <= 1 &&
      row.contractIntegrityRate >=
        P1_OBSERVATION_THRESHOLDS.minimumContractIntegrityRate,
  };
  return { checks, recalculatedWriteSuccessRate };
}

export function buildP1ObservationClosureEvidence(
  locationKey: string,
  rows: ShadowWeatherObservationDay[],
  capturedAt: number
): { evidence: P1ObservationClosureEvidence; reasons: string[] } {
  const uniqueByDate = new Map<string, ShadowWeatherObservationDay>();
  for (const row of [...rows].sort((left, right) =>
    right.observationDate.localeCompare(left.observationDate)
  )) {
    if (!uniqueByDate.has(row.observationDate))
      uniqueByDate.set(row.observationDate, row);
  }
  const windowRows = Array.from(uniqueByDate.values()).slice(
    0,
    P1_OBSERVATION_THRESHOLDS.requiredDays
  );
  const reasons: string[] = [];
  if (windowRows.length < P1_OBSERVATION_THRESHOLDS.requiredDays) {
    reasons.push(
      `Sept bilans quotidiens distincts sont requis ; ${windowRows.length}/${P1_OBSERVATION_THRESHOLDS.requiredDays} sont disponibles.`
    );
  }

  const days = windowRows.map(row => {
    const { checks, recalculatedWriteSuccessRate } = revalidateDay(row);
    if (!validIsoDate(row.observationDate))
      reasons.push(`Date d’observation invalide : ${row.observationDate}.`);
    if (row.locationKey !== locationKey)
      reasons.push(
        `Le bilan ${row.observationDate} ne correspond pas au lieu demandé.`
      );
    if (!checks.coverage)
      reasons.push(
        `${row.observationDate} : couverture des huit sources incomplète ou incohérente.`
      );
    if (!checks.writeSuccess)
      reasons.push(
        `${row.observationDate} : taux de runs réussis inférieur au seuil métier.`
      );
    if (!checks.idempotence)
      reasons.push(
        `${row.observationDate} : le critère d’idempotence n’est pas satisfait.`
      );
    if (!checks.productionIsolation)
      reasons.push(
        `${row.observationDate} : l’isolation shadow/production n’est pas satisfaite.`
      );
    if (!checks.contractIntegrity)
      reasons.push(
        `${row.observationDate} : l’intégrité du contrat est insuffisante.`
      );

    return {
      id: Number(row.id),
      observationDate: row.observationDate,
      locationKey: row.locationKey,
      expectedSourceCount: row.expectedSourceCount,
      dailySourceCount: row.dailySourceCount,
      hourlySourceCount: row.hourlySourceCount,
      totalRunCount: row.totalRunCount,
      successRunCount: row.successRunCount,
      partialRunCount: row.partialRunCount,
      failedRunCount: row.failedRunCount,
      totalValueCount: row.totalValueCount,
      validValueCount: row.validValueCount,
      missingValueCount: row.missingValueCount,
      duplicateRunGroupCount: row.duplicateRunGroupCount,
      nonShadowValueCount: row.nonShadowValueCount,
      appliedToProductionCount: row.appliedToProductionCount,
      writeSuccessRate: row.writeSuccessRate,
      recalculatedWriteSuccessRate,
      contractIntegrityRate: row.contractIntegrityRate,
      coverageGatePassed: row.coverageGatePassed,
      writeSuccessGatePassed: row.writeSuccessGatePassed,
      idempotenceGatePassed: row.idempotenceGatePassed,
      isolationGatePassed: row.isolationGatePassed,
      contractGatePassed: row.contractGatePassed,
      storedVerdict: row.verdict,
      reasons: row.reasons,
      evaluatedAt: Number(row.evaluatedAt),
      createdAt: dateValue(row.createdAt),
      updatedAt: dateValue(row.updatedAt),
      revalidatedCriteria: checks,
    } satisfies P1ObservationClosureDayEvidence;
  });

  const dates = days.map(day => day.observationDate).sort();
  const evidence: P1ObservationClosureEvidence = {
    version: "p1.6-admin-closure-v1",
    locationKey,
    capturedAt,
    requiredDays: P1_OBSERVATION_THRESHOLDS.requiredDays,
    completedDistinctDays: new Set(dates).size,
    oldestObservationDate: dates[0] ?? "",
    newestObservationDate: dates.at(-1) ?? "",
    thresholds: P1_OBSERVATION_THRESHOLDS,
    days,
  };
  return { evidence, reasons: Array.from(new Set(reasons)) };
}

export async function decideP1ObservationClosure(
  input: { locationKey: string; validatedByUserId: number },
  repository: P1ObservationClosureRepository,
  validatedAt = Date.now()
): Promise<P1ObservationClosureDecision> {
  const existing = await repository.getClosure(input.locationKey);
  if (existing) return { closure: existing, repeated: true };

  const rows = await repository.getLatestDays(
    input.locationKey,
    P1_OBSERVATION_THRESHOLDS.requiredDays
  );
  const confirmedExisting = await repository.getClosure(
    input.locationKey,
    true
  );
  if (confirmedExisting) return { closure: confirmedExisting, repeated: true };
  const { evidence, reasons } = buildP1ObservationClosureEvidence(
    input.locationKey,
    rows,
    validatedAt
  );
  if (
    reasons.length > 0 ||
    evidence.completedDistinctDays !== P1_OBSERVATION_THRESHOLDS.requiredDays
  ) {
    throw new P1ObservationClosureRejectedError(
      reasons.length > 0
        ? reasons
        : [
            `Sept bilans quotidiens distincts sont requis ; ${evidence.completedDistinctDays}/${P1_OBSERVATION_THRESHOLDS.requiredDays} sont disponibles.`,
          ]
    );
  }

  const row: P1ObservationClosureInsert = {
    locationKey: input.locationKey,
    closureStatus: "CLOSED",
    validatedByUserId: input.validatedByUserId,
    validatedAt,
    evidenceSnapshot: evidence,
    evidenceHash: hashP1ObservationClosureEvidence(evidence),
  };
  const result = await repository.insertClosureIfAbsent(row);
  return { closure: result.closure, repeated: !result.created };
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = canonicalizeJson(record[key]);
        return sorted;
      }, {});
  }
  return value;
}

export function hashP1ObservationClosureEvidence(
  evidence: P1ObservationClosureEvidence
): string {
  const canonicalJson = JSON.stringify(canonicalizeJson(evidence));
  return createHash("sha256").update(canonicalJson).digest("hex");
}

function isDuplicateKeyError(error: unknown): boolean {
  const candidates = [
    error,
    (error as any)?.cause,
    (error as any)?.driverError,
  ];
  return candidates.some(
    (candidate: any) =>
      candidate?.code === "ER_DUP_ENTRY" || candidate?.errno === 1062
  );
}

async function selectClosure(
  locationKey: string
): Promise<ShadowWeatherObservationClosure | null> {
  const db = await getDb();
  if (!db) return null;
  return (
    (
      await db
        .select()
        .from(shadowWeatherObservationClosures)
        .where(eq(shadowWeatherObservationClosures.locationKey, locationKey))
        .limit(1)
    )[0] ?? null
  );
}

export async function getP1ObservationClosure(
  locationKey: string
): Promise<ShadowWeatherObservationClosure | null> {
  return selectClosure(locationKey);
}

export async function closeP1ObservationWindow(input: {
  locationKey: string;
  validatedByUserId: number;
}): Promise<P1ObservationClosureDecision> {
  const db = await getDb();
  if (!db)
    throw new Error(
      "P1.6 closure storage is unavailable; apply the additive migration first."
    );

  return db.transaction(async tx => {
    const repository: P1ObservationClosureRepository = {
      async getClosure(locationKey, forUpdate = false) {
        const query = tx
          .select()
          .from(shadowWeatherObservationClosures)
          .where(eq(shadowWeatherObservationClosures.locationKey, locationKey))
          .limit(1);
        const rows = forUpdate ? await query.for("update") : await query;
        return rows[0] ?? null;
      },
      async getLatestDays(locationKey, limit) {
        return tx
          .select()
          .from(shadowWeatherObservationDays)
          .where(eq(shadowWeatherObservationDays.locationKey, locationKey))
          .orderBy(desc(shadowWeatherObservationDays.observationDate))
          .limit(limit)
          .for("update");
      },
      async insertClosureIfAbsent(row) {
        let created = true;
        try {
          await tx.insert(shadowWeatherObservationClosures).values(row);
        } catch (error) {
          if (!isDuplicateKeyError(error)) throw error;
          created = false;
        }
        const closure =
          (
            await tx
              .select()
              .from(shadowWeatherObservationClosures)
              .where(
                eq(
                  shadowWeatherObservationClosures.locationKey,
                  row.locationKey
                )
              )
              .limit(1)
              .for("update")
          )[0] ?? null;
        if (!closure)
          throw new Error("P1.6 closure could not be read after persistence.");
        return { created, closure };
      },
    };

    return decideP1ObservationClosure(input, repository);
  });
}
