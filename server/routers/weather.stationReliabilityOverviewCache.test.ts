import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const getPhysicalStationHistory = vi.hoisted(() => vi.fn());
const getHourlyForecastRunValues = vi.hoisted(() => vi.fn());
const getStationCollectionSnapshots = vi.hoisted(() => vi.fn());
const getStationQualityProfiles = vi.hoisted(() => vi.fn());
const getHourlyForecastEvaluationHistory = vi.hoisted(() => vi.fn());
const getLatestMeteoAIForecasts = vi.hoisted(() => vi.fn());

vi.mock("../db", async importOriginal => ({
  ...(await importOriginal<typeof import("../db")>()),
  getPhysicalStationHistory,
  getHourlyForecastRunValues,
  getStationCollectionSnapshots,
  getStationQualityProfiles,
  getHourlyForecastEvaluationHistory,
  getLatestMeteoAIForecasts,
}));

import {
  clearStationReliabilityOverviewCache,
  stationReliabilityOverviewCacheKey,
  STATION_RELIABILITY_OVERVIEW_CACHE_TTL_MS,
  weatherRouter,
} from "./weather";
import { HONDEGHEM } from "../stationService";
import { makeLocationKey } from "../db";

function publicCaller() {
  const ctx = {
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
    user: null,
  } as TrpcContext;
  return weatherRouter.createCaller(ctx);
}

function seedEmptyArchive() {
  getPhysicalStationHistory.mockResolvedValue({ stations: [], latestGroundTruth: null });
  getHourlyForecastRunValues.mockResolvedValue([]);
  getStationCollectionSnapshots.mockResolvedValue([]);
  getStationQualityProfiles.mockResolvedValue([]);
  getHourlyForecastEvaluationHistory.mockResolvedValue({ available: true, rows: [], legacyRows: [] });
  getLatestMeteoAIForecasts.mockResolvedValue([]);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T12:00:00.000Z"));
  clearStationReliabilityOverviewCache();
  getPhysicalStationHistory.mockReset();
  getHourlyForecastRunValues.mockReset();
  getStationCollectionSnapshots.mockReset();
  getStationQualityProfiles.mockReset();
  getHourlyForecastEvaluationHistory.mockReset();
  getLatestMeteoAIForecasts.mockReset();
  seedEmptyArchive();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("weather.getStationReliabilityOverview — cache mémoire du panorama stations", () => {
  it("sert deux fois le même panorama sans relire l’archive", async () => {
    const first = await publicCaller().getStationReliabilityOverview({
      lat: 50.7567,
      lon: 2.5204,
      periodDays: 7,
      radiusKm: 20,
    });
    const second = await publicCaller().getStationReliabilityOverview({
      lat: 50.7567,
      lon: 2.5204,
      periodDays: 7,
      radiusKm: 20,
    });

    expect(second).toEqual(first);
    expect(getPhysicalStationHistory).toHaveBeenCalledTimes(1);
    expect(getHourlyForecastEvaluationHistory).toHaveBeenCalledTimes(1);
  });

  it("relit l’archive après expiration du TTL", async () => {
    await publicCaller().getStationReliabilityOverview({ lat: 50.7567, lon: 2.5204 });
    expect(getPhysicalStationHistory).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(STATION_RELIABILITY_OVERVIEW_CACHE_TTL_MS + 1);
    await publicCaller().getStationReliabilityOverview({ lat: 50.7567, lon: 2.5204 });

    expect(getPhysicalStationHistory).toHaveBeenCalledTimes(2);
  });

  it("distingue les mailles période et rayon", async () => {
    await publicCaller().getStationReliabilityOverview({ lat: 50.7567, lon: 2.5204, periodDays: 1 });
    await publicCaller().getStationReliabilityOverview({ lat: 50.7567, lon: 2.5204, periodDays: 7 });
    expect(getPhysicalStationHistory).toHaveBeenCalledTimes(2);

    await publicCaller().getStationReliabilityOverview({ lat: 50.7567, lon: 2.5204, periodDays: 1, radiusKm: 10 });
    await publicCaller().getStationReliabilityOverview({ lat: 50.7567, lon: 2.5204, periodDays: 1, radiusKm: 25 });
    expect(getPhysicalStationHistory).toHaveBeenCalledTimes(4);
  });

  it("construit la clé de cache avec les valeurs par défaut du panorama", () => {
    expect(stationReliabilityOverviewCacheKey()).toBe(
      `${makeLocationKey(HONDEGHEM.lat, HONDEGHEM.lon)}:1:auto`
    );
    expect(stationReliabilityOverviewCacheKey({ lat: 50.7567, lon: 2.5204, periodDays: 7, radiusKm: 15 })).toBe(
      `${makeLocationKey(50.7567, 2.5204)}:7:15`
    );
  });
});
