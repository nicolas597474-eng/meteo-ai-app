import { formatOptionalForecastValue } from "./forecastTimeline";

export const HOURLY_SELECTED_DETAIL_COLORS = {
  condition: "#ddd6fe",
  temperature: "#fed7aa",
  apparentTemperature: "#fecdd3",
  precipitation: "#bae6fd",
  windSpeed: "#a5f3fc",
  windGust: "#99f6e4",
  windDirection: "#bfdbfe",
  humidity: "#a7f3d0",
  dewPoint: "#bbf7d0",
  cloudCover: "#cbd5e1",
  cloudLow: "#c7d2fe",
  cloudMid: "#e9d5ff",
  cloudHigh: "#f5d0fe",
  pressure: "#fbcfe8",
  uvIndex: "#fde68a",
  visibility: "#d9f99d",
} as const;

export type HourlySelectedDetailColor = keyof typeof HOURLY_SELECTED_DETAIL_COLORS;
export type HourlySelectedHistogramCategory =
  | "precipitation"
  | "wind"
  | "humidity"
  | "clouds"
  | "pressure"
  | "uv"
  | "apparent"
  | "visibility";

export type HourlySelectedForecast = {
  validAt?: number | null;
  condition?: string | null;
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
  color: string;
  value: string;
  available: boolean;
  summary: string;
  timeLabel: string;
  validAt: number | null;
  note?: string;
  histogramCategory?: HourlySelectedHistogramCategory;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatWithUnit(
  value: number | null | undefined,
  decimals: number,
  unit: string,
): string {
  return finite(value)
    ? formatOptionalForecastValue(value, decimals, unit)
    : "Indisponible";
}

function formatDirection(value: number | null | undefined): string {
  if (!finite(value)) return "Indisponible";
  const directions = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
  ];
  const cardinal = directions[Math.round((((value % 360) + 360) % 360) / 22.5) % 16];
  return `${cardinal} · ${formatOptionalForecastValue(value, 1, "°")}`;
}

function precipitationNote(hour: HourlySelectedForecast): string | undefined {
  const metrics = hour.multiModelMetrics?.source === "official_seven_models"
    && hour.multiModelMetrics.bestMatchIncluded === false
    ? hour.multiModelMetrics.precipitation
    : null;
  if (!finite(metrics?.rainModelCount) || !finite(metrics?.availableModelCount)) return undefined;
  const threshold = finite(metrics.thresholdMm)
    ? ` ≥ ${formatOptionalForecastValue(metrics.thresholdMm, 1, " mm")}`
    : "";
  return `${metrics.rainModelCount}/${metrics.availableModelCount} modèles au seuil${threshold} · fréquence descriptive brute, pas une probabilité calibrée.`;
}

/** Build every permitted weather field from one exact official hourly point. */
export function buildHourlySelectedDetails(
  hour: HourlySelectedForecast,
  timeLabel: string,
): HourlySelectedDetail[] {
  const validAt = typeof hour.validAt === "number"
    && Number.isSafeInteger(hour.validAt)
    && Number.isFinite(new Date(hour.validAt).getTime())
    ? hour.validAt
    : null;

  const make = (
    key: string,
    title: string,
    icon: string,
    color: HourlySelectedDetailColor,
    value: string,
    available: boolean,
    options: { note?: string; histogramCategory?: HourlySelectedHistogramCategory } = {},
  ): HourlySelectedDetail => ({
    key,
    title,
    icon,
    color: HOURLY_SELECTED_DETAIL_COLORS[color],
    value,
    available,
    summary: `${value} · ${timeLabel}`,
    timeLabel,
    validAt,
    ...options,
  });
  const numeric = (
    value: number | null | undefined,
    decimals: number,
    unit: string,
  ) => ({ value: formatWithUnit(value, decimals, unit), available: finite(value) });
  const condition = hour.condition?.trim();
  const precipitation = numeric(hour.precipitation, 1, " mm");
  const windSpeed = numeric(hour.windSpeed, 0, " km/h");
  const windGust = numeric(hour.windGust, 0, " km/h");
  const humidity = numeric(hour.humidity, 0, " %");
  const cloudCover = numeric(hour.cloudCover, 0, " %");
  const pressure = numeric(hour.pressure, 0, " hPa");
  const uvIndex = numeric(hour.uvIndex, 1, "");
  const apparentTemperature = numeric(hour.apparentTemp, 1, " °C");
  const visibility = numeric(hour.visibility, 1, " km");
  const dewPoint = numeric(hour.dewPoint, 1, " °C");
  const temperature = numeric(hour.temp, 1, " °C");
  const cloudLow = numeric(hour.cloudLow, 0, " %");
  const cloudMid = numeric(hour.cloudMid, 0, " %");
  const cloudHigh = numeric(hour.cloudHigh, 0, " %");
  const direction = formatDirection(hour.windDirection);

  return [
    make("condition", "Condition", "cloud_cover", "condition", condition || "Indisponible", Boolean(condition)),
    make("temperature", "Température de l’air", "thermometer", "temperature", temperature.value, temperature.available),
    make("apparent", "Température ressentie", "thermometer", "apparentTemperature", apparentTemperature.value, apparentTemperature.available, { histogramCategory: "apparent" }),
    make("precipitation", "Précipitations", "precipitation", "precipitation", precipitation.value, precipitation.available, { note: precipitationNote(hour), histogramCategory: "precipitation" }),
    make("windSpeed", "Vent moyen", "wind_param", "windSpeed", windSpeed.value, windSpeed.available, { histogramCategory: "wind" }),
    make("windGust", "Rafales", "wind_param", "windGust", windGust.value, windGust.available),
    make("windDirection", "Direction du vent", "wind_param", "windDirection", direction, finite(hour.windDirection)),
    make("humidity", "Humidité relative", "humidity", "humidity", humidity.value, humidity.available, { histogramCategory: "humidity" }),
    make("dewPoint", "Point de rosée", "humidity", "dewPoint", dewPoint.value, dewPoint.available),
    make("cloudCover", "Nébulosité totale", "cloud_cover", "cloudCover", cloudCover.value, cloudCover.available, { histogramCategory: "clouds" }),
    make("cloudLow", "Nuages bas", "cloud_cover", "cloudLow", cloudLow.value, cloudLow.available),
    make("cloudMid", "Nuages moyens", "cloud_cover", "cloudMid", cloudMid.value, cloudMid.available),
    make("cloudHigh", "Nuages hauts", "cloud_cover", "cloudHigh", cloudHigh.value, cloudHigh.available),
    make("pressure", "Pression atmosphérique", "pressure", "pressure", pressure.value, pressure.available, { histogramCategory: "pressure" }),
    make("uv", "Indice UV", "sunny", "uvIndex", uvIndex.value, uvIndex.available, { histogramCategory: "uv" }),
    make("visibility", "Visibilité", "eye", "visibility", visibility.value, visibility.available, { histogramCategory: "visibility" }),
  ];
}
