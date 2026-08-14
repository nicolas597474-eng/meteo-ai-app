import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./HourlyChart.tsx", import.meta.url), "utf8");

describe("HourlyChart", () => {
  it("présente les échelles et un ressenti continu avec les deux valeurs par heure", () => {
    expect(source).toContain("HourlyScaleLabels");
    expect(source).toContain('aria-label="Échelles du graphique horaire"');
    expect(source).toContain("windScaleTop");
    expect(source).toContain("precipScaleTop");
    expect(source).toContain("getChartTemperatureScale");
    expect(source).toContain("text-white");
    expect(source).toContain("text-emerald-400");
    expect(source).toContain("text-sky-400");
    expect(source).toContain("apparentTemp ?? h.temp ?? 0) + 3");
    expect(source).toContain("Ressenti affiché à chaque heure");
    expect(source).toContain("v.toFixed(1)}°");
    expect(source).toContain("p-2 sm:p-3");
    expect(source).toContain("weather-chart-3d");
  });
});
