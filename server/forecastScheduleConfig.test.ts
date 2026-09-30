import { describe, expect, it } from "vitest";
import {
  FAVORITES_FORECAST_CADENCE_ENV,
  getActiveParisForecastHours,
  getFavoritesForecastCadence,
  getFavoritesForecastScheduleLabel,
  getRequiredFavoritesForecastHeartbeatCron,
} from "./forecastScheduleConfig";

describe("configuration de cadence du batch de prévisions", () => {
  it("conserve le run historique de 05:00 tant que l’activation externe n’est pas définie", () => {
    expect(getFavoritesForecastCadence({})).toBe("daily-05");
    expect(getActiveParisForecastHours({})).toEqual([5]);
    expect(getFavoritesForecastScheduleLabel({})).toBe("05:00");
  });

  it("active les six heures Paris uniquement avec la valeur runtime explicite 4h", () => {
    const env = { [FAVORITES_FORECAST_CADENCE_ENV]: "4h" };
    expect(getFavoritesForecastCadence(env)).toBe("every-4-hours");
    expect(getActiveParisForecastHours(env)).toEqual([1, 5, 9, 13, 17, 21]);
    expect(getFavoritesForecastScheduleLabel(env)).toBe("01:00, 05:00, 09:00, 13:00, 17:00, 21:00");
    expect(getRequiredFavoritesForecastHeartbeatCron()).toBe("0 0 0,3,4,7,8,11,12,15,16,19,20,23 * * *");
  });

  it("retombe sur 05:00 pour toute valeur runtime non reconnue", () => {
    const env = { [FAVORITES_FORECAST_CADENCE_ENV]: "hourly" };
    expect(getActiveParisForecastHours(env)).toEqual([5]);
  });
});
