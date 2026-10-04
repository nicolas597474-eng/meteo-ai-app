import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./weatherFetch", () => ({
  fetchWeather: vi.fn(),
  getWeatherResponseAttemptCount: vi.fn(() => 1),
}));

import { fetchWeather } from "./weatherFetch";
import { collect15DayForecast, collectCurrentWeatherSnapshot, collectHourlyForecast, OFFICIAL_HOURLY_MODELS } from "./weatherServices";
import { computeOfficialDailyForecastWithDiagnostics } from "./officialForecast";
import { DAILY_FUSION_METRICS, type DailyFusionHorizon, type ModelPerformanceEvidence } from "./fusionPerformance";

const mockedFetchWeather = vi.mocked(fetchWeather);

function response(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

describe("collectHourlyForecast auxiliaire", () => {
  beforeEach(() => mockedFetchWeather.mockReset());

  it("préserve les prévisions des échéances active et future sans demander ni injecter current", async () => {
    mockedFetchWeather.mockResolvedValue(response({
      current: {
        time: Date.parse("2026-10-01T09:45:00.000Z") / 1000,
        temperature_2m: 99,
      },
      hourly: {
        time: [
          Date.parse("2026-10-01T08:00:00.000Z") / 1000,
          Date.parse("2026-10-01T09:00:00.000Z") / 1000,
          Date.parse("2026-10-01T10:00:00.000Z") / 1000,
        ],
        temperature_2m: [9, 11, 12],
        apparent_temperature: [9, 11, 12],
        precipitation: [0, 0, 0],
        wind_speed_10m: [0, 0, 0],
        wind_gusts_10m: [0, 0, 0],
        wind_direction_10m: [0, 0, 0],
        cloud_cover: [0, 0, 0],
        relative_humidity_2m: [0, 0, 0],
        uv_index: [0, 0, 0],
        surface_pressure: [1013, 1013, 1013],
        dew_point_2m: [0, 0, 0],
        visibility: [0, 0, 0],
        shortwave_radiation: [0, 0, 0],
        weather_code: [0, 0, 0],
      },
    }));

    const hours = await collectHourlyForecast(
      "2026-10-01",
      { lat: 50.7567, lon: 2.5204 },
      1,
      { now: Date.parse("2026-10-01T09:30:00.000Z") },
    );

    expect(mockedFetchWeather).toHaveBeenCalledTimes(1);
    const request = new URL(String(mockedFetchWeather.mock.calls[0]?.[0]));
    expect(request.searchParams.has("current")).toBe(false);
    expect(request.searchParams.get("timeformat")).toBe("unixtime");
    expect(hours.map(({ hour, temp, validAt }) => [hour, temp, validAt])).toEqual([
      ["11:00", 11, Date.parse("2026-10-01T09:00:00.000Z")],
      ["12:00", 12, Date.parse("2026-10-01T10:00:00.000Z")],
    ]);
    expect(hours[0]?.multiModelMetrics).toBeUndefined();
  });

  it("retourne le snapshot current avec une provenance modèle explicite", async () => {
    mockedFetchWeather.mockResolvedValue(response({
      current: {
        time: Date.parse("2026-10-01T09:45:00.000Z") / 1000,
        temperature_2m: 19,
        apparent_temperature: 18,
        precipitation: 0,
        wind_speed_10m: 6,
        wind_gusts_10m: 9,
        wind_direction_10m: 180,
        cloud_cover: 20,
        relative_humidity_2m: 60,
        weather_code: 1,
      },
    }));

    const snapshot = await collectCurrentWeatherSnapshot({ lat: 50.7567, lon: 2.5204 });
    const request = new URL(String(mockedFetchWeather.mock.calls[0]?.[0]));

    expect(request.searchParams.has("current")).toBe(true);
    expect(request.searchParams.has("hourly")).toBe(false);
    expect(snapshot).toMatchObject({
      sourceKind: "model_current_snapshot",
      source: "open-meteo",
      capturedAt: "2026-10-01T09:45:00.000Z",
      temp: 19,
      apparentTemp: 18,
    });
  });

  it("conserve les deux échéances 02:00 distinctes lors du retour à l’heure d’hiver", async () => {
    mockedFetchWeather.mockResolvedValue(response({
      hourly: {
        time: [
          Date.parse("2026-10-24T23:00:00.000Z") / 1000,
          Date.parse("2026-10-25T00:00:00.000Z") / 1000,
          Date.parse("2026-10-25T01:00:00.000Z") / 1000,
        ],
        temperature_2m: [9, 10, 11],
      },
    }));

    const hours = await collectHourlyForecast(
      "2026-10-25",
      { lat: 50.7567, lon: 2.5204 },
      1,
      { now: Date.parse("2026-10-25T00:30:00.000Z") },
    );

    expect(hours.map(({ date, hour, temp, validAt }) => [date, hour, temp, validAt])).toEqual([
      ["2026-10-25", "02:00", 10, Date.parse("2026-10-25T00:00:00.000Z")],
      ["2026-10-25", "02:00", 11, Date.parse("2026-10-25T01:00:00.000Z")],
    ]);
  });
});

describe("collect15DayForecast fusion officielle", () => {
  beforeEach(() => mockedFetchWeather.mockReset());

  it("fuse les preuves exactes, garde Best Match en référence et conserve une fusion à deux modèles", async () => {
    const issuedAt = Date.parse("2026-10-03T08:00:00.000Z");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(issuedAt + 60_000);
    const locationKey = "50.7567_2.5204";
    const datesByModel = [
      ["2026-10-03"],
      ["2026-10-03", "2026-10-04"],
      ["2026-10-03", "2026-10-04"],
      ["2026-10-03", "2026-10-04", "2026-10-05"],
      ["2026-10-03", "2026-10-04", "2026-10-05"],
      ["2026-10-03", "2026-10-04"],
      ["2026-10-03", "2026-10-04"],
      ["2026-10-03"],
    ];
    const dailyResponse = (modelIndex: number, dates: string[]) => response({
      daily: {
        time: dates,
        temperature_2m_max: dates.map(() => modelIndex === 7 ? 999 : 20 + modelIndex),
        temperature_2m_min: dates.map(() => modelIndex === 7 ? -999 : 10 + modelIndex),
        precipitation_sum: dates.map(() => modelIndex === 7 ? 999 : 0.2 + modelIndex),
        wind_speed_10m_max: dates.map(() => modelIndex === 7 ? 999 : 8 + modelIndex),
        wind_gusts_10m_max: dates.map(() => modelIndex === 7 ? 999 : 12 + modelIndex),
      },
    });
    datesByModel.forEach((dates, index) => mockedFetchWeather.mockResolvedValueOnce(dailyResponse(index, dates)));

    const evidence: ModelPerformanceEvidence[] = OFFICIAL_HOURLY_MODELS.flatMap((model, modelIndex) =>
      ( ["6-24h", "1-3d"] as DailyFusionHorizon[] ).flatMap((horizonBucket) => DAILY_FUSION_METRICS.map((variable) => ({
        locationKey,
        serviceName: model.name,
        modelId: model.modelId,
        variable,
        horizonBucket,
        comparisonCount: 500,
        sampleSize: 500,
        evaluatedDays: 500,
        mae: 0.4 + modelIndex * 0.1,
        rmse: 0.7 + modelIndex * 0.1,
        standardError: 0.02,
        signedBias: modelIndex - 3,
        latestScoreDate: "2026-10-02",
      }))),
    );
    const result = await collect15DayForecast(undefined, {
      issuedAt,
      resolveOfficialFusion: (targetDate, forecasts, collectionReferenceAt) => Promise.resolve(computeOfficialDailyForecastWithDiagnostics(forecasts, {
        locationKey,
        targetDate,
        issuedAt,
        referenceAt: collectionReferenceAt,
        evidenceStoreAvailable: true,
        evidence,
      })),
    });
    nowSpy.mockRestore();
    const [today, tomorrow, longRange] = result.days;

    expect(mockedFetchWeather).toHaveBeenCalledTimes(8);
    expect(mockedFetchWeather.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("forecast_days"))).toEqual(Array(8).fill("16"));
    expect(result.modelsUsed).toContain("Open-Meteo");
    expect(result.modelsUsed).toHaveLength(8);
    expect(result.days.map(({ date }) => date)).toEqual(["2026-10-03", "2026-10-04", "2026-10-05"]);

    expect(today).toMatchObject({
      tempMax: expect.any(Number),
      tempMin: expect.any(Number),
      precipitation: expect.any(Number),
      windSpeed: expect.any(Number),
      windGust: expect.any(Number),
      officialFusion: { horizonBucket: "6-24h" },
      bestMatchReference: {
        source: "Open-Meteo Best Match",
        officialContributor: false,
        tempMax: 999,
      },
    });
    expect(today!.tempMax).not.toBe(999);
    expect(today!.officialFusion.sourcesByVariable.tempMax).toHaveLength(7);
    expect(today!.officialFusion.diagnosticsByVariable?.tempMax).toMatchObject({
      status: "FUSED",
      availabilityStatus: "FUSED",
      calibrationStatus: "CALIBRATED",
      expectedModelCount: 7,
      availableValueModelCount: 7,
      evidenceEligibleModelCount: 7,
      contributingModelCount: 7,
    });
    expect(today!.officialFusion.sourcesByVariable.tempMin.every((source) => source.variable === "temperature_min" && source.horizonBucket === "6-24h")).toBe(true);
    expect(today!.officialFusion.sourcesByVariable.tempMax.every((source) => source.signedBias != null && source.latestScoreDate === "2026-10-02")).toBe(true);
    expect(today!.precipitationConsensus?.conditionalMeanMethod).toBe("historical_skill");
    expect(today!.modelAgreement.modelIssueTimeAvailable).toBe(false);
    expect(today!.modelAgreement.tempMax.range).toBeNull();
    expect(today!.modelAgreement.tempMax.availableModelCount).toBe(7);

    expect(tomorrow!.officialFusion.horizonBucket).toBe("1-3d");
    expect(tomorrow!.tempMax).not.toBeNull();
    expect(tomorrow!.officialFusion.sourcesByVariable.tempMax.every((source) => source.horizonBucket === "1-3d")).toBe(true);
    expect(tomorrow!.bestMatchReference).toBeNull();

    expect(longRange!.officialFusion.horizonBucket).toBe("1-3d");
    expect(longRange!.modelAgreement.tempMax.availableModelCount).toBe(2);
    expect(longRange!.tempMax).not.toBeNull();
    expect(longRange!.precipitation).not.toBeNull();
    expect(longRange!.officialFusion.sourcesByVariable.tempMax).toHaveLength(2);
    expect(longRange!.officialFusion.diagnosticsByVariable?.tempMax).toMatchObject({
      status: "FUSED",
      availabilityStatus: "FUSED",
      calibrationStatus: "CALIBRATED",
      availableValueModelCount: 2,
      evidenceEligibleModelCount: 2,
      contributingModelCount: 2,
    });
    expect(longRange!.bestMatchReference).toBeNull();
  });
});
