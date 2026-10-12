/**
 * Qualification multi-variables des capteurs citoyens openSenseMap et CWOP —
 * citizen-variable-qualification-v1 : humidité, pression, vitesse du vent.
 *
 * Philosophie du dépôt, appliquée intégralement :
 * - aucune donnée n'est fabriquée : chaque comparaison exige l'heure de mesure
 *   propre à la grandeur évaluée, fournie par le capteur ET par les stations
 *   officielles ; l'heure d'archive (observedAt) n'est jamais un substitut ;
 * - les exclusions n'annulent pas : un relevé sans heure de mesure, futur,
 *   sans valeur finie ou sans double référence officielle est écarté sans
 *   invalider les comparaisons restantes du même capteur ;
 * - la borne d'acceptation se mesure, elle ne se décrète pas : elle dérive du
 *   désaccord réel entre les stations officielles de la même heure, bornée de
 *   façon conservatrice par grandeur.
 *
 * La température (citizen-qualification-v2) demeure l'autorité de la
 * participation à la fusion : ce module ne réécrit jamais le statut des
 * stations physiques ni des capteurs, ses verdicts sont des preuves
 * additives par grandeur, destinées à la lecture, jamais à une activation
 * implicite.
 *
 * Ce module est pur et déterministe : il ne lit ni n'écrit la base et
 * n'appelle aucun fournisseur. Les portes structurelles et l'alignement
 * horaire sont partagés avec l'évaluateur de température, jamais
 * réimplémentés : un seul seuil, une seule mesure.
 */

import {
  CITIZEN_QUALIFICATION_SOURCES,
  OPEN_SENSE_MAP_QUALIFICATION_GATES,
  buildVariableComparisons,
  type OpenSenseMapQualificationStatus,
  type QualificationStation,
} from "./openSenseMapQualificationService";
import {
  OPEN_SENSE_MAP_REFERENCE_TOLERANCE,
  buildQualificationStation,
  groupQualificationObservationsByStation,
  type QualificationObservationRow,
  type QualificationStationRow,
} from "./openSenseMapQualificationApplier";

/** Version du jeu de règles multi-variables. */
export const CITIZEN_VARIABLE_QUALIFICATION_VERSION = "citizen-variable-qualification-v1" as const;
/** Longueur maximale de la colonne citizen_variable_qualifications.reason. */
export const CITIZEN_VARIABLE_QUALIFICATION_REASON_MAX_LENGTH = 512;
/** Grandeurs évaluées au-delà de la température ; la température reste l'autorité de la fusion. */
export const CITIZEN_QUALIFIED_VARIABLES = ["humidity", "pressure", "windSpeed"] as const;
export type CitizenQualifiedVariable = (typeof CITIZEN_QUALIFIED_VARIABLES)[number];

/** Libellé français de chaque grandeur dans les motifs de verdict. */
const CITIZEN_VARIABLE_LABELS: Record<CitizenQualifiedVariable, string> = {
  humidity: "l'humidité",
  pressure: "la pression",
  windSpeed: "la vitesse du vent",
};

/**
 * Bornes d'acceptation mesurées par grandeur : borne = 2 × désaccord officiel
 * moyen + marge, bornée de façon conservatrice, et plancher du MAD pour que
 * l'élagage robuste ne décrète pas d'aberrance sur un désaccord nul. Les
 * valeurs proviennent des écarts typiques des réseaux SYNOP par grandeur.
 */
export const CITIZEN_VARIABLE_ACCEPTANCE_BOUNDS: Record<
  CitizenQualifiedVariable,
  { unit: string; additive: number; min: number; max: number; madFloor: number }
> = {
  humidity: { unit: "%", additive: 5, min: 5, max: 20, madFloor: 1 },
  pressure: { unit: "hPa", additive: 0.5, min: 1, max: 3, madFloor: 0.1 },
  windSpeed: { unit: "km/h", additive: 3, min: 3, max: 15, madFloor: 1 },
};

export type CitizenVariableQualificationEvidence = {
  comparisons: number;
  retainedComparisons: number;
  outlierComparisons: number;
  distinctDays: number;
  officialStationsUsed: string[];
  meanOfficialDisagreement: number | null;
  acceptanceBound: number | null;
  meanAbsoluteError: number | null;
  meanBias: number | null;
  firstComparedAt: string | null;
  lastComparedAt: string | null;
};

export type CitizenVariableQualificationProfile = {
  version: typeof CITIZEN_VARIABLE_QUALIFICATION_VERSION;
  stationId: string;
  variable: CitizenQualifiedVariable;
  status: OpenSenseMapQualificationStatus;
  reason: string;
  evidence: CitizenVariableQualificationEvidence;
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

function roundValue(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function emptyVariableEvidence(): CitizenVariableQualificationEvidence {
  return {
    comparisons: 0,
    retainedComparisons: 0,
    outlierComparisons: 0,
    distinctDays: 0,
    officialStationsUsed: [],
    meanOfficialDisagreement: null,
    acceptanceBound: null,
    meanAbsoluteError: null,
    meanBias: null,
    firstComparedAt: null,
    lastComparedAt: null,
  };
}

function buildVariableProfile(
  stationId: string,
  variable: CitizenQualifiedVariable,
  status: OpenSenseMapQualificationStatus,
  reason: string,
  evidence: CitizenVariableQualificationEvidence,
): CitizenVariableQualificationProfile {
  return { version: CITIZEN_VARIABLE_QUALIFICATION_VERSION, stationId, variable, status, reason, evidence };
}

/**
 * Dérive le profil de qualification d'une grandeur d'un capteur citoyen à
 * partir de son historique et de celui des stations officielles SYNOP. Le
 * flux de portes est exactement celui de la température : mêmes comparaisons
 * minimum, mêmes jours distincts, même élagage robuste — seuls l'unité et
 * les bornes d'acceptation changent, mesurés par grandeur.
 */
export function deriveCitizenVariableQualificationProfile(input: {
  candidate: QualificationStation;
  officialStations: readonly QualificationStation[];
  variable: CitizenQualifiedVariable;
  asOf?: number;
}): CitizenVariableQualificationProfile {
  const asOf = Number.isFinite(input.asOf) ? input.asOf! : Date.now();
  const { candidate, variable } = input;
  const bound = CITIZEN_VARIABLE_ACCEPTANCE_BOUNDS[variable];

  const comparisons = buildVariableComparisons(candidate, input.officialStations, asOf, variable);
  const officialStationsUsed = new Set(comparisons.flatMap((comparison) => comparison.officialStationIds));

  if (comparisons.length === 0) {
    return buildVariableProfile(
      candidate.stationId,
      variable,
      "candidate",
      `Aucune comparaison alignée : chaque relevé exige l'heure de mesure propre à ${CITIZEN_VARIABLE_LABELS[variable]} et deux stations officielles dans la même heure ; l'heure d'archive n'est pas un substitut.`,
      emptyVariableEvidence(),
    );
  }

  const distinctDays = new Set(comparisons.map((comparison) => comparison.utcDay)).size;
  const baseEvidence: CitizenVariableQualificationEvidence = {
    comparisons: comparisons.length,
    retainedComparisons: comparisons.length,
    outlierComparisons: 0,
    distinctDays,
    officialStationsUsed: Array.from(officialStationsUsed).sort(),
    meanOfficialDisagreement: null,
    acceptanceBound: null,
    meanAbsoluteError: null,
    meanBias: null,
    firstComparedAt: new Date(comparisons[0].comparedAt).toISOString(),
    lastComparedAt: new Date(comparisons[comparisons.length - 1].comparedAt).toISOString(),
  };

  if (comparisons.length < OPEN_SENSE_MAP_QUALIFICATION_GATES.minimumComparisons) {
    return buildVariableProfile(
      candidate.stationId,
      variable,
      "candidate",
      `Historique insuffisant : ${comparisons.length}/${OPEN_SENSE_MAP_QUALIFICATION_GATES.minimumComparisons} comparaison(s) alignée(s) avec deux stations officielles minimum.`,
      baseEvidence,
    );
  }

  if (distinctDays < OPEN_SENSE_MAP_QUALIFICATION_GATES.minimumDistinctDays) {
    return buildVariableProfile(
      candidate.stationId,
      variable,
      "candidate",
      `Historique insuffisant : ${comparisons.length} comparaison(s) mais seulement ${distinctDays}/${OPEN_SENSE_MAP_QUALIFICATION_GATES.minimumDistinctDays} jour(s) distinct(s) ; les jours, pas les heures, portent l'échantillon.`,
      baseEvidence,
    );
  }

  const medianError = median(comparisons.map((comparison) => comparison.error)) ?? 0;
  const medianAbsoluteDeviation = median(comparisons.map((comparison) => Math.abs(comparison.error - medianError))) ?? 0;
  const robustThreshold = OPEN_SENSE_MAP_QUALIFICATION_GATES.robustOutlierFactor
    * Math.max(medianAbsoluteDeviation, bound.madFloor);
  const retained = comparisons.filter((comparison) => Math.abs(comparison.error - medianError) <= robustThreshold);
  const outliers = comparisons.filter((comparison) => Math.abs(comparison.error - medianError) > robustThreshold);
  const meanOfficialDisagreement = mean(comparisons.map((comparison) => comparison.officialDisagreement)) ?? 0;
  const acceptanceBound = Math.min(
    bound.max,
    Math.max(bound.min, OPEN_SENSE_MAP_QUALIFICATION_GATES.acceptanceReferenceFactor * meanOfficialDisagreement + bound.additive),
  );
  const robustEvidence: CitizenVariableQualificationEvidence = {
    ...baseEvidence,
    retainedComparisons: retained.length,
    outlierComparisons: outliers.length,
    meanOfficialDisagreement: roundValue(meanOfficialDisagreement),
    acceptanceBound: roundValue(acceptanceBound),
  };

  const outlierShare = outliers.length / comparisons.length;
  if (outlierShare > OPEN_SENSE_MAP_QUALIFICATION_GATES.maximumOutlierShare) {
    return buildVariableProfile(
      candidate.stationId,
      variable,
      "excluded",
      `Divergences répétées : ${outliers.length}/${comparisons.length} comparaison(s) s'écartent de la médiane au-delà de 3,5 × l'écart absolu médian.`,
      robustEvidence,
    );
  }

  const meanAbsoluteError = mean(retained.map((comparison) => Math.abs(comparison.error))) ?? 0;
  const meanBias = mean(retained.map((comparison) => comparison.error)) ?? 0;
  const measuredEvidence: CitizenVariableQualificationEvidence = {
    ...robustEvidence,
    meanAbsoluteError: roundValue(meanAbsoluteError),
    meanBias: roundValue(meanBias),
  };

  if (meanAbsoluteError > acceptanceBound) {
    return buildVariableProfile(
      candidate.stationId,
      variable,
      "excluded",
      `Erreur trop grande : MAE ${roundValue(meanAbsoluteError)} ${bound.unit} au-delà de la borne d'acceptation ${roundValue(acceptanceBound)} ${bound.unit}, dérivée du désaccord officiel mesuré (${roundValue(meanOfficialDisagreement)} ${bound.unit}).`,
      measuredEvidence,
    );
  }

  return buildVariableProfile(
    candidate.stationId,
    variable,
    "validated",
    `Grandeur qualifiée sur ${retained.length}/${comparisons.length} comparaison(s) : MAE ${roundValue(meanAbsoluteError)} ${bound.unit}, biais ${roundValue(meanBias)} ${bound.unit}, désaccord officiel moyen ${roundValue(meanOfficialDisagreement)} ${bound.unit}, borne d'acceptation ${roundValue(acceptanceBound)} ${bound.unit}. Les comparaisons sans double référence officielle et les valeurs aberrantes sont exclues sans annuler la qualification.`,
    measuredEvidence,
  );
}

function isSameVariableQualificationReference(
  candidate: QualificationStationRow,
  official: QualificationStationRow,
): boolean {
  return Math.abs(candidate.refLat - official.refLat) <= OPEN_SENSE_MAP_REFERENCE_TOLERANCE
    && Math.abs(candidate.refLon - official.refLon) <= OPEN_SENSE_MAP_REFERENCE_TOLERANCE;
}

/**
 * Déroute chaque capteur citoyen openSenseMap ou CWOP vers l'évaluateur
 * multi-variables, avec les stations officielles persistées pour sa propre
 * référence d'archivage : un profil par capteur et par grandeur. Seules les
 * sources citoyennes sont évaluées ; les stations officielles d'une autre
 * référence ne sont jamais témoins. Le résultat est déterministe : mêmes
 * lignes en entrée, mêmes profils.
 */
export function deriveCitizenVariableQualifications(input: {
  candidates: readonly QualificationStationRow[];
  officialStations: readonly QualificationStationRow[];
  observations: readonly QualificationObservationRow[];
  asOf?: number;
}): CitizenVariableQualificationProfile[] {
  const asOf = Number.isFinite(input.asOf) ? input.asOf! : Date.now();
  const readingsByStation = groupQualificationObservationsByStation(input.observations);
  const profiles: CitizenVariableQualificationProfile[] = [];

  for (const candidate of input.candidates) {
    // Seuls les capteurs citoyens (openSenseMap, CWOP) sont éligibles ; toute
    // autre source persistée n'est jamais évaluée par ce chemin.
    if (!CITIZEN_QUALIFICATION_SOURCES.has(candidate.source)) continue;
    const officialStations = input.officialStations
      .filter((official) => official.source === "meteofrance" && isSameVariableQualificationReference(candidate, official))
      .map((official) => buildQualificationStation(official, readingsByStation.get(official.stationId) ?? []));
    const candidateStation = buildQualificationStation(candidate, readingsByStation.get(candidate.stationId) ?? []);
    for (const variable of CITIZEN_QUALIFIED_VARIABLES) {
      profiles.push(deriveCitizenVariableQualificationProfile({
        candidate: candidateStation,
        officialStations,
        variable,
        asOf,
      }));
    }
  }
  return profiles;
}
