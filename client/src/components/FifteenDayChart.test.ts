import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./FifteenDayChart.tsx", import.meta.url), "utf8");

describe("FifteenDayChart", () => {
  it("présente les échelles température, vent et pluie à gauche", () => {
    expect(source).toContain("ForecastScaleLabels");
    expect(source).toContain('aria-label="Échelles du graphique de prévisions"');
    expect(source).toContain("windScaleTop");
    expect(source).toContain("precipScaleTop");
    expect(source).toContain("km/h");
    expect(source).toContain("mm");
  });
});
