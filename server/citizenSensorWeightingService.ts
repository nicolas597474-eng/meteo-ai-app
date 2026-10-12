/**
 * Pondération adaptative des capteurs citoyens validés dans la synthèse de
 * température locale — plan d'intégration openSenseMap/CWOP, bloc 5.
 *
 * Ce module dérive, pour chaque capteur citoyen porteur du verdict persisté
 * « validated », un multiplicateur de poids spatial fondé sur sa preuve
 * historique mesurée (MAE face aux stations officielles). Il remplace
 * l'égalité de poids entre capteurs validés par une hiérarchie mesurée,
 * sans jamais inventer de priorité technique ni toucher aux stations
 * physiques.
 *
 * Philosophie du dépôt, appliquée intégralement :
 * - aucune donnée n'est fabriquée : le MAE, le biais et la taille
 *   d'échantillon viennent de la preuve recalculée par l'évaluateur
 *   versionné (citizen-qualification-v2), jamais d'un compteur incrémental ;
 * - le biais signé reste un diagnostic archivé : il n'entre jamais dans le
 *   calcul du poids, seule la dispersion (MAE) mesure la confiance ;
 * - la régularisation suit le précédent des modèles (fusionPerformance) :
 *   le MAE d'un capteur se rapproche de la médiane des capteurs validés de
 *   la même référence quand sa preuve est jeune, et s'en écarte quand les
 *   comparaisons retenues s'accumulent ;
 * - le multiplicateur est borné [0,3 ; 2] : aucun capteur citoyen ne peut
 *   ni dominer la synthèse ni y être réduit à néant, et une station absente
 *   de la map demeure au multiplicateur neutre 1 — les stations physiques
 *   ne sont donc jamais touchées ;
 * - le module ne lit ni n'écrit la base et n'appelle aucun fournisseur : la
 *   persistance appartient au cycle planifié, la composition au chemin live.
 */

import type {
  OpenSenseMapQualificationEvidence,
  OpenSenseMapQualificationStatus,
} from "./openSenseMapQualificationService";

/** Version du jeu de règles de pondération. */
export const CITIZEN_SENSOR_WEIGHTING_VERSION = "citizen-sensor-weighting-v1" as const;

/** Prior de régularisation : comparaisons retenues au-delà desquelles la preuve devient autonome. */
export const CITIZEN_SENSOR_WEIGHT_PRIOR_COMPARISONS = 30;

/** Borne basse du multiplicateur : un capteur très imprécis garde une voix, jamais zéro. */
export const CITIZEN_SENSOR_WEIGHT_MIN_MULTIPLIER = 0.3;

/** Borne haute du multiplicateur : un capteur très précis ne domine jamais la synthèse. */
export const CITIZEN_SENSOR_WEIGHT_MAX_MULTIPLIER = 2;

/** Plancher du MAE régularisé : la réciproque d'un MAE nul n'existe pas. */
export const CITIZEN_SENSOR_WEIGHT_MAE_FLOOR_C = 0.5;

export type CitizenSensorWeightEvidenceEntry = {
  stationId: string;
  status: OpenSenseMapQualificationStatus;
  evidence: OpenSenseMapQualificationEvidence;
};

/** Poids adaptatif dérivé d'un capteur validé, prêt à être archivé. */
export type DerivedCitizenSensorWeight = {
  stationId: string;
  /** Multiplicateur de poids spatial live, borné ; 1 est le neutre. */
  performanceMultiplier: number;
  meanAbsoluteErrorC: number;
  /** MAE régularisé vers la médiane des capteurs validés de la référence. */
  regularizedMaeC: number;
  /** Biais signé face aux témoins officiels — diagnostic archivé, jamais appliqué. */
  meanBiasC: number | null;
  /** Part de la preuve dans le MAE régularisé : 0 = médiane, 1 = MAE mesuré. */
  sampleReliability: number;
  comparisons: number;
  retainedComparisons: number;
  distinctDays: number;
  meanOfficialDisagreementC: number | null;
  acceptanceBoundC: number | null;
  firstComparedAt: string | null;
  lastComparedAt: string | null;
};

/** Ensemble déterministe des poids d'une référence de favori. */
export type CitizenSensorWeightSet = {
  version: typeof CITIZEN_SENSOR_WEIGHTING_VERSION;
  windowDays: number;
  evaluatedAt: number;
  weights: DerivedCitizenSensorWeight[];
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Dérive le poids de chaque capteur validé à partir de sa preuve mesurée. Le
 * résultat est déterministe : mêmes preuves en entrée, mêmes poids. Seuls
 * les capteurs porteurs d'un statut « validated » avec un MAE mesuré
 * reçoivent un poids ; tout autre capteur est ignoré sans être signalé — le
 * verdict persisté reste l'autorité de participation, ce module n'en décide
 * jamais. L'ordre d'entrée est conservé : l'archivage demeure déterministe.
 */
export function deriveCitizenSensorWeights(input: {
  entries: readonly CitizenSensorWeightEvidenceEntry[];
  windowDays: number;
  evaluatedAt: number;
}): CitizenSensorWeightSet {
  const validated = input.entries.filter((entry) => entry.status === "validated");
  const measurableMaes = validated
    .map((entry) => entry.evidence.meanAbsoluteErrorC)
    .filter((mae): mae is number => mae != null && Number.isFinite(mae));
  const baselineMaeC = measurableMaes.length > 0 ? median(measurableMaes) : null;
  const weights = validated.flatMap((entry) => {
    const meanAbsoluteErrorC = entry.evidence.meanAbsoluteErrorC;
    if (meanAbsoluteErrorC == null || !Number.isFinite(meanAbsoluteErrorC) || baselineMaeC == null) return [];
    const retainedComparisons = entry.evidence.retainedComparisons;
    const sampleReliability = retainedComparisons / (retainedComparisons + CITIZEN_SENSOR_WEIGHT_PRIOR_COMPARISONS);
    const regularizedMaeC = baselineMaeC + sampleReliability * (meanAbsoluteErrorC - baselineMaeC);
    const performanceMultiplier = Math.min(
      CITIZEN_SENSOR_WEIGHT_MAX_MULTIPLIER,
      Math.max(CITIZEN_SENSOR_WEIGHT_MIN_MULTIPLIER, 1 / Math.max(regularizedMaeC, CITIZEN_SENSOR_WEIGHT_MAE_FLOOR_C)),
    );
    return [{
      stationId: entry.stationId,
      performanceMultiplier,
      meanAbsoluteErrorC,
      regularizedMaeC,
      meanBiasC: entry.evidence.meanBiasC,
      sampleReliability,
      comparisons: entry.evidence.comparisons,
      retainedComparisons,
      distinctDays: entry.evidence.distinctDays,
      meanOfficialDisagreementC: entry.evidence.meanOfficialDisagreementC,
      acceptanceBoundC: entry.evidence.acceptanceBoundC,
      firstComparedAt: entry.evidence.firstComparedAt,
      lastComparedAt: entry.evidence.lastComparedAt,
    }];
  });
  return {
    version: CITIZEN_SENSOR_WEIGHTING_VERSION,
    windowDays: input.windowDays,
    evaluatedAt: input.evaluatedAt,
    weights,
  };
}
