import { detectExtendedRegime, detectMultiRegime, EXTENDED_REGIME_INFO } from "./fusionEngine";

export type OfficialSnapshot = {
  tempMax?: number | null;
  tempMin?: number | null;
  precipitation?: number | null;
  windSpeed?: number | null;
  humidity?: number | null;
  cloudCover?: number | null;
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
  collectedAt?: Date | string | null;
} | null | undefined;

export type CurrentHourlyRegimeForecast = {
  temp?: number | null;
  precipitation?: number | null;
  windSpeed?: number | null;
  humidity?: number | null;
  cloudCover?: number | null;
  updatedAt?: Date | string | null;
} | null | undefined;

export type HourlyRegimePoint = {
  hour: string;
  temp?: number | null;
  precipitation?: number | null;
  windSpeed?: number | null;
  humidity?: number | null;
  cloudCover?: number | null;
};

function toTimestamp(value: Date | string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function averageTemperature(data: { tempMax?: number | null; tempMin?: number | null }) {
  return data.tempMax != null && data.tempMin != null
    ? (data.tempMax + data.tempMin) / 2
    : data.tempMax ?? data.tempMin ?? 15;
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

/**
 * Persisted multi-model snapshot. It is the stable fallback for every view.
 */
export function buildOfficialRegime(snapshot: OfficialSnapshot) {
  const params = {
    temperature: averageTemperature(snapshot ?? {}),
    precipitation: snapshot?.precipitation ?? 0,
    windSpeed: snapshot?.windSpeed ?? 0,
    humidity: snapshot?.humidity ?? null,
    cloudCover: snapshot?.cloudCover ?? null,
    pressure: snapshot?.pressure ?? null,
  };
  const multiRegime = detectMultiRegime(params);

  return {
    primary: multiRegime.primaryRegime,
    active: multiRegime.activeRegimes,
    confidence: multiRegime.confidenceScore,
    blendedWeights: multiRegime.blendedWeights,
    description: multiRegime.description,
    params,
    snapshotComputedAt: snapshot?.computedAt ? new Date(snapshot.computedAt).toISOString() : null,
  };
}

/**
 * Chooses a regime using measurable rules: a recent observation wins only when
 * it is newer than the forecast snapshot, under three hours old, and includes
 * cloud cover plus at least two additional weather dimensions. Otherwise every
 * page falls back to the persisted multi-model snapshot.
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
  const coverage = [observation?.tempMax ?? observation?.tempMin, observation?.precipitation, observation?.windSpeed, observation?.humidity, observation?.cloudCover]
    .filter((value) => value != null).length;
  const observationIsFresh = observationAt != null && nowMs - observationAt >= 0 && nowMs - observationAt <= 3 * 60 * 60 * 1000;
  const observationIsNewer = observationAt != null && (snapshotAt == null || observationAt > snapshotAt);
  const canUseObservation = observationIsFresh && observationIsNewer && observation?.cloudCover != null && coverage >= 3;

  if (canUseObservation) {
    const regimeId = detectExtendedRegime({
      temperature: averageTemperature(observation ?? {}),
      precipitation: observation?.precipitation ?? 0,
      windSpeed: observation?.windSpeed ?? 0,
      humidity: observation?.humidity ?? null,
      cloudCover: observation?.cloudCover ?? null,
    });
    const info = EXTENDED_REGIME_INFO[regimeId];
    const primary = { id: regimeId, ...info };
    return {
      primary,
      active: [{ id: regimeId, label: info.label, emoji: info.emoji, influence: 100 }],
      confidence: Math.min(95, 65 + coverage * 7),
      blendedWeights: info.weights,
      description: `${info.description} Déterminé par une observation récente et suffisamment couverte.`,
      params: {
        temperature: averageTemperature(observation ?? {}),
        precipitation: observation?.precipitation ?? 0,
        windSpeed: observation?.windSpeed ?? 0,
        humidity: observation?.humidity ?? null,
        cloudCover: observation?.cloudCover ?? null,
        pressure: null,
      },
      snapshotComputedAt: official.snapshotComputedAt,
      source: "fresh_observation" as const,
      sourceUpdatedAt: new Date(observationAt!).toISOString(),
      sourceLabel: "Observation récente validée",
      sourceAgeMinutes: Math.max(0, Math.round((nowMs - observationAt!) / 60000)),
      dataCoverage: coverage,
    };
  }

  const hourlyAt = toTimestamp(currentHourly?.updatedAt);
  const hourlyCoverage = [currentHourly?.temp, currentHourly?.precipitation, currentHourly?.windSpeed, currentHourly?.humidity, currentHourly?.cloudCover]
    .filter((value) => value != null).length;
  const hourlyIsFresh = hourlyAt != null && nowMs - hourlyAt >= 0 && nowMs - hourlyAt <= 20 * 60 * 1000;
  const canUseHourly = hourlyIsFresh && currentHourly?.cloudCover != null && hourlyCoverage >= 3;

  // Une prévision horaire générée pendant la requête décrit mieux la condition
  // actuelle qu’un snapshot journalier âgé de plusieurs heures. Elle reste
  // explicitement libellée comme prévision, jamais comme observation physique.
  if (canUseHourly) {
    const regimeId = detectExtendedRegime({
      temperature: currentHourly?.temp ?? null,
      precipitation: currentHourly?.precipitation ?? 0,
      windSpeed: currentHourly?.windSpeed ?? 0,
      humidity: currentHourly?.humidity ?? null,
      cloudCover: currentHourly?.cloudCover ?? null,
    });
    const info = EXTENDED_REGIME_INFO[regimeId];
    const primary = { id: regimeId, ...info };
    return {
      primary,
      active: [{ id: regimeId, label: info.label, emoji: info.emoji, influence: 100 }],
      confidence: Math.min(90, 55 + hourlyCoverage * 7),
      blendedWeights: info.weights,
      description: `${info.description} Déterminé par la prévision horaire actualisée.`,
      params: {
        temperature: currentHourly?.temp ?? null,
        precipitation: currentHourly?.precipitation ?? 0,
        windSpeed: currentHourly?.windSpeed ?? 0,
        humidity: currentHourly?.humidity ?? null,
        cloudCover: currentHourly?.cloudCover ?? null,
        pressure: null,
      },
      snapshotComputedAt: official.snapshotComputedAt,
      source: "hourly_forecast" as const,
      sourceUpdatedAt: new Date(hourlyAt!).toISOString(),
      sourceLabel: "Prévision horaire actualisée",
      sourceAgeMinutes: Math.max(0, Math.round((nowMs - hourlyAt!) / 60000)),
      dataCoverage: hourlyCoverage,
    };
  }

  return {
    ...official,
    source: "official_snapshot" as const,
    sourceUpdatedAt: official.snapshotComputedAt,
    sourceLabel: "Fusion officielle multi-modèles",
    sourceAgeMinutes: snapshotAt == null ? null : Math.max(0, Math.round((nowMs - snapshotAt) / 60000)),
    dataCoverage: [snapshot?.tempMax ?? snapshot?.tempMin, snapshot?.precipitation, snapshot?.windSpeed, snapshot?.humidity, snapshot?.cloudCover]
      .filter((value) => value != null).length,
  };
}

/** Retourne le premier créneau futur dont le régime diffère du régime courant. */
export function findNextHourlyRegimeChange(
  hours: HourlyRegimePoint[],
  currentHour: string,
  currentRegimeId: string,
) {
  const currentMinutes = hourToMinutes(currentHour);
  const currentIndex = currentMinutes == null
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
      temperature: point.temp ?? null,
      precipitation: point.precipitation ?? 0,
      windSpeed: point.windSpeed ?? 0,
      humidity: point.humidity ?? null,
      cloudCover: point.cloudCover ?? null,
    });
    if (id !== currentRegimeId) {
      const info = EXTENDED_REGIME_INFO[id];
      return { hour: point.hour, id, label: info.label, emoji: info.emoji, cloudCover: point.cloudCover ?? null };
    }
  }
  return null;
}
