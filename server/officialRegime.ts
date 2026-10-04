import { detectExtendedRegime, detectMultiRegime, EXTENDED_REGIME_INFO } from "./fusionEngine";

type RegimeParameters = {
  temperature: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  humidity: number | null;
  cloudCover: number | null;
  visibilityKm: number | null;
  pressure: number | null;
};

type RegimeDetectionParameters = {
  temperature: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  humidity: number | null;
  cloudCover: number | null;
  visibility: number | null;
};

export type OfficialSnapshot = {
  tempMax?: number | null;
  tempMin?: number | null;
  precipitation?: number | null;
  windSpeed?: number | null;
  humidity?: number | null;
  cloudCover?: number | null;
  visibilityKm?: number | null;
  pressure?: number | null;
  computedAt?: Date | string | null;
} | null | undefined;

export type FreshRegimeObservation = {
  tempMax?: number | null;
  tempMin?: number | null;
  precipitation?: number | null;
  windSpeed?: number | null;
  humidity?: number | null;
  cloudCover?: number | null;
  visibilityKm?: number | null;
  collectedAt?: Date | string | null;
} | null | undefined;

export type CurrentHourlyRegimeForecast = {
  temp?: number | null;
  precipitation?: number | null;
  windSpeed?: number | null;
  humidity?: number | null;
  cloudCover?: number | null;
  /** Open-Meteo HourlyPoint visibility, in km. */
  visibilityKm?: number | null;
  updatedAt?: Date | string | null;
} | null | undefined;

export type HourlyRegimePoint = {
  hour: string;
  validAt?: number | null;
  temp?: number | null;
  precipitation?: number | null;
  windSpeed?: number | null;
  humidity?: number | null;
  cloudCover?: number | null;
  /** Open-Meteo HourlyPoint visibility, in km. */
  visibilityKm?: number | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteOrNull(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

function toTimestamp(value: Date | string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function toIsoTimestamp(value: Date | string | null | undefined) {
  const timestamp = toTimestamp(value);
  return timestamp == null ? null : new Date(timestamp).toISOString();
}

function averageTemperature(data: { tempMax?: number | null; tempMin?: number | null }) {
  return isFiniteNumber(data.tempMax) && isFiniteNumber(data.tempMin)
    ? (data.tempMax + data.tempMin) / 2
    : null;
}

function hourToMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? hour * 60 + minute
    : null;
}

function snapshotParameters(snapshot: OfficialSnapshot): RegimeParameters {
  return {
    temperature: averageTemperature(snapshot ?? {}),
    precipitation: finiteOrNull(snapshot?.precipitation),
    windSpeed: finiteOrNull(snapshot?.windSpeed),
    humidity: finiteOrNull(snapshot?.humidity),
    cloudCover: finiteOrNull(snapshot?.cloudCover),
    visibilityKm: finiteOrNull(snapshot?.visibilityKm),
    pressure: finiteOrNull(snapshot?.pressure),
  };
}

function observationParameters(observation: FreshRegimeObservation): RegimeParameters {
  return {
    temperature: averageTemperature(observation ?? {}),
    precipitation: finiteOrNull(observation?.precipitation),
    windSpeed: finiteOrNull(observation?.windSpeed),
    humidity: finiteOrNull(observation?.humidity),
    cloudCover: finiteOrNull(observation?.cloudCover),
    visibilityKm: finiteOrNull(observation?.visibilityKm),
    pressure: null,
  };
}

function hourlyParameters(hourly: CurrentHourlyRegimeForecast): RegimeParameters {
  return {
    temperature: finiteOrNull(hourly?.temp),
    precipitation: finiteOrNull(hourly?.precipitation),
    windSpeed: finiteOrNull(hourly?.windSpeed),
    humidity: finiteOrNull(hourly?.humidity),
    cloudCover: finiteOrNull(hourly?.cloudCover),
    visibilityKm: finiteOrNull(hourly?.visibilityKm),
    pressure: null,
  };
}

function detectionParameters(params: RegimeParameters): RegimeDetectionParameters {
  return {
    temperature: params.temperature,
    precipitation: params.precipitation,
    windSpeed: params.windSpeed,
    humidity: params.humidity,
    cloudCover: params.cloudCover,
    visibility: params.visibilityKm == null ? null : params.visibilityKm * 1000,
  };
}

function dataCoverage(params: RegimeParameters) {
  return [params.temperature, params.precipitation, params.windSpeed, params.humidity, params.cloudCover, params.visibilityKm]
    .filter(isFiniteNumber).length;
}

function unavailableRegime(params: RegimeParameters, snapshotComputedAt: string | null) {
  return {
    status: "unknown" as const,
    primary: null,
    active: [],
    confidence: null,
    blendedWeights: null,
    description: "Régime indisponible : une ou plusieurs données météorologiques requises sont absentes ou invalides.",
    params,
    snapshotComputedAt,
  };
}

/**
 * Persisted multi-model snapshot. Every input used by the detector must be
 * present and finite; missing values are never replaced with climatological
 * defaults. Visibility is optional in the legacy daily snapshot, so that
 * snapshot remains explicitly unknown unless it actually contains visibility.
 */
export function buildOfficialRegime(snapshot: OfficialSnapshot) {
  const params = snapshotParameters(snapshot);
  const snapshotComputedAt = toIsoTimestamp(snapshot?.computedAt);
  const multiRegime = detectMultiRegime(detectionParameters(params));
  if (!multiRegime) return unavailableRegime(params, snapshotComputedAt);

  return {
    status: "available" as const,
    primary: multiRegime.primaryRegime,
    active: multiRegime.activeRegimes,
    confidence: multiRegime.confidenceScore,
    blendedWeights: multiRegime.blendedWeights,
    description: multiRegime.description,
    params,
    snapshotComputedAt,
  };
}

/**
 * Chooses a regime using measurable freshness rules. An observation or hourly
 * forecast is used only when every input consumed by the classifier is present
 * and finite; otherwise the real, possibly unknown, official snapshot is kept.
 */
export function buildOperationalRegime(
  snapshot: OfficialSnapshot,
  observation: FreshRegimeObservation,
  currentHourly?: CurrentHourlyRegimeForecast,
  nowMs = Date.now(),
) {
  const official = buildOfficialRegime(snapshot);
  const snapshotAt = toTimestamp(snapshot?.computedAt);
  const observationAt = toTimestamp(observation?.collectedAt);
  const observationParams = observationParameters(observation);
  const observationCoverage = dataCoverage(observationParams);
  const observationIsFresh = observationAt != null && nowMs - observationAt >= 0 && nowMs - observationAt <= 3 * 60 * 60 * 1000;
  const observationIsNewer = observationAt != null && (snapshotAt == null || observationAt > snapshotAt);
  const observationRegime = observationIsFresh && observationIsNewer
    ? detectExtendedRegime(detectionParameters(observationParams))
    : null;

  if (observationRegime) {
    const info = EXTENDED_REGIME_INFO[observationRegime];
    return {
      status: "available" as const,
      primary: { id: observationRegime, ...info },
      active: [{ id: observationRegime, label: info.label, emoji: info.emoji, influence: 100 }],
      confidence: Math.min(95, 65 + observationCoverage * 7),
      blendedWeights: info.weights,
      description: `${info.description} Déterminé par une observation récente et suffisamment couverte.`,
      params: observationParams,
      snapshotComputedAt: official.snapshotComputedAt,
      source: "fresh_observation" as const,
      sourceUpdatedAt: new Date(observationAt!).toISOString(),
      sourceLabel: "Observation récente validée",
      sourceAgeMinutes: Math.max(0, Math.round((nowMs - observationAt!) / 60000)),
      dataCoverage: observationCoverage,
    };
  }

  const hourlyAt = toTimestamp(currentHourly?.updatedAt);
  const hourlyParams = hourlyParameters(currentHourly);
  const hourlyCoverage = dataCoverage(hourlyParams);
  const hourlyIsFresh = hourlyAt != null && nowMs - hourlyAt >= 0 && nowMs - hourlyAt <= 20 * 60 * 1000;
  const hourlyRegime = hourlyIsFresh
    ? detectExtendedRegime(detectionParameters(hourlyParams))
    : null;

  // A complete hourly forecast is explicitly a forecast, never a physical observation.
  if (hourlyRegime) {
    const info = EXTENDED_REGIME_INFO[hourlyRegime];
    return {
      status: "available" as const,
      primary: { id: hourlyRegime, ...info },
      active: [{ id: hourlyRegime, label: info.label, emoji: info.emoji, influence: 100 }],
      confidence: Math.min(90, 55 + hourlyCoverage * 7),
      blendedWeights: info.weights,
      description: `${info.description} Déterminé par la prévision horaire actualisée.`,
      params: hourlyParams,
      snapshotComputedAt: official.snapshotComputedAt,
      source: "hourly_forecast" as const,
      sourceUpdatedAt: new Date(hourlyAt!).toISOString(),
      sourceLabel: "Prévision horaire actualisée",
      sourceAgeMinutes: Math.max(0, Math.round((nowMs - hourlyAt!) / 60000)),
      dataCoverage: hourlyCoverage,
    };
  }

  const officialCoverage = dataCoverage(official.params);
  if (officialCoverage === 0 && hourlyIsFresh && hourlyCoverage > 0) {
    return {
      ...unavailableRegime(hourlyParams, official.snapshotComputedAt),
      source: "hourly_forecast_partial" as const,
      sourceUpdatedAt: new Date(hourlyAt!).toISOString(),
      sourceLabel: "Prévision horaire partielle — régime non calculé",
      sourceAgeMinutes: Math.max(0, Math.round((nowMs - hourlyAt!) / 60000)),
      dataCoverage: hourlyCoverage,
    };
  }
  return {
    ...official,
    source: "official_snapshot" as const,
    sourceUpdatedAt: official.snapshotComputedAt,
    sourceLabel: official.status === "available" ? "Fusion officielle multi-modèles" : "Régime indisponible",
    sourceAgeMinutes: snapshotAt == null ? null : Math.max(0, Math.round((nowMs - snapshotAt) / 60000)),
    dataCoverage: officialCoverage,
  };
}

/** Retourne le premier créneau futur complet dont le régime diffère du régime courant. */
export function findNextHourlyRegimeChange(
  hours: HourlyRegimePoint[],
  currentHour: string,
  currentRegimeId: string,
  currentValidAt?: number | null,
) {
  if (!currentRegimeId) return null;
  const currentMinutes = hourToMinutes(currentHour);
  const validAtIndex = currentValidAt != null && Number.isFinite(currentValidAt)
    ? hours.findIndex((point) => point.validAt === currentValidAt)
    : -1;
  const currentIndex = validAtIndex >= 0
    ? validAtIndex
    : currentMinutes == null
      ? -1
      : hours.findIndex((point) => hourToMinutes(point.hour) === currentMinutes);
  const startIndex = currentIndex >= 0
    ? currentIndex
    : currentMinutes == null
      ? -1
      : hours.findIndex((point) => {
        const pointMinutes = hourToMinutes(point.hour);
        return pointMinutes != null && pointMinutes >= currentMinutes;
      });
  if (startIndex < 0) return null;

  for (let index = startIndex + 1; index < hours.length; index += 1) {
    const point = hours[index];
    const id = detectExtendedRegime({
      temperature: finiteOrNull(point.temp),
      precipitation: finiteOrNull(point.precipitation),
      windSpeed: finiteOrNull(point.windSpeed),
      humidity: finiteOrNull(point.humidity),
      cloudCover: finiteOrNull(point.cloudCover),
      visibility: finiteOrNull(point.visibilityKm) == null ? null : point.visibilityKm! * 1000,
    });
    if (!id || id === currentRegimeId) continue;
    const info = EXTENDED_REGIME_INFO[id];
    return { hour: point.hour, id, label: info.label, emoji: info.emoji, cloudCover: finiteOrNull(point.cloudCover) };
  }
  return null;
}
