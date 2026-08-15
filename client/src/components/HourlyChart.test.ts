import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./HourlyChart.tsx", import.meta.url), "utf8");

describe("HourlyChart", () => {
  it("présente les échelles avec une seule courbe de température par heure", () => {
    expect(source).toContain("HourlyScaleLabels");
    expect(source).toContain('aria-label="Échelles du graphique horaire"');
    expect(source).toContain("windScaleTop");
    expect(source).toContain("precipScaleTop");
    expect(source).toContain("getChartTemperatureScale");
    expect(source).toContain("text-white");
    expect(source).toContain("text-emerald-400");
    expect(source).toContain("text-sky-400");
    expect(source).toContain("ctx.fillText(`${v.toFixed(1)}°`, pt.x, temperatureLabelY)");
    expect(source).toContain("getLabelAboveCurveY(pt.y, tempZoneTop)");
    expect(source).not.toContain("Ressenti immédiatement sous sa courbe bleue");
    expect(source).not.toContain("apparentLabelY");
    expect(source).not.toContain('> Ressenti</span>');
    expect(source).toContain("ctx.font = `bold ${sel ? 12 : 10}px system-ui`");
    expect(source).toContain("p-2 sm:p-3");
    expect(source).toContain("weather-chart-3d");
    expect(source).toContain("ctx.fillRect(x, 0, COL_W, TOTAL_H)");
    expect(source).toContain('ctx.fillStyle = "#05070a"');
    expect(source).toContain("const visibleN = N");
    expect(source).toContain("Toutes les données sont dessinées immédiatement");
    expect(source).not.toContain("const [animProgress, setAnimProgress]");
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

  it("affiche les détails horaires au-dessus du graphique sélectionné", () => {
    expect(source).toContain("detailPanelRef");
    expect(source).toContain('scrollIntoView({ behavior: "smooth", block: "start" })');
    expect(source).toContain("scroll-mt-3");
    expect(source).toContain("slide-in-from-top-2");
    expect(source).toContain('aria-labelledby="hour-detail-title"');
    expect(source).toContain("Fermer les détails de la prévision horaire");
    expect(source).toContain("<span>Fermer</span>");
    expect(source).toContain("min-h-11");
  });

  it("ancre toujours le début du graphique sur l’heure actuelle", () => {
    expect(source).toContain("Toujours démarrer la zone visible sur l’heure actuelle");
    expect(source).toContain("nowHour * COL_W");
    expect(source).toContain('behavior: "auto"');
    expect(source).toContain("[hours, nowHour, COL_W]");
  });

  it("présente tous les paramètres horaires réellement fournis dans le panneau détaillé", () => {
    expect(source).toContain("dewPoint?: number | null");
    expect(source).toContain("pressure?: number | null");
    expect(source).toContain("visibility?: number | null");
    expect(source).toContain("solarRadiation?: number | null");
    expect(source).toContain("cloudLow?: number | null");
    expect(source).toContain("precipIntensity?: string | null");
    expect(source).toContain("Point de rosée");
    expect(source).toContain("Pression de surface");
    expect(source).toContain("Portée {visibilityLabel");
    expect(source).not.toContain("Régime opérationnel");
  });

  it("retire les sections de régime et d’évolution à court terme du panneau détaillé", () => {
    expect(source).not.toContain("getHourlyDetailInsights");
    expect(source).not.toContain("Évolution à court terme");
    expect(source).not.toContain("Température à +3 h");
    expect(source).not.toContain("Cumul de pluie à +3 h");
    expect(source).not.toContain("Rafale maximale à +3 h");
    expect(source).not.toContain("Tendance de pression");
    expect(source).not.toContain("Écart temp. / rosée");
  });
});
