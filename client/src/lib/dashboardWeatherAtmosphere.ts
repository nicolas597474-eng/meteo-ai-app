export type DashboardWeatherAtmosphereKind =
  | "rain"
  | "storm"
  | "snow"
  | "hail"
  | "ice"
  | "fog"
  | "dust"
  | "clouds"
  | "sun"
  | "cold-sun"
  | "heat"
  | "wind"
  | "night"
  | "none";

export type DashboardWeatherAtmosphereIntensity = "light" | "steady" | "heavy";

export type DashboardWeatherAtmosphereInput = {
  condition?: string | null;
  regime?: string | null;
  temperature?: number | null;
  visibilityKm?: number | null;
  precipitation?: number | null;
  cloudCover?: number | null;
  windSpeed?: number | null;
};

export type DashboardWeatherAtmosphere = {
  kind: DashboardWeatherAtmosphereKind;
  intensity: DashboardWeatherAtmosphereIntensity;
};

function normalizeCondition(condition?: string | null) {
  return (condition ?? "")
    .trim()
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ");
}

function finiteValue(value?: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function classifyCondition(
  condition: string
): DashboardWeatherAtmosphereKind | null {
  if (/(orage|thunder|tempet|storm)/.test(condition)) return "storm";
  if (/(grele|hail|gresil|graupel)/.test(condition)) return "hail";
  if (/(verglas|vergla|givre|gele|gel|frost|freezing|ice)/.test(condition))
    return "ice";
  if (/(neige|snow|sleet)/.test(condition)) return "snow";
  if (/(brume seche|poussiere|dust|haze)/.test(condition)) return "dust";
  if (/(brouillard|brume|fog|mist)/.test(condition)) return "fog";
  if (/(pluie|rain|averse|bruine|drizzle)/.test(condition)) return "rain";
  if (/(canicule|chaleur|heat)/.test(condition)) return "heat";
  if (/(vent|wind)/.test(condition)) return "wind";
  if (/(nuit|night)/.test(condition)) return "night";
  if (/(grand soleil|soleil froid|cold sun)/.test(condition)) return "cold-sun";
  if (/(nuage|cloud|couvert|overcast|variable)/.test(condition))
    return "clouds";
  if (/(soleil|sunny|ensoleill|degag|clair|clear)/.test(condition))
    return "sun";
  return null;
}

function getIntensity(
  kind: DashboardWeatherAtmosphereKind,
  condition: string,
  input: DashboardWeatherAtmosphereInput
): DashboardWeatherAtmosphereIntensity {
  if (kind === "storm" || kind === "heat") return "heavy";

  if (kind === "rain" || kind === "snow" || kind === "hail") {
    const precipitation = finiteValue(input.precipitation);
    if (
      (precipitation != null && precipitation > 10) ||
      /(fort|intense|heavy|violent)/.test(condition)
    ) {
      return "heavy";
    }
    if (/(bruine|faible|light|fine)/.test(condition)) return "light";
    return "steady";
  }

  if (kind === "ice") {
    if (/(fort|intense|heavy|violent)/.test(condition)) return "heavy";
    if (/(faible|leger|light)/.test(condition)) return "light";
    return "steady";
  }

  if (kind === "dust") {
    if (/(dense|fort|intense|heavy|violent)/.test(condition)) return "heavy";
    if (/(leger|faible|light)/.test(condition)) return "light";
    return "steady";
  }

  if (kind === "fog") {
    const visibilityKm = finiteValue(input.visibilityKm);
    return visibilityKm != null && visibilityKm < 0.2 ? "heavy" : "steady";
  }

  if (kind === "wind") {
    const windSpeed = finiteValue(input.windSpeed);
    return (windSpeed != null && windSpeed >= 65) ||
      /(fort|strong|rafale)/.test(condition)
      ? "heavy"
      : "steady";
  }

  if (kind === "clouds") {
    const cloudCover = finiteValue(input.cloudCover);
    return cloudCover != null && cloudCover >= 85 ? "heavy" : "steady";
  }

  return "steady";
}

/**
 * Choisit uniquement un habillage décoratif cohérent avec la condition ou le
 * régime déjà affiché, puis avec les seuils météo déjà utilisés par MeteoAI.
 * Aucun phénomène n’est déduit d’une donnée absente.
 */
export function getDashboardWeatherAtmosphere(
  input: DashboardWeatherAtmosphereInput
): DashboardWeatherAtmosphere {
  const condition = normalizeCondition(input.condition);
  const regime = normalizeCondition(input.regime);
  const displayedWeather = condition || regime;
  const explicitKind = classifyCondition(displayedWeather);
  const precipitation = finiteValue(input.precipitation);
  const cloudCover = finiteValue(input.cloudCover);
  const windSpeed = finiteValue(input.windSpeed);
  const temperature = finiteValue(input.temperature);
  const visibilityKm = finiteValue(input.visibilityKm);

  // La condition affichée reste prioritaire; les mesures ne servent qu’en repli.
  const kind =
    explicitKind ??
    (precipitation != null && precipitation > 0.2 ? "rain" : null) ??
    (windSpeed != null && windSpeed >= 40 ? "wind" : null) ??
    (visibilityKm != null && visibilityKm < 1 ? "fog" : null) ??
    (temperature != null && temperature > 33 ? "heat" : null) ??
    (temperature != null && temperature < 0 ? "ice" : null) ??
    (cloudCover != null && cloudCover > 20 ? "clouds" : null) ??
    "none";

  return {
    kind,
    intensity: getIntensity(kind, displayedWeather, input),
  };
}
