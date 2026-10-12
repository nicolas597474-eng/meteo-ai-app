/**
 * Activation des capteurs citoyens validés dans la synthèse de température
 * locale — plan d'intégration openSenseMap/CWOP, étape « Activer la
 * qualification et la pondération seulement si les métriques historiques
 * améliorent objectivement l'erreur locale ».
 *
 * Ce module transforme le rapport d'impact à blanc (citizen-fusion-impact-v1)
 * en une décision d'activation explicite, et compose les sources de la
 * synthèse locale live selon la décision persistée. La mesure reste la source
 * de vérité : la décision n'est jamais une opinion, et la priorité technique
 * des stations n'est jamais inventée ici.
 *
 * Philosophie du dépôt, appliquée intégralement :
 * - la décision est automatique mais jamais implicite : seul un rapport
 *   « improves » active les capteurs validés ; tout autre statut mesuré les
 *   maintient hors de la synthèse, avec la raison du rapport archivée telle
 *   quelle ;
 * - la composition n'ajoute que des capteurs citoyens porteurs du verdict
 *   persisté « validated » pour la référence : un candidat encore en
 *   validation ou un capteur exclu ne rejoint jamais la synthèse, même
 *   activée ;
 * - les seuils du moteur ultra-local (fiabilité minimum, fraîcheur, écart de
 *   température) restent appliqués tels quels : activer un capteur ne lui
 *   invente aucune priorité, et un capteur sous le seuil demeure exclu avec
 *   un motif visible — cas assumé d'openSenseMap, dont la fiabilité persistée
 *   de 0 reste sous le seuil du mode local ;
 * - seul le chemin live compose ici : la vérité terrain horaire archivée
 *   reste physique uniquement, l'historique demeure la source de vérité.
 */

import type { CitizenFusionImpactReport, CitizenFusionImpactStatus } from "./citizenFusionImpactService";
import type { StationData } from "./stationService";

/** Version du jeu de règles de la décision d'activation. */
export const CITIZEN_FUSION_ACTIVATION_VERSION = "citizen-fusion-activation-v1" as const;

/** Longueur maximale de la colonne citizen_fusion_activations.reason. */
export const CITIZEN_FUSION_ACTIVATION_REASON_MAX_LENGTH = 512;

export type CitizenFusionActivationStatus = "activated" | "not-activated";

export type CitizenFusionActivationDecision = {
  version: typeof CITIZEN_FUSION_ACTIVATION_VERSION;
  referenceLat: number;
  referenceLon: number;
  status: CitizenFusionActivationStatus;
  /** Statut du rapport d'impact qui porte la décision ; archivé avec elle. */
  impactStatus: CitizenFusionImpactStatus;
  reason: string;
  windowDays: number;
  comparisons: number;
  distinctDays: number;
  baselineMaeC: number | null;
  withCitizenMaeC: number | null;
  improvementC: number | null;
  validatedCitizenStations: string[];
  firstComparedAt: string | null;
  lastComparedAt: string | null;
  evaluatedAt: number;
};

/** Décision persistée pilotant la composition de la synthèse locale live. */
export type CitizenFusionActivationSnapshot = {
  status: CitizenFusionActivationStatus;
} | null;

/** Verdict de qualification persisté d'un capteur citoyen. */
export type PersistedCitizenVerdict = {
  stationId: string;
  qualificationStatus: string | null;
};

/**
 * Dérive la décision d'activation d'une référence de favori à partir de son
 * rapport d'impact mesuré. La décision est déterministe : seul un rapport
 * « improves » active les capteurs validés ; tout autre statut les maintient
 * hors de la synthèse, avec la raison mesurée du rapport reprise telle quelle.
 * Le module ne lit ni n'écrit la base et n'appelle aucun fournisseur.
 */
export function deriveCitizenFusionActivationDecision(
  report: CitizenFusionImpactReport,
  evaluatedAt = Date.now(),
): CitizenFusionActivationDecision {
  const activated = report.status === "improves";
  const reason = activated
    ? `Amélioration mesurée sur ${report.comparisons} comparaison(s) alignée(s), ${report.distinctDays} jour(s) distinct(s) : MAE ${report.baselineMaeC} °C pour la synthèse physique seule contre ${report.withCitizenMaeC} °C en ajoutant le(s) capteur(s) validé(s), soit ${report.improvementC} °C d'écart moyen en moins face à la médiane officielle. Les capteurs citoyens validés de cette référence participent à la synthèse de température locale ; la décision est réévaluée par le cycle planifié.`
    : report.reason;
  return {
    version: CITIZEN_FUSION_ACTIVATION_VERSION,
    referenceLat: report.referenceLat,
    referenceLon: report.referenceLon,
    status: activated ? "activated" : "not-activated",
    impactStatus: report.status,
    reason,
    windowDays: report.windowDays,
    comparisons: report.comparisons,
    distinctDays: report.distinctDays,
    baselineMaeC: report.baselineMaeC,
    withCitizenMaeC: report.withCitizenMaeC,
    improvementC: report.improvementC,
    validatedCitizenStations: report.validatedCitizenStations,
    firstComparedAt: report.firstComparedAt,
    lastComparedAt: report.lastComparedAt,
    evaluatedAt,
  };
}

/**
 * Compose les sources de la synthèse locale live. Sans décision « activated »
 * persistée pour la référence, la synthèse reste strictement physique. Avec
 * une décision activée, seuls les capteurs citoyens porteurs du verdict
 * persisté « validated » rejoignent la synthèse : la priorité technique de
 * chaque station reste celle de la collecte, jamais inventée ici, et les
 * seuils du moteur ultra-local continuent de s'appliquer tels quels. Un
 * capteur validé porteur d'une anomalie aiguë persistée (bloc 6) est
 * suspendu temporairement : son verdict demeure intact, seule sa
 * participation live attend une nouvelle preuve mesurée.
 */
export function composeLocalSynthesisSources(input: {
  physicalStations: readonly StationData[];
  citizenStations: readonly StationData[];
  activation: CitizenFusionActivationSnapshot;
  verdictByStationId: ReadonlyMap<string, PersistedCitizenVerdict>;
  /** Capteurs citoyens porteurs d'une anomalie aiguë persistée : suspendus de la composition live, verdict intact. */
  anomalousStationIds?: ReadonlySet<string>;
}): StationData[] {
  const physicalStations = [...input.physicalStations];
  if (input.activation?.status !== "activated") return physicalStations;
  const activatedCitizens: StationData[] = input.citizenStations
    .filter((station) => input.verdictByStationId.get(station.stationId)?.qualificationStatus === "validated")
    .filter((station) => !input.anomalousStationIds?.has(station.stationId))
    .map((station) => ({
      ...station,
      // La décision activée restaure la participation ; le verdict persisté
      // reste la preuve, et le motif live de non-participation ne s'applique plus.
      isActive: true,
      qualificationStatus: "validated" as const,
      exclusionReason: undefined,
    }));
  return [...physicalStations, ...activatedCitizens];
}
