import { describe, expect, it } from "vitest";
import {
  buildForecastDisplayDays,
  getDailyReferenceSourceLabels,
} from "@/lib/forecastDayDisplay";

describe("forecast display days", () => {
  it("keeps official hourly dates distinct and uses only real daily dates after them, capped at 15", () => {
    const dailyDays = Array.from({ length: 16 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 9, 3 + index)).toISOString().slice(0, 10),
      tempMax: 18 + index,
      tempMin: 8 + index,
    }));
    const hours = [
      { date: "2026-10-03", hour: "09:00", temp: 12 },
      { date: "2026-10-03", hour: "10:00", temp: 13 },
      { date: "2026-10-04", hour: "00:00", temp: 11 },
    ];

    const result = buildForecastDisplayDays(hours, dailyDays);

    expect(result).toHaveLength(15);
    expect(result[0]).toMatchObject({
      date: "2026-10-03",
      kind: "official-hourly",
      daily: null,
    });
    expect(result[1]).toMatchObject({
      date: "2026-10-04",
      kind: "official-hourly",
      daily: null,
    });
    expect(result[2]).toMatchObject({
      date: "2026-10-05",
      kind: "legacy-daily-reference",
      hourlyGroup: null,
    });
    expect(result.at(-1)?.date).toBe("2026-10-17");
    expect(
      result.every(day => day.kind !== "official-hourly" || day.daily === null)
    ).toBe(true);
  });

  it("does not invent dates when either source is sparse or undated", () => {
    const result = buildForecastDisplayDays(
      [{ date: "2026-10-03", hour: "09:00" }, { hour: "10:00" }],
      [
        { date: "2026-10-06", tempMax: 19 },
        { date: "not-a-date", tempMax: 20 },
      ]
    );

    expect(result.map(({ date, kind }) => [date, kind])).toEqual([
      ["2026-10-03", "official-hourly"],
      ["2026-10-06", "legacy-daily-reference"],
    ]);
  });

  it("names Best Match only as a non-independent aggregator and preserves sources actually returned", () => {
    expect(
      getDailyReferenceSourceLabels([
        "ECMWF",
        "GFS",
        "ICON",
        "Open-Meteo",
        "ECMWF",
      ])
    ).toEqual([
      "ECMWF",
      "GFS",
      "ICON",
      "Best Match · agrégateur, non indépendant",
    ]);
    expect(getDailyReferenceSourceLabels([])).toEqual([]);
  });
});
