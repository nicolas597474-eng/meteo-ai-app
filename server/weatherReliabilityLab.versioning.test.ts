import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHourlyForecastEvaluationHistory: vi.fn(),
  makeLocationKey: vi.fn(() => "50.700_2.500"),
}));

vi.mock("./db", () => mocks);

import { OFFICIAL_HOURLY_MODELS } from "./weatherServices";
import { buildReliabilityLaboratory } from "./weatherReliabilityLab";

describe("Weather AI Lab — agrégats horaires legacy non versionnés", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T12:00:00.000Z"));
    mocks.getHourlyForecastEvaluationHistory.mockReset();
    mocks.getHourlyForecastEvaluationHistory.mockResolvedValue({
      available: true,
      rows: [],
      legacyRows: [{
        date: "2026-10-04",
        sourceName: "open-meteo",
        modelName: OFFICIAL_HOURLY_MODELS[0]!.name,
        modelId: OFFICIAL_HOURLY_MODELS[0]!.modelId,
        variable: "temperature",
        horizonBucket: "6_24h",
        sampleSize: 35,
        mae: 0.4,
        rmse: 0.6,
        bias: 0.1,
        scoringValidationVersion: null,
      }],
      exactAvailable: false,
      exactRows: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("distingue les lignes historiques non versionnées d’une archive sans score sans leur attribuer de métriques", async () => {
    const result = await buildReliabilityLaboratory({
      lat: 50.7,
      lon: 2.5,
      period: "30d",
      horizon: "6-24h",
    });
    const legacyOnly = result.metrics.find((row) =>
      row.modelName === OFFICIAL_HOURLY_MODELS[0]!.name && row.variable === "temperature");
    const noScore = result.metrics.find((row) =>
      row.modelName === OFFICIAL_HOURLY_MODELS[1]!.name && row.variable === "temperature");
    const selectedHorizonSummary = result.horizonEvidence.find((horizon) => horizon.id === "6-24h");
    const unarchivedHorizonSummary = result.horizonEvidence.find((horizon) => horizon.id === "24-48h");

    expect(mocks.getHourlyForecastEvaluationHistory).toHaveBeenCalledWith(
      "50.700_2.500",
      expect.any(String),
      expect.any(String),
      [],
      { includeLegacy: true },
    );
    expect(legacyOnly).toMatchObject({
      status: "legacy_unversioned_only",
      metrics: null,
      legacyUnversionedRowCount: 1,
    });
    expect(legacyOnly?.reason).toContain("exclue(s) des preuves actuelles et des poids officiels");
    expect(noScore).toMatchObject({
      status: "no_evidence",
      metrics: null,
      legacyUnversionedRowCount: 0,
    });
    expect(selectedHorizonSummary).toMatchObject({
      status: "available",
      rawEvidenceCellCount: 0,
      qualifiedCellCount: 0,
      expectedCellCount: OFFICIAL_HOURLY_MODELS.length * 6,
    });
    expect(unarchivedHorizonSummary).toMatchObject({
      status: "horizon_not_stored",
      rawEvidenceCellCount: null,
      qualifiedCellCount: null,
    });
  });
});
