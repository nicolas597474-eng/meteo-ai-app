import {
  FORECAST_HEARTBEAT_CRON_UTC,
  PARIS_FORECAST_RUN_HOURS,
  type ParisForecastRunHour,
} from "./weatherTime";

export const FAVORITES_FORECAST_CADENCE_ENV = "METEOAI_FAVORITES_FORECAST_CADENCE";
export type FavoritesForecastCadence = "daily-05" | "every-4-hours";

/**
 * The existing 05:00 schedule remains the safe default. Set this runtime value
 * to `4h` only together with the external Heartbeat cron update documented in
 * docs/favorites-forecast-schedule.md.
 */
export function getFavoritesForecastCadence(
  env: Record<string, string | undefined> = process.env,
): FavoritesForecastCadence {
  return env[FAVORITES_FORECAST_CADENCE_ENV] === "4h" ? "every-4-hours" : "daily-05";
}

export function getActiveParisForecastHours(
  env: Record<string, string | undefined> = process.env,
): readonly ParisForecastRunHour[] {
  return getFavoritesForecastCadence(env) === "every-4-hours" ? PARIS_FORECAST_RUN_HOURS : [5];
}

export function getFavoritesForecastScheduleLabel(
  env: Record<string, string | undefined> = process.env,
): string {
  return getActiveParisForecastHours(env)
    .map((hour) => `${String(hour).padStart(2, "0")}:00`)
    .join(", ");
}

export function getRequiredFavoritesForecastHeartbeatCron(): string {
  return FORECAST_HEARTBEAT_CRON_UTC;
}
