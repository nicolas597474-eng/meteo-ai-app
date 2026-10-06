export type HourlyHistogramField =
  | "precipitation"
  | "windSpeed"
  | "windGust"
  | "humidity"
  | "dewPoint"
  | "cloudCover"
  | "cloudLow"
  | "cloudMid"
  | "cloudHigh"
  | "pressure"
  | "uvIndex"
  | "apparentTemp"
  | "visibility"
  | "solarRadiation";

export type HourlyHistogramForecast = {
  validAt?: number | null;
  date?: string | null;
  hour?: string | null;
  precipitation?: number | null;
  windSpeed?: number | null;
  windGust?: number | null;
  humidity?: number | null;
  dewPoint?: number | null;
  cloudCover?: number | null;
  cloudLow?: number | null;
  cloudMid?: number | null;
  cloudHigh?: number | null;
  pressure?: number | null;
  uvIndex?: number | null;
  apparentTemp?: number | null;
  visibility?: number | null;
  solarRadiation?: number | null;
};

export type IndexedHourlyHistogramHour<T extends HourlyHistogramForecast = HourlyHistogramForecast> = {
  index: number;
  hour: T;
};

export type HourlyHistogramMetricDefinition = {
  field: HourlyHistogramField;
  label: string;
  unit: string;
  decimals: number;
};

export type HourlyHistogramPoint<T extends HourlyHistogramForecast = HourlyHistogramForecast> = {
  key: string;
  index: number;
  validAt: number;
  hour: T;
  value: number | null;
};

export type HourlyHistogramSeries<T extends HourlyHistogramForecast = HourlyHistogramForecast> = {
  field: HourlyHistogramField;
  label: string;
  unit: string;
  decimals: number;
  points: HourlyHistogramPoint<T>[];
};

export const HOURLY_HISTOGRAM_PALETTE = {
  precipitation: { barClassName: "bg-sky-400" },
  wind: { barClassName: "bg-teal-400" },
  humidity: { barClassName: "bg-cyan-400" },
  clouds: { barClassName: "bg-slate-400" },
  pressure: { barClassName: "bg-violet-400" },
  uv: { barClassName: "bg-amber-400" },
  apparent: { barClassName: "bg-rose-400" },
  visibility: { barClassName: "bg-blue-300" },
  radiation: { barClassName: "bg-orange-400" },
  "air-quality": { barClassName: "bg-emerald-400" },
} as const;

export type HourlyHistogramCategoryKey = keyof typeof HOURLY_HISTOGRAM_PALETTE;

export const HOURLY_HISTOGRAM_SERIES_BY_CATEGORY: Record<
  HourlyHistogramCategoryKey,
  readonly HourlyHistogramMetricDefinition[]
> = {
  precipitation: [
    { field: "precipitation", label: "Précipitations", unit: "mm", decimals: 1 },
  ],
  wind: [
    { field: "windSpeed", label: "Vent", unit: "km/h", decimals: 0 },
    { field: "windGust", label: "Rafales", unit: "km/h", decimals: 0 },
  ],
  humidity: [
    { field: "humidity", label: "Humidité", unit: "%", decimals: 0 },
    { field: "dewPoint", label: "Point de rosée", unit: "°C", decimals: 1 },
  ],
  clouds: [
    { field: "cloudCover", label: "Nuages · total", unit: "%", decimals: 0 },
    { field: "cloudLow", label: "Nuages · basses", unit: "%", decimals: 0 },
    { field: "cloudMid", label: "Nuages · moyennes", unit: "%", decimals: 0 },
    { field: "cloudHigh", label: "Nuages · hautes", unit: "%", decimals: 0 },
  ],
  pressure: [
    { field: "pressure", label: "Pression", unit: "hPa", decimals: 0 },
  ],
  uv: [{ field: "uvIndex", label: "Indice UV", unit: "", decimals: 1 }],
  apparent: [
    { field: "apparentTemp", label: "Température ressentie", unit: "°C", decimals: 1 },
  ],
  visibility: [
    { field: "visibility", label: "Visibilité", unit: "km", decimals: 1 },
  ],
  radiation: [
    { field: "solarRadiation", label: "Rayonnement solaire", unit: "W/m²", decimals: 0 },
  ],
  "air-quality": [],
};

const HOUR_MS = 60 * 60_000;

function isValidTimestamp(value: number | null | undefined): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && Number.isFinite(new Date(value).getTime());
}

/**
 * Resolve one shared UTC start for every mini-histogram. A direct hour selection
 * takes precedence; otherwise use the active current hour, then the first future
 * validTime. No local-hour string is used to align the series.
 */
export function getHourlyHistogramStartValidAt<T extends HourlyHistogramForecast>(
  hours: readonly IndexedHourlyHistogramHour<T>[],
  activeHourIndex: number,
  clickedValidAt: number | null,
  nowMs = Date.now(),
): number | null {
  if (isValidTimestamp(clickedValidAt)) return clickedValidAt;

  const activeHour = hours.find(({ index }) => index === activeHourIndex)?.hour;
  if (
    activeHour
    && isValidTimestamp(activeHour.validAt)
    && activeHour.validAt <= nowMs
    && nowMs < activeHour.validAt + HOUR_MS
  ) {
    return activeHour.validAt;
  }

  const currentHour = hours
    .map(({ hour }) => hour.validAt)
    .filter((validAt): validAt is number => (
      isValidTimestamp(validAt)
      && validAt <= nowMs
      && nowMs < validAt + HOUR_MS
    ))
    .sort((left, right) => left - right)[0];
  if (currentHour != null) return currentHour;

  const nextHour = hours
    .map(({ hour }) => hour.validAt)
    .filter((validAt): validAt is number => isValidTimestamp(validAt) && validAt >= nowMs)
    .sort((left, right) => left - right)[0];
  return nextHour ?? null;
}

/**
 * Build aligned, real-timestamp series for numeric fields only. Missing values
 * keep their time slot as null; no interpolation or synthetic values are made.
 */
export function buildHourlyHistogramSeries<T extends HourlyHistogramForecast>(
  categoryKey: string,
  hours: readonly IndexedHourlyHistogramHour<T>[],
  startValidAt: number | null,
): HourlyHistogramSeries<T>[] {
  if (!isValidTimestamp(startValidAt)) return [];

  const definitions = HOURLY_HISTOGRAM_SERIES_BY_CATEGORY[
    categoryKey as HourlyHistogramCategoryKey
  ] ?? [];
  if (definitions.length === 0) return [];

  const orderedHours = hours
    .filter(({ hour }) => isValidTimestamp(hour.validAt) && hour.validAt >= startValidAt)
    .slice()
    .sort((left, right) => left.hour.validAt! - right.hour.validAt! || left.index - right.index);

  return definitions.flatMap((definition) => {
    const points = orderedHours.map(({ index, hour }) => {
      const candidate = hour[definition.field];
      return {
        key: `${definition.field}-${hour.validAt}-${index}`,
        index,
        validAt: hour.validAt!,
        hour,
        value: typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null,
      };
    });
    if (!points.some(({ value }) => value != null)) return [];
    return [{ ...definition, points }];
  });
}
