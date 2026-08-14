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
    expect(source).toContain("Ressenti affiché sous la courbe bleue");
    expect(source).toContain("v.toFixed(1)}°");
    expect(source).toContain("const apparentLabelY = Math.min(pt.y + 21, windZoneTop - 5)");
    expect(source).toContain('ctx.font = `${sel ? "bold 12" : "10"}px system-ui`');
    expect(source).toContain("p-2 sm:p-3");
    expect(source).toContain("weather-chart-3d");
    expect(source).toContain("ctx.fillRect(x, 0, COL_W, TOTAL_H)");
    expect(source).toContain("bold ${sel ? 12 : 10}px system-ui");
    expect(source).toContain("`${Math.round(v)} km/h`");
    expect(source).toContain("ctx.fillText(degToCompass(dir), x, y + 14)");
    expect(source).toContain('ctx.font = "bold 10px system-ui"');
    expect(source).toContain("const precipLabelBand = 16");
    expect(source).toContain("ctx.fillText(p.toFixed(1), x, barTop - 5)");
    expect(source).toContain("ctx.fillText(p.toFixed(1), x, precipZoneBot - 5)");
    expect(source).not.toContain("rounded-b-xl border border-blue-300/70");
    expect(source).not.toContain("ctx.strokeRect(x + 0.5, 0.5, COL_W - 1, CHART_H - 1)");
  });
});
