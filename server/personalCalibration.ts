export const PERSONAL_CONDITIONS = [
  "sunny", "few_clouds", "partly_cloudy", "overcast", "fog", "drizzle", "rain", "showers", "storm", "snow",
] as const;

export type PersonalCondition = (typeof PERSONAL_CONDITIONS)[number];

export const PERSONAL_CONDITION_LABELS: Record<PersonalCondition, string> = {
  sunny: "Ensoleillé",
  few_clouds: "Quelques nuages",
  partly_cloudy: "Partiellement nuageux",
  overcast: "Ciel couvert",
  fog: "Brouillard",
  drizzle: "Bruine",
  rain: "Pluie",
  showers: "Averses",
  storm: "Orage",
  snow: "Neige",
};

type PersonalObservationInput = {
  temperature: number | null;
  condition: PersonalCondition;
  windSpeed: number | null;
};

type ArchivedModelForecast = {
  temperature: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
  cloudCover: number | null;
};

type PriorCalibration = {
  comparisonCount: number;
  scoreEma: number | null;
  temperatureMaeEma: number | null;
  conditionScoreEma: number | null;
  windScoreEma: number | null;
};

const EMA_ALPHA = 0.15;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const ema = (current: number | null, next: number | null) => next == null ? current : current == null ? next : EMA_ALPHA * next + (1 - EMA_ALPHA) * current;

export function personalConditionFromForecast(weatherCode: number | null, cloudCover: number | null): PersonalCondition {
  if (weatherCode === 0) return "sunny";
  if (weatherCode === 1) return "few_clouds";
  if (weatherCode === 2) return "partly_cloudy";
  if (weatherCode === 3) return "overcast";
  if (weatherCode != null && weatherCode <= 49) return "fog";
  if (weatherCode != null && weatherCode <= 59) return "drizzle";
  if (weatherCode != null && weatherCode <= 69) return "rain";
  if (weatherCode != null && weatherCode <= 79) return "snow";
  if (weatherCode != null && weatherCode <= 84) return "showers";
  if (weatherCode != null) return "storm";
  if ((cloudCover ?? 0) > 80) return "overcast";
  if ((cloudCover ?? 0) > 50) return "partly_cloudy";
  if ((cloudCover ?? 0) > 20) return "few_clouds";
  return "sunny";
}

export function conditionAgreementScore(observed: PersonalCondition, forecast: PersonalCondition): number {
  if (observed === forecast) return 100;
  const sky = ["sunny", "few_clouds", "partly_cloudy", "overcast"];
  const precipitation = ["drizzle", "rain", "showers", "storm"];
  if (sky.includes(observed) && sky.includes(forecast)) return 60;
  if (precipitation.includes(observed) && precipitation.includes(forecast)) return 60;
  return 0;
}

export function scorePersonalModelObservation(observation: PersonalObservationInput, forecast: ArchivedModelForecast) {
  const temperatureError = observation.temperature != null && forecast.temperature != null
    ? Math.abs(forecast.temperature - observation.temperature)
    : null;
  const temperatureScore = temperatureError == null ? null : 100 * Math.exp(-temperatureError / 2);
  const forecastCondition = personalConditionFromForecast(forecast.weatherCode, forecast.cloudCover);
  const conditionScore = conditionAgreementScore(observation.condition, forecastCondition);
  const windScore = observation.windSpeed != null && forecast.windSpeed != null
    ? 100 * Math.exp(-Math.abs(forecast.windSpeed - observation.windSpeed) / 10)
    : null;
  const dimensions = [
    { weight: 0.5, score: temperatureScore },
    { weight: 0.3, score: conditionScore },
    { weight: 0.2, score: windScore },
  ].filter((entry): entry is { weight: number; score: number } => entry.score != null);
  const totalWeight = dimensions.reduce((sum, entry) => sum + entry.weight, 0);
  const overallScore = dimensions.reduce((sum, entry) => sum + entry.weight * entry.score, 0) / totalWeight;
  return { temperatureError, temperatureScore, conditionScore, windScore, overallScore, forecastCondition };
}

export function updatePersonalCalibration(prior: PriorCalibration | undefined, result: ReturnType<typeof scorePersonalModelObservation>) {
  const comparisonCount = (prior?.comparisonCount ?? 0) + 1;
  const scoreEma = ema(prior?.scoreEma ?? null, result.overallScore);
  const temperatureMaeEma = ema(prior?.temperatureMaeEma ?? null, result.temperatureError);
  const conditionScoreEma = ema(prior?.conditionScoreEma ?? null, result.conditionScore);
  const windScoreEma = ema(prior?.windScoreEma ?? null, result.windScore);
  const evidenceState = comparisonCount < 20 ? "insufficient" : comparisonCount < 50 ? "provisional" : "qualified";
  // Aucun modèle ne reçoit une influence opérationnelle avant 50 comparaisons.
  const weightMultiplier = evidenceState === "qualified" && scoreEma != null
    ? clamp(0.85 + (scoreEma / 100) * 0.3, 0.85, 1.15)
    : 1;
  return { comparisonCount, scoreEma, temperatureMaeEma, conditionScoreEma, windScoreEma, evidenceState, weightMultiplier };
}
