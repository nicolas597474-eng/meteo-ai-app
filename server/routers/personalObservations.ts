import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getPersonalModelCalibrations,
  getAllPersonalWeatherObservations,
  getPersonalWeatherObservationById,
  getRecentPersonalWeatherObservations,
  getStoredHourlyForecasts,
  insertPersonalModelObservationScores,
  insertPersonalWeatherObservation,
  makeLocationKey,
  updatePersonalWeatherObservation,
  deletePersonalWeatherObservation,
  upsertPersonalModelCalibration,
} from "../db";
import {
  PERSONAL_CONDITIONS,
  PERSONAL_CONDITION_LABELS,
  scorePersonalModelObservation,
  updatePersonalCalibration,
} from "../personalCalibration";
import { getParisDate, getParisHour } from "../weatherTime";
import { conditionFromWmoWeatherCode } from "../weatherConditionLabels";
import { rebuildPersonalCalibration } from "../personalObservationHistory";

const observationInput = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  temperature: z.number().min(-60).max(60).nullable(),
  condition: z.enum(PERSONAL_CONDITIONS),
  windSpeed: z.number().min(0).max(250).nullable(),
  precipitation: z.number().min(0).max(500).nullable(),
});
const observationEditInput = observationInput.pick({ temperature: true, condition: true, windSpeed: true, precipitation: true });

function weightedAverage(values: Array<{ value: number | null; weight: number }>) {
  const available = values.filter((entry): entry is { value: number; weight: number } => entry.value != null);
  const totalWeight = available.reduce((sum, entry) => sum + entry.weight, 0);
  return totalWeight > 0 ? available.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight : null;
}

export const personalObservationsRouter = router({
  labels: protectedProcedure.query(() => PERSONAL_CONDITION_LABELS),

  dashboardState: protectedProcedure
    .input(z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }))
    .query(async ({ ctx, input }) => {
      const locationKey = makeLocationKey(input.lat, input.lon);
      const [calibrations, recentObservations] = await Promise.all([
        getPersonalModelCalibrations(ctx.user.id, locationKey),
        getRecentPersonalWeatherObservations(ctx.user.id, locationKey, 3),
      ]);
      const qualifiedCount = calibrations.filter((item) => item.evidenceState === "qualified").length;
      const comparisonCount = calibrations.length > 0 ? Math.max(...calibrations.map((item) => item.comparisonCount)) : 0;
      return {
        calibrations,
        recentObservations,
        evidence: {
          comparisonCount,
          state: qualifiedCount > 0 ? "qualified" : comparisonCount >= 20 ? "provisional" : "insufficient",
          minimumForPreview: 20,
          minimumForWeighting: 50,
        },
      };
    }),

  personalizedHourly: protectedProcedure
    .input(z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const locationKey = makeLocationKey(input.lat, input.lon);
      const [calibrations, forecasts] = await Promise.all([
        getPersonalModelCalibrations(ctx.user.id, locationKey),
        getStoredHourlyForecasts(locationKey, getParisDate(now)),
      ]);
      const qualified = new Map(calibrations.filter((item) => item.evidenceState === "qualified").map((item) => [item.modelName, item.weightMultiplier]));
      if (qualified.size === 0) return { applied: false, hours: [], comparedModels: [] as string[] };
      const byHour = new Map<number, typeof forecasts>();
      for (const forecast of forecasts) byHour.set(forecast.hour, [...(byHour.get(forecast.hour) ?? []), forecast]);
      const hours = Array.from(byHour.entries()).sort(([a], [b]) => a - b).flatMap(([hour, rows]) => {
        const weightedRows = rows.filter((row) => qualified.has(row.modelName)).map((row) => ({ row, weight: qualified.get(row.modelName) ?? 1 }));
        if (weightedRows.length === 0) return [];
        const leading = [...weightedRows].sort((a, b) => b.weight - a.weight)[0].row;
        const temperatures = weightedRows.map(({ row }) => row.temperature).filter((value): value is number => value != null);
        return [{
          hour: `${String(hour).padStart(2, "0")}:00`,
          temp: weightedAverage(weightedRows.map(({ row, weight }) => ({ value: row.temperature, weight }))),
          apparentTemp: weightedAverage(weightedRows.map(({ row, weight }) => ({ value: row.apparentTemperature, weight }))),
          precipitation: weightedAverage(weightedRows.map(({ row, weight }) => ({ value: row.precipitation, weight }))),
          windSpeed: weightedAverage(weightedRows.map(({ row, weight }) => ({ value: row.windSpeed, weight }))),
          windGust: weightedAverage(weightedRows.map(({ row, weight }) => ({ value: row.windGusts, weight }))),
          windDirection: leading.windDirection,
          cloudCover: weightedAverage(weightedRows.map(({ row, weight }) => ({ value: row.cloudCover, weight }))),
          humidity: weightedAverage(weightedRows.map(({ row, weight }) => ({ value: row.humidity, weight }))),
          pressure: weightedAverage(weightedRows.map(({ row, weight }) => ({ value: row.pressure, weight }))),
          condition: conditionFromWmoWeatherCode(leading.weatherCode, leading.precipitation, leading.cloudCover),
          tempSpread: temperatures.length > 1 ? Math.max(...temperatures) - Math.min(...temperatures) : null,
          modelCount: weightedRows.length,
          isPersonalized: true,
        }];
      });
      return { applied: hours.length > 0, hours, comparedModels: Array.from(qualified.keys()) };
    }),

  history: protectedProcedure
    .input(z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }))
    .query(async ({ ctx, input }) => getAllPersonalWeatherObservations(ctx.user.id, makeLocationKey(input.lat, input.lon))),

  update: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), observation: observationEditInput }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getPersonalWeatherObservationById(ctx.user.id, input.id);
      if (!existing) throw new Error("Observation introuvable.");
      const updated = await updatePersonalWeatherObservation(ctx.user.id, input.id, input.observation);
      if (!updated) throw new Error("L’observation n’a pas pu être modifiée.");
      const rebuild = await rebuildPersonalCalibration(ctx.user.id, existing.locationKey);
      return { success: true, rebuild };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getPersonalWeatherObservationById(ctx.user.id, input.id);
      if (!existing) throw new Error("Observation introuvable.");
      const deleted = await deletePersonalWeatherObservation(ctx.user.id, input.id);
      if (!deleted) throw new Error("L’observation n’a pas pu être supprimée.");
      const rebuild = await rebuildPersonalCalibration(ctx.user.id, existing.locationKey);
      return { success: true, rebuild };
    }),

  submit: protectedProcedure.input(observationInput).mutation(async ({ ctx, input }) => {
    const now = new Date();
    const locationKey = makeLocationKey(input.lat, input.lon);
    const observedAt = now.getTime();
    const observationId = await insertPersonalWeatherObservation({
      userId: ctx.user.id,
      locationKey,
      lat: input.lat,
      lon: input.lon,
      observedAt,
      temperature: input.temperature,
      condition: input.condition,
      windSpeed: input.windSpeed,
      precipitation: input.precipitation,
    });
    if (!observationId) throw new Error("L’observation n’a pas pu être enregistrée.");

    const [storedForecasts, calibrations] = await Promise.all([
      getStoredHourlyForecasts(locationKey, getParisDate(now)),
      getPersonalModelCalibrations(ctx.user.id, locationKey),
    ]);
    const priorByModel = new Map(calibrations.map((calibration) => [calibration.modelName, calibration]));
    const alignedForecasts = storedForecasts.filter((forecast) => forecast.hour === getParisHour(now));
    const modelResults = alignedForecasts.map((forecast) => {
      const result = scorePersonalModelObservation(input, forecast);
      return { forecast, result };
    });

    await insertPersonalModelObservationScores(modelResults.map(({ forecast, result }) => ({
      observationId,
      modelName: forecast.modelName,
      temperatureError: result.temperatureError,
        temperatureScore: result.temperatureScore,
        conditionScore: result.conditionScore,
        precipitationError: result.precipitationError,
        precipitationScore: result.precipitationScore,
        windScore: result.windScore,
      overallScore: result.overallScore,
      forecastSnapshot: {
        temperature: forecast.temperature,
        windSpeed: forecast.windSpeed,
        precipitation: forecast.precipitation,
        weatherCode: forecast.weatherCode,
        cloudCover: forecast.cloudCover,
        forecastCondition: result.forecastCondition,
      },
    })));

    const updatedCalibrations = [];
    for (const { forecast, result } of modelResults) {
      const updated = updatePersonalCalibration(priorByModel.get(forecast.modelName), result);
      await upsertPersonalModelCalibration({
        userId: ctx.user.id,
        locationKey,
        modelName: forecast.modelName,
        ...updated,
        lastObservationAt: observedAt,
      });
      updatedCalibrations.push({ modelName: forecast.modelName, ...updated, overallScore: result.overallScore });
    }

    return {
      observationId,
      matchedModelCount: modelResults.length,
      modelResults: updatedCalibrations.sort((a, b) => b.overallScore - a.overallScore),
      notice: modelResults.length === 0
        ? "Observation enregistrée, mais aucune prévision archivée ne correspond encore à ce créneau."
        : "Observation comparée aux prévisions archivées du même lieu et du même créneau.",
    };
  }),
});
