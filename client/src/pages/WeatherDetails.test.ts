import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./WeatherDetails.tsx", import.meta.url), "utf8");
const timelineSource = readFileSync(new URL("../components/weather/ForecastByDaySection.tsx", import.meta.url), "utf8");

describe("page Prévisions détaillées", () => {
  it("présente une seule prévision horaire officielle sans reconstituer un résumé quotidien", () => {
    expect(pageSource).toContain('import { ForecastByDaySection } from "@/components/weather/ForecastByDaySection"');
    expect(pageSource).toContain("<ForecastByDaySection hours={hours} activeHourIndex={currentHourIdx}");
    expect(pageSource).toContain("includeExtendedPeriods: false");
    expect(pageSource).not.toContain("data?.days");
    expect(pageSource).not.toContain("periodHours");
    expect(pageSource).not.toContain("<TrendSection");
    expect(timelineSource).toContain("groupOfficialHourlyForecastByDate(hours)");
    expect(timelineSource).toContain("Températures maximale et minimale quotidiennes indisponibles");
    expect(timelineSource).toContain("Extrêmes quotidiens non fournis");
    expect(timelineSource).not.toContain("tempMax");
    expect(timelineSource).not.toContain("tempMin");
  });

  it("rend les bandes jour/heure tactiles, horizontales et accessibles", () => {
    expect(timelineSource).toContain('aria-label="Jours de prévision défilables"');
    expect(timelineSource).toContain('aria-label="Heures de prévision défilables"');
    expect(timelineSource.match(/overflow-x-auto/g)?.length).toBeGreaterThanOrEqual(3);
    expect(timelineSource.match(/touch-pan-x/g)?.length).toBeGreaterThanOrEqual(3);
    expect(timelineSource.match(/snap-x snap-mandatory/g)?.length).toBeGreaterThanOrEqual(2);
    expect(timelineSource).toContain("centerWithinHorizontalStrip");
    expect(timelineSource).toContain("strip.scrollTo({ left");
    expect(timelineSource).toContain("aria-pressed={isSelected}");
    expect(timelineSource).toContain("aria-pressed={isHourSelected}");
    expect(timelineSource).toContain("forecast-day-tile");
    expect(timelineSource).toContain("forecast-hour-cell");
  });

  it("distingue l'heure sélectionnée de l'échéance active et affiche le ressenti seulement s'il existe", () => {
    expect(timelineSource).toContain("isActiveForecast");
    expect(timelineSource).toContain("selectedEntry?.hour.apparentTemp");
    expect(timelineSource).toContain("entry.hour.temp");
    expect(timelineSource).toContain("formatOptionalForecastValue");
    expect(timelineSource).toContain("return dateText(date);");
    expect(timelineSource).toContain("Condition indisponible");
    expect(timelineSource).toContain('partly_cloudy: "Partiellement nuageux"');
    expect(timelineSource).toContain("function conditionDescription");
    expect(timelineSource).toContain("grouped.undatedHours");
    expect(timelineSource).toContain("sans date locale explicite");
  });

  it("préserve les détails horaires et ne transforme pas une fréquence de modèles en probabilité", () => {
    expect(timelineSource).toContain('title: "Précipitations"');
    expect(timelineSource).toContain('title: "Vent"');
    expect(timelineSource).toContain('title: "Humidité"');
    expect(timelineSource).not.toContain('title: "Nuages"');
    expect(timelineSource).not.toContain('title: "Pression"');
    expect(timelineSource).not.toContain('title: "Indice UV"');
    expect(timelineSource).toContain("function AirQualityAccordion()");
    expect(timelineSource).toContain("ne fait pas partie du contrat météo de cette page");
    expect(timelineSource).toContain("function HourlyMiniChart");
    expect(timelineSource).toContain("Valeurs horaires fournies");
    expect(timelineSource).toContain("fréquence brute non calibrée");
    expect(timelineSource).toContain("jamais une probabilité de pluie calibrée");
    expect(timelineSource).toContain("isOfficialSevenModelSource");
  });

  it("préserve la navigation historique, la carte et les preuves horaires", () => {
    expect(pageSource).toContain('import { Link } from "wouter"');
    expect(pageSource).toContain("Historique des prévisions");
    expect(pageSource).toContain('href="/history"');
    expect(pageSource).toContain("<WindyMap");
    expect(pageSource).toContain("<HourlyHistoricalEvidencePanel");
    expect(pageSource).toContain("findActiveHourlyForecastIndex(data.hours, Date.now())");
    expect(pageSource).toContain("Prévisions temporairement indisponibles");
    expect(pageSource).toContain("forecast-details-page");
    expect(pageSource).toContain("pb-24");
  });
});
