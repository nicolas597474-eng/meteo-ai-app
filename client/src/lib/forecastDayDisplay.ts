import {
  groupOfficialHourlyForecastByDate,
  type DatedForecastHour,
  type ForecastDayGroup,
} from "@/lib/forecastTimeline";
import type { DailyModelAgreement } from "@shared/modelAgreement";
import type {
  BestMatchDailyReference,
  DailyOfficialFusionDisplay,
} from "@shared/dailyForecast";

export type DailyForecastPoint = {
  date?: string | null;
  tempMax?: number | null;
  tempMin?: number | null;
  precipitation?: number | null;
  precipitationConsensus?: {
    thresholdMm?: number | null;
    rainModelCount?: number | null;
    availableModelCount?: number | null;
  } | null;
  windSpeed?: number | null;
  windGust?: number | null;
  windDirection?: number | null;
  humidity?: number | null;
  cloudCover?: number | null;
  condition?: string | null;
  uvIndex?: number | null;
  feelsLikeMax?: number | null;
  feelsLikeMin?: number | null;
  sunrise?: string | null;
  sunset?: string | null;
  officialFusion?: DailyOfficialFusionDisplay | null;
  bestMatchReference?: BestMatchDailyReference | null;
  modelAgreement?: DailyModelAgreement | null;
};

export type ForecastDisplayDay<
  THour extends DatedForecastHour,
  TDay extends DailyForecastPoint,
> = {
  date: string;
  kind: "official-hourly" | "official-daily-fusion";
  hourlyGroup: ForecastDayGroup<THour> | null;
  daily: TDay | null;
};

function isValidDateKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/**
 * Keeps the official hourly series authoritative wherever it exists. Daily
 * qualified daily fusions are used only for dates without official hours and
 * retain their own explicit identity. Dates are never inferred from timestamps.
 */
export function buildForecastDisplayDays<
  THour extends DatedForecastHour,
  TDay extends DailyForecastPoint,
>(
  hours: readonly THour[],
  dailyDays: readonly TDay[],
  maximumDays = 15
): ForecastDisplayDay<THour, TDay>[] {
  const byDate = new Map<
    string,
    {
      hourlyGroup: ForecastDayGroup<THour> | null;
      daily: TDay | null;
    }
  >();

  for (const group of groupOfficialHourlyForecastByDate(hours).days) {
    byDate.set(group.date, { hourlyGroup: group, daily: null });
  }
  for (const daily of dailyDays) {
    if (!isValidDateKey(daily.date)) continue;
    const current = byDate.get(daily.date);
    if (current?.hourlyGroup) continue;
    byDate.set(daily.date, { hourlyGroup: null, daily });
  }

  const limit = Math.max(0, Math.min(15, Math.floor(maximumDays)));
  const result: ForecastDisplayDay<THour, TDay>[] = [];
  const dates = Array.from(byDate.keys())
    .sort((left, right) => left.localeCompare(right))
    .slice(0, limit);
  for (const date of dates) {
    const entry = byDate.get(date);
    if (!entry) continue;
    if (entry.hourlyGroup) {
      result.push({
        date,
        kind: "official-hourly",
        hourlyGroup: entry.hourlyGroup,
        daily: null,
      });
    } else if (entry.daily) {
      result.push({
        date,
        kind: "official-daily-fusion",
        hourlyGroup: null,
        daily: entry.daily,
      });
    }
  }
  return result;
}

/** Names Best Match as a separate derived reference, never an official contributor. */
export function getDailyReferenceSourceLabels(
  modelsUsed: readonly string[]
): string[] {
  return Array.from(
    new Set(
      modelsUsed
        .map(source => {
          const normalized = source
            .trim()
            .toLowerCase()
            .replace(/[\s_-]+/g, "");
          return normalized === "openmeteo" || normalized === "bestmatch"
            ? "Best Match · référence dérivée, non contributeur officiel"
            : source.trim();
        })
        .filter(Boolean)
    )
  );
}
