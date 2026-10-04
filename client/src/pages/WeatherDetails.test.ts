import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const pageSource = readFileSync(new URL("./WeatherDetails.tsx", import.meta.url), "utf8");
const timelineSource = readFileSync(new URL("../components/weather/ForecastByDaySection.tsx", import.meta.url), "utf8");
const displayDaysSource = readFileSync(new URL("../lib/forecastDayDisplay.ts", import.meta.url), "utf8");
describe("page Prévisions détaillées", () => {
  it("réutilise le contrat existant et transmet séparément l’horaire officiel, les jours et leurs sources", () => {
    expect(pageSource).toContain('trpc.weather.getDetailedForecast.useQuery({ ...coordsInput, includeExtendedPeriods: false }');
    expect(pageSource).toContain("dailyDays={data.days ?? []}");
    expect(pageSource).toContain("dailySources={data.modelsUsed ?? []}");
    expect(pageSource).toContain("hours={hours}");
    expect(pageSource).not.toContain("periodHours");
    expect(pageSource).not.toContain("includeExtendedPeriods: true");
    expect(displayDaysSource).toContain("kind: \"official-daily-fusion\"");
    expect(displayDaysSource).toContain("kind: \"official-hourly\"");
  });
  it("limite les dates aux données réelles et protège la séparation officielle/référence", () => {
    expect(displayDaysSource).toContain("Math.min(15, Math.floor(maximumDays))");
    expect(displayDaysSource).toContain("groupOfficialHourlyForecastByDate(hours)");
    expect(displayDaysSource).toContain("if (current?.hourlyGroup) continue");
    expect(displayDaysSource).toContain("isValidDateKey(daily.date)");
    expect(timelineSource).toContain("buildForecastDisplayDays(hours, dailyDays)");
    expect(timelineSource).toContain("Fusion officielle · preuves par variable");
    expect(timelineSource).toContain("Sources quotidiennes réellement reçues");
    expect(timelineSource).toContain("Best Match · référence dérivée, non contributeur officiel");
    expect(timelineSource).toContain("aucun biais historique n’est appliqué aux valeurs futures");
    expect(timelineSource).toContain("l’heure exacte des runs modèles n’est pas fournie");
    expect(timelineSource).toContain("Best Match");
  });
  it("sépare disponibilité physique, calibration robuste et contributions sans score de confiance", () => {
    expect(timelineSource).toContain('diagnostic.availabilityStatus === "UNAVAILABLE"');
    expect(timelineSource).toContain('diagnostic.availabilityStatus === "SINGLE_MODEL"');
    expect(timelineSource).toContain("diagnostic.contributingModelCount === 1");
    expect(timelineSource).toContain('diagnostic.calibrationStatus === "PARTIALLY_CALIBRATED"');
    expect(timelineSource).toContain('diagnostic.calibrationStatus === "CALIBRATED"');
    expect(timelineSource).toContain("diagnosticsByVariable?.[key]");
    expect(timelineSource).toContain("Valeurs réellement disponibles :");
    expect(timelineSource).toContain("preuves historiques qualifiées :");
    expect(timelineSource).toContain("contributeurs effectifs");
    expect(timelineSource).toContain("ils ne constituent ni une note de fiabilité ni un pourcentage de confiance");
    expect(timelineSource).toContain("Une couverture plus faible peut être normale selon l’horizon du modèle.");
    expect(timelineSource).toContain("Niveau de couverture/confiance indicatif selon le nombre de contributeurs");
    expect(timelineSource).toContain("ni une probabilité ni une confiance statistiquement calibrée");
    expect(timelineSource).toContain("Statut de calibration historique, distinct");
  });
  it("garde les rubans horizontaux accessibles et n’invente pas d’échéances pour la série quotidienne", () => {
    expect(timelineSource).toContain('aria-label="Jours de prévision défilables"');
    expect(timelineSource).toContain('aria-label="Heures de prévision défilables"');
    expect(timelineSource.match(/overflow-x-auto/g)?.length).toBeGreaterThanOrEqual(3);
    expect(timelineSource.match(/touch-pan-x/g)?.length).toBeGreaterThanOrEqual(3);
    expect(timelineSource.match(/snap-x snap-mandatory/g)?.length).toBeGreaterThanOrEqual(2);
    expect(timelineSource).toContain("centerWithinHorizontalStrip");
    expect(timelineSource).toContain("aria-pressed={isSelected}");
    expect(timelineSource).toContain("aria-pressed={isHourSelected}");
    expect(timelineSource).toContain("Aucune série horaire officielle disponible pour cette date");
    expect(timelineSource).toContain("Extrêmes quotidiens non fournis");
  });
  it("n’affiche que les champs fournis, distingue les fréquences brutes et laisse l’AQI indisponible", () => {
    for (const title of ["Précipitations", "Vent", "Humidité et rosée", "Nuages", "Pression", "Indice UV", "Température ressentie", "Visibilité", "Rayonnement solaire"]) {
      expect(timelineSource).toContain(`title: "${title}"`);
    }
    expect(timelineSource).toContain("Rafales max.");
    expect(timelineSource).toContain("Direction dominante");
    expect(timelineSource).toContain("Soleil");
    expect(timelineSource).toContain("fréquence brute descriptive, pas une probabilité");
    expect(timelineSource).toContain("jamais une probabilité de pluie calibrée");
    expect(timelineSource).toContain("buildDailyDetailCategories");
    expect(timelineSource).toContain("L’indice de qualité de l’air ne fait pas partie des données renvoyées à cette page");
    expect(timelineSource).toContain("Aucune valeur n’est demandée, déduite ou inventée");
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
