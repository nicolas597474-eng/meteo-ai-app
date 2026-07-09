import { describe, expect, it } from "vitest";
import {
  calculateReliabilityScore,
  calculateStabilityIndex,
  generateMeteoAIForecast,
  detectWeatherRegime,
} from "./statsEngine";

// ─── detectWeatherRegime ─────────────────────────────────────────────────────

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
    expect(result.regime).toBe("standard");
  });

  it("storm takes priority over rainy", () => {
    const result = detectWeatherRegime({ precipitation: 10, windSpeed: 55, tempMax: 12, tempMin: 8 });
    expect(result.regime).toBe("storm");
  });
});

// ─── calculateReliabilityScore — dimension structure ─────────────────────────

describe("calculateReliabilityScore — dimensions", () => {
  it("returns all 4 dimension objects", () => {
    const forecasts = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];
    const observations = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];
    const result = calculateReliabilityScore(forecasts, observations);

    expect(result.dimensions).toBeDefined();
    expect(result.dimensions.temperature).toBeDefined();
    expect(result.dimensions.precipitation).toBeDefined();
    expect(result.dimensions.wind).toBeDefined();
    expect(result.dimensions.condition).toBeDefined();
  });

  it("temperature dimension has mae, bias, maxError, score", () => {
    const forecasts = [{ tempMax: 25, tempMin: 15, precipitation: 0, windSpeed: 10 }];
    const observations = [{ tempMax: 25, tempMin: 15, precipitation: 0, windSpeed: 10 }];
    const result = calculateReliabilityScore(forecasts, observations);
    const t = result.dimensions.temperature;

    expect(t.mae).toBe(0);
    expect(t.bias).toBe(0);
    expect(t.maxError).toBe(0);
    expect(t.score).toBeGreaterThanOrEqual(99);
  });

  it("temperature dimension detects warm bias", () => {
    const forecasts = [{ tempMax: 30, tempMin: 20, precipitation: 0, windSpeed: 10 }];
    const observations = [{ tempMax: 25, tempMin: 15, precipitation: 0, windSpeed: 10 }];
    const result = calculateReliabilityScore(forecasts, observations);
    const t = result.dimensions.temperature;

    expect(t.bias).toBeGreaterThan(0); // warm bias
    expect(t.mae).toBe(5);
    expect(t.maxError).toBe(5);
    expect(t.score).toBeLessThan(80);
  });

  it("precipitation dimension — perfect detection", () => {
    const forecasts = [{ tempMax: 20, tempMin: 12, precipitation: 5, windSpeed: 15 }];
    const observations = [{ tempMax: 20, tempMin: 12, precipitation: 5, windSpeed: 15 }];
    const result = calculateReliabilityScore(forecasts, observations);
    const p = result.dimensions.precipitation;

    expect(p.pod).toBe(1);   // hit
    expect(p.far).toBe(0);   // no false alarms
    expect(p.csi).toBe(1);   // perfect
    expect(p.falsePositives).toBe(0);
    expect(p.falseNegatives).toBe(0);
  });

  it("precipitation dimension — false negative (missed rain)", () => {
    const forecasts = [{ tempMax: 20, tempMin: 12, precipitation: 0, windSpeed: 15 }]; // predicted dry
    const observations = [{ tempMax: 20, tempMin: 12, precipitation: 8, windSpeed: 15 }]; // actually rainy
    const result = calculateReliabilityScore(forecasts, observations);
    const p = result.dimensions.precipitation;

    expect(p.falseNegatives).toBe(1);
    expect(p.pod).toBe(0);
    expect(p.csi).toBe(0);
  });

  it("precipitation dimension — false positive (predicted rain, no rain)", () => {
    const forecasts = [{ tempMax: 20, tempMin: 12, precipitation: 5, windSpeed: 15 }]; // predicted rain
    const observations = [{ tempMax: 20, tempMin: 12, precipitation: 0, windSpeed: 15 }]; // actually dry
    const result = calculateReliabilityScore(forecasts, observations);
    const p = result.dimensions.precipitation;

    expect(p.falsePositives).toBe(1);
    expect(p.far).toBe(1);
    expect(p.csi).toBe(0);
  });

  it("wind dimension has maeMean, maeGusts, biasMean, score", () => {
    const forecasts = [{ tempMax: 20, tempMin: 10, precipitation: 0, windSpeed: 30 }];
    const observations = [{ tempMax: 20, tempMin: 10, precipitation: 0, windSpeed: 20 }];
    const result = calculateReliabilityScore(forecasts, observations);
    const w = result.dimensions.wind;

    expect(w.maeMean).toBe(10);
    expect(w.biasMean).toBe(10); // overestimated wind
    expect(w.score).toBeLessThan(80);
  });

  it("condition dimension returns concordance", () => {
    const forecasts = [{ tempMax: 25, tempMin: 15, precipitation: 0, windSpeed: 10, condition: "Ensoleillé" }];
    const observations = [{ tempMax: 25, tempMin: 15, precipitation: 0, windSpeed: 10, condition: "Ensoleillé" }];
    const result = calculateReliabilityScore(forecasts, observations);
    const c = result.dimensions.condition;

    expect(c.concordance).toBe(100); // exact match
    expect(c.score).toBeGreaterThanOrEqual(90);
  });

  it("weights sum to 1.0", () => {
    const forecasts = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];
    const observations = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];
    const result = calculateReliabilityScore(forecasts, observations);
    const { temp, precip, wind, condition } = result.weights;

    expect(temp + precip + wind + condition).toBeCloseTo(1.0, 5);
  });

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

  it("auto-detects summer regime from hot dry observations", () => {
    const forecasts = [{ tempMax: 30, tempMin: 18, precipitation: 0, windSpeed: 10 }];
    const observations = [{ tempMax: 30, tempMin: 18, precipitation: 0, windSpeed: 10 }];
    const result = calculateReliabilityScore(forecasts, observations);

    expect(result.regime).toBe("summer");
    expect(result.regimeEmoji).toBe("🌞");
  });

  it("handles empty arrays gracefully", () => {
    const result = calculateReliabilityScore([], []);
    expect(typeof result.weightedScore).toBe("number");
    expect(result.dimensions.temperature.sampleSize).toBe(0);
    expect(result.dimensions.precipitation.sampleSize).toBe(0);
  });
});

// ─── calculateStabilityIndex ─────────────────────────────────────────────────

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
    const result = calculateStabilityIndex([{ tempMax: 25, tempMin: 15, precipitation: 2, windSpeed: 10 }]);
    expect(result.index).toBe(100);
    expect(result.label).toBe("stable");
  });

  it("handles empty array", () => {
    const result = calculateStabilityIndex([]);
    expect(typeof result.index).toBe("number");
    expect(result.label).toBe("stable");
  });
});

// ─── generateMeteoAIForecast ─────────────────────────────────────────────────

describe("generateMeteoAIForecast", () => {
  it("returns weighted average of forecasts", () => {
    const forecasts = [
      { tempMax: 25, tempMin: 15, precipitation: 2, windSpeed: 10 },
      { tempMax: 27, tempMin: 17, precipitation: 4, windSpeed: 12 },
    ];
    const serviceNames = ["AROME", "GFS"];
    const reliabilityMap = { AROME: 90, GFS: 60 };
    const result = generateMeteoAIForecast(forecasts, serviceNames, reliabilityMap);

    expect(result.tempMax).toBeGreaterThan(25);
    expect(result.tempMax).toBeLessThan(27);
    expect(result.tempMax - 25).toBeLessThan(27 - result.tempMax);
  });

  it("returns simple average when no reliability data", () => {
    const forecasts = [
      { tempMax: 20, tempMin: 10, precipitation: 0, windSpeed: 5 },
      { tempMax: 30, tempMin: 20, precipitation: 10, windSpeed: 15 },
    ];
    const result = generateMeteoAIForecast(forecasts, ["A", "B"], {});
    expect(result.tempMax).toBeCloseTo(25, 0);
    expect(result.tempMin).toBeCloseTo(15, 0);
    expect(result.precipitation).toBeCloseTo(5, 0);
    expect(result.windSpeed).toBeCloseTo(10, 0);
  });

  it("handles empty forecasts", () => {
    const result = generateMeteoAIForecast([], [], {});
    expect(result.tempMax).toBe(0);
    expect(result.tempMin).toBe(0);
  });
});
