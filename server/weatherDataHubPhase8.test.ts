import { describe, expect, it } from "vitest";
import { buildPhase8MetricsReport } from "./weatherDataHubShadow";
import { calculatePhase8Metrics } from "../shared/weatherDataHub";

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

  it("signale toute violation de l’isolation", () => {
    const report = buildPhase8MetricsReport([{
      periodKey: "p", periodStart: 1, periodEnd: 2, locationKey: "x", sourceKey: "a", variable: "air_temperature_2m", horizonKey: "0_2h", status: "VALIDABLE", comparisonCount: 30, evaluatedDays: 7, physicalComparisonCount: 30, legacyComparisonCount: 0, mae: 1, rmse: 1, bias: 0, medianAbsoluteError: 1, rainHitRate: null, rainHits: 0, rainMisses: 0, rainFalseAlarms: 0, windDirectionMeanAbsoluteError: null, brierScore: null, crps: null, calibrationError: null, metricAvailability: "DETERMINISTIC_ONLY", missingEvidence: [], productionReadsEnabled: 0, appliedToProduction: 0, evaluatedAt: 2,
    }]);
    expect(report.valid).toBe(true);
    expect(report.statuses.VALIDABLE).toBe(1);
    expect(report.physicalEvidenceComparisons).toBe(30);
  });
});
