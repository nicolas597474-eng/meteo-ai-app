/**
 * Chargement en lecture de la preuve de qualification des capteurs citoyens.
 *
 * Ce module orchestre les lectures de base puis délègue le calcul à
 * `buildCitizenQualificationEvidence`, qui réutilise l'évaluateur lui-même. Il
 * n'écrit jamais : consulter la progression d'un capteur ne peut pas le promouvoir.
 *
 * Les entrées sont volontairement identiques à celles du chemin planifié
 * (`evaluateOpenSenseMapQualifications`) — même fenêtre d'historique, mêmes
 * témoins officiels, même `asOf` — afin que la progression affichée soit
 * exactement celle sur laquelle le verdict sera posé.
 */

import {
  getCitizenStationsForQualification,
  getStationObservationsForQualification,
  getValidatedOfficialStationsNearReference,
} from "./db";
import {
  buildCitizenQualificationEvidence,
  type CitizenQualificationEvidenceEntry,
} from "./citizenQualificationEvidenceService";
import { OPEN_SENSE_MAP_QUALIFICATION_HISTORY_WINDOW_DAYS } from "./openSenseMapQualificationApplier";

export type CitizenQualificationEvidenceReadModel = {
  /** Preuve par capteur citoyen, dans l'ordre d'évaluation (déterministe). */
  entries: CitizenQualificationEvidenceEntry[];
  /** Fenêtre d'historique réellement parcourue, en jours. */
  historyWindowDays: number;
  /** Instant de référence de l'évaluation, en ms depuis l'époque Unix. */
  asOf: number;
};

/**
 * Lit la preuve de qualification des capteurs citoyens archivés pour la
 * référence demandée, tous statuts confondus. Une base indisponible retourne un
 * modèle vide plutôt qu'une erreur : aucune progression n'est inventée.
 */
export async function loadCitizenQualificationEvidence(
  refLat: number,
  refLon: number,
  nowMs: number = Date.now(),
): Promise<CitizenQualificationEvidenceReadModel> {
  const empty: CitizenQualificationEvidenceReadModel = {
    entries: [],
    historyWindowDays: OPEN_SENSE_MAP_QUALIFICATION_HISTORY_WINDOW_DAYS,
    asOf: nowMs,
  };
  if (!Number.isFinite(refLat) || !Number.isFinite(refLon)) return empty;

  const candidates = await getCitizenStationsForQualification(refLat, refLon);
  if (candidates.length === 0) return empty;

  // Les stations officielles se lisent par référence de favori : le désaccord
  // qui mesure la borne d'acceptation est local, jamais régional.
  const officialStations = (
    await Promise.all(
      Array.from(new Set(candidates.map((candidate) => `${candidate.refLat}:${candidate.refLon}`)))
        .map((referenceKey) => {
          const [lat, lon] = referenceKey.split(":").map(Number);
          return getValidatedOfficialStationsNearReference(lat, lon);
        }),
    )
  ).flat();

  const sinceMs = nowMs - OPEN_SENSE_MAP_QUALIFICATION_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const observations = await getStationObservationsForQualification(
    [
      ...candidates.map((candidate) => candidate.stationId),
      ...officialStations.map((station) => station.stationId),
    ],
    sinceMs,
  );

  return {
    entries: buildCitizenQualificationEvidence({
      candidates,
      officialStations,
      observations,
      asOf: nowMs,
    }),
    historyWindowDays: OPEN_SENSE_MAP_QUALIFICATION_HISTORY_WINDOW_DAYS,
    asOf: nowMs,
  };
}
