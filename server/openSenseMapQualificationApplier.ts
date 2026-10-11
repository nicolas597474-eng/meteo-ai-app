/**
 * Application des verdicts de qualification openSenseMap — pont pur entre les
 * archives persistées (weather_stations, station_observations) et
 * l'évaluateur opensensemap-qualification-v1.
 *
 * Philosophie du dépôt, appliquée intégralement :
 * - ce module ne lit ni n'écrit la base et n'appelle aucun fournisseur : les
 *   lignes lui parviennent déjà chargées, les verdicts repartent purs ;
 * - un verdict ne s'applique qu'aux statuts définitifs : un capteur toujours
 *   candidat n'est jamais écrit, son historique continue de s'accumuler ;
 * - la référence officielle se mesure près du favori d'archivage : une station
 *   officielle persistée pour une autre référence n'est jamais témoin d'un
 *   capteur, aussi proche soit-elle en apparence.
 *
 * La preuve chiffrée (MAE, biais, bornes) n'est pas stockée en colonne :
 * l'évaluateur est déterministe et versionné, elle se recalcule à l'identique
 * depuis l'historique archivé, qui demeure la source de vérité. Seule la raison
 * d'exclusion est persistée, tronquée à la longueur de sa colonne.
 */

import type { StationMeasurementTimes } from "./stationMeasurementFreshness";
import {
  deriveOpenSenseMapQualificationProfile,
  type OpenSenseMapQualificationProfile,
  type QualificationStation,
} from "./openSenseMapQualificationService";

/** Fenêtre d'historique évaluée, alignée sur celle des profils de qualité. */
export const OPEN_SENSE_MAP_QUALIFICATION_HISTORY_WINDOW_DAYS = 30;
/** Longueur maximale de la colonne weather_stations.exclusionReason. */
export const WEATHER_STATION_EXCLUSION_REASON_MAX_LENGTH = 256;
/** Tolérance d'identification de la référence d'archivage (lat/lon de favori). */
export const OPEN_SENSE_MAP_REFERENCE_TOLERANCE = 0.0001;

export type QualificationStationRow = {
  stationId: string;
  source: string;
  lat: number;
  lon: number;
  refLat: number;
  refLon: number;
};

export type QualificationObservationRow = {
  stationId: string;
  /** Heure d'archive de la collecte ; jamais un substitut d'heure de mesure. */
  observedAt: number;
  temperature: number | null;
  measurementTimes: StationMeasurementTimes | null;
};

export type OpenSenseMapQualificationVerdictUpdate = {
  stationId: string;
  qualificationStatus: "validated" | "excluded";
  isActive: number;
  exclusionReason: string | null;
};

export type OpenSenseMapVerdictEvaluation = {
  profiles: OpenSenseMapQualificationProfile[];
  verdicts: OpenSenseMapQualificationVerdictUpdate[];
};

function isSameQualificationReference(
  candidate: QualificationStationRow,
  official: QualificationStationRow,
): boolean {
  return Math.abs(candidate.refLat - official.refLat) <= OPEN_SENSE_MAP_REFERENCE_TOLERANCE
    && Math.abs(candidate.refLon - official.refLon) <= OPEN_SENSE_MAP_REFERENCE_TOLERANCE;
}

export function groupQualificationObservationsByStation(
  observations: readonly QualificationObservationRow[],
): Map<string, QualificationObservationRow[]> {
  const byStation = new Map<string, QualificationObservationRow[]>();
  for (const observation of observations) {
    byStation.set(observation.stationId, [...(byStation.get(observation.stationId) ?? []), observation]);
  }
  return byStation;
}

export function buildQualificationStation(
  station: QualificationStationRow,
  readings: readonly QualificationObservationRow[],
): QualificationStation {
  return {
    stationId: station.stationId,
    source: station.source,
    lat: station.lat,
    lon: station.lon,
    // L'heure d'archive (observedAt) transite telle quelle : l'évaluateur
    // n'aligne que les heures de mesure propres à la température et n'utilise
    // jamais l'heure d'archive comme substitut.
    readings: readings.map((reading) => ({
      observedAt: reading.observedAt,
      measurementTimes: reading.measurementTimes,
      temperature: reading.temperature,
    })),
  };
}

/**
 * Convertit un profil d'évaluateur en verdict persistable. Un statut candidat
 * ne produit aucun verdict : le capteur demeure en validation sans écriture.
 * Un capteur validé devient actif comme preuve qualifiée ; la participation
 * des capteurs citoyens à la fusion reste une décision séparée, revue
 * explicitement, jamais implicite.
 */
export function toPersistedOpenSenseMapVerdict(
  profile: OpenSenseMapQualificationProfile,
): OpenSenseMapQualificationVerdictUpdate | null {
  if (profile.status === "validated") {
    return {
      stationId: profile.stationId,
      qualificationStatus: "validated",
      isActive: 1,
      exclusionReason: null,
    };
  }
  if (profile.status === "excluded") {
    return {
      stationId: profile.stationId,
      qualificationStatus: "excluded",
      isActive: 0,
      exclusionReason: profile.reason.slice(0, WEATHER_STATION_EXCLUSION_REASON_MAX_LENGTH),
    };
  }
  return null;
}

/**
 * Déroute chaque capteur citoyen openSenseMap encore candidat vers
 * l'évaluateur, avec les stations officielles persistées pour sa propre
 * référence d'archivage, puis convertit les statuts définitifs en verdicts.
 * Le résultat est déterministe : mêmes lignes en entrée, mêmes verdicts.
 */
export function deriveOpenSenseMapVerdicts(input: {
  candidates: readonly QualificationStationRow[];
  officialStations: readonly QualificationStationRow[];
  observations: readonly QualificationObservationRow[];
  asOf?: number;
}): OpenSenseMapVerdictEvaluation {
  const readingsByStation = groupQualificationObservationsByStation(input.observations);
  const profiles: OpenSenseMapQualificationProfile[] = [];
  const verdicts: OpenSenseMapQualificationVerdictUpdate[] = [];

  for (const candidate of input.candidates) {
    // Seul un capteur openSenseMap est éligible ; une autre source persistée
    // n'est jamais évaluée ni réécrite par ce chemin.
    if (candidate.source !== "opensensemap") continue;
    const officialStations = input.officialStations
      .filter((official) => official.source === "meteofrance" && isSameQualificationReference(candidate, official))
      .map((official) => buildQualificationStation(official, readingsByStation.get(official.stationId) ?? []));
    const profile = deriveOpenSenseMapQualificationProfile({
      candidate: buildQualificationStation(candidate, readingsByStation.get(candidate.stationId) ?? []),
      officialStations,
      asOf: input.asOf,
    });
    profiles.push(profile);
    const verdict = toPersistedOpenSenseMapVerdict(profile);
    if (verdict) verdicts.push(verdict);
  }
  return { profiles, verdicts };
}
