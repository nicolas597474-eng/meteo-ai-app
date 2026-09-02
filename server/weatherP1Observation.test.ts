import { describe, expect, it } from "vitest";
import type { ShadowWeatherObservationDay } from "../drizzle/schema";
import {
  evaluateP1ObservationMetrics,
  resolveP1ObservationWindow,
  type P1ObservationMetrics,
} from "./weatherP1Observation";

const healthyMetrics: P1ObservationMetrics = {
  observationDate: "2026-09-02",
  locationKey: "50.7565,2.5199",
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
  contractCompliantValueCount: 1976,
};

function historyRow(date: string, verdict: "VALIDABLE" | "EXTEND" | "FAILED"): ShadowWeatherObservationDay {
  return {
    id: 1,
    observationDate: date,
    locationKey: healthyMetrics.locationKey,
    expectedSourceCount: 8,
    dailySourceCount: 8,
    hourlySourceCount: 8,
    totalRunCount: 16,
    successRunCount: 16,
    partialRunCount: 0,
    failedRunCount: 0,
    totalValueCount: 1976,
    validValueCount: 1976,
    missingValueCount: 0,
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
    verdict,
    reasons: [],
    evaluatedAt: Date.parse(`${date}T05:00:00Z`),
    createdAt: new Date(`${date}T05:00:00Z`),
    updatedAt: new Date(`${date}T05:00:00Z`),
  };
}

describe("P1.6 observation evaluator", () => {
  it("qualifie un bilan quotidien sain comme VALIDABLE", () => {
    const result = evaluateP1ObservationMetrics(healthyMetrics);
    expect(result.verdict).toBe("VALIDABLE");
    expect(result.coverageGatePassed).toBe(true);
    expect(result.isolationGatePassed).toBe(true);
  });

  it("demande une prolongation lorsque la couverture est incomplète", () => {
    const result = evaluateP1ObservationMetrics({ ...healthyMetrics, hourlySourceCount: 7 });
    expect(result.verdict).toBe("EXTEND");
    expect(result.reasons[0]).toContain("7/8 horaire");
  });

  it("considère un run PARTIAL persisté comme une écriture réussie avec données manquantes explicites", () => {
    const result = evaluateP1ObservationMetrics({
      ...healthyMetrics,
      successRunCount: 14,
      partialRunCount: 2,
    });
    expect(result.writeSuccessRate).toBe(1);
    expect(result.verdict).toBe("VALIDABLE");
  });

  it("échoue immédiatement si l’isolation ou l’idempotence est rompue", () => {
    expect(evaluateP1ObservationMetrics({ ...healthyMetrics, appliedToProductionCount: 1 }).verdict).toBe("FAILED");
    expect(evaluateP1ObservationMetrics({ ...healthyMetrics, duplicateRunGroupCount: 1 }).verdict).toBe("FAILED");
  });

  it("reste OBSERVING tant que sept dates distinctes ne sont pas présentes", () => {
    const result = resolveP1ObservationWindow([historyRow("2026-09-02", "VALIDABLE")]);
    expect(result.verdict).toBe("OBSERVING");
    expect(result.remainingDays).toBe(6);
  });

  it("ne compte pas deux fois une même date lors d’un replay idempotent", () => {
    const first = historyRow("2026-09-02", "VALIDABLE");
    const replay = { ...historyRow("2026-09-02", "VALIDABLE"), id: 2 };
    const result = resolveP1ObservationWindow([first, replay]);

    expect(result.completedDays).toBe(1);
    expect(result.remainingDays).toBe(6);
    expect(result.verdict).toBe("OBSERVING");
  });

  it("devient VALIDABLE après sept bilans quotidiens conformes", () => {
    const history = Array.from({ length: 7 }, (_, index) => historyRow(`2026-09-0${index + 1}`, "VALIDABLE"));
    expect(resolveP1ObservationWindow(history).verdict).toBe("VALIDABLE");
  });

  it("demande EXTEND après sept jours si un critère récupérable reste insuffisant", () => {
    const history = Array.from({ length: 7 }, (_, index) => historyRow(`2026-09-0${index + 1}`, index === 3 ? "EXTEND" : "VALIDABLE"));
    expect(resolveP1ObservationWindow(history).verdict).toBe("EXTEND");
  });

  it("retourne FAILED si la fenêtre contient une rupture dure", () => {
    const history = Array.from({ length: 7 }, (_, index) => historyRow(`2026-09-0${index + 1}`, index === 2 ? "FAILED" : "VALIDABLE"));
    expect(resolveP1ObservationWindow(history).verdict).toBe("FAILED");
  });
});
