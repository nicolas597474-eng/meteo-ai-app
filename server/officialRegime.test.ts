import { describe, expect, it } from "vitest";
import { buildOperationalRegime } from "./officialRegime";

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
});
