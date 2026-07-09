import { describe, expect, it } from "vitest";
import { calculateReliabilityScore, calculateStabilityIndex, generateMeteoAIForecast, detectWeatherRegime } from "./statsEngine";

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

describe("detectWeatherRegime", () => {
  it("detects storm when wind > 50 km/h", () => {
    const result = detectWeatherRegime({ precipitation: 2, windSpeed: 60, tempMax: 18, tempMin: 12 });
    expect(result.regime).toBe("storm");
    expect(result.weights.wind).toBe(0.40);
    expect(result.weights.precip).toBe(0.30);
  });

  it("detects rainy day when precipitation > 3 mm", () => {
    const result = detectWeatherRegime({ precipitation: 8, windSpeed: 20, tempMax: 14, tempMin: 9 });
    expect(result.regime).toBe("rainy");
    expect(result.weights.precip).toBe(0.50);
    expect(result.weights.temp).toBe(0.20);
  });

  it("detects cold winter when avg temp < 5°C", () => {
    const result = detectWeatherRegime({ precipitation: 0.5, windSpeed: 15, tempMax: 3, tempMin: -2 });
    expect(result.regime).toBe("cold_winter");
    expect(result.weights.temp).toBe(0.45);
  });

  it("detects summer stable when hot, dry, calm", () => {
    const result = detectWeatherRegime({ precipitation: 0, windSpeed: 10, tempMax: 30, tempMin: 18 });
    expect(result.regime).toBe("summer");
    expect(result.weights.temp).toBe(0.40);
    expect(result.weights.condition).toBe(0.30);
  });

  it("falls back to standard for mild conditions", () => {
    const result = detectWeatherRegime({ precipitation: 1, windSpeed: 20, tempMax: 17, tempMin: 10 });
    expect(result.regime).toBe("standard");
    expect(result.weights.temp).toBe(0.30);
    expect(result.weights.precip).toBe(0.30);
  });

  it("handles null values gracefully", () => {
    const result = detectWeatherRegime({ precipitation: null, windSpeed: null, tempMax: null, tempMin: null });
    expect(result.regime).toBe("standard"); // defaults to standard with all-null inputs
  });

  it("storm takes priority over rainy", () => {
    // High wind + heavy rain → storm, not rainy
    const result = detectWeatherRegime({ precipitation: 10, windSpeed: 55, tempMax: 12, tempMin: 8 });
    expect(result.regime).toBe("storm");
  });
});

describe("calculateReliabilityScore with regime", () => {
  it("uses forced regime weights when provided", () => {
    const forecasts = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];
    const observations = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];

    const rainyResult = calculateReliabilityScore(forecasts, observations, "rainy");
    const stormResult = calculateReliabilityScore(forecasts, observations, "storm");

    expect(rainyResult.regime).toBe("rainy");
    expect(rainyResult.weights.precip).toBe(0.50);
    expect(stormResult.regime).toBe("storm");
    expect(stormResult.weights.wind).toBe(0.40);
  });

  it("auto-detects regime from observations when not forced", () => {
    // Hot, dry, calm → summer
    const forecasts = [{ tempMax: 30, tempMin: 18, precipitation: 0, windSpeed: 10 }];
    const observations = [{ tempMax: 30, tempMin: 18, precipitation: 0, windSpeed: 10 }];

    const result = calculateReliabilityScore(forecasts, observations);
    expect(result.regime).toBe("summer");
    expect(result.regimeEmoji).toBe("🌞");
  });

  it("includes regime metadata in result", () => {
    const forecasts = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];
    const observations = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];

    const result = calculateReliabilityScore(forecasts, observations);

    expect(result.regime).toBeDefined();
    expect(result.regimeLabel).toBeDefined();
    expect(result.regimeEmoji).toBeDefined();
    expect(result.weights).toBeDefined();
    expect(result.weights.temp + result.weights.precip + result.weights.wind + result.weights.condition).toBeCloseTo(1.0, 5);
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
