import { describe, expect, it } from "vitest";
import { buildOfficialWeatherSnapshot, getOfficialSnapshotTtlMs } from "./officialWeatherSnapshot";

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
});
