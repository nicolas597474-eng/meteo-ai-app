import { describe, expect, it } from "vitest";
import {
  calculateReliabilityScore,
  calculateStabilityIndex,
  generateMeteoAIForecast,
  detectWeatherRegime,
} from "./statsEngine";

// ─── detectWeatherRegime (now delegates to 20-regime fusionEngine) ────────────
// The new regime system uses detectExtendedRegime which maps to 20 specific regimes.
// Old regimes (storm, rainy, cold_winter, summer, standard) are replaced by:
// storm → windy (wind>50 without heavy precip), thunderstorm (wind>40+precip>5)
// rainy → rainy (precip>3)
// cold_winter → snow (temp<3 + precip) or frost (temp<0)
// summer → few_clouds (temp>22 dry) or summer_heat (temp>32)
// standard → showers, partly_cloudy, etc. based on conditions

describe("detectWeatherRegime", () => {
  it("detects windy regime when wind > 50 km/h without heavy precip", () => {
    const result = detectWeatherRegime({ precipitation: 2, windSpeed: 60, tempMax: 18, tempMin: 12 });
    expect(result.regime).toBe("windy");
    expect(result.weights.wind).toBe(0.45);
    expect(result.weights.precip).toBe(0.15);
  });

  it("detects rainy regime when precipitation > 3 mm", () => {
    const result = detectWeatherRegime({ precipitation: 8, windSpeed: 20, tempMax: 14, tempMin: 9 });
    expect(result.regime).toBe("rainy");
    expect(result.weights.precip).toBe(0.40);
    expect(result.weights.temp).toBe(0.20);
  });

  it("detects snow regime when avg temp < 5°C with some precip", () => {
    const result = detectWeatherRegime({ precipitation: 0.5, windSpeed: 15, tempMax: 3, tempMin: -2 });
    expect(result.regime).toBe("snow");
    expect(result.weights.temp).toBe(0.40);
  });

  it("detects few_clouds regime when hot, dry, calm", () => {
    const result = detectWeatherRegime({ precipitation: 0, windSpeed: 10, tempMax: 30, tempMin: 18 });
    expect(result.regime).toBe("few_clouds");
    expect(result.weights.temp).toBe(0.30);
    // Conditions = nébulosité 0,30 + humidité 0,10 + pression 0,10.
    expect(result.weights.condition).toBe(0.50);
  });

  it("detects showers for mild conditions with light rain", () => {
    const result = detectWeatherRegime({ precipitation: 1, windSpeed: 20, tempMax: 17, tempMin: 10 });
    expect(result.regime).toBe("showers");
    expect(result.weights.precip).toBeGreaterThan(0.2);
  });

  it("handles null values gracefully (returns a valid regime)", () => {
    const result = detectWeatherRegime({ precipitation: null, windSpeed: null, tempMax: null, tempMin: null });
    expect(typeof result.regime).toBe("string");
    expect(result.regime.length).toBeGreaterThan(0);
  });

  it("detects thunderstorm when wind > 40 and precip > 5", () => {
    const result = detectWeatherRegime({ precipitation: 10, windSpeed: 55, tempMax: 12, tempMin: 8 });
    expect(result.regime).toBe("thunderstorm");
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

  it("weights sum to 1.0 across the four scored dimensions", () => {
    const forecasts = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];
    const observations = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];
    const result = calculateReliabilityScore(forecasts, observations);
    const { temp, precip, wind, condition } = result.weights;
    // Humidité et pression sont incluses dans la dimension « conditions » :
    // quatre dimensions scorées, dont la somme reste égale à 1.
    const total = temp + precip + wind + condition;
    expect(total).toBeCloseTo(1.0, 5);
  });

  it("uses forced regime weights when provided — rainy regime", () => {
    const forecasts = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];
    const observations = [{ tempMax: 25, tempMin: 15, precipitation: 5, windSpeed: 20 }];

    const rainyResult = calculateReliabilityScore(forecasts, observations, "rainy");
    expect(rainyResult.regime).toBe("rainy");
    expect(rainyResult.weights.precip).toBe(0.40); // new rainy regime weight
  });

  it("auto-detects regime from hot dry observations", () => {
    const forecasts = [{ tempMax: 30, tempMin: 18, precipitation: 0, windSpeed: 10 }];
    const observations = [{ tempMax: 30, tempMin: 18, precipitation: 0, windSpeed: 10 }];
    const result = calculateReliabilityScore(forecasts, observations);
    // With 20-regime system, 30°C dry → few_clouds
    expect(result.regime).toBe("few_clouds");
    expect(typeof result.regimeEmoji).toBe("string");
  });

  it("handles empty arrays gracefully", () => {
    const result = calculateReliabilityScore([], []);
    expect(typeof result.weightedScore).toBe("number");
    expect(result.dimensions.temperature.sampleSize).toBe(0);
    expect(result.dimensions.precipitation.sampleSize).toBe(0);
  });

  it("calcule un score normalisé complet de 100 lorsque les six variables sont exactes", () => {
    const forecast = {
      tempMax: 22,
      tempMin: 12,
      precipitation: 2,
      windSpeed: 15,
      windGust: 23,
      humidity: 64,
      pressure: 1013,
    };
    const result = calculateReliabilityScore([forecast], [{ ...forecast }]);

    expect(result.normalizedScore).toBe(100);
    expect(result.laboratory.humidity).toEqual(expect.objectContaining({ mae: 0, sampleSize: 1, score: 100 }));
    expect(result.laboratory.pressure).toEqual(expect.objectContaining({ mae: 0, sampleSize: 1, score: 100 }));
  });

  it("laisse le score normalisé indisponible lorsqu’une composante n’est pas archivée", () => {
    const result = calculateReliabilityScore(
      [{ tempMax: 22, tempMin: 12, precipitation: 2, windSpeed: 15, windGust: 23, humidity: 64 }],
      [{ tempMax: 22, tempMin: 12, precipitation: 2, windSpeed: 15, windGust: 23, humidity: 64 }],
    );

    expect(result.laboratory.pressure.sampleSize).toBe(0);
    expect(result.normalizedScore).toBeNull();
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
