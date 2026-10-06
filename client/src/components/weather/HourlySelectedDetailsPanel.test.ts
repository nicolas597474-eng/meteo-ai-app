import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildHourlySelectedDetails } from "../../lib/hourlySelectedDetails";
import { HourlySelectedDetailsPanel } from "./HourlySelectedDetailsPanel";

const details = buildHourlySelectedDetails({
  validAt: Date.parse("2026-10-06T16:00:00.000Z"),
  condition: "partly_cloudy",
  temp: 18.2,
  apparentTemp: 17.4,
  precipitation: 0,
  windSpeed: 9,
  windGust: 13,
  windDirection: 350,
  humidity: 64,
  dewPoint: 11.7,
  cloudCover: 56,
  cloudLow: 0,
  cloudMid: 24,
  cloudHigh: 88,
  pressure: 1010,
  uvIndex: 0,
  visibility: 13.1,
}, "18:00");

function renderPanel(variant: "summary" | "details" = "details") {
  return renderToStaticMarkup(createElement(HourlySelectedDetailsPanel, {
    details,
    variant,
    heading: variant === "summary" ? "Données météo · 18:00" : undefined,
    provenance: variant === "summary" ? "validTime UTC : 2026-10-06T16:00:00.000Z · Source : Open-Meteo" : undefined,
    describeCondition: (condition: string) => condition === "partly_cloudy"
      ? "Partiellement nuageux"
      : condition,
  }));
}

describe("panneau des détails météo horaires sélectionnés", () => {
  it("rend les 16 mesures dans une grille mono-colonne sur mobile, sans hauteur contrainte", () => {
    const markup = renderPanel();
    expect(markup).toContain('aria-label="Mesures météo de l’échéance horaire sélectionnée"');
    expect(markup).toContain('class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"');
    expect(markup.match(/<article\b/g)).toHaveLength(16);
    expect(markup).not.toMatch(/max-height|overflow:\s*(hidden|auto)|height:/i);
    expect(markup).toContain("Partiellement nuageux");
    expect(markup).toContain("18:00");
  });

  it("applique une couleur à chaque carte, garde les valeurs absentes visibles et omet les rubriques exclues", () => {
    const markup = renderPanel();
    for (const detail of details) {
      expect(markup).toContain(`data-hourly-detail-field="${detail.key}"`);
      expect(markup).toContain(detail.color);
    }
    const missingMarkup = renderToStaticMarkup(createElement(HourlySelectedDetailsPanel, {
      details: buildHourlySelectedDetails({ temp: null, humidity: 52 }, "13:00"),
      describeCondition: (condition: string) => condition,
    }));
    expect(missingMarkup).toContain("Indisponible");
    expect(missingMarkup).toContain("52 %");
    expect(markup).not.toMatch(/Type et intensité|Rayonnement solaire|Code météo|W\/m²/);
    expect(markup).toContain("Variables non fournies par le backend");
  });

  it("rend sous la température et dans le panneau détaillé les mêmes 16 champs, valeurs, couleurs, heure et provenance", () => {
    const summaryMarkup = renderPanel("summary");
    const detailsMarkup = renderPanel("details");
    const combinedMarkup = summaryMarkup + detailsMarkup;

    expect(summaryMarkup).toContain("Données météo · 18:00");
    expect(summaryMarkup).toContain("validTime UTC : 2026-10-06T16:00:00.000Z");
    expect(summaryMarkup).toContain('class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"');
    expect(detailsMarkup).toContain('class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"');
    expect(combinedMarkup.match(/<article\b/g)).toHaveLength(32);
    for (const detail of details) {
      expect(combinedMarkup.match(new RegExp(`data-hourly-detail-field="${detail.key}"`, "g"))).toHaveLength(2);
      expect(combinedMarkup.match(new RegExp(`${detail.title} à 18:00`, "g"))).toHaveLength(2);
      expect(combinedMarkup.match(new RegExp(`border-color:${detail.color}`, "g"))).toHaveLength(2);
      expect(combinedMarkup).toContain(detail.key === "condition" ? "Partiellement nuageux" : detail.value);
    }
    expect(combinedMarkup).not.toMatch(/Type et intensité|Rayonnement solaire|Code météo|W\/m²/);
  });
});
