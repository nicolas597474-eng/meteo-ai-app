import { describe, expect, it } from "vitest";
import { buildPhase3HorizonHierarchyReport, type Phase3ShadowHorizonValue } from "./weatherDataHubShadow";

function value(sourceKey: string, displayName: string, horizon: number, appliedToProduction = 0): Phase3ShadowHorizonValue {
  return {
    sourceKey,
    displayName,
    category: sourceKey === "openmeteo_best_match" ? "DERIVED_AGGREGATOR" : "DETERMINISTIC",
    independenceClass: sourceKey === "openmeteo_best_match" ? "non_independent" : "independent_model",
    forecastHorizonMinutes: horizon,
    missingData: 0,
    qualityStatus: "VALID",
    appliedToProduction,
  };
}

describe("Phase 3 shadow horizon hierarchy", () => {
  const deterministic = [
    ["openmeteo_arome_france_hd", "AROME"],
    ["openmeteo_arpege_europe", "ARPEGE"],
    ["openmeteo_icon_eu", "ICON"],
    ["openmeteo_ecmwf_ifs025", "ECMWF"],
    ["openmeteo_gfs_seamless", "GFS"],
    ["openmeteo_gem_seamless", "GEM"],
    ["openmeteo_ukmo_seamless", "UKMET"],
  ] as const;

  it("keeps unavailable capabilities explicit while detecting real deterministic coverage", () => {
    const rows = [120, 400, 2_000, 5_000, 12_000].flatMap(horizon => [
      ...deterministic.map(([sourceKey, displayName]) => value(sourceKey, displayName, horizon)),
      value("openmeteo_best_match", "Open-Meteo Best Match", horizon),
    ]);
    const report = buildPhase3HorizonHierarchyReport(rows);

    expect(report.windowCount).toBe(6);
    expect(report.windows.find(window => window.key === "2_6h")?.status).toBe("PARTIAL");
    expect(report.windows.find(window => window.key === "1_3d")?.availablePrioritySources).toHaveLength(7);
    expect(report.windows.find(window => window.key === "7_15d")?.status).toBe("UNAVAILABLE");
    expect(report.windows.find(window => window.key === "7_15d")?.missingCapabilities).toEqual(["ENSEMBLE", "AI_ENSEMBLE", "CONSENSUS"]);
  });

  it("never counts Best Match as an independent priority", () => {
    const report = buildPhase3HorizonHierarchyReport([
      value("openmeteo_best_match", "Open-Meteo Best Match", 400),
    ]);
    const window = report.windows.find(item => item.key === "6_24h");
    expect(window?.availablePrioritySources).toHaveLength(0);
    expect(window?.derivedReferences).toEqual([
      expect.objectContaining({ sourceKey: "openmeteo_best_match", independent: false }),
    ]);
  });

  it("invalidates the shadow report if any run is marked as applied to production", () => {
    const report = buildPhase3HorizonHierarchyReport([
      value("openmeteo_arome_france_hd", "AROME", 400, 1),
    ]);
    expect(report.appliedToProduction).toBe(1);
    expect(report.valid).toBe(false);
  });

  it("derives an old shadow horizon at read time without rewriting its stored value", () => {
    const receivedAt = Date.parse("2026-09-02T03:00:00Z");
    const report = buildPhase3HorizonHierarchyReport([{
      ...value("openmeteo_arome_france_hd", "AROME", 0),
      forecastHorizonMinutes: null,
      validTime: receivedAt + 180 * 60_000,
      receivedAt,
    }]);
    expect(report.knownHorizonValueCount).toBe(1);
    expect(report.windows.find(window => window.key === "2_6h")?.availablePrioritySources).toEqual([
      expect.objectContaining({ sourceKey: "openmeteo_arome_france_hd" }),
    ]);
  });
});
