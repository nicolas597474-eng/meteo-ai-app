import { calculateReliabilityScore } from "./statsEngine";

type PhysicalSnapshot = { hour: number; stationCount: number; temperature: number | null; precipitation: number | null; windSpeed: number | null };
type HourlyForecast = { modelName: string; hour: number; temperature: number | null; precipitation: number | null; windSpeed: number | null };

export type QualifiedHourlyModelScore = {
  serviceName: string;
  sampleSize: number;
  maeTemp: number | null;
  rmseTemp: number | null;
  biasTemp: number | null;
  maePrecip: number | null;
  rmsePrecip: number | null;
  maeWind: number | null;
  rmseWind: number | null;
  weightedScore: number | null;
};

const MINIMUM_ALIGNED_HOURS = 18;

/** Scores only exist where an archived model hour and a physical snapshot coincide. */
export function scoreQualifiedHourlyModels(snapshots: PhysicalSnapshot[], forecasts: HourlyForecast[]): QualifiedHourlyModelScore[] {
  const physicalByHour = new Map(snapshots.filter((snapshot) => snapshot.stationCount > 0 && snapshot.temperature != null).map((snapshot) => [snapshot.hour, snapshot]));
  const grouped = new Map<string, HourlyForecast[]>();
  for (const forecast of forecasts) grouped.set(forecast.modelName, [...(grouped.get(forecast.modelName) ?? []), forecast]);

  return Array.from(grouped.entries()).flatMap(([serviceName, rows]) => {
    const pairs = rows.flatMap((forecast) => {
      const observation = physicalByHour.get(forecast.hour);
      return observation ? [{ forecast, observation }] : [];
    });
    if (pairs.length < MINIMUM_ALIGNED_HOURS) return [];
    const score = calculateReliabilityScore(
      pairs.map(({ forecast }) => ({ tempMax: forecast.temperature, tempMin: forecast.temperature, precipitation: forecast.precipitation, windSpeed: forecast.windSpeed })),
      pairs.map(({ observation }) => ({ tempMax: observation.temperature, tempMin: observation.temperature, precipitation: observation.precipitation, windSpeed: observation.windSpeed })),
    );
    return [{
      serviceName,
      sampleSize: pairs.length,
      maeTemp: score.maeTemp,
      rmseTemp: score.rmseTemp,
      biasTemp: score.biasTemp,
      maePrecip: score.maePrecip,
      rmsePrecip: score.rmsePrecip,
      maeWind: score.maeWind,
      rmseWind: score.rmseWind,
      weightedScore: score.weightedScore,
    }];
  });
}
