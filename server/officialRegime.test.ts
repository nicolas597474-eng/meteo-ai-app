import { describe, expect, it } from "vitest";
import { buildOperationalRegime, findNextHourlyRegimeChange } from "./officialRegime";

describe("buildOperationalRegime", () => {
  it("privilégie une observation plus récente, fraîche et couvrant la nébulosité", () => {
    const now = Date.parse("2026-08-12T08:00:00.000Z");
    const regime = buildOperationalRegime(
      { tempMax: 24, tempMin: 14, precipitation: 0, windSpeed: 10, cloudCover: 65, computedAt: new Date("2026-08-12T05:00:00.000Z") },
      { tempMax: 20, tempMin: 12, precipitation: 0, windSpeed: 8, humidity: 55, cloudCover: 30, collectedAt: new Date("2026-08-12T07:30:00.000Z") },
      undefined,
      now,
    );
    expect(regime.source).toBe("fresh_observation");
    expect(regime.primary.id).toBe("few_clouds");
    expect(regime.sourceAgeMinutes).toBe(30);
  });

  it("conserve la fusion officielle lorsqu’une observation est trop ancienne ou incomplète", () => {
    const now = Date.parse("2026-08-12T08:00:00.000Z");
    const regime = buildOperationalRegime(
      { tempMax: 24, tempMin: 14, precipitation: 0, windSpeed: 10, cloudCover: 65, computedAt: new Date("2026-08-12T05:00:00.000Z") },
      { tempMax: 20, precipitation: 0, windSpeed: 8, cloudCover: 30, collectedAt: new Date("2026-08-12T03:00:00.000Z") },
      undefined,
      now,
    );
    expect(regime.source).toBe("official_snapshot");
    expect(regime.primary.id).toBe("partly_cloudy");
  });

  it("privilégie la prévision horaire actualisée pour une condition actuelle sans observation fraîche", () => {
    const now = Date.parse("2026-08-12T08:00:00.000Z");
    const regime = buildOperationalRegime(
      { tempMax: 24, tempMin: 14, precipitation: 0, windSpeed: 10, cloudCover: 65, computedAt: new Date("2026-08-12T05:00:00.000Z") },
      null,
      { temp: 18, precipitation: 0, windSpeed: 8, humidity: 45, cloudCover: 0, updatedAt: new Date("2026-08-12T07:55:00.000Z") },
      now,
    );
    expect(regime.source).toBe("hourly_forecast");
    expect(regime.primary.id).toBe("sunny");
  });

  it("retourne le premier changement de régime dans les créneaux futurs", () => {
    const change = findNextHourlyRegimeChange([
      { hour: "09:00", temp: 18, precipitation: 0, windSpeed: 8, humidity: 45, cloudCover: 0 },
      { hour: "10:00", temp: 19, precipitation: 0, windSpeed: 8, humidity: 45, cloudCover: 0 },
      { hour: "11:00", temp: 19, precipitation: 0, windSpeed: 10, humidity: 55, cloudCover: 60 },
    ], "09:00", "sunny");
    expect(change).toMatchObject({ hour: "11:00", id: "partly_cloudy", cloudCover: 60 });
  });

  it("normalise les heures sans zéro initial pour détecter le prochain changement", () => {
    const change = findNextHourlyRegimeChange([
      { hour: "6:00", temp: 15, precipitation: 0, windSpeed: 5, humidity: 50, cloudCover: 4 },
      { hour: "07:00", temp: 16, precipitation: 0, windSpeed: 5, humidity: 50, cloudCover: 8 },
      { hour: "08:00", temp: 17, precipitation: 0, windSpeed: 6, humidity: 55, cloudCover: 65 },
    ], "06:00", "sunny");

    expect(change).toMatchObject({ hour: "08:00", id: "partly_cloudy", cloudCover: 65 });
  });
});
