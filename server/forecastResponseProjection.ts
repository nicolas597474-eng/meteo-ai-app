import type { HourlyPoint } from "./weatherServices";

/**
 * The Dashboard never exposes the per-variable, per-model historical weight
 * trace. That trace can be tens of kilobytes per hour and is preserved intact
 * for the detailed Forecast page only. This projection removes presentation-
 * irrelevant diagnostics without changing a single meteorological value,
 * provenance field, model-dispersion metric, or calculation result.
 */
export function projectHourlyForecastForDashboard(hours: readonly HourlyPoint[]): HourlyPoint[] {
  return hours.map(({ forecastWeighting: _forecastWeighting, ...hour }) => hour as HourlyPoint);
}
