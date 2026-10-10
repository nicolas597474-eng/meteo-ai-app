import { describe, expect, it } from "vitest";
import { buildLocalOfficialDeltaHistory } from "./localOfficialHistory";

describe("buildLocalOfficialDeltaHistory", () => {
  it("compare les observations physiques à la température déjà calculée par le moteur horaire officiel", () => {
    const points = buildLocalOfficialDeltaHistory([
      { stationId: "mf-59000", observedAt: Date.parse("2026-08-12T06:31:00.000Z"), temperature: 17, distanceKm: 4, reliabilityScore: 92 },
      { stationId: "mf-123", observedAt: Date.parse("2026-08-12T06:45:00.000Z"), temperature: 16, distanceKm: 8, reliabilityScore: 92 },
    ], [
      { validAt: Date.parse("2026-08-12T06:00:00.000Z"), temperature: 14.4 },
    ]);

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ validAt: Date.parse("2026-08-12T06:00:00.000Z"), officialTemperature: 14.4, stationCount: 2 });
    expect(points[0]?.label).toContain("08h");
    expect(points[0]?.localTemperature).toBeGreaterThan(16);
    expect(points[0]?.deltaC).toBeGreaterThan(1);
  });

  it("n’invente pas de comparaison lorsqu’aucune température officielle qualifiée n’est fournie", () => {
    expect(buildLocalOfficialDeltaHistory([
      { stationId: "mf-123", observedAt: Date.parse("2026-08-12T06:31:00.000Z"), temperature: null, distanceKm: 1, reliabilityScore: 92 },
    ], [])).toEqual([]);
  });

  it("garde séparées les deux heures locales répétées au retour à l’heure d’hiver", () => {
    const points = buildLocalOfficialDeltaHistory([
      { stationId: "station-summer", observedAt: Date.parse("2026-10-25T00:31:00.000Z"), temperature: 12, distanceKm: 2, reliabilityScore: 90 },
      { stationId: "station-winter", observedAt: Date.parse("2026-10-25T01:31:00.000Z"), temperature: 11, distanceKm: 2, reliabilityScore: 90 },
    ], [
      { validAt: Date.parse("2026-10-25T00:00:00.000Z"), temperature: 13 },
      { validAt: Date.parse("2026-10-25T01:00:00.000Z"), temperature: 10 },
    ]);

    expect(points).toHaveLength(2);
    expect(points.map((point) => point.validAt)).toEqual([
      Date.parse("2026-10-25T00:00:00.000Z"),
      Date.parse("2026-10-25T01:00:00.000Z"),
    ]);
    expect(points[0]?.key).not.toBe(points[1]?.key);
    expect(points[0]?.label).toContain("02h");
    expect(points[1]?.label).toContain("02h");
    expect(points[0]?.label).not.toBe(points[1]?.label);
  });
});
