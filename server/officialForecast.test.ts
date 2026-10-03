import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { computeOfficialDailyForecast } from "./officialForecast";
import { OFFICIAL_HOURLY_MODELS, WEATHER_SERVICES } from "./weatherServices";
import { DAILY_FUSION_METRICS, type DailyFusionHorizon, type DailyFusionMetric, type ModelPerformanceEvidence } from "./fusionPerformance";

const targetDate = "2026-10-02";
const issuedAt = Date.parse("2026-10-02T08:00:00.000Z");
const locationKey = "50.7567_2.5204";
const horizonBucket: DailyFusionHorizon = "6-24h";
const serviceNames = ["AROME", "ARPEGE", "ICON", "ECMWF"];
const serviceModelId = (serviceName: string) => WEATHER_SERVICES.expert.find((service) => service.name === serviceName)!.modelId;

const forecasts = serviceNames.map((serviceName, index) => ({
  serviceName,
  tempMax: 21 + index,
  tempMin: 11 + index,
  precipitation: 0.5 + index,
  windSpeed: 10 + index * 2,
  windGust: 18 + index * 3,
  humidity: 55 + index * 5,
  cloudCover: 30 + index * 10,
}));

function evidenceFor(
  serviceName: string,
  variable: DailyFusionMetric,
  options: Partial<Pick<ModelPerformanceEvidence, "locationKey" | "horizonBucket" | "sampleSize" | "evaluatedDays" | "comparisonCount" | "mae" | "standardError">> = {},
): ModelPerformanceEvidence {
  const sampleSize = options.sampleSize ?? 120;
  return {
    locationKey: options.locationKey ?? locationKey,
    serviceName,
    modelId: serviceModelId(serviceName),
    variable,
    horizonBucket: options.horizonBucket ?? horizonBucket,
    comparisonCount: options.comparisonCount ?? sampleSize,
    sampleSize,
    evaluatedDays: options.evaluatedDays ?? sampleSize,
    mae: options.mae ?? 0.5 + serviceNames.indexOf(serviceName) * 0.2,
    rmse: (options.mae ?? 0.5 + serviceNames.indexOf(serviceName) * 0.2) + 0.2,
    standardError: options.standardError ?? 0.05,
    latestScoreDate: "2026-10-01",
  };
}

function qualifiedEvidence(): ModelPerformanceEvidence[] {
  return serviceNames.flatMap((serviceName) => DAILY_FUSION_METRICS.map((variable) => evidenceFor(serviceName, variable)));
}

function options(evidence = qualifiedEvidence(), evidenceStoreAvailable = true) {
  return { locationKey, targetDate, issuedAt, evidenceStoreAvailable, evidence };
}

const allOfficialServiceNames = OFFICIAL_HOURLY_MODELS.map((model) => model.name);
const sevenModelForecasts = OFFICIAL_HOURLY_MODELS.map((model, index) => ({
  serviceName: model.name,
  tempMax: 22 + index,
  tempMin: 12 + index,
  precipitation: 0.5 + index,
  windSpeed: 9 + index,
  windGust: 15 + index,
  humidity: 40 + index,
  cloudCover: 20 + index,
}));
const bestMatchForecast = {
  serviceName: "Open-Meteo",
  tempMax: 99,
  tempMin: -50,
  precipitation: 1000,
  windSpeed: 400,
  windGust: 700,
  humidity: 100,
  cloudCover: 100,
};

function sevenModelEvidence(): ModelPerformanceEvidence[] {
  return allOfficialServiceNames.flatMap((serviceName, index) => DAILY_FUSION_METRICS.map((variable) => evidenceFor(
    serviceName,
    variable,
    { sampleSize: 120, comparisonCount: 500, evaluatedDays: 120, mae: 0.4 + index * 0.1, standardError: 0.05 },
  )));
}

function bestMatchEvidence(): ModelPerformanceEvidence[] {
  return DAILY_FUSION_METRICS.map((variable) => evidenceFor(
    "Open-Meteo",
    variable,
    { sampleSize: 120, comparisonCount: 500, evaluatedDays: 120, mae: 0.001, standardError: 0 },
  ));
}

describe("computeOfficialDailyForecast", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(issuedAt);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("fuse uniquement les preuves de production exactes et respecte le plafond individuel", () => {
    const first = computeOfficialDailyForecast(forecasts, options());
    const second = computeOfficialDailyForecast(forecasts, options());

    expect(first).toEqual(second);
    expect(first.coreCalibrationComplete).toBe(true);
    expect(first.tempMax).not.toBeNull();
    expect(first.tempMin).not.toBeNull();
    expect(first.precipitation).not.toBeNull();
    expect(first.windSpeed).not.toBeNull();
    expect(first.confidenceScore).not.toBeNull();
    expect(first.trace.version).toBe(2);
    expect(first.trace.horizonBucket).toBe("6-24h");
    expect(first.trace.calibrationStatus.tempMax).toBe("calibrated");
    expect(first.trace.calibrationStatus.precipitation).toBe("calibrated");
    expect(first.trace.precipitationConsensus).toMatchObject({
      thresholdMm: 0.1,
      expectedModelCount: 7,
      availableModelCount: 4,
      rainModelCount: 4,
      frequencyPercent: 100,
      conditionalMeanMethod: "historical_skill",
      consensusEstimateMm: first.precipitation,
      modelsWithData: serviceNames,
      modelsPredictingRain: serviceNames,
      isProbabilityCalibrated: false,
    });
    expect(first.precipitation).toBeCloseTo(
      (first.trace.precipitationConsensus.rainModelCount / first.trace.precipitationConsensus.availableModelCount)
        * first.trace.precipitationConsensus.conditionalMeanMm!,
      10,
    );
    expect(first.trace.calibrationStatus.humidity).toBe("insufficient_data");
    expect(first.humidity).toBeNull();
    expect(first.cloudCover).toBeNull();

    for (const metricSources of [
      first.trace.parameterSources.temperature,
      first.trace.parameterSources.precipitation,
      first.trace.parameterSources.wind,
    ]) {
      expect(metricSources.reduce((sum, source) => sum + source.finalWeight, 0)).toBeCloseTo(1, 8);
      expect(metricSources.every((source) => source.finalWeight <= 0.35)).toBe(true);
      expect(metricSources.every((source) => source.sampleSize === 120 && source.horizonBucket === "6-24h")).toBe(true);
    }
    expect(first.trace.parameterSources.temperature.every((source) => source.variable === "temperature_max")).toBe(true);
    expect(Object.values(first.weights).every((weight) => weight.tempWeight <= 0.35 && weight.precipWeight <= 0.35 && weight.windWeight <= 0.35)).toBe(true);
  });

  it("garde valeurs, poids, trace et compte officiel invariants face à Best Match pour Tmin/Tmax, pluie, vent et rafales", () => {
    const evidence = sevenModelEvidence();
    const withoutBestMatch = computeOfficialDailyForecast(sevenModelForecasts, options(evidence));
    const withBestMatch = computeOfficialDailyForecast(
      [...sevenModelForecasts, bestMatchForecast],
      options([...evidence, ...bestMatchEvidence()]),
    );

    expect(withoutBestMatch.coreCalibrationComplete).toBe(true);
    expect(withBestMatch).toEqual(withoutBestMatch);
    for (const metric of ["tempMax", "tempMin", "precipitation", "windSpeed", "windGust"] as const) {
      expect(withBestMatch[metric]).toBe(withoutBestMatch[metric]);
    }
    expect(withBestMatch.weights).toEqual(withoutBestMatch.weights);
    expect(Object.keys(withBestMatch.weights)).toEqual(allOfficialServiceNames);
    expect(withBestMatch.weights).not.toHaveProperty("Open-Meteo");
    expect(withBestMatch.trace.sourceCount).toBe(7);
    expect(withBestMatch.trace.parameterSources.temperature.every((source) => source.name !== "Open-Meteo")).toBe(true);
    expect(withBestMatch.trace.parameterSources.precipitation.every((source) => source.name !== "Open-Meteo")).toBe(true);
    expect(withBestMatch.trace.parameterSources.wind.every((source) => source.name !== "Open-Meteo")).toBe(true);
    expect(withBestMatch.trace.precipitationConsensus.modelsWithData).toEqual(allOfficialServiceNames);
  });

  it("reste indisponible quand la seule preuve qualifiée appartient à Best Match", () => {
    const result = computeOfficialDailyForecast(
      [...sevenModelForecasts, bestMatchForecast],
      options(bestMatchEvidence()),
    );

    expect(result.coreCalibrationComplete).toBe(false);
    expect(result.tempMax).toBeNull();
    expect(result.tempMin).toBeNull();
    expect(result.precipitation).toBeNull();
    expect(result.windSpeed).toBeNull();
    expect(result.windGust).toBeNull();
    expect(result.trace.sourceCount).toBe(7);
    expect(result.trace.parameterSources.temperature).toEqual([]);
    expect(result.trace.parameterSources.precipitation).toEqual([]);
    expect(result.trace.parameterSources.wind).toEqual([]);
    expect(result.trace.precipitationConsensus).toMatchObject({
      expectedModelCount: 7,
      availableModelCount: 7,
      conditionalMeanMethod: "arithmetic_mean",
      modelsWithData: allOfficialServiceNames,
    });
    expect(Object.keys(result.weights)).toEqual(allOfficialServiceNames);
    expect(Object.values(result.weights).every((weight) => weight.tempWeight === 0 && weight.precipWeight === 0 && weight.windWeight === 0)).toBe(true);
  });

  it("ne fabrique ni poids égaux ni valeur officielle quand la preuve est absente", () => {
    const result = computeOfficialDailyForecast(forecasts, options([]));

    expect(result.coreCalibrationComplete).toBe(false);
    expect(result.tempMax).toBeNull();
    expect(result.tempMin).toBeNull();
    expect(result.precipitation).toBeNull();
    expect(result.windSpeed).toBeNull();
    expect(result.confidenceScore).toBeNull();
    expect(result.trace.calibrationStatus.tempMax).toBe("insufficient_data");
    expect(result.trace.parameterSources.temperature).toEqual([]);
    expect(result.trace.precipitationConsensus).toMatchObject({
      availableModelCount: 4,
      rainModelCount: 4,
      frequencyPercent: 100,
      conditionalMeanMm: 2,
      conditionalMeanMethod: "arithmetic_mean",
      consensusEstimateMm: 2,
      isProbabilityCalibrated: false,
    });
    expect(Object.values(result.weights).every((weight) => weight.tempWeight === 0 && weight.precipWeight === 0 && weight.windWeight === 0)).toBe(true);
  });

  it("exclut les modèles sous 0,1 mm de la quantité conditionnelle et du poids officiel de pluie", () => {
    const mixedRainForecasts = forecasts.map((forecast, index) => ({
      ...forecast,
      precipitation: [0, 0.1, 0.4, 1][index]!,
    }));
    const result = computeOfficialDailyForecast(mixedRainForecasts, options());
    const summary = result.trace.precipitationConsensus;

    expect(summary).toMatchObject({
      thresholdMm: 0.1,
      expectedModelCount: 7,
      availableModelCount: 4,
      rainModelCount: 3,
      frequencyPercent: 75,
      conditionalMeanMethod: "historical_skill",
      isProbabilityCalibrated: false,
    });
    expect(summary.modelsPredictingRain).toEqual(["ARPEGE", "ICON", "ECMWF"]);
    expect(result.weights.AROME!.precipWeight).toBe(0);
    expect(result.weights.ARPEGE!.precipWeight).toBeGreaterThan(0);
    expect(result.precipitation).toBeCloseTo((3 / 4) * summary.conditionalMeanMm!, 10);
    expect(result.precipitation).toBeCloseTo(summary.consensusEstimateMm!, 10);
  });

  it("signale distinctement un schéma non migré sans tenter de fusion de repli", () => {
    const result = computeOfficialDailyForecast(forecasts, options([], false));
    expect(result.tempMax).toBeNull();
    expect(result.confidenceScore).toBeNull();
    expect(result.trace.calibrationStatus.tempMax).toBe("schema_unavailable");
    expect(result.methodNote).toContain("non calibrée");
  });

  it("refuse une prévision dont l’horodatage dépasse la fraîcheur maximale", () => {
    const currentTime = Date.now();
    try {
      vi.setSystemTime(issuedAt + 25 * 60 * 60 * 1_000);
      const result = computeOfficialDailyForecast(forecasts, options());

      expect(result.tempMax).toBeNull();
      expect(result.trace.parameterSources.temperature).toEqual([]);
      expect(result.trace.excludedSources.some((source) => source.reason.includes("Données trop anciennes"))).toBe(true);
    } finally {
      vi.setSystemTime(currentTime);
    }
  });

  it("n’emprunte ni une variable, ni une échéance, ni un lieu différent", () => {
    const mismatched = serviceNames.flatMap((serviceName) => [
      evidenceFor(serviceName, "temperature_max", { horizonBucket: "1-3d" }),
      evidenceFor(serviceName, "temperature_max", { horizonBucket, locationKey: "autre-lieu" }),
    ]);
    const result = computeOfficialDailyForecast(forecasts, options(mismatched));

    expect(result.trace.horizonBucket).toBe("6-24h");
    expect(result.tempMax).toBeNull();
    expect(result.tempMin).toBeNull();
    expect(result.trace.calibrationStatus.tempMax).toBe("insufficient_data");
    expect(result.trace.calibrationStatus.tempMin).toBe("insufficient_data");
    expect(result.precipitation).toBeNull();
    expect(result.windSpeed).toBeNull();
  });

  it("n’utilise pas un modèle indisponible pour une variable et refuse si le plafond devient impossible", () => {
    const threeForecasts = forecasts.slice(0, 3).map((forecast, index) => ({
      ...forecast,
      tempMax: index === 0 ? null : forecast.tempMax,
    }));
    const result = computeOfficialDailyForecast(threeForecasts, options(qualifiedEvidence()));

    expect(result.tempMax).toBeNull();
    expect(result.trace.calibrationStatus.tempMax).toBe("insufficient_data");
    expect(result.tempMin).not.toBeNull();
    expect(result.trace.parameterSources.temperature).toEqual([]);
    expect(result.trace.excludedSources.some((source) => source.reason.includes("prévision de cette variable indisponible"))).toBe(true);
  });
});
