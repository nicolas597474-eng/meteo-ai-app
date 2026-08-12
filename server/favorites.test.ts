import { describe, expect, it } from "vitest";
import { buildDashboardCurrentTemperature } from "./routers/favorites";

describe("buildDashboardCurrentTemperature", () => {
  it("utilise l’observation locale validée en modes Local et Ultra-local", () => {
    expect(buildDashboardCurrentTemperature({
      localMode: "ultra-local",
      temperature: 17,
      stationCount: 12,
      confidenceScore: 85,
    })).toEqual({ temperature: 17, stationCount: 12, confidenceScore: 85, source: "local_validated" });
  });

  it("conserve la prévision officielle en mode Standard ou sans source locale", () => {
    expect(buildDashboardCurrentTemperature({
      localMode: "standard",
      temperature: 17,
      stationCount: 12,
      confidenceScore: 85,
    })).toBeNull();
    expect(buildDashboardCurrentTemperature({
      localMode: "local",
      temperature: null,
      stationCount: 0,
      confidenceScore: 0,
    })).toBeNull();
  });
});
