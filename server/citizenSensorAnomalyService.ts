/**
 * Détection d'anomalies aiguës des capteurs citoyens validés dans la synthèse
 * de température locale — plan d'intégration openSenseMap/CWOP, bloc 6.
 *
 * Ce module dérive, pour chaque capteur citoyen porteur du verdict persisté
 * « validated », un signal d'anomalie fondé sur la comparaison de son
 * comportement récent à sa propre preuve historique mesurée. Une anomalie
 * n'est jamais une opinion : le capteur doit s'écarter, dans la fenêtre
 * récente, au-delà de la plus stricte de deux bornes mesurées — la borne
 * d'acceptation locale de sa référence, et le double de son erreur
 * habituelle augmenté d'une marge.
 *
 * Philosophie du dépôt, appliquée intégralement :
 * - aucune donnée n'est fabriquée : les comparaisons proviennent du même
 *   alignement horaire que la qualification (heure de mesure propre à la
 *   température, double référence officielle, médiane des témoins) ;
 * - la preuve qui accuse est aussi forte que la preuve qui valide : 7
 *   comparaisons minimum sur 3 jours distincts dans la fenêtre récente, les
 *   mêmes seuils que les portes de qualification. Une preuve insuffisante
 *   n'accuse jamais, et elle n'acquitte pas non plus : la décision précédente
 *   demeure jusqu'à nouvelle preuve mesurée ;
 * - le verdict persisté reste l'autorité de participation : une anomalie
 *   n'écrit jamais le statut de qualification, elle suspend temporairement la
 *   participation live jusqu'à nouvelle preuve ;
 * - le biais signé reste un diagnostic archivé : le décalage de biais est
 *   mesuré et conservé, mais c'est la dispersion (MAE récent) qui porte le
 *   signal, car l'erreur absolue moyenne majore toujours le biais ;
 * - le module ne lit ni n'écrit la base et n'appelle aucun fournisseur : la
 *   persistance appartient au cycle planifié, la composition au chemin live.
 */

import type {
  OpenSenseMapQualificationEvidence,
  OpenSenseMapQualificationStatus,
  QualificationComparison,
} from "./openSenseMapQualificationService";

/** Version du jeu de règles de détection d'anomalies. */
export const CITIZEN_ANOMALY_DETECTION_VERSION = "citizen-anomaly-detection-v1" as const;

/** Fenêtre récente examinée, en jours : une anomalie aiguë se mesure sur quelques jours, pas sur le mois entier. */
export const CITIZEN_ANOMALY_RECENT_WINDOW_DAYS = 3;

/** Comparaisons récentes minimum : la preuve qui accuse est aussi forte que celle qui valide. */
export const CITIZEN_ANOMALY_MIN_RECENT_COMPARISONS = 7;

/** Jours distincts minimum dans la fenêtre récente ; les jours, pas les heures, portent l'échantillon. */
export const CITIZEN_ANOMALY_MIN_RECENT_DISTINCT_DAYS = 3;

/** L'erreur récente doit dépasser un multiple de l'erreur habituelle du capteur… */
export const CITIZEN_ANOMALY_MAE_SPIKE_FACTOR = 2;

/** …augmenté d'une marge : une dérive aiguë se distingue d'une variation d'échantillonnage. */
export const CITIZEN_ANOMALY_MAE_SPIKE_MARGIN_C = 0.5;

/** Plancher de l'erreur habituelle dans la borne : un capteur très précis ne voit pas sa borne tomber à zéro. */
export const CITIZEN_ANOMALY_BASELINE_MAE_FLOOR_C = 0.5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Entrée d'évaluation d'un capteur : sa preuve de qualification et l'intégralité de ses comparaisons alignées. */
export type CitizenSensorAnomalyEntry = {
  stationId: string;
  status: OpenSenseMapQualificationStatus;
  /** Preuve de qualification mesurée sur la fenêtre d'historique complète. */
  baseline: OpenSenseMapQualificationEvidence;
  /** Toutes les comparaisons alignées de la fenêtre d'historique ; le module extrait lui-même la fenêtre récente. */
  comparisons: readonly QualificationComparison[];
};

/** Statut mesuré du capteur dans la fenêtre récente. */
export type CitizenSensorAnomalyStatus = "nominal" | "anomaly" | "unproven";

/** Signal d'anomalie dérivé d'un capteur validé, prêt à être archivé. */
export type DerivedCitizenSensorAnomaly = {
  stationId: string;
  status: CitizenSensorAnomalyStatus;
  reason: string;
  /** MAE récent face à la médiane officielle, sur la fenêtre récente. */
  recentMaeC: number | null;
  /** Biais signé récent — diagnostic archivé, jamais appliqué au signal. */
  recentBiasC: number | null;
  /** Décalage du biais récent par rapport au biais de référence — diagnostic archivé, jamais appliqué au signal. */
  biasShiftC: number | null;
  recentComparisons: number;
  recentDistinctDays: number;
  recentMeanOfficialDisagreementC: number | null;
  /** MAE de référence mesuré sur la fenêtre d'historique complète. */
  baselineMaeC: number | null;
  baselineAcceptanceBoundC: number | null;
  /** Borne effectivement appliquée : la plus stricte de la borne d'acceptation locale et du multiple de l'erreur habituelle augmenté d'une marge. */
  anomalyThresholdC: number | null;
  firstComparedAt: string | null;
  lastComparedAt: string | null;
};

/** Ensemble déterministe des signaux d'anomalie d'une référence de favori. */
export type CitizenSensorAnomalySet = {
  version: typeof CITIZEN_ANOMALY_DETECTION_VERSION;
  baselineWindowDays: number;
  recentWindowDays: number;
  evaluatedAt: number;
  anomalies: DerivedCitizenSensorAnomaly[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function roundC(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Dérive le signal d'anomalie de chaque capteur validé à partir de sa preuve
 * mesurée et de ses comparaisons alignées. Le résultat est déterministe :
 * mêmes entrées, mêmes signaux. Seuls les capteurs porteurs du statut
 * « validated » sont évalués — le verdict persisté reste l'autorité de
 * participation, ce module n'en décide jamais. L'ordre d'entrée est conservé :
 * l'archivage demeure déterministe.
 */
export function deriveCitizenSensorAnomalies(input: {
  entries: readonly CitizenSensorAnomalyEntry[];
  baselineWindowDays: number;
  recentWindowDays: number;
  evaluatedAt: number;
}): CitizenSensorAnomalySet {
  const recentSinceMs = input.evaluatedAt - input.recentWindowDays * DAY_MS;
  const anomalies: DerivedCitizenSensorAnomaly[] = [];
  for (const entry of input.entries) {
    if (entry.status !== "validated") continue;

    const recent = entry.comparisons.filter((comparison) => comparison.comparedAt >= recentSinceMs);
    const recentDistinctDays = new Set(recent.map((comparison) => comparison.utcDay)).size;
    const recentMaeC = mean(recent.map((comparison) => Math.abs(comparison.error)));
    const recentBiasC = mean(recent.map((comparison) => comparison.error));
    const recentMeanOfficialDisagreementC = mean(recent.map((comparison) => comparison.officialDisagreement));

    const baselineMaeC = entry.baseline.meanAbsoluteErrorC;
    const baselineBiasC = entry.baseline.meanBiasC;
    const baselineAcceptanceBoundC = entry.baseline.acceptanceBoundC;
    const measurableEnvelope = isFiniteNumber(baselineMaeC) && isFiniteNumber(baselineAcceptanceBoundC);
    const anomalyThresholdC = measurableEnvelope
      ? Math.max(
        baselineAcceptanceBoundC,
        CITIZEN_ANOMALY_MAE_SPIKE_FACTOR * Math.max(baselineMaeC, CITIZEN_ANOMALY_BASELINE_MAE_FLOOR_C)
          + CITIZEN_ANOMALY_MAE_SPIKE_MARGIN_C,
      )
      : null;
    const biasShiftC = isFiniteNumber(recentBiasC) && isFiniteNumber(baselineBiasC)
      ? roundC(recentBiasC - baselineBiasC)
      : null;

    const roundedRecentMaeC = isFiniteNumber(recentMaeC) ? roundC(recentMaeC) : null;
    const roundedRecentBiasC = isFiniteNumber(recentBiasC) ? roundC(recentBiasC) : null;
    const roundedRecentDisagreement = isFiniteNumber(recentMeanOfficialDisagreementC)
      ? roundC(recentMeanOfficialDisagreementC)
      : null;

    let status: CitizenSensorAnomalyStatus;
    let reason: string;
    if (recent.length < CITIZEN_ANOMALY_MIN_RECENT_COMPARISONS
      || recentDistinctDays < CITIZEN_ANOMALY_MIN_RECENT_DISTINCT_DAYS) {
      status = "unproven";
      reason = `Preuve récente insuffisante : ${recent.length}/${CITIZEN_ANOMALY_MIN_RECENT_COMPARISONS} comparaison(s) alignée(s) sur ${recentDistinctDays}/${CITIZEN_ANOMALY_MIN_RECENT_DISTINCT_DAYS} jour(s) distinct(s) dans la fenêtre récente de ${input.recentWindowDays} jour(s) ; aucune anomalie n'est décrétée sans mesure, et la décision précédente demeure.`;
    } else if (!measurableEnvelope || roundedRecentMaeC == null) {
      status = "unproven";
      reason = "Enveloppe de référence non mesurable : la borne d'anomalie exige un MAE et une borne d'acceptation mesurés sur la fenêtre d'historique ; aucune anomalie n'est décrétée sans mesure.";
    } else if (roundedRecentMaeC > anomalyThresholdC) {
      status = "anomaly";
      reason = `Anomalie aiguë mesurée : MAE récent ${roundedRecentMaeC} °C au-delà de la borne ${roundC(anomalyThresholdC)} °C — la plus stricte de la borne d'acceptation locale (${roundC(baselineAcceptanceBoundC)} °C) et du double de l'erreur habituelle du capteur (${roundC(baselineMaeC)} °C) augmenté d'une marge ; le capteur est suspendu de la synthèse jusqu'à nouvelle preuve mesurée, sans jamais toucher à son verdict.`;
    } else {
      status = "nominal";
      reason = `Comportement nominal : MAE récent ${roundedRecentMaeC} °C dans la borne ${roundC(anomalyThresholdC)} °C — la plus stricte de la borne d'acceptation locale (${roundC(baselineAcceptanceBoundC)} °C) et du double de l'erreur habituelle du capteur (${roundC(baselineMaeC)} °C) augmenté d'une marge.`;
    }

    anomalies.push({
      stationId: entry.stationId,
      status,
      reason,
      recentMaeC: roundedRecentMaeC,
      recentBiasC: roundedRecentBiasC,
      biasShiftC,
      recentComparisons: recent.length,
      recentDistinctDays,
      recentMeanOfficialDisagreementC: roundedRecentDisagreement,
      baselineMaeC: isFiniteNumber(baselineMaeC) ? roundC(baselineMaeC) : null,
      baselineAcceptanceBoundC: isFiniteNumber(baselineAcceptanceBoundC) ? roundC(baselineAcceptanceBoundC) : null,
      anomalyThresholdC: anomalyThresholdC != null ? roundC(anomalyThresholdC) : null,
      firstComparedAt: recent.length > 0 ? new Date(recent[0].comparedAt).toISOString() : null,
      lastComparedAt: recent.length > 0 ? new Date(recent[recent.length - 1].comparedAt).toISOString() : null,
    });
  }
  return {
    version: CITIZEN_ANOMALY_DETECTION_VERSION,
    baselineWindowDays: input.baselineWindowDays,
    recentWindowDays: input.recentWindowDays,
    evaluatedAt: input.evaluatedAt,
    anomalies,
  };
}
