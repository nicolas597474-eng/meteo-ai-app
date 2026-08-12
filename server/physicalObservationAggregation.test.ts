import { describe, expect, it } from "vitest";
import { buildQualifiedDailyObservation } from "./physicalObservationAggregation";

describe("buildQualifiedDailyObservation", () => {
  it("refuse une couverture physique insuffisante", () => {
    const result = buildQualifiedDailyObservation([{ hour: 10, stationCount: 1, temperature: 18, windSpeed: 8, windGust: 12, precipitation: 0 }]);
    expect(result.isQualified).toBe(false);
    expect(result.tempMax).toBeNull();
  });

  it("agrège uniquement des snapshots physiques suffisamment couvrants", () => {
    const snapshots = Array.from({ length: 18 }, (_, hour) => ({ hour, stationCount: 1, temperature: 10 + hour / 2, windSpeed: 5 + hour / 10, windGust: 10 + hour / 5, precipitation: 0 }));
    const result = buildQualifiedDailyObservation(snapshots);
    expect(result.isQualified).toBe(true);
    expect(result.coverageHours).toBe(18);
    expect(result.tempMin).toBe(10);
    expect(result.tempMax).toBe(18.5);
  });
});
