import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getActiveOfficialForecastHour, getHourlyForecastAtValidTime, getOfficialForecastCoordinates, getOfficialForecastQueryInput } from "./officialForecast";

const dashboardSource = readFileSync(new URL("../pages/Dashboard.tsx", import.meta.url), "utf8");
const detailsSource = readFileSync(new URL("../pages/WeatherDetails.tsx", import.meta.url), "utf8");
const sharedHookSource = readFileSync(new URL("../hooks/useOfficialForecast.ts", import.meta.url), "utf8");

describe("prévision horaire officielle partagée", () => {
  it("utilise les mêmes coordonnées explicites, y compris pour le lieu de repli", () => {
    expect(getOfficialForecastCoordinates(null)).toEqual({ lat: 50.7567, lon: 2.5204 });
    const location = { lat: 48.8566, lon: 2.3522, name: "Paris" };
    expect(getOfficialForecastQueryInput(location)).toEqual({
      lat: 48.8566,
      lon: 2.3522,
      includeExtendedPeriods: false,
    });
    expect(dashboardSource).toContain("useOfficialForecast(selectedLocation)");
    expect(detailsSource).toContain("useOfficialForecast(activeLocation)");
    expect(sharedHookSource).toContain("OFFICIAL_FORECAST_REFETCH_INTERVAL_MS");
    expect(sharedHookSource).toContain("refetchIntervalInBackground: false");
  });

  it("fait afficher la même valeur aux deux vues pour un même lieu et un validTime identique", () => {
    const location = { lat: 48.8566, lon: 2.3522, name: "Paris" };
    const dashboardInput = getOfficialForecastQueryInput(location);
    const detailsInput = getOfficialForecastQueryInput({ ...location });
    const validTime = Date.parse("2026-10-07T10:00:00.000Z");
    const hours = [
      { validAt: validTime - 60 * 60_000, temp: 13.1 },
      { validAt: validTime, temp: 17.4, precipitation: 0.6 },
      { validAt: validTime + 60 * 60_000, temp: 18.2 },
    ];
    const dashboardHour = getActiveOfficialForecastHour(hours, validTime + 5 * 60_000);
    const detailsHour = dashboardHour?.hour
      ? getHourlyForecastAtValidTime(hours, dashboardHour.hour.validAt)
      : null;

    expect(dashboardInput).toEqual(detailsInput);
    expect(dashboardInput).toMatchObject({ lat: 48.8566, lon: 2.3522 });
    expect(dashboardHour?.hour.validAt).toBe(validTime);
    expect(detailsHour?.validAt).toBe(validTime);
    expect(dashboardHour?.hour.temp).toBe(17.4);
    expect(detailsHour?.temp).toBe(dashboardHour?.hour.temp);
    expect(dashboardSource).toContain("getActiveOfficialForecastHour(hours, forecastNowMs)");
    expect(detailsSource).toContain("getActiveOfficialForecastHour(data.hours, Date.now())");
  });
});
