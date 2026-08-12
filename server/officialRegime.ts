import { detectMultiRegime } from "./fusionEngine";

type OfficialSnapshot = {
  tempMax?: number | null;
  tempMin?: number | null;
  precipitation?: number | null;
  windSpeed?: number | null;
  humidity?: number | null;
  cloudCover?: number | null;
  pressure?: number | null;
  computedAt?: Date | null;
} | null | undefined;

/**
 * Unique source of truth for the official weather regime.
 * It deliberately consumes only the persisted MeteoAI snapshot, never a local
 * station reading nor a live provider response, so every official view agrees.
 */
export function buildOfficialRegime(snapshot: OfficialSnapshot) {
  const temperature = snapshot?.tempMax != null && snapshot?.tempMin != null
    ? (snapshot.tempMax + snapshot.tempMin) / 2
    : snapshot?.tempMax ?? snapshot?.tempMin ?? 15;
  const params = {
    temperature,
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
    snapshotComputedAt: snapshot?.computedAt?.toISOString?.() ?? null,
  };
}
