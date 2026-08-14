import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getHourlyDetailInsights } from "@/lib/hourlyDetailInsights";

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

  it("affiche les détails horaires au-dessus du graphique sélectionné", () => {
    expect(source).toContain("detailPanelRef");
    expect(source).toContain('scrollIntoView({ behavior: "smooth", block: "start" })');
    expect(source).toContain("scroll-mt-3");
    expect(source).toContain("slide-in-from-top-2");
    expect(source).toContain('aria-labelledby="hour-detail-title"');
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
    expect(source).toContain("Régime opérationnel");
  });

  it("ajoute des indicateurs dérivés transparents sur un horizon de trois heures", () => {
    expect(source).toContain("getHourlyDetailInsights");
    expect(source).toContain("Évolution à court terme");
    expect(source).toContain("Température à +3 h");
    expect(source).toContain("Cumul de pluie à +3 h");
    expect(source).toContain("Rafale maximale à +3 h");
    expect(source).toContain("Tendance de pression");
    expect(source).toContain("Écart temp. / rosée");
    expect(source).toContain("même prévision officielle");
  });

  it("calcule les tendances à court terme depuis les points horaires mesurés", () => {
    const makeHour = (hour: string, values: Record<string, number | null>) => ({
      hour,
      temp: 18,
      apparentTemp: 18,
      precipitation: 0,
      windSpeed: 8,
      windGust: 10,
      windDirection: 180,
      cloudCover: 20,
      humidity: 55,
      uvIndex: 3,
      condition: "Peu nuageux",
      pressure: 1012,
      dewPoint: 14,
      visibility: 15,
      solarRadiation: 250,
      cloudLow: 10,
      cloudMid: 10,
      cloudHigh: 10,
      precipProb: 0,
      ...values,
    });
    const hours = [
      makeHour("10:00", { pressure: 1010 }),
      makeHour("11:00", { pressure: 1011 }),
      makeHour("12:00", { temp: 20, dewPoint: 17, pressure: 1012, cloudCover: 20, windGust: 12 }),
      makeHour("13:00", { temp: 21, precipitation: 0.2, precipProb: 50, windGust: 15, cloudCover: 30 }),
      makeHour("14:00", { temp: 22, precipitation: 0.3, precipProb: 80, windGust: 22, cloudCover: 45 }),
      makeHour("15:00", { temp: 23, precipitation: 0.1, precipProb: 20, windGust: 18, cloudCover: 60 }),
    ];
    const insights = getHourlyDetailInsights(hours, 2);

    expect(insights.temperatureDelta).toBe(3);
    expect(insights.temperatureAtEnd).toBe(23);
    expect(insights.precipitationTotal).toBeCloseTo(0.6);
    expect(insights.precipitationProbabilityMax).toBe(80);
    expect(insights.gustMax).toBe(22);
    expect(insights.cloudDelta).toBe(40);
    expect(insights.pressureDelta).toBe(2);
    expect(insights.dewPointGap).toBe(3);
  });
});
