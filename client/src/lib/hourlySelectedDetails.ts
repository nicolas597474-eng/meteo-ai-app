import { formatOptionalForecastValue } from "./forecastTimeline";

export type HourlySelectedForecast = {
  validAt?: number | null;
  temp?: number | null;
  apparentTemp?: number | null;
  precipitation?: number | null;
  windSpeed?: number | null;
  windGust?: number | null;
  windDirection?: number | null;
  humidity?: number | null;
  dewPoint?: number | null;
  cloudCover?: number | null;
  cloudLow?: number | null;
  cloudMid?: number | null;
  cloudHigh?: number | null;
  pressure?: number | null;
  uvIndex?: number | null;
  visibility?: number | null;
  solarRadiation?: number | null;
  weatherCode?: number | null;
  precipType?: string | null;
  precipIntensity?: string | null;
  multiModelMetrics?: {
    source?: string | null;
    bestMatchIncluded?: boolean | null;
    precipitation?: {
      thresholdMm?: number | null;
      rainModelCount?: number | null;
      availableModelCount?: number | null;
    } | null;
  } | null;
};

export type HourlySelectedDetail = {
  key: string;
  title: string;
  icon: string;
  value: string;
  summary: string;
  timeLabel: string;
  validAt: number | null;
  note?: string;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatWithUnit(
  value: number | null | undefined,
  decimals: number,
  unit: string
): string {
  return finite(value)
    ? formatOptionalForecastValue(value, decimals, unit)
    : `—${unit}`;
}

function formatNumber(value: number | null | undefined, decimals = 0): string {
  return finite(value) ? formatOptionalForecastValue(value, decimals) : "—";
}

function windDirectionLabel(degrees: number): string {
  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSO",
    "SO",
    "OSO",
    "O",
    "ONO",
    "NO",
    "NNO",
  ];
  return directions[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
}

function precipitationTypeLabel(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const labels: Record<string, string> = {
    rain: "Pluie",
    snow: "Neige",
    freezing_rain: "Pluie verglaçante",
    sleet: "Neige fondue",
  };
  return labels[value.toLowerCase()] ?? value;
}

function precipitationIntensityLabel(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const labels: Record<string, string> = {
    light: "Faible",
    moderate: "Modérée",
    heavy: "Forte",
  };
  return labels[value.toLowerCase()] ?? value;
}

/** Build every field shown in the selected-hour panel from one exact official point. */
export function buildHourlySelectedDetails(
  hour: HourlySelectedForecast,
  timeLabel: string
): HourlySelectedDetail[] {
  const validAt =
    typeof hour.validAt === "number" &&
    Number.isSafeInteger(hour.validAt) &&
    Number.isFinite(new Date(hour.validAt).getTime())
      ? hour.validAt
      : null;
  const make = (
    key: string,
    title: string,
    icon: string,
    value: string,
    note?: string
  ): HourlySelectedDetail => ({
    key,
    title,
    icon,
    value,
    summary: `${value} · ${timeLabel}`,
    timeLabel,
    validAt,
    ...(note ? { note } : {}),
  });
  const precipitationMetrics =
    hour.multiModelMetrics?.source === "official_seven_models" &&
    hour.multiModelMetrics.bestMatchIncluded === false
      ? hour.multiModelMetrics.precipitation
      : null;
  const hasPrecipitationCounts =
    finite(precipitationMetrics?.rainModelCount) &&
    finite(precipitationMetrics?.availableModelCount);
  const precipitationNote = hasPrecipitationCounts
    ? `${precipitationMetrics.rainModelCount}/${precipitationMetrics.availableModelCount} modèles au seuil${finite(precipitationMetrics.thresholdMm) ? ` ≥ ${formatOptionalForecastValue(precipitationMetrics.thresholdMm, 1, " mm")}` : ""} · fréquence descriptive brute, pas une probabilité calibrée.`
    : undefined;
  const direction = finite(hour.windDirection)
    ? `${windDirectionLabel(hour.windDirection)} (${formatWithUnit(hour.windDirection, 1, "°")})`
    : "—";

  return [
    make(
      "precipitation",
      "Précipitations",
      "precipitation",
      `Quantité ${formatWithUnit(hour.precipitation, 1, " mm")}`,
      precipitationNote
    ),
    make(
      "precip-type",
      "Type et intensité",
      "precipitation",
      `Type ${precipitationTypeLabel(hour.precipType)} · intensité ${precipitationIntensityLabel(hour.precipIntensity)}`
    ),
    make(
      "wind",
      "Vent",
      "wind_param",
      `Vent ${formatWithUnit(hour.windSpeed, 0, " km/h")} · direction ${direction} · rafales ${formatWithUnit(hour.windGust, 0, " km/h")}`
    ),
    make(
      "humidity",
      "Humidité et rosée",
      "humidity",
      `Humidité ${formatWithUnit(hour.humidity, 0, " %")} · point de rosée ${formatWithUnit(hour.dewPoint, 1, " °C")}`
    ),
    make(
      "clouds",
      "Nuages",
      "cloud_cover",
      `Total ${formatWithUnit(hour.cloudCover, 0, " %")} · basses ${formatWithUnit(hour.cloudLow, 0, " %")} · moyennes ${formatWithUnit(hour.cloudMid, 0, " %")} · hautes ${formatWithUnit(hour.cloudHigh, 0, " %")}`
    ),
    make(
      "pressure",
      "Pression",
      "pressure",
      formatWithUnit(hour.pressure, 0, " hPa")
    ),
    make("uv", "Indice UV", "sunny", formatNumber(hour.uvIndex, 1)),
    make(
      "apparent",
      "Température ressentie",
      "thermometer",
      formatWithUnit(hour.apparentTemp, 1, " °C")
    ),
    make(
      "visibility",
      "Visibilité",
      "eye",
      formatWithUnit(hour.visibility, 1, " km")
    ),
    make(
      "radiation",
      "Rayonnement solaire",
      "sunny",
      formatWithUnit(hour.solarRadiation, 0, " W/m²")
    ),
    make(
      "air-quality",
      "Qualité de l’air",
      "cloud_cover",
      "Non disponible",
      "Aucune donnée horaire de qualité de l’air n’est fournie par cette prévision officielle."
    ),
    make(
      "weather-code",
      "Code météo (WMO)",
      "calendar",
      `Code ${formatNumber(hour.weatherCode)}`
    ),
  ];
}
