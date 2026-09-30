import { describe, expect, it } from "vitest";
import { buildDatedDailyFusionFallback, buildOfficialWeatherSnapshot, getOfficialSnapshotTtlMs, mergeManualHourlyForecast } from "./officialWeatherSnapshot";

describe("buildOfficialWeatherSnapshot", () => {
  it("sélectionne une unique valeur officielle pour le même lieu et la même heure", () => {
    const snapshot = buildOfficialWeatherSnapshot({
      lat: 50.75646,
      lon: 2.52085,
      weatherDate: "2026-08-12",
      computedAt: new Date("2026-08-12T12:01:00.000Z"),
      parisHour: "14",
      hourly: [
        { hour: "13:00", temp: 21.1, apparentTemp: 21.1, precipitation: 0, windSpeed: 8, windGust: 12, windDirection: 180, cloudCover: 10, humidity: 55, uvIndex: 5, condition: "Ensoleillé" },
        { hour: "14:00", temp: 23.4, apparentTemp: 23.2, precipitation: 0, windSpeed: 9, windGust: 14, windDirection: 180, cloudCover: 12, humidity: 50, uvIndex: 6, condition: "Ensoleillé" },
      ],
      daily: [],
      modelsUsed: ["ECMWF"],
    });

    expect(snapshot.current?.temp).toBe(23.4);
    expect(snapshot.validAt).toBe("2026-08-12T14:00");
    expect(snapshot.sourceKind).toBe("official_forecast");
  });

  it("raccourcit le cache uniquement lorsque la source horaire ne renvoie aucune donnée", () => {
    expect(getOfficialSnapshotTtlMs([])).toBe(12_000);
    expect(getOfficialSnapshotTtlMs([
      { hour: "14:00", temp: 23.4, apparentTemp: 23.2, precipitation: 0, windSpeed: 9, windGust: 14, windDirection: 180, cloudCover: 12, humidity: 50, uvIndex: 6, condition: "Ensoleillé" },
    ])).toBe(120_000);
  });

  it("actualise les heures prévisionnelles sans modifier le point courant officiel", () => {
    const snapshot = buildOfficialWeatherSnapshot({
      lat: 50.75646,
      lon: 2.52085,
      weatherDate: "2026-08-12",
      computedAt: new Date("2026-08-12T12:01:00.000Z"),
      parisHour: "14",
      hourly: [
        { date: "2026-08-12", hour: "14:00", temp: 23.4, apparentTemp: 23.2, precipitation: 0, windSpeed: 9, windGust: 14, windDirection: 180, cloudCover: 12, humidity: 50, uvIndex: 6, condition: "Ensoleillé", isCurrent: true, observedAt: "2026-08-12T12:01:00.000Z" },
        { date: "2026-08-12", hour: "15:00", temp: 24, apparentTemp: 24, precipitation: 0, windSpeed: 8, windGust: 12, windDirection: 180, cloudCover: 10, humidity: 48, uvIndex: 6, condition: "Ensoleillé" },
      ],
      daily: [],
      modelsUsed: ["Open-Meteo Best Match"],
    });
    const refreshedAt = new Date("2026-08-12T12:10:00.000Z");
    const refreshed = mergeManualHourlyForecast(snapshot, [
      { date: "2026-08-12", hour: "14:00", temp: 99, apparentTemp: 99, precipitation: 1, windSpeed: 99, windGust: 99, windDirection: 0, cloudCover: 99, humidity: 99, uvIndex: 0, condition: "Pluie" },
      { date: "2026-08-12", hour: "15:00", temp: 25.2, apparentTemp: 25.2, precipitation: 0.1, windSpeed: 11, windGust: 14, windDirection: 190, cloudCover: 20, humidity: 45, uvIndex: 5, condition: "Nuageux" },
    ], refreshedAt);

    expect(refreshed.current).toEqual(snapshot.current);
    expect(refreshed.computedAt).toBe(snapshot.computedAt);
    expect(refreshed.hourlyComputedAt).toBe(refreshedAt.toISOString());
    expect(refreshed.hourly.find((hour) => hour.hour === "14:00")).toEqual(snapshot.current);
    expect(refreshed.hourly.find((hour) => hour.hour === "15:00")?.temp).toBe(25.2);
  });

  it("conserve la date et l’horodatage d’une fusion quotidienne sans la présenter comme horaire", () => {
    const fallback = buildDatedDailyFusionFallback({
      date: "2026-08-11",
      computedAt: new Date("2026-08-11T03:05:00.000Z"),
      tempMax: 24.1,
      tempMin: 13.2,
      precipitation: 1.4,
      windSpeed: 18,
      condition: "Nuageux",
      confidenceScore: 72,
    });

    expect(fallback).toEqual({
      kind: "daily_fusion",
      date: "2026-08-11",
      computedAt: "2026-08-11T03:05:00.000Z",
      tempMax: 24.1,
      tempMin: 13.2,
      precipitation: 1.4,
      windSpeed: 18,
      condition: "Nuageux",
      confidenceScore: 72,
    });
  });
});
