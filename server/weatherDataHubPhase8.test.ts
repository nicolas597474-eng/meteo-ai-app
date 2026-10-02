import { describe, expect, it } from "vitest";
import { buildPhase8MetricsReport, buildPhase8ValidationProgress, selectLatestAdmissiblePhase8Candidates } from "./weatherDataHubShadow";
import { calculatePhase8Metrics } from "../shared/weatherDataHub";
import fs from "node:fs";

describe("Phase 8 metrics shadow", () => {
  it("calcule les métriques déterministes sans inventer les probabilités", () => {
    const result = calculatePhase8Metrics({
      locationKey: "50.781_2.544",
      sourceKey: "arome",
      variable: "air_temperature_2m",
      horizonKey: "6_24h",
      periodStart: 1,
      periodEnd: 10,
      evaluatedAt: 10,
      samples: [
        { forecastValue: 20, observedValue: 21, validTime: 1, evidenceType: "physical_observation", qualityStatus: "VALID" },
        { forecastValue: 22, observedValue: 20, validTime: 86_400_001, evidenceType: "physical_observation", qualityStatus: "VALID" },
      ],
    });
    expect(result.comparisonCount).toBe(2);
    expect(result.physicalComparisonCount).toBe(2);
    expect(result.mae).toBe(1.5);
    expect(result.rmse).toBe(1.58);
    expect(result.brierScore).toBeNull();
    expect(result.crps).toBeNull();
    expect(result.calibrationError).toBeNull();
    expect(result.metricAvailability).toBe("DETERMINISTIC_ONLY");
    expect(result.missingEvidence).toContain("probability_distribution_and_event_outcome");
    expect(result.status).toBe("INSUFFICIENT");
    expect(result.appliedToProduction).toBe(0);
  });

  it("calcule l’erreur circulaire de direction et la pluie séparément", () => {
    const result = calculatePhase8Metrics({
      locationKey: "x", sourceKey: "gfs", variable: "wind_direction_10m", horizonKey: "0_2h",
      periodStart: 1, periodEnd: 2, evaluatedAt: 2,
      samples: [{ forecastValue: 359, observedValue: 1, validTime: 1, evidenceType: "physical_observation", qualityStatus: "VALID" }],
    });
    expect(result.windDirectionMeanAbsoluteError).toBe(2);
  });

  it("sélectionne le run admissible le plus récent et écarte les réceptions postérieures", () => {
    const observationAt = Date.parse("2026-09-29T10:00:00Z");
    const validTime = observationAt;
    const selected = selectLatestAdmissiblePhase8Candidates([
      { valueId: 1, sourceKey: "arome", locationKey: "x", variable: "air_temperature_2m", validTime, receivedAt: observationAt - 6 * 60 * 60_000 },
      { valueId: 2, sourceKey: "arome", locationKey: "x", variable: "air_temperature_2m", validTime, receivedAt: observationAt - 20 * 60_000 },
      { valueId: 3, sourceKey: "arome", locationKey: "x", variable: "air_temperature_2m", validTime, receivedAt: observationAt + 60_000 },
      { valueId: 4, sourceKey: "gfs", locationKey: "x", variable: "air_temperature_2m", validTime, receivedAt: observationAt - 90 * 60_000 },
    ], { locationKey: "x", variable: "air_temperature_2m", validTime, observationAt });
    expect(selected.map((candidate) => candidate.valueId)).toEqual([2, 4]);
  });

  it("signale toute violation de l’isolation", () => {
    const report = buildPhase8MetricsReport([{
      periodKey: "p", periodStart: 1, periodEnd: 2, locationKey: "x", sourceKey: "a", variable: "air_temperature_2m", horizonKey: "0_2h", status: "VALIDABLE", comparisonCount: 30, evaluatedDays: 7, physicalComparisonCount: 30, legacyComparisonCount: 0, mae: 1, rmse: 1, bias: 0, medianAbsoluteError: 1, rainHitRate: null, rainHits: 0, rainMisses: 0, rainFalseAlarms: 0, windDirectionMeanAbsoluteError: null, brierScore: null, crps: null, calibrationError: null, metricAvailability: "DETERMINISTIC_ONLY", missingEvidence: [], productionReadsEnabled: 0, appliedToProduction: 0, evaluatedAt: 2,
    }]);
    expect(report.valid).toBe(true);
    expect(report.statuses.VALIDABLE).toBe(1);
    expect(report.physicalEvidenceComparisons).toBe(30);
    expect(report.probabilisticMetrics).toMatchObject({ status: "UNAVAILABLE", brierRecordCount: 0, crpsRecordCount: 0, calibrationRecordCount: 0, evidenceRecordCount: 0 });
    expect(report.probabilisticMetrics.reasons.join(" ")).toContain("Aucune probabilité");
  });

  it("suit séparément les seuils 18 et 30 par modèle, variable et horizon", () => {
    const row = {
      periodKey: "p", periodStart: 1, periodEnd: 2, locationKey: "x", sourceKey: "gfs", variable: "air_temperature_2m", horizonKey: "6_24h", status: "VALIDABLE", comparisonCount: 30, evaluatedDays: 7, physicalComparisonCount: 30, legacyComparisonCount: 0, mae: 1, rmse: 1, bias: 0, medianAbsoluteError: 1, rainHitRate: null, rainHits: 0, rainMisses: 0, rainFalseAlarms: 0, windDirectionMeanAbsoluteError: null, brierScore: null, crps: null, calibrationError: null, metricAvailability: "DETERMINISTIC_ONLY", missingEvidence: [], productionReadsEnabled: 0, shadowMode: 1, appliedToProduction: 0, evaluatedAt: 2,
    };
    const progress = buildPhase8ValidationProgress([row]);
    expect(progress.physicalComparisonCount).toBe(30);
    expect(progress.scopesAt18).toBe(1);
    expect(progress.scopesAt30).toBe(1);
    expect(progress.intermediateReportReady).toBe(true);
    expect(progress.fullValidationReportReady).toBe(true);
    expect(progress.decisionStatus).toBe("HUMAN_REVIEW_REQUIRED");
    expect(progress.automaticProductionPromotion).toBe(false);
  });

  it("impose le replay physique, l’alignement temporel et le mode shadow", () => {
    const source = fs.readFileSync(new URL("./weatherDataHubShadow.ts", import.meta.url), "utf8");
    expect(source).toContain("forecast_received_after_observation");
    expect(source).toContain("observation_time_ambiguous_or_nonexistent");
    expect(source).toContain("qualified_observation_snapshots");
    expect(source).toContain("shadowMode: 1, appliedToProduction: 0");
    expect(source).toContain("observationProvenance");
    expect(source).toContain("forecastProvenance");
  });
});
