import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./HourlyChart.tsx", import.meta.url), "utf8");

describe("HourlyChart", () => {
  it("présente les échelles et un ressenti continu avec les deux valeurs par heure", () => {
    expect(source).toContain("HourlyScaleLabels");
    expect(source).toContain('aria-label="Échelles du graphique horaire"');
    expect(source).toContain("windScaleTop");
    expect(source).toContain("precipScaleTop");
    expect(source).toContain("apparentTemp ?? h.temp ?? 0) + 3");
    expect(source).toContain("Ressenti affiché à chaque heure");
    expect(source).toContain("v.toFixed(1)}°");
  });
});
