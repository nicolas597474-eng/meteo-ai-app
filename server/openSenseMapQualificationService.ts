/**
 * Qualification des capteurs citoyens openSenseMap par historique comparé aux
 * stations officielles SYNOP — opensensemap-qualification-v1.
 *
 * Philosophie du dépôt, appliquée intégralement :
 * - aucune donnée n'est fabriquée : chaque comparaison exige l'heure de mesure
 *   propre à la température, fournie par le capteur ET par les stations
 *   officielles ; l'heure d'archive (observedAt) n'est jamais un substitut ;
 * - les exclusions n'annulent pas : un relevé sans heure de mesure, futur,
 *   sans valeur finie ou sans double référence officielle est écarté sans
 *   invalider les comparaisons restantes du même capteur ;
 * - la borne d'acceptation se mesure, elle ne se décrète pas : elle dérive du
 *   désaccord réel entre les stations officielles de la même heure, bornée de
 *   façon conservatrice entre 1,0 et 3,0 °C.
 *
 * Ce module est pur et déterministe : il ne lit ni n'écrit la base et
 * n'appelle aucun fournisseur. L'application du verdict (promotion du statut
 * persisted) reste hors de son périmètre.
 */

import type { StationMeasurementTimes } from "./stationMeasurementFreshness";

export const OPEN_SENSE_MAP_QUALIFICATION_VERSION = "opensensemap-qualification-v1" as const;

/**
 * Gates de qualification. Le minimum de 7 comparaisons provient du plan
 * d'intégration openSenseMap/CWOP ; les 3 jours distincts héritent de la
 * politique du dépôt : les jours, pas les heures, portent l'échantillon.
 */
export const OPEN_SENSE_MAP_QUALIFICATION_GATES = {
  /** Comparaisons minimum avant toute activation dans la fusion (plan d'intégration). */
  minimumComparisons: 7,
  /** Jours distincts minimum ; un après-midi unique ne qualifie pas un capteur. */
  minimumDistinctDays: 3,
  /** Deux stations officielles minimum par comparaison : la référence se mesure. */
  minimumOfficialReferencesPerComparison: 2,
  /** Élagage robuste : |erreur − médiane| > 3,5 × MAD exclut la comparaison. */
  robustOutlierFactor: 3.5,
  /** Plancher du MAD : évite qu'un désaccord officiel nul rende tout écart aberrant. */
  robustMadFloorC: 0.1,
  /** Au-delà de 30 % de comparaisons aberrantes, le capteur est exclu. */
  maximumOutlierShare: 0.3,
  /** Borne d'acceptation = 2 × désaccord officiel moyen + 0,5 °C, bornée. */
  acceptanceReferenceFactor: 2,
  acceptanceAdditiveC: 0.5,
  acceptanceMinC: 1,
  acceptanceMaxC: 3,
} as const;

const HOUR_MS = 60 * 60 * 1000;

export type QualificationReading = {
  /** Heure d'archive de la collecte ; jamais un substitut d'heure de mesure. */
  observedAt?: number | Date | string | null;
  measurementTimes?: StationMeasurementTimes | null;
  temperature?: number | null;
};

export type QualificationStation = {
  stationId: string;
  source: string;
  lat: number;
  lon: number;
  readings: readonly QualificationReading[];
};

export type OpenSenseMapQualificationStatus = "candidate" | "validated" | "excluded";

export type OpenSenseMapQualificationEvidence = {
  comparisons: number;
  retainedComparisons: number;
  outlierComparisons: number;
  distinctDays: number;
  officialStationsUsed: string[];
  meanOfficialDisagreementC: number | null;
  acceptanceBoundC: number | null;
  meanAbsoluteErrorC: number | null;
  meanBiasC: number | null;
  firstComparedAt: string | null;
  lastComparedAt: string | null;
};

export type OpenSenseMapQualificationProfile = {
  version: typeof OPEN_SENSE_MAP_QUALIFICATION_VERSION;
  stationId: string;
  status: OpenSenseMapQualificationStatus;
  reason: string;
  evidence: OpenSenseMapQualificationEvidence;
};

type MeasuredPoint = { epoch: number; value: number };

type QualificationComparison = {
  error: number;
  officialDisagreement: number;
  utcDay: string;
  comparedAt: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Analyse stricte d'un horodatage de mesure : format ISO complet et
 * calendrier cohérent obligatoires. Aucun remplacement par l'heure d'archive.
 */
export function parseStrictMeasurementEpoch(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|([+-])(\d{2}):?(\d{2}))$/i.exec(value);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6] ?? 0);
  const offsetHour = Number(parts[9] ?? 0);
  const offsetMinute = Number(parts[10] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59
    || offsetHour > 23 || offsetMinute > 59) return null;
  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year, month - 1, day);
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch : null;
}

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
 * Extrait les points de température exploitables d'une station : heure de
 * mesure propre à la température, valide, non future, valeur finie. Les
 * relevés non conformes sont exclus sans annuler les autres.
 */
export function collectQualificationTemperaturePoints(
  station: QualificationStation,
  asOf: number,
): MeasuredPoint[] {
  const points = new Map<number, number>();
  for (const reading of station.readings) {
    const epoch = parseStrictMeasurementEpoch(reading.measurementTimes?.temperature);
    const value = reading.temperature;
    if (epoch === null || epoch > asOf || !isFiniteNumber(value)) continue;
    if (!points.has(epoch)) points.set(epoch, value);
  }
  return Array.from(points.entries())
    .map(([epoch, value]) => ({ epoch, value }))
    .sort((left, right) => left.epoch - right.epoch);
}

function emptyEvidence(): OpenSenseMapQualificationEvidence {
  return {
    comparisons: 0,
    retainedComparisons: 0,
    outlierComparisons: 0,
    distinctDays: 0,
    officialStationsUsed: [],
    meanOfficialDisagreementC: null,
    acceptanceBoundC: null,
    meanAbsoluteErrorC: null,
    meanBiasC: null,
    firstComparedAt: null,
    lastComparedAt: null,
  };
}

function buildProfile(
  stationId: string,
  status: OpenSenseMapQualificationStatus,
  reason: string,
  evidence: OpenSenseMapQualificationEvidence,
): OpenSenseMapQualificationProfile {
  return { version: OPEN_SENSE_MAP_QUALIFICATION_VERSION, stationId, status, reason, evidence };
}

/**
 * Dérive le profil de qualification d'un capteur openSenseMap à partir de son
 * historique et de celui des stations officielles SYNOP. Une comparaison
 * aligne le relevé du capteur sur la médiane d'au moins deux stations
 * officielles de la même heure de mesure, à condition que leurs relevés ne
 * soient pas postérieurs au moment mesuré du capteur.
 */
export function deriveOpenSenseMapQualificationProfile(input: {
  candidate: QualificationStation;
  officialStations: readonly QualificationStation[];
  asOf?: number;
}): OpenSenseMapQualificationProfile {
  const asOf = Number.isFinite(input.asOf) ? input.asOf! : Date.now();
  const { candidate } = input;

  if (candidate.source !== "opensensemap") {
    return buildProfile(
      candidate.stationId,
      "candidate",
      "Seul un capteur openSenseMap est éligible à cette qualification par comparaison SYNOP.",
      emptyEvidence(),
    );
  }

  const officialStations = input.officialStations.filter((station) => station.source === "meteofrance");
  const officialPointsByStation = officialStations.map((station) => ({
    stationId: station.stationId,
    points: collectQualificationTemperaturePoints(station, asOf),
  }));

  const candidatePoints = collectQualificationTemperaturePoints(candidate, asOf);
  const comparisons: QualificationComparison[] = [];
  const officialStationsUsed = new Set<string>();

  for (const point of candidatePoints) {
    const bucket = Math.floor(point.epoch / HOUR_MS) * HOUR_MS;
    const officialValues: Array<{ stationId: string; value: number }> = [];
    for (const { stationId, points } of officialPointsByStation) {
      let latest: MeasuredPoint | null = null;
      for (const official of points) {
        if (official.epoch > point.epoch) break;
        if (Math.floor(official.epoch / HOUR_MS) * HOUR_MS !== bucket) continue;
        latest = official;
      }
      if (latest) officialValues.push({ stationId, value: latest.value });
    }
    // Sans deux références officielles dans la même heure, la comparaison est
    // exclue sans annuler les autres relevés du capteur.
    if (officialValues.length < OPEN_SENSE_MAP_QUALIFICATION_GATES.minimumOfficialReferencesPerComparison) continue;

    const values = officialValues.map((entry) => entry.value);
    const officialMedian = median(values);
    if (officialMedian === null) continue;
    officialValues.forEach((entry) => officialStationsUsed.add(entry.stationId));
    comparisons.push({
      error: point.value - officialMedian,
      officialDisagreement: mean(values.map((value) => Math.abs(value - officialMedian))) ?? 0,
      utcDay: new Date(point.epoch).toISOString().slice(0, 10),
      comparedAt: point.epoch,
    });
  }

  if (comparisons.length === 0) {
    return buildProfile(
      candidate.stationId,
      "candidate",
      "Aucune comparaison alignée : chaque relevé exige l'heure de mesure propre à la température et deux stations officielles dans la même heure ; l'heure d'archive n'est pas un substitut.",
      emptyEvidence(),
    );
  }

  const distinctDays = new Set(comparisons.map((comparison) => comparison.utcDay)).size;
  const baseEvidence: OpenSenseMapQualificationEvidence = {
    comparisons: comparisons.length,
    retainedComparisons: comparisons.length,
    outlierComparisons: 0,
    distinctDays,
    officialStationsUsed: Array.from(officialStationsUsed).sort(),
    meanOfficialDisagreementC: null,
    acceptanceBoundC: null,
    meanAbsoluteErrorC: null,
    meanBiasC: null,
    firstComparedAt: new Date(comparisons[0].comparedAt).toISOString(),
    lastComparedAt: new Date(comparisons[comparisons.length - 1].comparedAt).toISOString(),
  };

  if (comparisons.length < OPEN_SENSE_MAP_QUALIFICATION_GATES.minimumComparisons) {
    return buildProfile(
      candidate.stationId,
      "candidate",
      `Historique insuffisant : ${comparisons.length}/${OPEN_SENSE_MAP_QUALIFICATION_GATES.minimumComparisons} comparaison(s) alignée(s) avec deux stations officielles minimum.`,
      baseEvidence,
    );
  }

  if (distinctDays < OPEN_SENSE_MAP_QUALIFICATION_GATES.minimumDistinctDays) {
    return buildProfile(
      candidate.stationId,
      "candidate",
      `Historique insuffisant : ${comparisons.length} comparaison(s) mais seulement ${distinctDays}/${OPEN_SENSE_MAP_QUALIFICATION_GATES.minimumDistinctDays} jour(s) distinct(s) ; les jours, pas les heures, portent l'échantillon.`,
      baseEvidence,
    );
  }

  const medianError = median(comparisons.map((comparison) => comparison.error)) ?? 0;
  const medianAbsoluteDeviation = median(comparisons.map((comparison) => Math.abs(comparison.error - medianError))) ?? 0;
  const robustThreshold = OPEN_SENSE_MAP_QUALIFICATION_GATES.robustOutlierFactor
    * Math.max(medianAbsoluteDeviation, OPEN_SENSE_MAP_QUALIFICATION_GATES.robustMadFloorC);
  const retained = comparisons.filter((comparison) => Math.abs(comparison.error - medianError) <= robustThreshold);
  const outliers = comparisons.filter((comparison) => Math.abs(comparison.error - medianError) > robustThreshold);
  const meanOfficialDisagreement = mean(comparisons.map((comparison) => comparison.officialDisagreement)) ?? 0;
  const acceptanceBound = Math.min(
    OPEN_SENSE_MAP_QUALIFICATION_GATES.acceptanceMaxC,
    Math.max(
      OPEN_SENSE_MAP_QUALIFICATION_GATES.acceptanceMinC,
      OPEN_SENSE_MAP_QUALIFICATION_GATES.acceptanceReferenceFactor * meanOfficialDisagreement
        + OPEN_SENSE_MAP_QUALIFICATION_GATES.acceptanceAdditiveC,
    ),
  );
  const robustEvidence: OpenSenseMapQualificationEvidence = {
    ...baseEvidence,
    retainedComparisons: retained.length,
    outlierComparisons: outliers.length,
    meanOfficialDisagreementC: roundC(meanOfficialDisagreement),
    acceptanceBoundC: roundC(acceptanceBound),
  };

  const outlierShare = outliers.length / comparisons.length;
  if (outlierShare > OPEN_SENSE_MAP_QUALIFICATION_GATES.maximumOutlierShare) {
    return buildProfile(
      candidate.stationId,
      "excluded",
      `Divergences répétées : ${outliers.length}/${comparisons.length} comparaison(s) s'écartent de la médiane au-delà de 3,5 × l'écart absolu médian.`,
      robustEvidence,
    );
  }

  const meanAbsoluteError = mean(retained.map((comparison) => Math.abs(comparison.error))) ?? 0;
  const meanBias = mean(retained.map((comparison) => comparison.error)) ?? 0;
  const measuredEvidence: OpenSenseMapQualificationEvidence = {
    ...robustEvidence,
    meanAbsoluteErrorC: roundC(meanAbsoluteError),
    meanBiasC: roundC(meanBias),
  };

  if (meanAbsoluteError > acceptanceBound) {
    return buildProfile(
      candidate.stationId,
      "excluded",
      `Erreur trop grande : MAE ${roundC(meanAbsoluteError)} °C au-delà de la borne d'acceptation ${roundC(acceptanceBound)} °C, dérivée du désaccord officiel mesuré (${roundC(meanOfficialDisagreement)} °C).`,
      measuredEvidence,
    );
  }

  return buildProfile(
    candidate.stationId,
    "validated",
    `Capteur qualifié sur ${retained.length}/${comparisons.length} comparaison(s) : MAE ${roundC(meanAbsoluteError)} °C, biais ${roundC(meanBias)} °C, désaccord officiel moyen ${roundC(meanOfficialDisagreement)} °C, borne d'acceptation ${roundC(acceptanceBound)} °C. Les comparaisons sans double référence officielle et les valeurs aberrantes sont exclues sans annuler la qualification.`,
    measuredEvidence,
  );
}
