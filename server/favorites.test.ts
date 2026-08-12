import { describe, expect, it } from "vitest";
import { buildDashboardCurrentTemperature } from "./routers/favorites";

describe("buildDashboardCurrentTemperature", () => {
  it("utilise l’observation locale validée en modes Local et Ultra-local", () => {
    expect(buildDashboardCurrentTemperature({
      localMode: "ultra-local",
      temperature: 17,
      stationCount: 12,
      confidenceScore: 85,
      observedAt: "2026-08-12T06:30:00.000Z",
      officialTemperature: 14.4,
    })).toEqual({
      temperature: 17,
      stationCount: 12,
      confidenceScore: 85,
      source: "local_validated",
      observedAt: "2026-08-12T06:30:00.000Z",
      deltaFromOfficialC: 2.6,
    });
  });

  it("conserve la prévision officielle en mode Standard ou sans source locale", () => {
    expect(buildDashboardCurrentTemperature({
      localMode: "standard",
      temperature: 17,
      stationCount: 12,
      confidenceScore: 85,
      observedAt: null,
      officialTemperature: 14.4,
    })).toBeNull();
    expect(buildDashboardCurrentTemperature({
      localMode: "local",
      temperature: null,
      stationCount: 0,
      confidenceScore: 0,
      observedAt: null,
      officialTemperature: 14.4,
    })).toBeNull();
  });
});
