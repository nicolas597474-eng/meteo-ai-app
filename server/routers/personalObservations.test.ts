import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("routeur des observations personnelles", () => {
  it("apparie une observation au même lieu et créneau avant de calibrer", () => {
    const source = readFileSync(new URL("./personalObservations.ts", import.meta.url), "utf8");
    expect(source).toContain("getStoredHourlyForecasts(locationKey, getParisDate(now))");
    expect(source).toContain("forecast.hour === getParisHour(now)");
    expect(source).toContain("minimumForWeighting: 50");
    expect(source).toContain("scorePersonalModelObservation(input, forecast)");
    expect(source).toContain("precipitation: z.number().min(0).max(500).nullable()");
    expect(source).toContain("precipitationScore: result.precipitationScore");
    expect(source).toContain("precipitation: forecast.precipitation");
    expect(source).toContain("personalizedHourly");
    expect(source).toContain('item.evidenceState === "qualified"');
    expect(source).toContain("weightMultiplier");
    expect(source).toContain("history: protectedProcedure");
    expect(source).toContain("rebuildPersonalCalibration");
    expect(source).toContain("delete: protectedProcedure");
  });
});
