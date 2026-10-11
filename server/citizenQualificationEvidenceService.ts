/**
 * Preuve de qualification des capteurs citoyens exposée en lecture — pont en
 * lecture seule entre l'historique archivé et l'affichage de progression
 * (Laboratoire, carte des stations).
 *
 * Philosophie du dépôt, appliquée intégralement :
 * - aucune donnée n'est fabriquée : la progression se recalcule depuis
 *   l'historique archivé, jamais depuis un compteur incrémental ;
 * - aucune écriture : ce module ne persiste rien. Le verdict persisté demeure
 *   la seule autorité de promotion, et il est posé par le chemin planifié
 *   (`evaluateOpenSenseMapQualifications`). Relire la preuve ne promeut donc
 *   jamais un capteur ;
 * - une seule source de vérité pour les seuils : la progression est dérivée de
 *   `OPEN_SENSE_MAP_QUALIFICATION_GATES`, jamais recopiée côté client ;
 * - une seule évaluation : la preuve est celle que `deriveOpenSenseMapVerdicts`
 *   calcule déjà pour appliquer les verdicts. Ce module ne réimplémente ni la
 *   sélection des témoins officiels ni les règles, il les réutilise — deux
 *   implémentations d'un même seuil finiraient par diverger.
 *
 * Pourquoi la preuve n'est pas stockée en colonne : l'évaluateur est
 * déterministe et versionné, la même entrée produit la même preuve. La
 * recalculer à la demande évite une colonne qui dériverait silencieusement du
 * jeu de règles.
 */

import {
  deriveOpenSenseMapVerdicts,
  type QualificationObservationRow,
  type QualificationStationRow,
} from "./openSenseMapQualificationApplier";
import {
  OPEN_SENSE_MAP_QUALIFICATION_GATES,
  type OpenSenseMapQualificationEvidence,
  type OpenSenseMapQualificationStatus,
} from "./openSenseMapQualificationService";

/**
 * Porte qui limite actuellement le capteur. L'ordre reproduit exactement celui
 * de l'évaluateur : les comparaisons sont testées avant les jours distincts, la
 * porte affichée est donc celle qui bloque réellement.
 */
export type CitizenQualificationGate = "comparisons" | "distinctDays" | "complete" | "excluded";

export type CitizenQualificationProgress = {
  /** Comparaisons alignées — la grandeur que la porte teste réellement. */
  comparisons: number;
  minimumComparisons: number;
  /**
   * Comparaisons encore nécessaires. Dérivé de `evidence.comparisons`, la
   * grandeur que la porte teste réellement. Aujourd'hui `retainedComparisons`
   * donnerait le même nombre : l'élagage robuste ne s'exécute qu'après les deux
   * portes de suffisance, donc un profil encore candidat n'a jamais été élagué
   * (invariant vérifié par test). Le choix de `comparisons` est défensif — il
   * reste juste si la structure de retours anticipés de l'évaluateur évolue.
   */
  remainingComparisons: number;
  distinctDays: number;
  minimumDistinctDays: number;
  remainingDistinctDays: number;
  gate: CitizenQualificationGate;
};

export type CitizenQualificationEvidenceEntry = {
  stationId: string;
  status: OpenSenseMapQualificationStatus;
  /** Motif de l'évaluateur, repris tel quel : jamais reformulé pour l'affichage. */
  reason: string;
  evidence: OpenSenseMapQualificationEvidence;
  progress: CitizenQualificationProgress;
};

function clampRemaining(required: number, observed: number): number {
  return Math.max(0, required - observed);
}

/**
 * Progression d'un capteur, dérivée de la preuve de l'évaluateur. Un capteur
 * exclu n'a plus de progression : sa porte est `excluded` et les restants
 * tombent à zéro, de sorte qu'aucun écran n'annonce une validation à venir pour
 * un capteur écarté.
 */
export function deriveCitizenQualificationProgress(
  status: OpenSenseMapQualificationStatus,
  evidence: OpenSenseMapQualificationEvidence,
): CitizenQualificationProgress {
  const minimumComparisons = OPEN_SENSE_MAP_QUALIFICATION_GATES.minimumComparisons;
  const minimumDistinctDays = OPEN_SENSE_MAP_QUALIFICATION_GATES.minimumDistinctDays;
  const excluded = status === "excluded";
  const gate: CitizenQualificationGate = excluded
    ? "excluded"
    : evidence.comparisons < minimumComparisons
      ? "comparisons"
      : evidence.distinctDays < minimumDistinctDays
        ? "distinctDays"
        : "complete";
  return {
    comparisons: evidence.comparisons,
    minimumComparisons,
    remainingComparisons: excluded ? 0 : clampRemaining(minimumComparisons, evidence.comparisons),
    distinctDays: evidence.distinctDays,
    minimumDistinctDays,
    remainingDistinctDays: excluded ? 0 : clampRemaining(minimumDistinctDays, evidence.distinctDays),
    gate,
  };
}

/**
 * Évalue en lecture les capteurs citoyens fournis et retourne leur preuve
 * chiffrée. Le résultat est déterministe : mêmes lignes en entrée, même preuve.
 * Seules les sources citoyennes éligibles sont évaluées ; toute autre source est
 * ignorée sans être réécrite ni signalée.
 */
export function buildCitizenQualificationEvidence(input: {
  candidates: readonly QualificationStationRow[];
  officialStations: readonly QualificationStationRow[];
  observations: readonly QualificationObservationRow[];
  asOf?: number;
}): CitizenQualificationEvidenceEntry[] {
  const { profiles } = deriveOpenSenseMapVerdicts(input);
  return profiles.map((profile) => ({
    stationId: profile.stationId,
    status: profile.status,
    reason: profile.reason,
    evidence: profile.evidence,
    progress: deriveCitizenQualificationProgress(profile.status, profile.evidence),
  }));
}

/**
 * Indexe les preuves par identifiant de station pour l'affichage : la carte des
 * stations et la liste du Laboratoire cherchent la preuve d'un capteur par son
 * `stationId`.
 */
export function indexCitizenQualificationEvidence(
  entries: readonly CitizenQualificationEvidenceEntry[],
): Record<string, CitizenQualificationEvidenceEntry> {
  const indexed: Record<string, CitizenQualificationEvidenceEntry> = {};
  for (const entry of entries) indexed[entry.stationId] = entry;
  return indexed;
}
