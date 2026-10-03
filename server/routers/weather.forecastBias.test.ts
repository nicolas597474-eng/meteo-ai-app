import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./weather.ts", import.meta.url), "utf8");

describe("déclenchement admin des prévisions officielles", () => {
  it("fusionne et archive les valeurs brutes sans lire ni appliquer le biais station", () => {
    expect(source).not.toContain("applyBiasCorrection");
    expect(source).not.toContain("getQualifiedCumulativeRankingForLocation");
    expect(source).toContain("const rawForecasts = allForecasts.map");
    expect(source).toContain("buildForecastRunArchiveRows(expertData, locationKey, targetDate, issuedAt)");
    expect(source).toContain("computeOfficialDailyForecast(rawForecasts");
  });
});
