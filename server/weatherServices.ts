/**
 * Weather Services Configuration & Open-Meteo Collector
 * Location: Hondeghem (lat: 50.7567, lon: 2.5204)
 */

import { randomUUID } from "node:crypto";
import { conditionFromWmoWeatherCode } from "./weatherConditionLabels";
import { fetchWeather, getWeatherResponseAttemptCount } from "./weatherFetch";
import { getParisDateAndHour } from "./parisHourlyTime";
import type { HourlyHistoricalEvidence, HourlyMultiModelMetrics } from "../shared/hourlyModelMetrics";
import { summarizeDailyModelAgreement, type DailyAgreementInput, type DailyModelAgreement } from "../shared/modelAgreement";
import type { PrecipitationModelConsensus } from "../shared/precipitationConsensus";
import type { BestMatchDailyReference, DailyForecastMetric, DailyOfficialFusionDisplay } from "../shared/dailyForecast";
import type { computeOfficialDailyForecast, ForecastTraceSource } from "./officialForecast";
import {
  buildDailyModelCollectionCoverage,
  buildHourlyModelCollectionCoverage,
  DAILY_FORECAST_REQUEST_KEYS,
  finiteCoverageValue,
  HOURLY_FORECAST_VARIABLES,
  type DailyModelCollectionCoverage,
} from "./forecastVariableCoverage";

// Hondeghem coordinates
export const HONDEGHEM = { lat: 50.7567, lon: 2.5204 };

// All weather services/models tracked
export const WEATHER_SERVICES = {
  expert: [
    { name: "AROME", modelId: "meteofrance_arome_france_hd", category: "expert" as const },
    { name: "ARPEGE", modelId: "meteofrance_arpege_europe", category: "expert" as const },
    { name: "ICON", modelId: "dwd_icon_eu", category: "expert" as const },
    { name: "ECMWF", modelId: "ecmwf_ifs025", category: "expert" as const },
    { name: "GFS", modelId: "gfs_seamless", category: "expert" as const },
    { name: "GEM", modelId: "gem_seamless", category: "expert" as const },
    { name: "UKMET", modelId: "ukmo_seamless", category: "expert" as const },
    { name: "Open-Meteo", modelId: "best_match", category: "expert" as const },
  ],
  /** Aucun service public de prévision n'est actif ni écrit en production. */
  public: [] as const,
  /** Marques documentaires uniquement : aucune donnée ne doit être affichée ou scorée sans intégration réelle. */
  inactivePublicCatalogue: ["Meteoblue", "AccuWeather", "Apple Weather", "Weather.com", "Ventusky", "Weatherbit", "World Weather Online", "La Chaîne Météo"] as const,
};

/** Les seules séries admises dans la prévision horaire officielle. */
export const OFFICIAL_HOURLY_MODELS = [
  { name: "AROME", modelId: "meteofrance_arome_france_hd" },
  { name: "ARPEGE", modelId: "meteofrance_arpege_europe" },
  { name: "ICON", modelId: "dwd_icon_eu" },
  { name: "ECMWF", modelId: "ecmwf_ifs025" },
  { name: "GFS", modelId: "gfs_seamless" },
  { name: "GEM", modelId: "gem_seamless" },
  { name: "UKMET", modelId: "ukmo_seamless" },
] as const;

/** Modèles observés séparément avant toute éventuelle qualification. */
export const VALIDATION_WEATHER_MODELS = [
  { name: "DMI HARMONIE-DINI", modelId: "dmi_seamless", family: "harmonie" as const },
  { name: "ICON-D2", modelId: "dwd_icon_d2", family: "icon" as const },
  { name: "ECMWF AIFS", modelId: "ecmwf_aifs025", family: "aifs" as const },
  { name: "ECMWF ENS", modelId: "ecmwf_ifs025_ensemble", family: "ensemble" as const },
  { name: "AIFS ENS", modelId: "ecmwf_aifs025_ensemble", family: "ensemble" as const },
] as const;

export type ForecastData = {
  serviceName: string;
  serviceCategory: "public" | "expert";
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust: number | null;
  humidity: number | null;
  cloudCover: number | null;
  condition: string | null;
  rawData?: unknown;
};

export type DailyFusionResolver = (
  targetDate: string,
  forecasts: ForecastData[],
  issuedAt: number,
) => Promise<ReturnType<typeof computeOfficialDailyForecast>>;

export type Collect15DayForecastOptions = {
  issuedAt: number;
  resolveOfficialFusion: DailyFusionResolver;
};

export function hasUsableForecastValue(forecast: Pick<ForecastData, "tempMax" | "tempMin" | "precipitation" | "windSpeed" | "windGust" | "humidity" | "cloudCover">): boolean {
  return [
    forecast.tempMax,
    forecast.tempMin,
    forecast.precipitation,
    forecast.windSpeed,
    forecast.windGust,
    forecast.humidity,
    forecast.cloudCover,
  ].some((value) => typeof value === "number" && Number.isFinite(value));
}

export type ValidationForecastData = ForecastData & {
  modelId: string;
  validationStatus: "candidate";
};

/** Collect each expert source and retain a safe per-model daily coverage summary. */
export async function collectExpertForecastsWithDiagnostics(
  targetDate: string,
  coords?: { lat: number; lon: number },
): Promise<{ forecasts: ForecastData[]; diagnostics: DailyModelCollectionCoverage[] }> {
  const location = coords ?? HONDEGHEM;
  const outcomes = await Promise.all(WEATHER_SERVICES.expert.map(async (service) => {
    const base = {
      modelName: service.name,
      modelId: service.modelId,
      isOfficialModel: service.modelId !== "best_match",
      requestedDays: 16,
      targetDate,
    };
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", location.lat.toString());
      url.searchParams.set("longitude", location.lon.toString());
      url.searchParams.set("daily", DAILY_FORECAST_REQUEST_KEYS.join(","));
      url.searchParams.set("timezone", "Europe/Paris");
      url.searchParams.set("forecast_days", String(base.requestedDays));
      if (service.modelId !== "best_match") url.searchParams.set("models", service.modelId);

      const response = await fetchWeather(url.toString(), {}, { timeoutMs: 12_000, attempts: 2 });
      const requestAttempts = getWeatherResponseAttemptCount(response);
      if (!response.ok) {
        const errorCode = response.status >= 500 ? "provider_http_5xx" : response.status >= 400 ? "provider_http_4xx" : "provider_http_error";
        return {
          forecast: null,
          diagnostic: buildDailyModelCollectionCoverage({ ...base, status: "failed", requestAttempts, errorCode }),
        };
      }

      const data = await response.json();
      const daily = data && typeof data === "object" && "daily" in data && data.daily && typeof data.daily === "object"
        ? data.daily as Record<string, unknown>
        : null;
      const preliminary = buildDailyModelCollectionCoverage({
        ...base,
        status: "succeeded",
        requestAttempts,
        errorCode: null,
        daily,
      });
      const hasReturnedValues = preliminary.variables.some((variable) => variable.requested && variable.receivedCount > 0);
      const allRequestedVariablesHaveValues = preliminary.variables
        .filter((variable) => variable.requested)
        .every((variable) => variable.receivedCount === base.requestedDays);
      const dateIndex = Array.isArray(daily?.time) ? daily.time.indexOf(targetDate) : -1;
      const rawAtDate = (key: string): unknown => dateIndex >= 0 && Array.isArray(daily?.[key])
        ? (daily![key] as unknown[])[dateIndex]
        : null;
      const forecast: ForecastData | null = dateIndex < 0 ? null : {
        serviceName: service.name,
        serviceCategory: service.category,
        tempMax: finiteCoverageValue(rawAtDate("temperature_2m_max")),
        tempMin: finiteCoverageValue(rawAtDate("temperature_2m_min")),
        precipitation: finiteCoverageValue(rawAtDate("precipitation_sum")),
        windSpeed: finiteCoverageValue(rawAtDate("wind_speed_10m_max")),
        windGust: finiteCoverageValue(rawAtDate("wind_gusts_10m_max")),
        // Keep requesting these undocumented means; expose only values actually returned by this model.
        humidity: finiteCoverageValue(rawAtDate("relative_humidity_2m_mean")),
        cloudCover: finiteCoverageValue(rawAtDate("cloud_cover_mean")),
        condition: null,
        rawData: data,
      };
      const usableForecast = forecast && hasUsableForecastValue(forecast) ? forecast : null;
      const status = preliminary.returnedDays === 0
        ? "failed"
        : hasReturnedValues && allRequestedVariablesHaveValues && preliminary.returnedDays === base.requestedDays && preliminary.targetDateInResponse
          ? "succeeded"
          : "partial";
      const errorCode = !hasReturnedValues
        ? "no_usable_data"
        : !preliminary.targetDateInResponse
          ? "target_date_out_of_horizon"
          : !usableForecast
            ? "target_date_no_usable_data"
            : null;
      const diagnostic = buildDailyModelCollectionCoverage({
        ...base,
        status,
        requestAttempts,
        errorCode,
        daily,
      });
      return { forecast: usableForecast, diagnostic };
    } catch (error) {
      const errorCode = classifyHourlyProviderError(error);
      return {
        forecast: null,
        diagnostic: buildDailyModelCollectionCoverage({
          ...base,
          status: errorCode === "invalid_response" ? "failed" : "safe_error",
          requestAttempts: 2,
          errorCode,
        }),
      };
    }
  }));

  return {
    forecasts: outcomes.flatMap((outcome) => outcome.forecast ? [outcome.forecast] : []),
    diagnostics: outcomes.map((outcome) => outcome.diagnostic),
  };
}

/** Compatibility wrapper for consumers that only need the current daily values. */
export async function collectExpertForecasts(
  targetDate: string,
  coords?: { lat: number; lon: number },
): Promise<ForecastData[]> {
  return (await collectExpertForecastsWithDiagnostics(targetDate, coords)).forecasts;
}

/**
 * Collect validation models separately from the active expert catalogue.
 * Empty provider responses remain unavailable; no other model substitutes them.
 */
export async function collectValidationForecasts(
  targetDate: string,
  coords?: { lat: number; lon: number }
): Promise<ValidationForecastData[]> {
  const location = coords ?? HONDEGHEM;
  const responses = await Promise.all(
    VALIDATION_WEATHER_MODELS.map(async (model): Promise<ValidationForecastData | null> => {
      try {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", location.lat.toString());
        url.searchParams.set("longitude", location.lon.toString());
        url.searchParams.set("daily", DAILY_FORECAST_REQUEST_KEYS.join(","));
        url.searchParams.set("timezone", "Europe/Paris");
        url.searchParams.set("forecast_days", "16");
        url.searchParams.set("models", model.modelId);

        const response = await fetchWeather(url.toString(), {}, { timeoutMs: 12_000, attempts: 2 });
        if (!response.ok) return null;
        const data = await response.json();
        const daily = data.daily;
        const dateIndex = daily?.time?.indexOf(targetDate) ?? -1;
        if (dateIndex < 0 || daily.temperature_2m_max?.[dateIndex] == null) return null;
        return {
          serviceName: model.name,
          serviceCategory: "expert",
          modelId: model.modelId,
          validationStatus: "candidate",
          tempMax: daily.temperature_2m_max?.[dateIndex] ?? null,
          tempMin: daily.temperature_2m_min?.[dateIndex] ?? null,
          precipitation: daily.precipitation_sum?.[dateIndex] ?? null,
          windSpeed: daily.wind_speed_10m_max?.[dateIndex] ?? null,
          windGust: daily.wind_gusts_10m_max?.[dateIndex] ?? null,
          humidity: null,
          cloudCover: null,
          condition: null,
          rawData: data,
        };
      } catch (err) {
        console.warn(`[Validation] Error fetching ${model.name}:`, err);
        return null;
      }
    })
  );
  return responses.filter((forecast): forecast is ValidationForecastData => forecast !== null);
}

/**
 * Collect a retrospective model reference from Open-Meteo's forecast endpoint.
 * This is deliberately not represented as a physical observation.
 */
export async function collectObservations(
  targetDate: string,
  coords?: { lat: number; lon: number; name?: string }
) {
  const lat = coords?.lat ?? HONDEGHEM.lat;
  const lon = coords?.lon ?? HONDEGHEM.lon;
  const locationName = coords?.name ?? "Steenvoorde/Hazebrouck";
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lat.toString());
    url.searchParams.set("longitude", lon.toString());
    url.searchParams.set("daily", DAILY_FORECAST_REQUEST_KEYS.join(","));
    url.searchParams.set("timezone", "Europe/Paris");
    url.searchParams.set("past_days", "7");
    url.searchParams.set("forecast_days", "0");

    const response = await fetchWeather(url.toString(), {}, { timeoutMs: 10_000, attempts: 2 });
    if (!response.ok) return null;

    const data = await response.json();
    const daily = data.daily;
    if (!daily || !daily.time) return null;

    const dateIndex = daily.time.indexOf(targetDate);
    if (dateIndex === -1) return null;

    return {
      date: targetDate,
      tempMax: daily.temperature_2m_max?.[dateIndex] ?? null,
      tempMin: daily.temperature_2m_min?.[dateIndex] ?? null,
      precipitation: daily.precipitation_sum?.[dateIndex] ?? null,
      windSpeed: daily.wind_speed_10m_max?.[dateIndex] ?? null,
      windGust: daily.wind_gusts_10m_max?.[dateIndex] ?? null,
      humidity: null,
      cloudCover: null,
      condition: null,
      source: `Open-Meteo forecast reference (${locationName})`,
      provenanceType: "model_reference" as const,
      isQualified: 0 as const,
      rawData: data,
    };
  } catch (err) {
    console.error("[Collector] Error fetching observations:", err);
    return null;
  }
}

export type DayForecast = {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  precipitationConsensus?: PrecipitationModelConsensus | null;
  windSpeed: number | null;
  windGust: number | null;
  windDirection?: number | null;
  humidity: number | null;
  cloudCover: number | null;
  condition: string | null;
  modelAgreement: DailyModelAgreement;
  officialFusion: DailyOfficialFusionDisplay;
  bestMatchReference: BestMatchDailyReference | null;
  uvIndex?: number | null;
  feelsLikeMax?: number | null;
  feelsLikeMin?: number | null;
  sunrise?: string | null;
  sunset?: string | null;
};

export type HourlyWeightingUnavailableReason =
  | "insufficient_historical_evidence"
  | "history_unavailable"
  | "horizon_not_scored"
  | "incomparable_horizons"
  | "no_wet_models"
  | "no_model_data";

export type HourlyVariableWeighting = {
  variable: string;
  method: "historical_skill" | "unavailable";
  unavailableReason: HourlyWeightingUnavailableReason | null;
  modelsWithData: string[];
  modelWeights: Array<{ modelName: string; weight: number }>;
  minimumComparisons: number | null;
  minimumComparableDays: number | null;
  historicalEvidence?: HourlyHistoricalEvidence[];
};

export type HourlyPointWeighting = {
  method: "historical_skill" | "mixed" | "unavailable";
  horizonBucket: string | null;
  unavailableReason: HourlyWeightingUnavailableReason | null;
  scoredVariables: string[];
  unavailableVariables: string[];
  minimumComparisons: number | null;
  minimumComparableDays: number | null;
  variableWeightings: HourlyVariableWeighting[];
  modelsWithData: string[];
};

export type HourlyPoint = {
  date?: string;              // YYYY-MM-DD, nécessaire lorsque la couverture dépasse la journée courante
  hour: string;      // "HH:00"
  validAt?: number; // Absolute UTC instant; preserves repeated local hours at DST fall-back.
  forecastWeighting?: HourlyPointWeighting;
  temp: number | null;
  apparentTemp: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDirection: number | null;  // degrees 0-360
  cloudCover: number | null;
  humidity: number | null;
  uvIndex: number | null;
  condition: string | null;
  weatherCode?: number | null;     // code WMO de la source, lorsqu’il est disponible
  // Extended fields for details page
  pressure?: number | null;        // hPa
  dewPoint?: number | null;        // °C
  visibility?: number | null;      // km
  solarRadiation?: number | null;  // W/m²
  cloudLow?: number | null;        // %
  cloudMid?: number | null;        // %
  cloudHigh?: number | null;       // %
  precipType?: string | null;      // rain, snow, freezing_rain, etc.
  precipIntensity?: string | null; // light, moderate, heavy
  /** Only the official seven-model engine populates these source-tagged metrics. */
  multiModelMetrics?: HourlyMultiModelMetrics | null;
};

export type CurrentWeatherSnapshot = {
  sourceKind: "model_current_snapshot";
  source: "open-meteo";
  capturedAt: string;
  temp: number | null;
  apparentTemp: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDirection: number | null;
  cloudCover: number | null;
  humidity: number | null;
  weatherCode: number | null;
  condition: string | null;
};

/** Une direction est circulaire : 350° et 10° sont proches du nord, pas du sud. */
export function circularMeanDegrees(values: readonly number[]): number | null {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) return null;
  const radians = valid.map((value) => (value * Math.PI) / 180);
  const sin = radians.reduce((sum, value) => sum + Math.sin(value), 0) / radians.length;
  const cos = radians.reduce((sum, value) => sum + Math.cos(value), 0) / radians.length;
  return Math.round((((Math.atan2(sin, cos) * 180) / Math.PI + 360) % 360) * 10) / 10;
}

/** Écart angulaire minimal, en tenant compte du passage 359° → 0°. */
export function circularDifferenceDegrees(left: number | null, right: number | null): number | null {
  if (left == null || right == null || !Number.isFinite(left) || !Number.isFinite(right)) return null;
  const rawDifference = Math.abs(left - right) % 360;
  return Math.min(rawDifference, 360 - rawDifference);
}

/** Fetch actual daily coverage from the official models and fuse only qualified evidence. */
export async function collect15DayForecast(
  coords: { lat: number; lon: number } | undefined,
  options: Collect15DayForecastOptions,
): Promise<{ days: DayForecast[]; modelsUsed: string[] }> {
  const location = coords ?? HONDEGHEM;
  const models = [
    ...OFFICIAL_HOURLY_MODELS.map((model) => ({ name: model.name, modelId: model.modelId })),
    { name: "Open-Meteo", modelId: null },
  ];
  const officialModelNames = OFFICIAL_HOURLY_MODELS.map((model) => model.name);
  const dates = new Set<string>();
  const forecastsByDate = new Map<string, ForecastData[]>();
  const agreementInputsByDate = new Map<string, DailyAgreementInput[]>();
  const bestMatchByDate = new Map<string, BestMatchDailyReference>();
  const sunDataByDate = new Map<string, { sunrise: string | null; sunset: string | null }>();
  const usedModels = new Set<string>();
  const requestDate = getParisDateAndHour(options.issuedAt)?.date ?? null;
  const dailyFields = Array.from(new Set([
    ...DAILY_FORECAST_REQUEST_KEYS,
    "wind_direction_10m_dominant",
    "uv_index_max",
    "apparent_temperature_max",
    "apparent_temperature_min",
    "sunrise",
    "sunset",
  ])).join(",");

  const modelResults = await Promise.all(models.map(async (model) => {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", location.lat.toString());
      url.searchParams.set("longitude", location.lon.toString());
      url.searchParams.set("daily", dailyFields);
      url.searchParams.set("timezone", "Europe/Paris");
      url.searchParams.set("forecast_days", "16");
      if (model.modelId) url.searchParams.set("models", model.modelId);

      const response = await fetchWeather(url.toString(), {}, { timeoutMs: 6_000, attempts: 1 });
      if (!response.ok) return null;
      const data = await response.json();
      const daily = data.daily;
      if (!Array.isArray(daily?.time)) return null;
      return { name: model.name, modelId: model.modelId, daily };
    } catch (error) {
      console.error(`[15Day] Error fetching ${model.name}:`, error);
      return null;
    }
  }));

  const at = (values: unknown, index: number): number | null =>
    Array.isArray(values) ? finiteCoverageValue(values[index]) : null;
  const dateIsValid = (value: unknown): value is string => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T12:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };

  for (const result of modelResults) {
    if (!result) continue;
    const { name, modelId, daily } = result;
    const bestMatch = modelId == null;
    const requestedDates = daily.time.slice(0, 16);
    for (let index = 0; index < requestedDates.length; index++) {
      const date = requestedDates[index];
      if (!dateIsValid(date)) continue;
      dates.add(date);
      const values = {
        tempMax: at(daily.temperature_2m_max, index),
        tempMin: at(daily.temperature_2m_min, index),
        precipitation: at(daily.precipitation_sum, index),
        windSpeed: at(daily.wind_speed_10m_max, index),
        windGust: at(daily.wind_gusts_10m_max, index),
      };
      const hasMetric = Object.values(values).some((value) => value != null);
      if (hasMetric) usedModels.add(name);

      if (bestMatch) {
        if (hasMetric) {
          bestMatchByDate.set(date, {
            source: "Open-Meteo Best Match",
            role: "derived_reference",
            officialContributor: false,
            ...values,
          });
        }
      } else {
        const forecast: ForecastData = {
          serviceName: name,
          serviceCategory: "expert",
          tempMax: values.tempMax,
          tempMin: values.tempMin,
          precipitation: values.precipitation,
          windSpeed: values.windSpeed,
          windGust: values.windGust,
          humidity: null,
          cloudCover: null,
          condition: null,
        };
        const forecasts = forecastsByDate.get(date) ?? [];
        forecasts.push(forecast);
        forecastsByDate.set(date, forecasts);
        const agreementInputs = agreementInputsByDate.get(date) ?? [];
        agreementInputs.push({
          modelName: name,
          tempMax: values.tempMax,
          tempMin: values.tempMin,
          precipitation: values.precipitation,
          windSpeed: values.windSpeed,
          windGust: values.windGust,
          humidity: null,
          cloudCover: null,
        });
        agreementInputsByDate.set(date, agreementInputs);
      }

      if (!sunDataByDate.has(date) && Array.isArray(daily.sunrise) && Array.isArray(daily.sunset)
        && typeof daily.sunrise[index] === "string" && typeof daily.sunset[index] === "string") {
        sunDataByDate.set(date, {
          sunrise: daily.sunrise[index].slice(11, 16),
          sunset: daily.sunset[index].slice(11, 16),
        });
      }
    }
  }

  const toDiagnostics = (
    sources: readonly ForecastTraceSource[],
    variable: DailyForecastMetric,
    horizonBucket: DailyOfficialFusionDisplay["horizonBucket"],
  ) => sources.flatMap((source) => {
    const sourceHorizon = source.horizonBucket ?? horizonBucket;
    if (!sourceHorizon) return [];
    return [{
      modelName: source.name,
      variable: source.variable ?? variable,
      horizonBucket: sourceHorizon,
      finalWeight: source.finalWeight,
      signedBias: source.signedBias ?? null,
      sampleSize: source.sampleSize ?? null,
      comparisonCount: source.comparisonCount ?? null,
      evaluatedDays: source.evaluatedDays ?? null,
      latestScoreDate: source.latestScoreDate ?? null,
    }];
  });

  const requestDay = requestDate ? Date.parse(`${requestDate}T12:00:00.000Z`) : NaN;
  const days: DayForecast[] = await Promise.all(Array.from(dates).sort().slice(0, 16).map(async (date) => {
    const officialForecasts = forecastsByDate.get(date) ?? [];
    const fusion = await options.resolveOfficialFusion(date, officialForecasts, options.issuedAt);
    const horizonBucket = fusion.trace.horizonBucket;
    const modelAgreement = summarizeDailyModelAgreement(
      agreementInputsByDate.get(date) ?? [],
      officialModelNames,
      Number.isFinite(requestDay)
        ? Math.round((Date.parse(`${date}T12:00:00.000Z`) - requestDay) / 86_400_000)
        : null,
    );
    const officialFusion: DailyOfficialFusionDisplay = {
      issuedAt: fusion.trace.issuedAt,
      horizonBucket,
      calibrationStatus: {
        tempMax: fusion.calibrationStatus.tempMax,
        tempMin: fusion.calibrationStatus.tempMin,
        precipitation: fusion.calibrationStatus.precipitation,
        windSpeed: fusion.calibrationStatus.windSpeed,
        windGust: fusion.calibrationStatus.windGust,
      },
      sourcesByVariable: {
        tempMax: toDiagnostics(fusion.trace.parameterSources.temperature, "temperature_max", horizonBucket),
        tempMin: toDiagnostics(fusion.trace.parameterSources.temperatureMin, "temperature_min", horizonBucket),
        precipitation: toDiagnostics(fusion.trace.parameterSources.precipitation, "precipitation_sum", horizonBucket),
        windSpeed: toDiagnostics(fusion.trace.parameterSources.wind, "wind_speed_max", horizonBucket),
        windGust: toDiagnostics(fusion.trace.parameterSources.windGust, "wind_gust_max", horizonBucket),
      },
    };
    const precipitationIsQualified = fusion.calibrationStatus.precipitation === "calibrated";
    return {
      date,
      tempMax: fusion.tempMax,
      tempMin: fusion.tempMin,
      precipitation: fusion.precipitation,
      precipitationConsensus: precipitationIsQualified ? fusion.trace.precipitationConsensus : null,
      windSpeed: fusion.windSpeed,
      windGust: fusion.windGust,
      // Daily issue-run provenance is absent for these variables, so they remain unavailable.
      windDirection: null,
      humidity: null,
      cloudCover: null,
      condition: null,
      modelAgreement,
      officialFusion,
      bestMatchReference: bestMatchByDate.get(date) ?? null,
      uvIndex: null,
      feelsLikeMax: null,
      feelsLikeMin: null,
      sunrise: sunDataByDate.get(date)?.sunrise ?? null,
      sunset: sunDataByDate.get(date)?.sunset ?? null,
    };
  }));

  return { days, modelsUsed: models.filter((model) => usedModels.has(model.name)).map((model) => model.name) };
}

/**
 * Fetch hourly forecast for today from Open-Meteo best_match model.
 */
export async function collectHourlyForecast(
  targetDate: string,
  coords?: { lat: number; lon: number },
  forecastDays = 2,
  options: { now?: number } = {},
): Promise<HourlyPoint[]> {
  const location = coords ?? HONDEGHEM;
  const now = options.now ?? Date.now();
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", location.lat.toString());
    url.searchParams.set("longitude", location.lon.toString());
    url.searchParams.set("hourly", "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,relative_humidity_2m,uv_index,surface_pressure,dew_point_2m,visibility,shortwave_radiation,cloud_cover_low,cloud_cover_mid,cloud_cover_high,snowfall,weather_code");
    url.searchParams.set("timezone", "Europe/Paris");
    url.searchParams.set("timeformat", "unixtime");
    url.searchParams.set("forecast_days", String(Math.min(16, Math.max(1, forecastDays))));

    const response = await fetchWeather(url.toString(), {}, { timeoutMs: 8_000, attempts: 1 });
    if (!response.ok) return [];

    const data = await response.json();
    const hourly = data.hourly;
    if (!hourly?.time) return [];

    const points: HourlyPoint[] = [];
    for (let i = 0; i < hourly.time.length; i++) {
      const validAt = Number(hourly.time[i]) * 1000;
      const parisTime = getParisDateAndHour(validAt);
      if (!Number.isFinite(validAt) || !parisTime || parisTime.date < targetDate || validAt + 60 * 60_000 <= now) continue;
      const date = parisTime.date;
      const hour = `${String(parisTime.hour).padStart(2, "0")}:00`;
      const precip = hourly.precipitation?.[i] ?? null;
      const cloud = hourly.cloud_cover?.[i] ?? null;
      const weatherCode = hourly.weather_code?.[i] ?? null;
      const bestTemp = hourly.temperature_2m?.[i] ?? null;
      const windSpeed = hourly.wind_speed_10m?.[i] ?? null;
      const windGust = hourly.wind_gusts_10m?.[i] ?? null;
      const windDirection = hourly.wind_direction_10m?.[i] ?? null;
      const humidity = hourly.relative_humidity_2m?.[i] ?? null;

      // Derive precipitation type and intensity
      const snowfall = hourly.snowfall?.[i] ?? 0;
      let precipType: string | null = null;
      let precipIntensity: string | null = null;
      if ((precip ?? 0) > 0 || snowfall > 0) {
        precipType = snowfall > 0 ? "snow" : (bestTemp != null && bestTemp <= 0) ? "freezing_rain" : "rain";
        const total = (precip ?? 0) + snowfall;
        precipIntensity = total > 5 ? "heavy" : total > 1 ? "moderate" : "light";
      }

      points.push({
        date,
        hour,
        validAt,
        temp: bestTemp,
        apparentTemp: hourly.apparent_temperature?.[i] ?? null,
        precipitation: precip,
        windSpeed,
        windGust,
        windDirection,
        cloudCover: cloud,
        humidity,
        uvIndex: hourly.uv_index?.[i] ?? null,
        condition: conditionFromWmoWeatherCode(weatherCode, precip, cloud),
        weatherCode,
        // Extended fields
        pressure: hourly.surface_pressure?.[i] ?? null,
        dewPoint: hourly.dew_point_2m?.[i] ?? null,
        visibility: hourly.visibility?.[i] != null ? Math.round((hourly.visibility[i] as number) / 1000 * 10) / 10 : null,
        solarRadiation: hourly.shortwave_radiation?.[i] ?? null,
        cloudLow: hourly.cloud_cover_low?.[i] ?? null,
        cloudMid: hourly.cloud_cover_mid?.[i] ?? null,
        cloudHigh: hourly.cloud_cover_high?.[i] ?? null,
        precipType,
        precipIntensity,
      });
    }
    return points;
  } catch (err) {
    console.error("[Hourly] Error fetching hourly forecast:", err);
    return [];
  }
}

/** Fetches Open-Meteo's model-provided current snapshot separately from hourly forecast values. */
export async function collectCurrentWeatherSnapshot(
  coords?: { lat: number; lon: number },
): Promise<CurrentWeatherSnapshot | null> {
  const location = coords ?? HONDEGHEM;
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", location.lat.toString());
    url.searchParams.set("longitude", location.lon.toString());
    url.searchParams.set("current", "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,relative_humidity_2m,weather_code");
    url.searchParams.set("timezone", "Europe/Paris");
    url.searchParams.set("timeformat", "unixtime");

    const response = await fetchWeather(url.toString(), {}, { timeoutMs: 8_000, attempts: 1 });
    if (!response.ok) return null;
    const current = (await response.json()).current;
    if (!current || typeof current.time !== "number" || !Number.isFinite(current.time)) return null;
    const capturedAt = Number(current?.time) * 1000;
    if (!Number.isFinite(capturedAt)) return null;
    const weatherCode = current.weather_code ?? null;
    const precipitation = current.precipitation ?? null;
    const cloudCover = current.cloud_cover ?? null;
    return {
      sourceKind: "model_current_snapshot",
      source: "open-meteo",
      capturedAt: new Date(capturedAt).toISOString(),
      temp: current.temperature_2m ?? null,
      apparentTemp: current.apparent_temperature ?? null,
      precipitation,
      windSpeed: current.wind_speed_10m ?? null,
      windGust: current.wind_gusts_10m ?? null,
      windDirection: current.wind_direction_10m ?? null,
      cloudCover,
      humidity: current.relative_humidity_2m ?? null,
      weatherCode,
      condition: conditionFromWmoWeatherCode(weatherCode, precipitation, cloudCover),
    };
  } catch (error) {
    console.error("[CurrentSnapshot] Error fetching Open-Meteo current model snapshot:", error);
    return null;
  }
}

/**
 * Collect hourly forecasts for ALL expert models for a given date and location.
 * Returns an array of { modelName, hours } for storage in hourly_forecasts table.
 * Called at each active favorite-forecast schedule slot; deployment Heartbeat is configured separately.
 */
export type HourlyModelForecast = {
  modelName: string;
  modelId?: string | null;
  sourceName?: string;
  captureRunId?: string;
  requestStartedAt?: number;
  availableAt?: number;
  hours: Array<{
    validAt: number;
    hour: number;
    temperature: number | null;
    apparentTemperature: number | null;
    precipitation: number | null;
    rain: number | null;
    showers: number | null;
    windSpeed: number | null;
    windGusts: number | null;
    windDirection: number | null;
    humidity: number | null;
    pressure: number | null;
    cloudCover: number | null;
    weatherCode: number | null;
    uvIndex?: number | null;
    dewPoint?: number | null;
    visibility?: number | null; // km
    solarRadiation?: number | null;
    cloudLow?: number | null;
    cloudMid?: number | null;
    cloudHigh?: number | null;
    snowfall?: number | null;
  }>;
  sourceMetadata?: {
    timezone: string | null;
    utcOffsetSeconds: number | null;
    units: {
      temperature: string | null;
      apparentTemperature: string | null;
      precipitation: string | null;
      rain: string | null;
      showers: string | null;
      windSpeed: string | null;
      windGusts: string | null;
      windDirection: string | null;
      humidity: string | null;
      pressure: string | null;
      cloudCover: string | null;
      weatherCode: string | null;
      uvIndex?: string | null;
      dewPoint?: string | null;
      visibility?: string | null;
      solarRadiation?: string | null;
      cloudLow?: string | null;
      cloudMid?: string | null;
      cloudHigh?: string | null;
      snowfall?: string | null;
    };
  };
};

export type HourlyModelCollectionStatus = "attempting" | "succeeded" | "partial" | "failed" | "safe_error";
export type HourlyModelCollectionDiagnostic = {
  modelName: string;
  modelId: string | null;
  status: Exclude<HourlyModelCollectionStatus, "attempting">;
  attemptCount: number;
  hoursReceived: number;
  valuesReceived: number;
  expectedValueCount: number;
  errorCode: string | null;
};

export type CollectedHourlyForecastModels = {
  forecasts: HourlyModelForecast[];
  diagnostics: HourlyModelCollectionDiagnostic[];
};

const HOURLY_ARCHIVE_VARIABLES = HOURLY_FORECAST_VARIABLES.map((definition) => definition.valueField);

function finiteHourlyValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function classifyHourlyProviderError(error: unknown): string {
  if (error instanceof Error && error.name === "SyntaxError") return "invalid_response";
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" || /timeout|timed out|aborted/i.test(error.message))) {
    return "timeout";
  }
  return "source_unavailable";
}

/** Collects each model independently and preserves safe per-model outcome metadata. */
export async function collectHourlyForecastAllModelsWithDiagnostics(
  targetDate: string,
  coords?: { lat: number; lon: number },
  options: { includeBestMatch?: boolean; includeNextDay?: boolean } = {},
): Promise<CollectedHourlyForecastModels> {
  const location = coords ?? HONDEGHEM;
  const lastDate = options.includeNextDay ? (() => {
    const [year, month, day] = targetDate.split("-").map(Number);
    const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
    return Number.isFinite(nextDate.getTime()) ? nextDate.toISOString().slice(0, 10) : targetDate;
  })() : targetDate;
  const modelsToCollect = [
    ...OFFICIAL_HOURLY_MODELS,
    ...(options.includeBestMatch === false ? [] : [{ name: "best_match", modelId: null }]), // Open-Meteo best match
  ];

  type ModelAttempt = { forecast: HourlyModelForecast | null; diagnostic: HourlyModelCollectionDiagnostic };
  const collectModel = async (model: typeof modelsToCollect[number], attempts: number): Promise<ModelAttempt> => {
    const requestStartedAt = Date.now();
    let attemptCount = 0;
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", location.lat.toString());
      url.searchParams.set("longitude", location.lon.toString());
      url.searchParams.set("hourly", HOURLY_FORECAST_VARIABLES.map((definition) => definition.apiKey).join(","));
      url.searchParams.set("timezone", "Europe/Paris");
      url.searchParams.set("timeformat", "unixtime");
      url.searchParams.set("forecast_days", "2");
      if (model.modelId) {
        url.searchParams.set("models", model.modelId);
      }

      const response = await fetchWeather(url.toString(), {}, { timeoutMs: 12_000, attempts, cacheTtlMs: 0 });
      attemptCount = getWeatherResponseAttemptCount(response);
      if (!response.ok) {
        const errorCode = response.status >= 500 ? "provider_http_5xx" : response.status >= 400 ? "provider_http_4xx" : "provider_http_error";
        console.warn(`[HourlyAll] ${model.name} request failed (${errorCode}).`);
        return { forecast: null, diagnostic: {
          modelName: model.name, modelId: model.modelId, status: "failed", attemptCount,
          hoursReceived: 0, valuesReceived: 0, expectedValueCount: 0, errorCode,
        } };
      }

      const data = await response.json();
      const availableAt = Date.now();
      if (!data || typeof data !== "object" || !("hourly" in data)) {
        return { forecast: null, diagnostic: {
          modelName: model.name, modelId: model.modelId, status: "failed", attemptCount,
          hoursReceived: 0, valuesReceived: 0, expectedValueCount: 0, errorCode: "invalid_response",
        } };
      }
      const hourly = (data as { hourly?: Record<string, unknown> }).hourly;
      const rawTimes = hourly?.time;
      if (!hourly || !Array.isArray(rawTimes) || rawTimes.length === 0) {
        return { forecast: null, diagnostic: {
          modelName: model.name, modelId: model.modelId, status: "failed", attemptCount,
          hoursReceived: 0, valuesReceived: 0, expectedValueCount: 0, errorCode: "no_usable_data",
        } };
      }

      const hours: HourlyModelForecast["hours"] = [];
      let valuesReceived = 0;

      for (let i = 0; i < rawTimes.length; i++) {
        const unixSeconds = typeof rawTimes[i] === "number" ? rawTimes[i] : Number.NaN;
        if (!Number.isFinite(unixSeconds)) continue;
        const validAt = unixSeconds * 1000;
        const parisTime = getParisDateAndHour(validAt);
        if (!parisTime || parisTime.date < targetDate || parisTime.date > lastDate) continue;
        const parsedHour = {
          validAt,
          hour: parisTime.hour,
          temperature: finiteHourlyValue(hourly.temperature_2m instanceof Array ? hourly.temperature_2m[i] : null),
          apparentTemperature: finiteHourlyValue(hourly.apparent_temperature instanceof Array ? hourly.apparent_temperature[i] : null),
          precipitation: finiteHourlyValue(hourly.precipitation instanceof Array ? hourly.precipitation[i] : null),
          rain: finiteHourlyValue(hourly.rain instanceof Array ? hourly.rain[i] : null),
          showers: finiteHourlyValue(hourly.showers instanceof Array ? hourly.showers[i] : null),
          windSpeed: finiteHourlyValue(hourly.wind_speed_10m instanceof Array ? hourly.wind_speed_10m[i] : null),
          windGusts: finiteHourlyValue(hourly.wind_gusts_10m instanceof Array ? hourly.wind_gusts_10m[i] : null),
          windDirection: finiteHourlyValue(hourly.wind_direction_10m instanceof Array ? hourly.wind_direction_10m[i] : null),
          humidity: finiteHourlyValue(hourly.relative_humidity_2m instanceof Array ? hourly.relative_humidity_2m[i] : null),
          pressure: finiteHourlyValue(hourly.surface_pressure instanceof Array ? hourly.surface_pressure[i] : null),
          cloudCover: finiteHourlyValue(hourly.cloud_cover instanceof Array ? hourly.cloud_cover[i] : null),
          weatherCode: finiteHourlyValue(hourly.weather_code instanceof Array ? hourly.weather_code[i] : null),
          uvIndex: finiteHourlyValue(hourly.uv_index instanceof Array ? hourly.uv_index[i] : null),
          dewPoint: finiteHourlyValue(hourly.dew_point_2m instanceof Array ? hourly.dew_point_2m[i] : null),
          visibility: finiteHourlyValue(hourly.visibility instanceof Array ? hourly.visibility[i] : null) == null
            ? null : finiteHourlyValue(hourly.visibility instanceof Array ? hourly.visibility[i] : null)! / 1000,
          solarRadiation: finiteHourlyValue(hourly.shortwave_radiation instanceof Array ? hourly.shortwave_radiation[i] : null),
          cloudLow: finiteHourlyValue(hourly.cloud_cover_low instanceof Array ? hourly.cloud_cover_low[i] : null),
          cloudMid: finiteHourlyValue(hourly.cloud_cover_mid instanceof Array ? hourly.cloud_cover_mid[i] : null),
          cloudHigh: finiteHourlyValue(hourly.cloud_cover_high instanceof Array ? hourly.cloud_cover_high[i] : null),
          snowfall: finiteHourlyValue(hourly.snowfall instanceof Array ? hourly.snowfall[i] : null),
        };
        valuesReceived += HOURLY_ARCHIVE_VARIABLES.filter((key) => parsedHour[key as keyof typeof parsedHour] != null).length;
        hours.push(parsedHour);
      }

      if (hours.length > 0) {
        const hourlyUnits = (data as { hourly_units?: unknown }).hourly_units && typeof (data as { hourly_units?: unknown }).hourly_units === "object"
          ? (data as { hourly_units: Record<string, unknown> }).hourly_units
          : {};
        const getUnit = (key: string) => typeof hourlyUnits[key] === "string" ? hourlyUnits[key] as string : null;
        const forecast: HourlyModelForecast = {
          modelName: model.name,
          modelId: model.modelId,
          sourceName: "open-meteo",
          captureRunId: randomUUID(),
          requestStartedAt,
          availableAt,
          hours,
          sourceMetadata: {
            timezone: typeof (data as { timezone?: unknown }).timezone === "string" ? (data as { timezone: string }).timezone : null,
            utcOffsetSeconds: Number.isFinite(Number((data as { utc_offset_seconds?: unknown }).utc_offset_seconds)) ? Number((data as { utc_offset_seconds?: unknown }).utc_offset_seconds) : null,
            units: {
              temperature: getUnit("temperature_2m"),
              apparentTemperature: getUnit("apparent_temperature"),
              precipitation: getUnit("precipitation"),
              rain: getUnit("rain"),
              showers: getUnit("showers"),
              windSpeed: getUnit("wind_speed_10m"),
              windGusts: getUnit("wind_gusts_10m"),
              windDirection: getUnit("wind_direction_10m"),
              humidity: getUnit("relative_humidity_2m"),
              pressure: getUnit("surface_pressure"),
              cloudCover: getUnit("cloud_cover"),
              weatherCode: getUnit("weather_code"),
              uvIndex: getUnit("uv_index"),
              dewPoint: getUnit("dew_point_2m"),
              visibility: getUnit("visibility") === "m" ? "km" : getUnit("visibility"),
              solarRadiation: getUnit("shortwave_radiation"),
              cloudLow: getUnit("cloud_cover_low"),
              cloudMid: getUnit("cloud_cover_mid"),
              cloudHigh: getUnit("cloud_cover_high"),
              snowfall: getUnit("snowfall"),
            },
          },
        };
        const expectedValueCount = hours.length * HOURLY_FORECAST_VARIABLES.length;
        if (valuesReceived === 0) {
          return { forecast: null, diagnostic: {
            modelName: model.name, modelId: model.modelId, status: "failed", attemptCount,
            hoursReceived: hours.length, valuesReceived: 0, expectedValueCount, errorCode: "no_usable_data",
          } };
        }
        return { forecast, diagnostic: {
          modelName: model.name,
          modelId: model.modelId,
          status: valuesReceived === expectedValueCount ? "succeeded" : valuesReceived > 0 ? "partial" : "failed",
          attemptCount,
          hoursReceived: hours.length,
          valuesReceived,
          expectedValueCount,
          errorCode: valuesReceived > 0 ? null : "no_usable_data",
        } };
      }
      return { forecast: null, diagnostic: {
        modelName: model.name, modelId: model.modelId, status: "failed", attemptCount,
        hoursReceived: 0, valuesReceived: 0, expectedValueCount: 0, errorCode: "no_usable_data",
      } };
    } catch (err) {
      const errorCode = classifyHourlyProviderError(err);
      console.warn(`[HourlyAll] ${model.name} request failed (${errorCode}).`);
      return { forecast: null, diagnostic: {
        modelName: model.name, modelId: model.modelId,
        status: errorCode === "invalid_response" ? "failed" : "safe_error",
        attemptCount: attemptCount || attempts,
        hoursReceived: 0, valuesReceived: 0, expectedValueCount: 0, errorCode,
      } };
    }
  };

  const firstPass = await Promise.all(modelsToCollect.map((model) => collectModel(model, 2)));
  const retryIndexes = firstPass.map((result, index) => result.diagnostic.status === "succeeded" ? -1 : index).filter((index) => index >= 0);
  const retryPass = new Map<number, ModelAttempt>();
  if (retryIndexes.length > 0) {
    console.warn(`[HourlyAll] Retry targeted for ${retryIndexes.length} incomplete model source(s).`);
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const retryResults = await Promise.all(retryIndexes.map((index) => collectModel(modelsToCollect[index], 1)));
    retryIndexes.forEach((index, resultIndex) => retryPass.set(index, retryResults[resultIndex]));
  }

  const outcomes = firstPass.map((first, index) => {
    const retry = retryPass.get(index);
    if (!retry) return first;
    const firstQuality = first.diagnostic.valuesReceived;
    const retryQuality = retry.diagnostic.valuesReceived;
    const selected = retryQuality > firstQuality ? retry : first;
    const status = selected.diagnostic.status;
    return {
      forecast: selected.forecast,
      diagnostic: {
        ...selected.diagnostic,
        attemptCount: first.diagnostic.attemptCount + retry.diagnostic.attemptCount,
        errorCode: status === "succeeded" ? null : retry.diagnostic.errorCode ?? selected.diagnostic.errorCode,
      },
    };
  });

  return {
    forecasts: outcomes.flatMap((outcome) => outcome.forecast ? [outcome.forecast] : []),
    diagnostics: outcomes.map(({ diagnostic }) => diagnostic),
  };
}

export async function collectHourlyForecastAllModels(
  targetDate: string,
  coords?: { lat: number; lon: number },
  options: { includeBestMatch?: boolean; includeNextDay?: boolean } = {},
): Promise<HourlyModelForecast[]> {
  return (await collectHourlyForecastAllModelsWithDiagnostics(targetDate, coords, options)).forecasts;
}

/** Collect hourly candidate series without affecting active model coverage. */
export async function collectValidationHourlyForecasts(
  targetDate: string,
  coords?: { lat: number; lon: number }
): Promise<Array<{
  modelName: string;
  modelId: string;
  sourceName: string;
  captureRunId: string;
  requestStartedAt: number;
  availableAt: number;
  hours: Array<{
    validAt: number;
    hour: number;
    temperature: number | null;
    apparentTemperature: number | null;
    precipitation: number | null;
    windSpeed: number | null;
    windGusts: number | null;
    windDirection: number | null;
    humidity: number | null;
    cloudCover: number | null;
    weatherCode: number | null;
  }>;
}>> {
  const location = coords ?? HONDEGHEM;
  const results = await Promise.all(VALIDATION_WEATHER_MODELS.map(async (model) => {
    const requestStartedAt = Date.now();
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", location.lat.toString());
      url.searchParams.set("longitude", location.lon.toString());
      url.searchParams.set("hourly", "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,relative_humidity_2m,cloud_cover,weather_code");
      url.searchParams.set("timezone", "Europe/Paris");
      url.searchParams.set("timeformat", "unixtime");
      url.searchParams.set("forecast_days", "2");
      url.searchParams.set("models", model.modelId);
      const response = await fetchWeather(url.toString(), {}, { timeoutMs: 12_000, attempts: 2 });
      if (!response.ok) return null;
      const data = await response.json();
      const availableAt = Date.now();
      const hourly = data.hourly;
      if (!hourly?.time) return null;
      const hours = hourly.time.flatMap((unixTime: number | string, index: number) => {
        const unixSeconds = Number(unixTime);
        if (!Number.isFinite(unixSeconds) || hourly.temperature_2m?.[index] == null) return [];
        const validAt = unixSeconds * 1000;
        const parisTime = getParisDateAndHour(validAt);
        if (!parisTime || parisTime.date !== targetDate) return [];
        return [{
          validAt,
          hour: parisTime.hour,
          temperature: hourly.temperature_2m[index] ?? null,
          apparentTemperature: hourly.apparent_temperature?.[index] ?? null,
          precipitation: hourly.precipitation?.[index] ?? null,
          windSpeed: hourly.wind_speed_10m?.[index] ?? null,
          windGusts: hourly.wind_gusts_10m?.[index] ?? null,
          windDirection: hourly.wind_direction_10m?.[index] ?? null,
          humidity: hourly.relative_humidity_2m?.[index] ?? null,
          cloudCover: hourly.cloud_cover?.[index] ?? null,
          weatherCode: hourly.weather_code?.[index] ?? null,
        }];
      });
      return hours.length > 0 ? {
        modelName: model.name,
        modelId: model.modelId,
        sourceName: "open-meteo",
        captureRunId: randomUUID(),
        requestStartedAt,
        availableAt,
        hours,
      } : null;
    } catch (err) {
      console.warn(`[ValidationHourly] Error fetching ${model.name}:`, err);
      return null;
    }
  }));
  return results.filter((forecast): forecast is NonNullable<typeof forecast> => forecast !== null);
}
