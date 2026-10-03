import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./WeatherDetails.tsx", import.meta.url), "utf8");
const timelineSource = readFileSync(new URL("../components/weather/ForecastByDaySection.tsx", import.meta.url), "utf8");

describe("page Prévisions détaillées", () => {
  it("fusionne le déroulé horaire et la tendance par jour dans une seule section officielle", () => {
    expect(pageSource).toContain('import { ForecastByDaySection } from "@/components/weather/ForecastByDaySection"');
    expect(pageSource).toContain("<ForecastByDaySection hours={hours} activeHourIndex={currentHourIdx}");
    expect(pageSource).toContain("includeExtendedPeriods: false");
    expect(pageSource).not.toContain("data?.days");
    expect(pageSource).not.toContain("periodHours");
    expect(pageSource).not.toContain("<TrendSection");
    expect(timelineSource).toContain("groupOfficialHourlyForecastByDate(hours)");
    expect(timelineSource).toContain("L’API ne fournit pas de synthèse quotidienne cohérente avec cette série");
    expect(timelineSource).toContain("l’ancien agrégat 16 jours n’est pas utilisé");
  });

  it("rend les bandes des jours et des heures défilables horizontalement au toucher", () => {
    expect(timelineSource).toContain('aria-label="Jours de prévision défilables"');
    expect(timelineSource).toContain('aria-label="Heures de prévision défilables"');
    expect(timelineSource.match(/overflow-x-auto/g)?.length).toBeGreaterThanOrEqual(2);
    expect(timelineSource.match(/touch-pan-x/g)?.length).toBeGreaterThanOrEqual(2);
    expect(timelineSource.match(/snap-x snap-mandatory/g)?.length).toBeGreaterThanOrEqual(2);
    expect(timelineSource).toContain("aria-pressed={isSelected}");
    expect(timelineSource).toContain("aria-pressed={isHourSelected}");
    expect(timelineSource).toContain("aria-expanded={expanded}");
    expect(timelineSource).toContain("<details className=\"group");
  });

  it("sépare l’heure choisie de l’échéance active et respecte les données manquantes", () => {
    expect(timelineSource).toContain("Prévision active");
    expect(timelineSource).toContain("Créneau sélectionné");
    expect(timelineSource).toContain("snapshot courant séparé");
    expect(timelineSource).toContain("undatedHours");
    expect(timelineSource).toContain("aucune date n’a été déduite de l’horodatage UTC");
    expect(timelineSource).toContain("Qualité de l’air absente du contrat de cette page");
    expect(timelineSource).toContain('title: "Pluie"');
    expect(timelineSource).toContain('title: "Vent, rafales et direction"');
    expect(timelineSource).toContain('title: "Humidité"');
    expect(timelineSource).toContain('title: "Nuages"');
    expect(timelineSource).toContain('title: "Pression"');
    expect(timelineSource).toContain('title: "Indice UV"');
  });

  it("préserve la navigation historique, la carte et les preuves horaires", () => {
    expect(pageSource).toContain('import { Link } from "wouter"');
    expect(pageSource).toContain("Historique des prévisions");
    expect(pageSource).toContain('href="/history"');
    expect(pageSource).toContain("<WindyMap");
    expect(pageSource).toContain("<HourlyHistoricalEvidencePanel");
    expect(pageSource).toContain("findActiveHourlyForecastIndex(data.hours, Date.now())");
    expect(pageSource).toContain("Prévisions temporairement indisponibles");
  });
});
