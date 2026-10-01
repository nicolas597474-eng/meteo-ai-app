import { describe, expect, it, vi } from "vitest";
import type {
  ShadowWeatherObservationClosure,
  ShadowWeatherObservationDay,
} from "../drizzle/schema";
import {
  buildP1ObservationClosureEvidence,
  decideP1ObservationClosure,
  hashP1ObservationClosureEvidence,
  P1ObservationClosureRejectedError,
  type P1ObservationClosureInsert,
  type P1ObservationClosureRepository,
} from "./weatherP1Closure";

const locationKey = "50.756_2.52";
function observationDay(
  index: number,
  changes: Partial<ShadowWeatherObservationDay> = {}
): ShadowWeatherObservationDay {
  const date = `2026-09-${String(index).padStart(2, "0")}`;
  return {
    id: index,
    observationDate: date,
    locationKey,
    expectedSourceCount: 8,
    dailySourceCount: 8,
    hourlySourceCount: 8,
    totalRunCount: 16,
    successRunCount: 16,
    partialRunCount: 0,
    failedRunCount: 0,
    totalValueCount: 1976,
    validValueCount: 1900,
    missingValueCount: 76,
    duplicateRunGroupCount: 0,
    nonShadowValueCount: 0,
    appliedToProductionCount: 0,
    writeSuccessRate: 1,
    contractIntegrityRate: 1,
    coverageGatePassed: 1,
    writeSuccessGatePassed: 1,
    idempotenceGatePassed: 1,
    isolationGatePassed: 1,
    contractGatePassed: 1,
    verdict: "VALIDABLE",
    reasons: [],
    evaluatedAt: Date.parse(`${date}T05:00:00.000Z`),
    createdAt: new Date(`${date}T05:00:00.000Z`),
    updatedAt: new Date(`${date}T05:00:00.000Z`),
    ...changes,
  };
}

function repository(
  days: ShadowWeatherObservationDay[]
): P1ObservationClosureRepository & {
  inserted: P1ObservationClosureInsert[];
  stored: ShadowWeatherObservationClosure | null;
} {
  const state: {
    inserted: P1ObservationClosureInsert[];
    stored: ShadowWeatherObservationClosure | null;
  } = { inserted: [], stored: null };
  return {
    ...state,
    get inserted() {
      return state.inserted;
    },
    get stored() {
      return state.stored;
    },
    async getClosure(key) {
      return state.stored?.locationKey === key ? state.stored : null;
    },
    async getLatestDays(key, limit) {
      return days
        .filter(day => day.locationKey === key)
        .slice()
        .sort((a, b) => b.observationDate.localeCompare(a.observationDate))
        .slice(0, limit);
    },
    async insertClosureIfAbsent(input) {
      if (state.stored) return { created: false, closure: state.stored };
      state.inserted.push(input);
      state.stored = {
        ...input,
        id: 44,
        createdAt: new Date("2026-09-08T06:00:00.000Z"),
      };
      return { created: true, closure: state.stored };
    },
  };
}

const sevenHealthyDays = () =>
  Array.from({ length: 7 }, (_, index) => observationDay(index + 1));

describe("P1.6 administrative closure", () => {
  it("rejects incomplete windows and revalidates persisted business criteria, regardless of stored verdict", async () => {
    const incomplete = repository(sevenHealthyDays().slice(0, 6));
    await expect(
      decideP1ObservationClosure(
        { locationKey, validatedByUserId: 12 },
        incomplete,
        1_800_000_000_000
      )
    ).rejects.toBeInstanceOf(P1ObservationClosureRejectedError);
    expect(incomplete.inserted).toHaveLength(0);

    const badCoverageDays = sevenHealthyDays();
    badCoverageDays[0] = observationDay(1, {
      hourlySourceCount: 7,
      verdict: "VALIDABLE",
    });
    const badCoverage = repository(badCoverageDays);
    await expect(
      decideP1ObservationClosure(
        { locationKey, validatedByUserId: 12 },
        badCoverage,
        1_800_000_000_000
      )
    ).rejects.toThrow(/couverture des huit sources/i);
    expect(badCoverage.inserted).toHaveLength(0);

    for (const dayChange of [
      { duplicateRunGroupCount: 1 },
      { appliedToProductionCount: 1 },
      { nonShadowValueCount: 1 },
      { contractIntegrityRate: 0.99 },
      { successRunCount: 15, failedRunCount: 1 },
    ]) {
      const days = sevenHealthyDays();
      days[0] = observationDay(1, dayChange);
      const invalid = repository(days);
      await expect(
        decideP1ObservationClosure(
          { locationKey, validatedByUserId: 12 },
          invalid,
          1_800_000_000_000
        )
      ).rejects.toBeInstanceOf(P1ObservationClosureRejectedError);
      expect(invalid.inserted).toHaveLength(0);
    }
  });

  it("saves the admin, decision time, exact seven-day evidence, and a verifiable hash without changing source rows", async () => {
    const days = sevenHealthyDays();
    const before = structuredClone(days);
    const repo = repository(days);
    const result = await decideP1ObservationClosure(
      { locationKey, validatedByUserId: 27 },
      repo,
      1_800_000_000_000
    );

    expect(result.repeated).toBe(false);
    expect(result.closure.closureStatus).toBe("CLOSED");
    expect(result.closure.validatedByUserId).toBe(27);
    expect(result.closure.validatedAt).toBe(1_800_000_000_000);
    const evidence = result.closure.evidenceSnapshot as {
      version: string;
      completedDistinctDays: number;
      days: Array<{
        id: number;
        observationDate: string;
        revalidatedCriteria: { coverage: boolean; writeSuccess: boolean };
      }>;
    };
    expect(evidence.version).toBe("p1.6-admin-closure-v1");
    expect(evidence.completedDistinctDays).toBe(7);
    expect(evidence.days).toHaveLength(7);
    expect(
      evidence.days.every(
        day =>
          day.revalidatedCriteria.coverage &&
          day.revalidatedCriteria.writeSuccess
      )
    ).toBe(true);
    expect(result.closure.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.closure.evidenceHash).toBe(
      hashP1ObservationClosureEvidence(evidence as never)
    );
    expect(days).toEqual(before);
    expect(repo.inserted).toHaveLength(1);
  });

  it("rejects duplicate dates instead of counting seven rows as seven days", () => {
    const duplicated = sevenHealthyDays();
    duplicated[6] = { ...observationDay(6), id: 70 };
    const { evidence, reasons } = buildP1ObservationClosureEvidence(
      locationKey,
      duplicated,
      1_800_000_000_000
    );
    expect(evidence.completedDistinctDays).toBe(6);
    expect(reasons.some(reason => reason.includes("6/7"))).toBe(true);
  });

  it("is idempotent after closure and preserves the originally recorded proof", async () => {
    const days = sevenHealthyDays();
    const repo = repository(days);
    const first = await decideP1ObservationClosure(
      { locationKey, validatedByUserId: 27 },
      repo,
      1_800_000_000_000
    );
    const storedEvidence = structuredClone(first.closure.evidenceSnapshot);
    const second = await decideP1ObservationClosure(
      { locationKey, validatedByUserId: 99 },
      repo,
      1_800_100_000_000
    );

    expect(first.repeated).toBe(false);
    expect(second.repeated).toBe(true);
    expect(second.closure.validatedByUserId).toBe(27);
    expect(second.closure.evidenceSnapshot).toEqual(storedEvidence);
    expect(repo.inserted).toHaveLength(1);
  });
});
