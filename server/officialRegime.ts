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
