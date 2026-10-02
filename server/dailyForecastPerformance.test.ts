import { describe, expect, it } from "vitest";
import type { ForecastRun } from "../drizzle/schema";
import { aggregateDailyForecastPerformance, buildDailyForecastObservationComparisons, buildForecastRunArchiveRows, getDailyForecastHorizon } from "./dailyForecastPerformance";
import type { PhysicalSnapshot } from "./physicalObservationAggregation";

const locationKey = "50.7567_2.5204";
const validDate = "2026-10-02";
const issuedAt = Date.parse("2026-10-02T08:00:00.000Z");

function makeForecast() {
  return {
    serviceName: "AROME",
    serviceCategory: "expert" as const,
    tempMax: 20,
    tempMin: 10,
    precipitation: 3,
    windSpeed: 15,
    windGust: 22,
    humidity: 60,
    cloudCover: 40,
    condition: null,
    rawData: {
      daily: {
        time: ["2026-10-02", "2026-10-03"],
        temperature_2m_max: [20, 21],
        temperature_2m_min: [10, 11],
        precipitation_sum: [3, 4],
        wind_speed_10m_max: [15, 16],
        wind_gusts_10m_max: [22, 23],
        relative_humidity_2m_mean: [60, 61],
        cloud_cover_mean: [40, 41],
      },
    },
  };
}

function snapshots(): PhysicalSnapshot[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    stationCount: 1,
    temperature: 8 + hour / 2,
    windSpeed: 7 + hour / 2,
    windGust: 12 + hour / 2,
    precipitation: 0.5,
  }));
}

describe("daily production forecast performance archive", () => {
  it("archives the provider’s actual dates and the bias-corrected forecast values", () => {
    const rows = buildForecastRunArchiveRows([makeForecast()], locationKey, validDate, issuedAt, [
      { serviceName: "AROME", biasTemp: 1, biasPrecip: 1, biasWind: null },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.validDate)).toEqual(["2026-10-02", "2026-10-03"]);
    expect(rows[0].tempMax).toBe(19.3);
    expect(rows[0].tempMin).toBe(9.3);
    expect(rows[0].precipitation).toBe(2.3);
    expect(rows[1].tempMax).toBe(20.3);
    expect(rows[0].rawData).toEqual(makeForecast().rawData);
  });

  it("classifies the same target day by the lead time from issue to Paris-local day end", () => {
    expect(getDailyForecastHorizon(issuedAt, validDate)).toEqual({ bucket: "6-24h", leadTimeMinutes: 840 });
    expect(getDailyForecastHorizon(Date.parse("2026-10-01T08:00:00.000Z"), validDate)?.bucket).toBe("1-3d");
  });

  it("records separate comparisons for supported variables only with qualified physical coverage", () => {
    const archive = buildForecastRunArchiveRows([makeForecast()], locationKey, validDate, issuedAt, []);
    const run = { ...archive[0], id: 101 } as ForecastRun;
    const rows = buildDailyForecastObservationComparisons(locationKey, validDate, [run], snapshots());

    expect(rows.map((row) => row.variable).sort()).toEqual([
      "precipitation_sum",
      "temperature_max",
      "temperature_min",
      "wind_gust_max",
      "wind_speed_max",
    ]);
    expect(rows.every((row) => row.horizonBucket === "6-24h" && row.evidenceType === "physical_observation" && row.observationIsQualified === 1)).toBe(true);
    expect(rows.find((row) => row.variable === "precipitation_sum")?.observedValue).toBe(12);
    expect(rows.find((row) => row.variable === "precipitation_sum")?.observationCoverageHours).toBe(24);

    expect(buildDailyForecastObservationComparisons(locationKey, validDate, [], snapshots())).toEqual([]);
    expect(buildDailyForecastObservationComparisons("autre-lieu", validDate, [run], snapshots())).toEqual([]);
  });

  it("ne transforme pas plusieurs captures d’un même jour en plusieurs jours indépendants", () => {
    const archive = buildForecastRunArchiveRows([makeForecast()], locationKey, validDate, issuedAt, []);
    const run = { ...archive[0], id: 101 } as ForecastRun;
    const first = buildDailyForecastObservationComparisons(locationKey, validDate, [run], snapshots())
      .find((row) => row.variable === "temperature_max")!;
    const second = {
      ...first,
      forecastRunId: 102,
      comparisonKey: "102:temperature_max",
      forecastValue: Number(first.forecastValue) + 0.4,
      absoluteError: Number(first.absoluteError) + 0.4,
    };
    const [score] = aggregateDailyForecastPerformance([first, second]);

    expect(score.comparisonCount).toBe(2);
    expect(score.sampleSize).toBe(1);
    expect(score.evaluatedDays).toBe(1);
    expect(score.latestScoreDate).toBe(validDate);
  });
});
