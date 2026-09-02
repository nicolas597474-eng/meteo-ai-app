import { describe, expect, it } from "vitest";
import { buildPhase4NormalizationReport } from "./weatherDataHubShadow";

describe("Phase 4 shadow data normalization report", () => {
  const metadata = {
    version: "phase4-data-normalization-v1",
    status: "NORMALIZED",
    sourceValue: 12,
    sourceUnit: "°C",
    canonicalUnit: "Cel",
    conversion: "celsius_identity",
    sourceTimezone: "Europe/Paris",
    cardinalDirection: null,
    coordinateStatus: "VALID",
    nativeResolutionStatus: "UNKNOWN",
    issues: [],
    appliedToProduction: 0,
  } as const;

  it("separates normalized, missing, issue, legacy and non-ingested variables", () => {
    const report = buildPhase4NormalizationReport([
      { variable: "air_temperature_2m", unit: "Cel", normalizationMetadata: metadata, missingData: 0, shadowMode: 1, appliedToProduction: 0 },
      { variable: "air_temperature_2m", unit: "Cel", normalizationMetadata: null, missingData: 0, shadowMode: 1, appliedToProduction: 0 },
      {
        variable: "relative_humidity_2m",
        unit: "%",
        normalizationMetadata: { ...metadata, status: "ISSUES", sourceValue: 120, sourceUnit: "%", canonicalUnit: "%", conversion: "percentage_identity", issues: ["VALUE_OUT_OF_RANGE"] },
        missingData: 0,
        shadowMode: 1,
        appliedToProduction: 0,
      },
      {
        variable: "precipitation_amount",
        unit: "mm",
        normalizationMetadata: { ...metadata, status: "MISSING", sourceValue: null, sourceUnit: "mm", canonicalUnit: "mm", conversion: "missing_value", issues: ["MISSING_VALUE"] },
        missingData: 1,
        shadowMode: 1,
        appliedToProduction: 0,
      },
    ]);

    expect(report.valid).toBe(true);
    expect(report.normalizedValueCount).toBe(1);
    expect(report.missingValueCount).toBe(1);
    expect(report.issueValueCount).toBe(1);
    expect(report.legacyValueCount).toBe(1);
    expect(report.variables.find(variable => variable.variable === "air_temperature_2m")?.status).toBe("PARTIAL");
    expect(report.variables.find(variable => variable.variable === "visibility")?.status).toBe("NO_INGESTION");
    expect(report.issues).toContainEqual({ issue: "VALUE_OUT_OF_RANGE", count: 1 });
  });

  it("invalidates the report if a run or normalization is applied to production", () => {
    const report = buildPhase4NormalizationReport([{
      variable: "air_temperature_2m",
      unit: "Cel",
      normalizationMetadata: { ...metadata, appliedToProduction: 1 },
      missingData: 0,
      shadowMode: 1,
      appliedToProduction: 1,
    }]);
    expect(report.valid).toBe(false);
    expect(report.appliedToProduction).toBe(1);
    expect(report.normalizationAppliedToProduction).toBe(1);
  });

  it("invalidates a canonical unit mismatch without rewriting the row", () => {
    const report = buildPhase4NormalizationReport([{
      variable: "air_temperature_2m",
      unit: "°F",
      normalizationMetadata: metadata,
      missingData: 0,
      shadowMode: 1,
      appliedToProduction: 0,
    }]);
    expect(report.valid).toBe(false);
    expect(report.canonicalUnitMismatchCount).toBe(1);
  });
});
