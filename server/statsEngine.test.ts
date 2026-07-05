import { describe, expect, it } from "vitest";
import { calculateReliabilityScore, calculateStabilityIndex, generateMeteoAIForecast } from "./statsEngine";

describe("calculateReliabilityScore", () => {
  it("returns perfect score when forecast matches observation", () => {
    const forecasts = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];
    const observations = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];

    const result = calculateReliabilityScore(forecasts, observations);

    expect(result.maeTemp).toBe(0);
    expect(result.maePrecip).toBe(0);
    expect(result.maeWind).toBe(0);
    expect(result.biasTemp).toBe(0);
    expect(result.biasPrecip).toBe(0);
    // Perfect score should be close to 100 (30+30+20+20 = 100 max with condition at 70*0.2=14)
    expect(result.weightedScore).toBeGreaterThan(90);
  });

  it("returns lower score when forecast deviates significantly", () => {
    const forecasts = [{ tempMax: 30, tempMin: 20, precipitation: 10, windSpeed: 30 }];
    const observations = [{ tempMax: 25, tempMin: 15, precipitation: 2, windSpeed: 15 }];

    const result = calculateReliabilityScore(forecasts, observations);

    expect(result.maeTemp).toBe(5); // (|30-25| + |20-15|) / 2 = 5
    expect(result.maePrecip).toBe(8); // |10-2| = 8
    expect(result.maeWind).toBe(15); // |30-15| = 15
    expect(result.biasTemp).toBe(5); // warm bias
    expect(result.biasPrecip).toBe(8); // wet bias
    expect(result.weightedScore).toBeLessThan(60);
  });

  it("handles null values gracefully", () => {
    const forecasts = [{ tempMax: 25, tempMin: null, precipitation: null, windSpeed: null }];
    const observations = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];

    const result = calculateReliabilityScore(forecasts, observations);

    // Should not throw and should return a valid score
    expect(typeof result.weightedScore).toBe("number");
    expect(result.weightedScore).toBeGreaterThanOrEqual(0);
  });

  it("handles empty arrays", () => {
    const result = calculateReliabilityScore([], []);
    expect(typeof result.weightedScore).toBe("number");
  });
});

describe("calculateStabilityIndex", () => {
  it("returns high stability when all models agree", () => {
    const forecasts = [
      { tempMax: 25, tempMin: 15, precipitation: 2, windSpeed: 10 },
      { tempMax: 25, tempMin: 15, precipitation: 2, windSpeed: 10 },
      { tempMax: 25, tempMin: 15, precipitation: 2, windSpeed: 10 },
    ];

    const result = calculateStabilityIndex(forecasts);

    expect(result.index).toBeGreaterThanOrEqual(90);
    expect(result.label).toBe("stable");
  });

  it("returns low stability when models disagree", () => {
    const forecasts = [
      { tempMax: 30, tempMin: 20, precipitation: 0, windSpeed: 5 },
      { tempMax: 20, tempMin: 10, precipitation: 15, windSpeed: 30 },
      { tempMax: 35, tempMin: 25, precipitation: 0, windSpeed: 10 },
    ];

    const result = calculateStabilityIndex(forecasts);

    expect(result.index).toBeLessThan(60);
    expect(result.label).toBe("unstable");
  });

  it("handles single forecast", () => {
    const forecasts = [{ tempMax: 25, tempMin: 15, precipitation: 2, windSpeed: 10 }];

    const result = calculateStabilityIndex(forecasts);

    expect(result.index).toBe(100); // No variance with single forecast
    expect(result.label).toBe("stable");
  });

  it("handles empty array", () => {
    const result = calculateStabilityIndex([]);
    expect(typeof result.index).toBe("number");
    expect(result.label).toBe("stable");
  });
});

describe("generateMeteoAIForecast", () => {
  it("returns weighted average of forecasts", () => {
    const forecasts = [
      { tempMax: 25, tempMin: 15, precipitation: 2, windSpeed: 10 },
      { tempMax: 27, tempMin: 17, precipitation: 4, windSpeed: 12 },
    ];
    const serviceNames = ["AROME", "GFS"];
    const reliabilityMap = { AROME: 90, GFS: 60 };

    const result = generateMeteoAIForecast(forecasts, serviceNames, reliabilityMap);

    // AROME has higher weight (90) vs GFS (60), so result should be closer to AROME values
    expect(result.tempMax).toBeGreaterThan(25);
    expect(result.tempMax).toBeLessThan(27);
    // Should be closer to 25 than 27
    expect(result.tempMax! - 25).toBeLessThan(27 - result.tempMax!);
  });

  it("returns simple average when no reliability data", () => {
    const forecasts = [
      { tempMax: 20, tempMin: 10, precipitation: 0, windSpeed: 5 },
      { tempMax: 30, tempMin: 20, precipitation: 10, windSpeed: 15 },
    ];
    const serviceNames = ["A", "B"];
    const reliabilityMap = {};

    const result = generateMeteoAIForecast(forecasts, serviceNames, reliabilityMap);

    // Default weight is 50 for both, so should be simple average
    expect(result.tempMax).toBeCloseTo(25, 0);
    expect(result.tempMin).toBeCloseTo(15, 0);
    expect(result.precipitation).toBeCloseTo(5, 0);
    expect(result.windSpeed).toBeCloseTo(10, 0);
  });

  it("handles empty forecasts", () => {
    const result = generateMeteoAIForecast([], [], {});
    // With no data, returns 0 (NaN/0 fallback)
    expect(result.tempMax).toBe(0);
    expect(result.tempMin).toBe(0);
  });
});
