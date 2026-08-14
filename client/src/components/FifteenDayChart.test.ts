import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./FifteenDayChart.tsx", import.meta.url), "utf8");

describe("FifteenDayChart", () => {
  it("présente les échelles température, vent et pluie à gauche", () => {
    expect(source).toContain("ForecastScaleLabels");
    expect(source).toContain('aria-label="Échelles du graphique de prévisions"');
    expect(source).toContain("windScaleTop");
    expect(source).toContain("precipScaleTop");
    expect(source).toContain("getChartTemperatureScale");
    expect(source).toContain("text-white");
    expect(source).toContain("text-emerald-400");
    expect(source).toContain("text-sky-400");
    expect(source).toContain("km/h");
    expect(source).toContain("mm");
    expect(source).toContain("weather-chart-3d");
    expect(source).toContain("rounded-b-xl border border-blue-300/50");
    expect(source).toContain("`${Math.round(v)} km/h`");
    expect(source).toContain("ctx.fillText(degToCompass(dir), x, y + 14)");
    expect(source).toContain('ctx.font = "bold 11px system-ui"');
    expect(source).toContain("const precipLabelBand = 18");
    expect(source).toContain("ctx.fillText(p.toFixed(1), x, barTop - 5)");
    expect(source).toContain("ctx.fillText(p.toFixed(1), x, precipZoneBot - 5)");
  });

  it("affiche la prévision détaillée au-dessus du graphique sélectionné", () => {
    expect(source).toContain("detailPanelRef");
    expect(source).toContain('scrollIntoView({ behavior: "smooth", block: "start" })');
    expect(source).toContain("scroll-mt-3");
    expect(source).toContain("slide-in-from-top-2");
    expect(source).toContain('role="region"');
  });

  it("réserve une zone d’alerte séparée des libellés de date", () => {
    expect(source).toContain("chartAlerts");
    expect(source).toContain('aria-label="Alertes météo des prévisions"');
    expect(source).toContain("Alertes météo");
    expect(source).toContain("Canicule · maximum ≥ 33°C");
    expect(source).not.toContain('ctx.fillText("☀ Canicule"');
  });
});
