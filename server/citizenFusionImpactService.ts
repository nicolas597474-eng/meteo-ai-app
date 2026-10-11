/**
 * Évaluation à blanc de l'impact des capteurs citoyens validés sur l'erreur
 * locale — plan d'intégration openSenseMap/CWOP, étape « Activer la
 * qualification et la pondération seulement si les métriques historiques
 * améliorent objectivement l'erreur locale ».
 *
 * Ce module mesure avant d'activer : il rejoue, sur l'historique archivé de la
 * référence de favori, la pondération spatiale de référence (distance 50 %,
 * priorité de source 30 %, fraîcheur 20 %) et compare l'écart de la synthèse
 * physique à la médiane des stations officielles, avec et sans les capteurs
 * citoyens porteurs d'un verdict « validated » persisté.
 *
 * Philosophie du dépôt, appliquée intégralement :
 * - aucune donnée n'est fabriquée : chaque comparaison exige l'heure de mesure
 *   propre à la température du capteur, au moins deux stations officielles et
 *   une station physique dans la même heure ; l'heure d'archive n'est jamais
 *   un substitut, un relevé absent ne devient jamais zéro ;
 * - les deux bras (synthèse physique seule, synthèse avec capteurs validés)
 *   partagent exactement le même cadre d'alignement, la même pondération et la
 *   même référence, afin que l'écart mesuré isole la seule contribution des
 *   capteurs citoyens ;
 * - l'évaluation ne modifie rien : ni la fusion locale, ni la vérité terrain,
 *   ni un statut persisté. L'activation des capteurs citoyens dans la fusion
 *   demeure une décision séparée, appuyée sur ces métriques, jamais implicite.
 */

import type { StationMeasurementTimes } from "./stationMeasurementFreshness";
import {
  CITIZEN_QUALIFICATION_SOURCES,
  collectQualificationTemperaturePoints,
} from "./openSenseMapQualificationService";
import { buildNormalizedSpatialWeights, type SpatialFusionSource } from "./spatialFusionCore";

/** Version du jeu de règles de l'évaluation d'impact. */
export const CITIZEN_FUSION_IMPACT_VERSION = "citizen-fusion-impact-v1" as const;

/** Fenêtre d'historique évaluée, alignée sur celle de la qualification citoyenne. */
export const CITIZEN_FUSION_IMPACT_HISTORY_WINDOW_DAYS = 30;

/**
 * Gates de l'évaluation d'impact. Les seuils d'échantillon reprennent ceux de
 * la qualification (plan d'intégration : 7 comparaisons ; politique du dépôt :
 * les jours, pas les heures, portent l'échantillon). La référence officielle
 * se mesure : deux stations minimum par comparaison.
 */
export const CITIZEN_FUSION_IMPACT_GATES = {
  /** Comparaisons alignées minimum avant tout verdict d'amélioration. */
  minimumComparisons: 7,
  /** Jours distincts minimum ; un après-midi unique ne prouve rien. */
  minimumDistinctDays: 3,
  /** Deux stations officielles minimum par comparaison : la référence se mesure. */
  minimumOfficialReferencesPerComparison: 2,
} as const;

const HOUR_MS = 60 * 60 * 1000;

export type ImpactStationRow = {
  stationId: string;
  source: string;
  lat: number;
  lon: number;
  /** Distance persistée depuis la référence de favori ; jamais recalculée ici. */
  distanceKm: number;
  /** Priorité de source persistée (0-100) ; jamais fabriquée. */
  reliabilityScore: number;
};

export type ImpactObservationRow = {
  stationId: string;
  /** Heure d'archive de la collecte ; jamais un substitut d'heure de mesure. */
  observedAt: number;
  measurementTimes: StationMeasurementTimes | null;
  temperature: number | null;
};

export type CitizenFusionImpactStatus =
  | "no-validated-citizens"
  | "insufficient-history"
  | "improves"
  | "no-improvement";

export type CitizenFusionImpactReport = {
  version: typeof CITIZEN_FUSION_IMPACT_VERSION;
  referenceLat: number;
  referenceLon: number;
  windowDays: number;
  status: CitizenFusionImpactStatus;
  reason: string;
  comparisons: number;
  distinctDays: number;
  officialStationsUsed: string[];
  physicalStationsUsed: string[];
  validatedCitizenStations: string[];
  baselineMaeC: number | null;
  withCitizenMaeC: number | null;
  /** baselineMaeC − withCitizenMaeC ; strictement positif = amélioration mesurée. */
  improvementC: number | null;
  firstComparedAt: string | null;
  lastComparedAt: string | null;
};

type MeasuredPoint = { epoch: number; value: number };

type ImpactPointStation = ImpactStationRow & {
  points: MeasuredPoint[];
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function roundC(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Synthèse pondérée d'un bras de comparaison : la pondération spatiale de
 * référence est rejouée à l'heure du relevé évalué, avec l'heure de mesure
 * comme horodatage de fraîcheur. Aucune correction d'altitude ni contrôle de
 * cohérence ne sont inventés ici : les deux bras partagent le même cadre.
 */
function weightedTemperatureC(
  readings: ReadonlyArray<{ station: ImpactStationRow; value: number; measuredAt: number }>,
  now: number,
): number | null {
  if (readings.length === 0) return null;
  const sources: SpatialFusionSource[] = readings.map((reading) => ({
    id: reading.station.stationId,
    distanceKm: reading.station.distanceKm,
    reliabilityScore: reading.station.reliabilityScore,
    updatedAt: new Date(reading.measuredAt).toISOString(),
    temperature: reading.value,
  }));
  const weights = buildNormalizedSpatialWeights(sources, { now });
  let sum = 0;
  let weightSum = 0;
  for (const weight of weights) {
    const value = weight.source.temperature;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    sum += value * weight.finalWeight;
    weightSum += weight.finalWeight;
  }
  return weightSum > 0 ? sum / weightSum : null;
}

function emptyReport(
  input: { referenceLat: number; referenceLon: number },
  status: CitizenFusionImpactStatus,
  reason: string,
  validatedCitizenStations: string[],
): CitizenFusionImpactReport {
  return {
    version: CITIZEN_FUSION_IMPACT_VERSION,
    referenceLat: input.referenceLat,
    referenceLon: input.referenceLon,
    windowDays: CITIZEN_FUSION_IMPACT_HISTORY_WINDOW_DAYS,
    status,
    reason,
    comparisons: 0,
    distinctDays: 0,
    officialStationsUsed: [],
    physicalStationsUsed: [],
    validatedCitizenStations,
    baselineMaeC: null,
    withCitizenMaeC: null,
    improvementC: null,
    firstComparedAt: null,
    lastComparedAt: null,
  };
}

/**
 * Dérive le rapport d'impact à blanc d'une référence de favori. Les lignes lui
 * parviennent déjà chargées (stations persistées + relevés archivés) : le
 * module ne lit ni n'écrit la base et n'appelle aucun fournisseur. Le
 * résultat est déterministe : mêmes lignes en entrée, même rapport.
 */
export function deriveCitizenFusionImpactReport(input: {
  referenceLat: number;
  referenceLon: number;
  physicalStations: readonly ImpactStationRow[];
  validatedCitizens: readonly ImpactStationRow[];
  officialStations: readonly ImpactStationRow[];
  observations: readonly ImpactObservationRow[];
  asOf?: number;
}): CitizenFusionImpactReport {
  const asOf = Number.isFinite(input.asOf) ? input.asOf! : Date.now();
  const citizens = input.validatedCitizens.filter((station) =>
    CITIZEN_QUALIFICATION_SOURCES.has(station.source),
  );
  if (citizens.length === 0) {
    return emptyReport(
      input,
      "no-validated-citizens",
      "Aucun capteur citoyen validé n'est archivé pour cette référence : rien n'est évalué et aucune valeur n'est inventée.",
      input.validatedCitizens.map((station) => station.stationId),
    );
  }

  const readingsByStation = new Map<string, ImpactObservationRow[]>();
  for (const observation of input.observations) {
    readingsByStation.set(observation.stationId, [
      ...(readingsByStation.get(observation.stationId) ?? []),
      observation,
    ]);
  }

  const buildStation = (station: ImpactStationRow): ImpactPointStation => ({
    ...station,
    points: collectQualificationTemperaturePoints(
      {
        stationId: station.stationId,
        source: station.source,
        lat: station.lat,
        lon: station.lon,
        readings: readingsByStation.get(station.stationId) ?? [],
      },
      asOf,
    ),
  });

  const physicalStations = input.physicalStations.map(buildStation);
  const officialStations = input.officialStations
    .filter((station) => station.source === "meteofrance")
    .map(buildStation);
  const citizenStations = citizens.map(buildStation);

  if (physicalStations.every((station) => station.points.length === 0)) {
    return emptyReport(
      input,
      "insufficient-history",
      "Aucun relevé physique exploitable n'est archivé pour cette référence : l'erreur de la synthèse locale ne peut pas être mesurée, aucune valeur n'est inventée.",
      citizens.map((station) => station.stationId),
    );
  }

  type ImpactComparison = {
    baselineErrorC: number;
    withCitizenErrorC: number;
    utcDay: string;
    comparedAt: number;
  };

  // Les comparaisons suivent les points de température des capteurs validés :
  // une heure sans relevé citoyen ne change rien aux deux bras et n'apporte
  // aucune information d'impact.
  const candidatePoints = citizenStations
    .flatMap((station) => station.points)
    .sort((left, right) => left.epoch - right.epoch);
  const comparisons: ImpactComparison[] = [];
  const officialStationsUsed = new Set<string>();
  const physicalStationsUsed = new Set<string>();
  const citizenStationsUsed = new Set<string>();

  for (const point of candidatePoints) {
    const bucket = Math.floor(point.epoch / HOUR_MS) * HOUR_MS;
    const latestInBucket = (station: ImpactPointStation): MeasuredPoint | null => {
      let latest: MeasuredPoint | null = null;
      for (const candidate of station.points) {
        if (candidate.epoch > point.epoch) break;
        if (Math.floor(candidate.epoch / HOUR_MS) * HOUR_MS !== bucket) continue;
        latest = candidate;
      }
      return latest;
    };

    const officialReadings = officialStations
      .map((station) => ({ station, reading: latestInBucket(station) }))
      .filter((entry): entry is { station: ImpactPointStation; reading: MeasuredPoint } => entry.reading !== null);
    // Sans deux références officielles dans la même heure, la comparaison est
    // exclue sans annuler les autres relevés.
    if (officialReadings.length < CITIZEN_FUSION_IMPACT_GATES.minimumOfficialReferencesPerComparison) continue;

    const physicalReadings = physicalStations
      .map((station) => ({ station, reading: latestInBucket(station) }))
      .filter((entry): entry is { station: ImpactPointStation; reading: MeasuredPoint } => entry.reading !== null);
    // Sans station physique dans la même heure, aucune synthèse locale à
    // comparer : la comparaison est exclue, jamais remplacée.
    if (physicalReadings.length === 0) continue;

    const citizenReadings = citizenStations
      .map((station) => ({ station, reading: latestInBucket(station) }))
      .filter((entry): entry is { station: ImpactPointStation; reading: MeasuredPoint } => entry.reading !== null);
    if (citizenReadings.length === 0) continue;

    const officialMedian = median(officialReadings.map((entry) => entry.reading.value));
    if (officialMedian === null) continue;

    // La fraîcheur se rejoue à la fin du créneau comparé : les deux bras
    // partagent le même instant d'évaluation.
    const bucketEnd = bucket + HOUR_MS;
    const toWeightedReading = (entry: { station: ImpactPointStation; reading: MeasuredPoint }) => ({
      station: entry.station,
      value: entry.reading.value,
      measuredAt: entry.reading.epoch,
    });
    const baseline = weightedTemperatureC(physicalReadings.map(toWeightedReading), bucketEnd);
    const withCitizen = weightedTemperatureC(
      [...physicalReadings, ...citizenReadings].map(toWeightedReading),
      bucketEnd,
    );
    if (baseline === null || withCitizen === null) continue;

    officialReadings.forEach((entry) => officialStationsUsed.add(entry.station.stationId));
    physicalReadings.forEach((entry) => physicalStationsUsed.add(entry.station.stationId));
    citizenReadings.forEach((entry) => citizenStationsUsed.add(entry.station.stationId));
    comparisons.push({
      baselineErrorC: Math.abs(baseline - officialMedian),
      withCitizenErrorC: Math.abs(withCitizen - officialMedian),
      utcDay: new Date(point.epoch).toISOString().slice(0, 10),
      comparedAt: point.epoch,
    });
  }

  if (comparisons.length === 0) {
    return emptyReport(
      input,
      "insufficient-history",
      "Aucune comparaison alignée : chaque relevé exige l'heure de mesure propre à la température, deux stations officielles et une station physique dans la même heure ; l'heure d'archive n'est jamais un substitut.",
      citizens.map((station) => station.stationId),
    );
  }

  const distinctDays = new Set(comparisons.map((comparison) => comparison.utcDay)).size;
  const baseEvidence = {
    comparisons: comparisons.length,
    distinctDays,
    officialStationsUsed: Array.from(officialStationsUsed).sort(),
    physicalStationsUsed: Array.from(physicalStationsUsed).sort(),
    validatedCitizenStations: Array.from(citizenStationsUsed).sort(),
    firstComparedAt: new Date(comparisons[0].comparedAt).toISOString(),
    lastComparedAt: new Date(comparisons[comparisons.length - 1].comparedAt).toISOString(),
  };

  if (comparisons.length < CITIZEN_FUSION_IMPACT_GATES.minimumComparisons) {
    return {
      ...emptyReport(input, "insufficient-history", "", baseEvidence.validatedCitizenStations),
      ...baseEvidence,
      reason: `Historique insuffisant : ${comparisons.length}/${CITIZEN_FUSION_IMPACT_GATES.minimumComparisons} comparaison(s) alignée(s) avec deux stations officielles minimum et une station physique.`,
    };
  }

  if (distinctDays < CITIZEN_FUSION_IMPACT_GATES.minimumDistinctDays) {
    return {
      ...emptyReport(input, "insufficient-history", "", baseEvidence.validatedCitizenStations),
      ...baseEvidence,
      reason: `Historique insuffisant : ${comparisons.length} comparaison(s) mais seulement ${distinctDays}/${CITIZEN_FUSION_IMPACT_GATES.minimumDistinctDays} jour(s) distinct(s) ; les jours, pas les heures, portent l'échantillon.`,
    };
  }

  const baselineMae = mean(comparisons.map((comparison) => comparison.baselineErrorC));
  const withCitizenMae = mean(comparisons.map((comparison) => comparison.withCitizenErrorC));
  if (baselineMae === null || withCitizenMae === null) {
    return {
      ...emptyReport(input, "insufficient-history", "", baseEvidence.validatedCitizenStations),
      ...baseEvidence,
      reason: "Écart moyen non mesurable : aucune comparaison exploitable, aucune valeur n'est inventée.",
    };
  }

  const improvement = baselineMae - withCitizenMae;
  const measured = {
    ...baseEvidence,
    baselineMaeC: roundC(baselineMae),
    withCitizenMaeC: roundC(withCitizenMae),
    improvementC: roundC(improvement),
  };

  if (withCitizenMae < baselineMae) {
    return {
      version: CITIZEN_FUSION_IMPACT_VERSION,
      referenceLat: input.referenceLat,
      referenceLon: input.referenceLon,
      windowDays: CITIZEN_FUSION_IMPACT_HISTORY_WINDOW_DAYS,
      status: "improves",
      reason: `Amélioration mesurée sur ${comparisons.length} comparaison(s) alignée(s) : MAE ${roundC(baselineMae)} °C pour la synthèse physique seule contre ${roundC(withCitizenMae)} °C en ajoutant le(s) capteur(s) validé(s), soit ${roundC(improvement)} °C d'écart moyen en moins face à la médiane officielle. La participation à la fusion reste une décision séparée : rien n'est activé ici.`,
      ...measured,
    };
  }

  return {
    version: CITIZEN_FUSION_IMPACT_VERSION,
    referenceLat: input.referenceLat,
    referenceLon: input.referenceLon,
    windowDays: CITIZEN_FUSION_IMPACT_HISTORY_WINDOW_DAYS,
    status: "no-improvement",
    reason: `Aucune amélioration mesurée sur ${comparisons.length} comparaison(s) alignée(s) : MAE ${roundC(baselineMae)} °C pour la synthèse physique seule contre ${roundC(withCitizenMae)} °C en ajoutant le(s) capteur(s) validé(s). Les capteurs validés restent hors de la fusion locale.`,
    ...measured,
  };
}
