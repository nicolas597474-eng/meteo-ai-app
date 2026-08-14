import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { getCurrentHourlyRegimeInput } from "./routers/weather";
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
  it("expose les vingt régimes possibles pour le menu descriptif", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const catalogue = await caller.weather.getRegimeCatalogue();
    expect(catalogue).toHaveLength(20);
    expect(catalogue).toContainEqual(expect.objectContaining({ id: "stable", label: "Été stable" }));
    expect(catalogue).toContainEqual(expect.objectContaining({ id: "thunderstorm", label: "Orages" }));
    expect(catalogue).toContainEqual(expect.objectContaining({
      id: "stable",
      weights: expect.objectContaining({ temp: expect.any(Number), precip: expect.any(Number), wind: expect.any(Number), condition: expect.any(Number) }),
    }));
  });

  it("retrouve la prévision de l’heure courante malgré un format horaire sans zéro initial", () => {
    const current = getCurrentHourlyRegimeInput([
      { hour: "6:00", temp: 15.7, precipitation: 0, windSpeed: 5.8, humidity: 33, cloudCover: 4 },
      { hour: "07:00", temp: 17, precipitation: 0, windSpeed: 6, humidity: 35, cloudCover: 8 },
    ], 6);

    expect(current).toEqual(expect.objectContaining({
      temp: 15.7,
      cloudCover: 4,
    }));
  });

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
  }, 25_000);

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

describe("contrat de snapshot officiel inter-pages", () => {
  it("partage la même validité, provenance et type entre quinze jours, horaire et détails", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const [daily, hourly, details] = await Promise.all([
      caller.weather.get15DayForecast(),
      caller.weather.getHourlyForecast(),
      caller.weather.getDetailedForecast(),
    ]);

    expect(daily.officialSnapshot).toEqual(expect.objectContaining({
      validAt: expect.any(String),
      sourceKind: expect.any(String),
      source: expect.any(String),
    }));
    expect(hourly.officialSnapshot.validAt).toBe(daily.officialSnapshot.validAt);
    expect(details.officialSnapshot.validAt).toBe(daily.officialSnapshot.validAt);
    expect(hourly.officialSnapshot.sourceKind).toBe(daily.officialSnapshot.sourceKind);
    expect(details.officialSnapshot.sourceKind).toBe(daily.officialSnapshot.sourceKind);
    expect(hourly.officialSnapshot.source).toBe(daily.officialSnapshot.source);
    expect(details.officialSnapshot.source).toBe(daily.officialSnapshot.source);
    expect(details.hours.every((hour) => typeof hour.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(hour.date))).toBe(true);
    expect(new Set(details.hours.map((hour) => hour.date)).size).toBeGreaterThan(1);
  }, 25_000);
});

describe("weather.getAILab", () => {
  it("n’expose des modèles appliqués que depuis la trace de fusion officielle", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weather.getAILab();

    expect(Array.isArray(result.appliedModelWeights)).toBe(true);
    expect(Object.hasOwn(result, "latestStationCollection")).toBe(true);
    expect(Object.hasOwn(result, "modelIndicator")).toBe(true);
    for (const model of result.appliedModelWeights) {
      expect(model.name).toBeTruthy();
      expect(model.averageWeight).toBeGreaterThan(0);
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

  it("partage exactement le régime officiel du Dashboard pour une même localisation", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const [dashboard, ranking] = await Promise.all([
      caller.weather.getDashboard(),
      caller.weather.getRanking(),
    ]);

    expect(ranking.officialRegime.primary.id).toBe(dashboard.officialRegime.primary.id);
    expect(ranking.officialRegime.active).toEqual(dashboard.officialRegime.active);
    expect(ranking.officialRegime.blendedWeights).toEqual(dashboard.officialRegime.blendedWeights);
  }, 25_000);
});

describe("weather.getStationReliabilityOverview", () => {
  it("expose uniquement une comparaison physique/officielle structurée sur 24 heures", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.weather.getStationReliabilityOverview();

    expect(result).toHaveProperty("locationKey");
    expect(Array.isArray(result.stations)).toBe(true);
    expect(result.comparison24h).toHaveLength(24);
    expect(result.comparison24h[0]).toEqual(expect.objectContaining({
      hour: 0,
      stationSampleCount: expect.any(Number),
    }));
    expect(Object.hasOwn(result.comparison24h[0], "stationTemperature")).toBe(true);
    expect(Object.hasOwn(result.comparison24h[0], "officialTemperature")).toBe(true);
    for (const station of result.stations) {
      expect(station.source).toBe("meteofrance");
      expect(station).toHaveProperty("ageMinutes");
      expect(Array.isArray(station.readings)).toBe(true);
    }

    const weekly = await caller.weather.getStationReliabilityOverview({ periodDays: 7, radiusKm: 30 });
    expect(weekly.periodDays).toBe(7);
    expect(weekly.radiusKm).toBe(30);
    expect(weekly.comparison7d).toHaveLength(7);
    expect(weekly.center).toEqual(expect.objectContaining({
      lat: expect.any(Number),
      lon: expect.any(Number),
    }));
    expect(Object.hasOwn(weekly, "instantDeltaC")).toBe(true);
    expect(Array.isArray(weekly.availabilityHistory)).toBe(true);
    expect(Object.hasOwn(weekly, "latestCollection")).toBe(true);
  });
});

describe("weather.getReliabilityLaboratory", () => {
  it("expose uniquement des structures mesurées et les règles explicites de données insuffisantes", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weather.getReliabilityLaboratory({
      lat: 50.7567,
      lon: 2.5204,
      period: "30d",
      horizon: "6-24h",
    });

    expect(result.locationKey).toBeTruthy();
    expect(result.period).toEqual(expect.objectContaining({ id: "30d", days: 30 }));
    expect(result.scoreDefinition).toEqual(expect.objectContaining({
      minimumComparisons: 18,
      weights: expect.objectContaining({ temperature: 0.30, precipitation: 0.25, wind: 0.20 }),
    }));
    expect(Array.isArray(result.models)).toBe(true);
    expect(Array.isArray(result.horizons)).toBe(true);
    expect(Array.isArray(result.stations)).toBe(true);
    expect(result.horizons).toHaveLength(7);

    for (const model of result.models) {
      expect(model).toEqual(expect.objectContaining({
        name: expect.any(String),
        status: expect.any(String),
        evidence: expect.objectContaining({ comparisons: expect.any(Number), evaluatedDays: expect.any(Number) }),
        confidence: expect.objectContaining({ isRankable: expect.any(Boolean), label: expect.any(String) }),
      }));
      if (model.normalizedScore === null) {
        expect(model.insufficiencyReason).toBeTruthy();
      }
    }
  }, 25_000);
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
