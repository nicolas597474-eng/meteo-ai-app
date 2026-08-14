export type ForecastPeriod = "matin" | "apres_midi" | "soir" | "nuit";

export type DatedHourlyForecast = {
  date?: string;
  hour: string;
  [key: string]: unknown;
};

export const FORECAST_PERIODS: ForecastPeriod[] = ["matin", "apres_midi", "soir", "nuit"];

export const FORECAST_PERIOD_LABELS: Record<ForecastPeriod, { label: string; emoji: string }> = {
  matin: { label: "Matin", emoji: "🌅" },
  apres_midi: { label: "Après-midi", emoji: "☀️" },
  soir: { label: "Soir", emoji: "🌇" },
  nuit: { label: "Nuit", emoji: "🌙" },
};

export function getForecastPeriod(hour: string): ForecastPeriod {
  const parsedHour = Number.parseInt(hour.split(":")[0] ?? "0", 10);
  if (parsedHour >= 6 && parsedHour < 12) return "matin";
  if (parsedHour >= 12 && parsedHour < 18) return "apres_midi";
  if (parsedHour >= 18 && parsedHour < 22) return "soir";
  return "nuit";
}

export function getDayPeriodHours<T extends DatedHourlyForecast>(dayDate: string, hours: T[]): Record<ForecastPeriod, T[]> {
  const periods: Record<ForecastPeriod, T[]> = { matin: [], apres_midi: [], soir: [], nuit: [] };
  hours.filter((hour) => hour.date === dayDate).forEach((hour) => {
    periods[getForecastPeriod(hour.hour)].push(hour);
  });
  return periods;
}
