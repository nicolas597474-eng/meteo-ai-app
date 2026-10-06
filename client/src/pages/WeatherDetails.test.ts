import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const pageSource = readFileSync(new URL("./WeatherDetails.tsx", import.meta.url), "utf8");
const timelineSource = readFileSync(new URL("../components/weather/ForecastByDaySection.tsx", import.meta.url), "utf8");
const hourlyPanelSource = readFileSync(new URL("../components/weather/HourlySelectedDetailsPanel.tsx", import.meta.url), "utf8");
const selectedDetailsSource = readFileSync(new URL("../lib/hourlySelectedDetails.ts", import.meta.url), "utf8");
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
    expect(displayDaysSource).toContain("if (current?.hourlyGroup) {");
    expect(displayDaysSource).toContain("if (includeDailyForHourlyDate.has(daily.date)) current.daily = daily");
    expect(displayDaysSource).toContain("isValidDateKey(daily.date)");
    expect(timelineSource).toContain("buildForecastDisplayDays(hours, dailyDays, 15, [today, tomorrow])");
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
    expect(timelineSource).toContain("Nombre de modèles contributeurs :");
    expect(timelineSource).toContain("Incertitude statistique : non mesurée dans cette vue.");
    expect(timelineSource).toContain("Statut de calibration historique, distinct");
  });
  it("garde les rubans horizontaux accessibles et n’invente pas d’échéances pour la série quotidienne", () => {
    expect(timelineSource).toContain('aria-label="Jours de prévision défilables"');
    expect(timelineSource).toContain('aria-label="Heures de prévision défilables"');
    expect(timelineSource.match(/overflow-x-auto/g)?.length).toBeGreaterThanOrEqual(2);
    expect(timelineSource.match(/touch-pan-x/g)?.length).toBeGreaterThanOrEqual(2);
    expect(timelineSource.match(/snap-x snap-mandatory/g)?.length).toBeGreaterThanOrEqual(2);
    expect(timelineSource).toContain("centerWithinHorizontalStrip");
    expect(timelineSource).toContain("aria-pressed={isSelected}");
    expect(timelineSource).toContain("aria-pressed={isHourSelected}");
    expect(timelineSource).toContain("Aucune série horaire officielle disponible pour cette date");
    expect(timelineSource).toContain("Extrêmes journaliers indisponibles");
  });
  it("affiche tous les champs horaires autorisés, exclut les rubriques interdites et signale les variables non fournies", () => {
    for (const title of ["Condition", "Température de l’air", "Température ressentie", "Précipitations", "Vent moyen", "Rafales", "Direction du vent", "Humidité relative", "Point de rosée", "Nébulosité totale", "Nuages bas", "Nuages moyens", "Nuages hauts", "Pression atmosphérique", "Indice UV", "Visibilité"]) {
      expect(selectedDetailsSource).toContain(`"${title}"`);
    }
    for (const excluded of ["Type et intensité", "Rayonnement solaire", "Code météo", "precipType", "precipIntensity", "solarRadiation", "weatherCode"]) {
      expect(selectedDetailsSource).not.toContain(excluded);
    }
    expect(hourlyPanelSource).toContain("Variables non fournies par le backend");
    expect(hourlyPanelSource).toContain("qualité de l’air et probabilité calibrée de précipitations");
    expect(selectedDetailsSource).toContain("fréquence descriptive brute, pas une probabilité calibrée");
    expect(timelineSource).toContain("jamais une probabilité de pluie calibrée");
    expect(timelineSource).toContain("buildDailyDetailCategories");
    expect(timelineSource).toContain("L’indice de qualité de l’air ne fait pas partie des données renvoyées à cette page");
    expect(timelineSource).toContain("Aucune valeur n’est demandée, déduite ou inventée");
  });
  it("garde toutes les mesures visibles et colorées sur mobile, sans hauteur fixe, avec les histogrammes accessibles séparément", () => {
    expect(hourlyPanelSource).toContain("Mesures météo de l’échéance horaire sélectionnée");
    expect(hourlyPanelSource).toContain("grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3");
    expect(hourlyPanelSource).toContain("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4");
    expect(hourlyPanelSource).toContain("data-hourly-detail-field={detail.key}");
    expect(hourlyPanelSource).toContain("style={{ borderColor: detail.color, backgroundColor: \"#020617\" }}");
    expect(hourlyPanelSource).toContain("style={{ color: detail.color }}");
    expect(hourlyPanelSource).not.toMatch(/max-h-|maxHeight\s*:|height\s*:/);
    expect(timelineSource).toContain("Tendances horaires des mesures");
  });
  it("affiche les mêmes données de validTime sous la température et conserve le bloc Valeurs pour l’échéance sélectionnée", () => {
    expect(timelineSource).toContain("buildHourlySelectedDetails(selectedEntry.hour, hourTime(selectedEntry, hours))");
    expect(timelineSource.match(/details={selectedHourlyDetails}/g)).toHaveLength(2);
    expect(timelineSource).toContain('variant="summary"');
    expect(timelineSource).toContain('variant="details"');
    expect(timelineSource).toContain("Données météo de l’échéance sélectionnée · ${hourTime(selectedEntry, hours)}");
    expect(timelineSource).toContain("validTime UTC : ${selectedValidTimeUtc} · Source : ${selectedSourceLabel} · ${selectedMethodLabel}");
    expect(timelineSource).toContain("Valeurs pour l’échéance sélectionnée · {hourTime(selectedEntry, hours)}");
    expect(timelineSource.indexOf('variant="summary"')).toBeGreaterThan(timelineSource.indexOf("formatOptionalForecastValue(selectedEntry?.hour.temp, 1, \"°\")"));
    expect(timelineSource.indexOf('variant="summary"')).toBeLessThan(timelineSource.indexOf('aria-label="Heures de prévision défilables"'));
  });
  it("lie les valeurs affichées à l’heure cliquée et expose son validTime et sa source", () => {
    expect(timelineSource).toContain("buildHourlySelectedDetails(selectedEntry.hour, hourTime(selectedEntry, hours))");
    expect(timelineSource).toContain("buildHourlyDetailCategories(selectedEntry, hours, indexedHours, histogramStartValidAt)");
    expect(timelineSource).toContain("getHourlyHistogramStartValidAt(");
    expect(timelineSource).toContain("buildHourlyHistogramSeries(detail.histogramCategory, indexedHours, startValidAt)");
    expect(timelineSource).toContain("<HourlyMiniHistogram");
    expect(timelineSource).toContain("allHours={hours}");
    expect(timelineSource).toContain("selectedEntry.hour.validAt");
    expect(timelineSource).toContain("validTime UTC :");
    expect(timelineSource).toContain("Source : {selectedSourceLabel} · {selectedMethodLabel}");
    expect(timelineSource).toContain("whitespace-normal break-words");
    expect(pageSource).toContain("officialProvenance={{");
    expect(pageSource).toContain("source: data.officialSnapshot?.source");
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
  it("sépare la vérification admin du catalogue de la comparaison de valeurs AROME/Single Runs", () => {
    expect(pageSource).toContain("trpc.weather.verifyHondeghemAromeWindDirection.useMutation()");
    expect(pageSource).toContain('onClick={() => windDirectionVerification.mutate()}');
    expect(pageSource).toContain("ne télécharge ni raster AROME ni valeurs Single Runs");
    expect(pageSource).toContain("elle ne télécharge ni raster AROME ni valeurs Single Runs et n’intègre pas automatiquement le champ");
    expect(pageSource).toContain('{user?.role === "admin" && <MeteoSurface');
  });
  it("garde OpenWeather comme comparateur manuel shadow et affiche les échéances et champs non couverts", () => {
    expect(pageSource).toContain("trpc.weather.compareOpenWeatherShadow.useMutation()");
    expect(pageSource).toContain("validAt,");
    expect(pageSource).toContain("openWeatherShadow.data.provenance.endpoint");
    expect(pageSource).toContain("openWeatherShadow.data.coverage.map");
    expect(pageSource).toContain("openWeatherShadow.data.unsupportedFields.map");
    expect(pageSource).toContain("aucun changement des prévisions officielles");
    expect(pageSource).toContain("jamais un modèle ni un vote");
  });
});
