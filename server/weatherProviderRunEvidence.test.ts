import { describe, expect, it } from "vitest";
import {
  createScheduleDerivedRunEvidence,
  createUnknownRunEvidence,
  parseOpenMeteoRunMetadata,
} from "./weatherProviderRunEvidence";

describe("P2 provider run evidence", () => {
  it("keeps Open-Meteo metadata distinct from payload-bound provider proof", () => {
    const evidence = parseOpenMeteoRunMetadata({
      payload: {
        last_run_initialisation_time: 1_788_343_200,
        last_run_modification_time: 1_788_356_000,
        last_run_availability_time: 1_788_356_060,
        temporal_resolution_seconds: 3_600,
        update_interval_seconds: 21_600,
      },
      sourceUrl: "https://api.open-meteo.com/data/ecmwf_ifs025/static/meta.json",
      scope: "model_exact",
      observedAt: 1_788_356_100_000,
    });

    expect(evidence).toMatchObject({
      status: "OPEN_METEO_METADATA",
      scope: "model_exact",
      providerRunTime: 1_788_343_200_000,
      providerModifiedAt: 1_788_356_000_000,
      providerAvailableAt: 1_788_356_060_000,
      observedAt: 1_788_356_100_000,
    });
    expect(evidence.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not invent a run when metadata are malformed", () => {
    expect(parseOpenMeteoRunMetadata({
      payload: { last_run_initialisation_time: "unknown" },
      sourceUrl: "https://example.invalid/meta.json",
      scope: "model_exact",
      observedAt: 123,
    })).toMatchObject({
      status: "UNKNOWN",
      providerRunTime: null,
      observedAt: 123,
    });
  });

  it("keeps schedule-derived information separate from a provider run time", () => {
    expect(createScheduleDerivedRunEvidence({ observedAt: 456, detail: "Cadence documentaire" })).toEqual({
      status: "SCHEDULE_DERIVED",
      scope: "schedule_only",
      providerRunTime: null,
      providerAvailableAt: null,
      providerModifiedAt: null,
      observedAt: 456,
      sourceUrl: null,
      evidenceHash: null,
      detail: "Cadence documentaire",
      evidence: null,
    });
  });

  it("marks unresolved aggregators as unknown", () => {
    expect(createUnknownRunEvidence({ observedAt: 789, scope: "aggregator_unresolved", detail: "Best Match" }))
      .toMatchObject({ status: "UNKNOWN", scope: "aggregator_unresolved", providerRunTime: null });
  });
});
