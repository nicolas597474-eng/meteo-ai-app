import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("weather.getDashboard", () => {
  it("returns dashboard data with today's date", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.weather.getDashboard();

    expect(result).toHaveProperty("today");
    expect(result.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toHaveProperty("topServices");
    expect(Array.isArray(result.topServices)).toBe(true);
    expect(result).toHaveProperty("recentForecasts");
    expect(Array.isArray(result.recentForecasts)).toBe(true);
    expect(result).toHaveProperty("allServices");
    expect(Array.isArray(result.allServices)).toBe(true);
  });

  it("returns meteoAI forecast for today if available", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.weather.getDashboard();

    // meteoAI may be null if no forecast for today, or an object
    if (result.meteoAI) {
      expect(result.meteoAI).toHaveProperty("tempMax");
      expect(result.meteoAI).toHaveProperty("tempMin");
      expect(result.meteoAI).toHaveProperty("stabilityIndex");
      expect(result.meteoAI).toHaveProperty("stabilityLabel");
    }
  });
});

describe("weather.getRanking", () => {
  it("returns ranking array with scores", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.weather.getRanking();

    expect(result).toHaveProperty("ranking");
    expect(Array.isArray(result.ranking)).toBe(true);
    expect(result).toHaveProperty("totalServices");
    expect(typeof result.totalServices).toBe("number");

    // With seeded data, we should have rankings
    if (result.ranking.length > 0) {
      const first = result.ranking[0];
      expect(first).toHaveProperty("serviceName");
      expect(first).toHaveProperty("avgScore");
      expect(first).toHaveProperty("avgMaeTemp");
      expect(first).toHaveProperty("daysTracked");
      // Should be sorted by score descending
      for (let i = 1; i < result.ranking.length; i++) {
        expect(result.ranking[i - 1].avgScore! >= result.ranking[i].avgScore!).toBe(true);
      }
    }
  });
});

describe("weather.getHistory", () => {
  it("returns history data for 7 days", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.weather.getHistory({ days: 7 });

    expect(result).toHaveProperty("forecasts");
    expect(result).toHaveProperty("observations");
    expect(result).toHaveProperty("meteoAIForecasts");
    expect(result).toHaveProperty("startDate");
    expect(result).toHaveProperty("endDate");
    expect(Array.isArray(result.forecasts)).toBe(true);
    expect(Array.isArray(result.observations)).toBe(true);
  });
});

describe("weather.getReport", () => {
  it("returns report for a specific date", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.weather.getReport({ date: "2026-06-28" });

    expect(result).toHaveProperty("date", "2026-06-28");
    expect(result).toHaveProperty("forecasts");
    expect(Array.isArray(result.forecasts)).toBe(true);
    // We seeded data for this date
    expect(result.forecasts.length).toBeGreaterThan(0);
  });

  it("returns observation for a seeded date", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.weather.getReport({ date: "2026-06-26" });

    expect(result.observation).toBeTruthy();
    if (result.observation) {
      expect(result.observation.tempMax).toBeCloseTo(33.2, 0);
      expect(result.observation.tempMin).toBeCloseTo(21.4, 0);
    }
  });
});
