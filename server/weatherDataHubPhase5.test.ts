import { describe, expect, it } from "vitest";
import {
  PHASE5_QUALITY_CONTROL_VERSION,
  evaluatePhase5QualityControl,
  normalizePhase4WeatherValue,
  type Phase5QualityControlInput,
} from "../shared/weatherDataHub";
import { buildPhase5QualityControlReport, type Phase5ShadowQualityValue } from "./weatherDataHubShadow";

const receivedAt = Date.parse("2026-09-02T03:00:00Z");
const validTime = Date.parse("2026-09-02T10:00:00Z");

function input(overrides: Partial<Phase5QualityControlInput> = {}): Phase5QualityControlInput {
  const normalization = normalizePhase4WeatherValue({
    variable: "air_temperature_2m",
    value: 20,
    sourceUnit: "°C",
    sourceTimezone: "Europe/Paris",
    latitude: 50.756,
    longitude: 2.521,
    validTime,
    nativeResolutionKm: null,
  });
  return {
    variable: "air_temperature_2m",
    value: 20,
    missingData: 0,
    validTime,
    receivedAt,
    evaluatedAt: receivedAt,
    latitude: 50.756,
    longitude: 2.521,
    aggregation: "hourly",
    runStatus: "SUCCESS",
    duplicateCount: 1,
    normalizationMetadata: normalization.metadata,
    ...overrides,
  };
}

describe("Phase 5 shadow quality control", () => {
  it("returns VALID for a fresh, coherent and normalized value", () => {
    expect(evaluatePhase5QualityControl(input())).toMatchObject({
      status: "VALID",
      metadata: {
        version: PHASE5_QUALITY_CONTROL_VERSION,
        freshnessStatus: "FRESH",
        rules: [],
        usableInShadow: true,
        appliedToProduction: 0,
      },
    });
  });

  it("preserves a missing value without fabricating a replacement", () => {
    const missingNormalization = normalizePhase4WeatherValue({
      variable: "air_temperature_2m",
      value: null,
      sourceUnit: "°C",
      sourceTimezone: "Europe/Paris",
      latitude: 50.756,
      longitude: 2.521,
      validTime,
      nativeResolutionKm: null,
    });
    expect(evaluatePhase5QualityControl(input({
      value: null,
      missingData: 1,
      normalizationMetadata: missingNormalization.metadata,
    }))).toMatchObject({
      status: "MISSING",
      metadata: { rules: ["MISSING_VALUE"], excludedFromPhase5Shadow: true },
    });
  });

  it("keeps SUSPECT data usable with a warning", () => {
    expect(evaluatePhase5QualityControl(input({ runStatus: "PARTIAL" }))).toMatchObject({
      status: "SUSPECT",
      metadata: { rules: ["RUN_INCOMPLETE"], usableInShadow: true, excludedFromPhase5Shadow: false },
    });
  });

  it("marks impossible, duplicated or incoherent values INVALID", () => {
    const impossible = normalizePhase4WeatherValue({
      variable: "air_temperature_2m",
      value: 90,
      sourceUnit: "°C",
      sourceTimezone: "Europe/Paris",
      latitude: 50.756,
      longitude: 2.521,
      validTime,
      nativeResolutionKm: null,
    });
    const result = evaluatePhase5QualityControl(input({
      value: 90,
      duplicateCount: 2,
      normalizationMetadata: impossible.metadata,
    }));
    expect(result.status).toBe("INVALID");
    expect(result.metadata.rules).toEqual(expect.arrayContaining([
      "PHYSICAL_RANGE_INVALID",
      "NORMALIZATION_INVALID",
      "DUPLICATE_VALUE",
    ]));
    expect(result.metadata.usableInShadow).toBe(false);
  });

  it("computes STALE from the ingestion timestamp without pretending it is a provider run", () => {
    expect(evaluatePhase5QualityControl(input({
      evaluatedAt: receivedAt + 31 * 3_600_000,
    }))).toMatchObject({
      status: "STALE",
      metadata: { freshnessStatus: "STALE", rules: ["STALE_DATA"], excludedFromPhase5Shadow: true },
    });
  });

  it("detects a rapid variation only when a previous comparable point exists", () => {
    expect(evaluatePhase5QualityControl(input({
      value: 30,
      previousValue: 20,
      previousValidTime: validTime - 30 * 60_000,
    }))).toMatchObject({
      status: "SUSPECT",
      metadata: { rules: ["RAPID_VARIATION"] },
    });
    expect(evaluatePhase5QualityControl(input({ previousValue: undefined, previousValidTime: undefined })).status).toBe("VALID");
  });

  it("builds a complete shadow report without promoting invalid data to production", () => {
    const normalization = input().normalizationMetadata;
    const row = (overrides: Partial<Phase5ShadowQualityValue> = {}): Phase5ShadowQualityValue => ({
      ingestionRunId: 1,
      sourceKey: "openmeteo_arome_france_hd",
      displayName: "AROME",
      cycleKey: "hourly:2026-09-02:v1",
      runStatus: "SUCCESS",
      receivedAt,
      latitude: 50.756,
      longitude: 2.521,
      validTime,
      variable: "air_temperature_2m",
      value: 20,
      levelKey: "2m",
      memberKey: "deterministic",
      missingData: 0,
      normalizationMetadata: normalization,
      phase5QualityStatus: null,
      phase5QualityMetadata: null,
      phase5EvaluatedAt: null,
      phase5AppliedToProduction: 0,
      shadowMode: 1,
      runAppliedToProduction: 0,
      ...overrides,
    });
    const report = buildPhase5QualityControlReport([
      row(),
      row({ ingestionRunId: 2, sourceKey: "openmeteo_ecmwf_ifs025", displayName: "ECMWF", runStatus: "PARTIAL", value: 22 }),
    ], receivedAt);
    expect(report).toMatchObject({
      totalValueCount: 2,
      counts: { VALID: 1, SUSPECT: 1, INVALID: 0, MISSING: 0, STALE: 0 },
      usableInShadowCount: 2,
      excludedFromPhase5ShadowCount: 0,
      partialRunCount: 1,
      appliedToProduction: 0,
      productionReadsEnabled: false,
      valid: true,
    });
    expect(report.unavailableSourceCount).toBe(6);
  });

  it("invalidates duplicate canonical values and any production application", () => {
    const normalization = input().normalizationMetadata;
    const duplicate: Phase5ShadowQualityValue = {
      ingestionRunId: 1,
      sourceKey: "openmeteo_arome_france_hd",
      displayName: "AROME",
      cycleKey: "hourly:2026-09-02:v1",
      runStatus: "SUCCESS",
      receivedAt,
      latitude: 50.756,
      longitude: 2.521,
      validTime,
      variable: "air_temperature_2m",
      value: 20,
      levelKey: "2m",
      memberKey: "deterministic",
      missingData: 0,
      normalizationMetadata: normalization,
      phase5QualityStatus: null,
      phase5QualityMetadata: null,
      phase5EvaluatedAt: null,
      phase5AppliedToProduction: 1,
      shadowMode: 1,
      runAppliedToProduction: 0,
    };
    const report = buildPhase5QualityControlReport([duplicate, { ...duplicate }], receivedAt);
    expect(report.duplicateGroupCount).toBe(1);
    expect(report.counts.INVALID).toBe(2);
    expect(report.appliedToProduction).toBe(2);
    expect(report.valid).toBe(false);
  });
});
