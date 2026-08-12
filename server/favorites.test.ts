import { describe, expect, it } from "vitest";
import { buildDashboardCurrentTemperature, resolveLocalModeTemperature } from "./routers/favorites";

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

  it("aligne exactement les modes Local et Ultra-local sur l’officiel sans station physique", () => {
    expect(resolveLocalModeTemperature({
      officialTemperature: 30.7,
      localTemperature: 17.1,
      physicalStationCount: 0,
      microclimateAdjustment: -0.1,
      modelFallbackTemperature: null,
    })).toEqual({
      temperature: 30.7,
      usesOfficialFallback: true,
      microclimateAdjustment: 0,
      usesModelFallback: false,
    });
  });

  it("préserve la température locale et le micro-ajustement seulement avec une station qualifiée", () => {
    expect(resolveLocalModeTemperature({
      officialTemperature: 30.7,
      localTemperature: 29.9,
      physicalStationCount: 1,
      microclimateAdjustment: -0.2,
      modelFallbackTemperature: 30.7,
    })).toEqual({
      temperature: 29.9,
      usesOfficialFallback: false,
      microclimateAdjustment: -0.2,
      usesModelFallback: false,
    });
  });

  it("utilise la fusion officielle traçable si aucune station physique n’est valide", () => {
    expect(resolveLocalModeTemperature({
      officialTemperature: 31.1,
      localTemperature: null,
      physicalStationCount: 0,
      microclimateAdjustment: -0.1,
      modelFallbackTemperature: 30.4,
    })).toEqual({
      temperature: 30.4,
      usesOfficialFallback: false,
      microclimateAdjustment: 0,
      usesModelFallback: true,
    });
  });
});
