import { describe, expect, it } from "vitest";
import { buildLocalOfficialDeltaHistory } from "./localOfficialHistory";

describe("buildLocalOfficialDeltaHistory", () => {
  it("ne compare que les observations physiques horodatées aux heures officielles best_match", () => {
    const points = buildLocalOfficialDeltaHistory([
      { stationId: "metar-LFAC", observedAt: Date.parse("2026-08-12T06:31:00.000Z"), temperature: 17, distanceKm: 4, reliabilityScore: 90 },
      { stationId: "mf-123", observedAt: Date.parse("2026-08-12T06:45:00.000Z"), temperature: 16, distanceKm: 8, reliabilityScore: 92 },
    ], [
      { date: "2026-08-12", hour: 8, modelName: "best_match", temperature: 14.4 },
      { date: "2026-08-12", hour: 8, modelName: "ecmwf_ifs025", temperature: 13.2 },
    ]);

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ label: "08h", officialTemperature: 14.4, stationCount: 2 });
    expect(points[0]?.localTemperature).toBeGreaterThan(16);
    expect(points[0]?.deltaC).toBeGreaterThan(1);
  });

  it("ignore les heures sans température officielle best_match ou sans température locale", () => {
    expect(buildLocalOfficialDeltaHistory([
      { stationId: "mf-123", observedAt: Date.parse("2026-08-12T06:31:00.000Z"), temperature: null, distanceKm: 1, reliabilityScore: 92 },
    ], [
      { date: "2026-08-12", hour: 8, modelName: "ecmwf_ifs025", temperature: 14 },
    ])).toEqual([]);
  });
});
