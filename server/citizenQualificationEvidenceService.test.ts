import { describe, expect, it } from "vitest";
import {
  buildCitizenQualificationEvidence,
  deriveCitizenQualificationProgress,
  indexCitizenQualificationEvidence,
} from "./citizenQualificationEvidenceService";
import type { QualificationObservationRow, QualificationStationRow } from "./openSenseMapQualificationApplier";
import {
  OPEN_SENSE_MAP_QUALIFICATION_GATES,
  type OpenSenseMapQualificationStatus,
} from "./openSenseMapQualificationService";

// Fixtures explicitement marquées : données de test only, aucun appel réseau,
// aucune valeur de production.

/** Toutes les mesures précèdent cet instant : aucun relevé futur n'est évalué. */
const AS_OF = Date.parse("2026-10-04T00:00:00.000Z");

const REF_LAT = 50.756;
const REF_LON = 2.521;

const candidateRow: QualificationStationRow = {
  stationId: "opensensemap-box-evidence",
  source: "opensensemap",
  lat: 50.756,
  lon: 2.52,
  refLat: REF_LAT,
  refLon: REF_LON,
};

const officialRows: QualificationStationRow[] = [
  { stationId: "mf-a", source: "meteofrance", lat: 50.75, lon: 2.5, refLat: REF_LAT, refLon: REF_LON },
  { stationId: "mf-b", source: "meteofrance", lat: 50.76, lon: 2.53, refLat: REF_LAT, refLon: REF_LON },
];

const measurementTimes = (temperature: string) => ({
  temperature,
  humidity: null,
  pressure: null,
  windSpeed: null,
  windGust: null,
  windDirection: null,
  precipitation: null,
});

/**
 * Relevés officiels : une valeur par station et par heure. L'écart réel entre
 * les deux témoins (18,0 / 18,2) est ce qui mesure la borne d'acceptation.
 */
function officialObservationsFor(hours: Array<{ day: string; hour: number }>): QualificationObservationRow[] {
  return officialRows.flatMap((station, index) =>
    hours.map(({ day, hour }) => {
      const iso = `2026-10-${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;
      return {
        stationId: station.stationId,
        observedAt: Date.parse(iso),
        temperature: index === 0 ? 18 : 18.2,
        measurementTimes: measurementTimes(iso),
      } satisfies QualificationObservationRow;
    }),
  );
}

function candidateObservation(day: string, hour: number, temperature: number): QualificationObservationRow {
  const iso = `2026-10-${day}T${String(hour).padStart(2, "0")}:05:00.000Z`;
  return {
    stationId: candidateRow.stationId,
    observedAt: Date.parse(iso),
    temperature,
    measurementTimes: measurementTimes(iso),
  };
}

/** Trois relevés répartis sur trois jours distincts : 3 comparaisons, 3 jours. */
const threeDaysThreeComparisons = [
  candidateObservation("01", 12, 18.05),
  candidateObservation("02", 12, 18.05),
  candidateObservation("03", 12, 18.05),
];

/** Sept relevés sur une seule journée : assez de comparaisons, pas assez de jours. */
const oneDaySevenComparisons = [10, 11, 12, 13, 14, 15, 16].map((hour) =>
  candidateObservation("01", hour, 18.05),
);

/** Neuf relevés sur trois jours, écart quasi nul : candidat validable. */
const threeDaysNineComparisons = ["01", "02", "03"].flatMap((day) =>
  [12, 14, 16].map((hour) => candidateObservation(day, hour, 18.1)),
);

/**
 * Neuf relevés sur trois jours dont trois aberrants : la part d'aberrants
 * (3/9 = 33,3 %) dépasse le plafond de 30 %, le capteur est exclu.
 */
const threeDaysNineComparisonsWithOutliers = ["01", "02", "03"].flatMap((day) =>
  [12, 14, 16].map((hour, index) => candidateObservation(day, hour, index === 2 ? 28.1 : 18.1)),
);

function evaluate(observations: QualificationObservationRow[], candidate = candidateRow) {
  return buildCitizenQualificationEvidence({
    candidates: [candidate],
    officialStations: officialRows,
    observations: [...officialObservationsFor(observations.map((row) => ({
      day: row.measurementTimes!.temperature!.slice(8, 10),
      hour: Number(row.measurementTimes!.temperature!.slice(11, 13)),
    }))), ...observations],
    asOf: AS_OF,
  });
}

function only(entries: ReturnType<typeof evaluate>) {
  expect(entries).toHaveLength(1);
  return entries[0];
}

describe("progression de qualification citoyenne", () => {
  it("expose la porte « comparaisons » tant que le minimum n'est pas atteint", () => {
    const entry = only(evaluate(threeDaysThreeComparisons));
    expect(entry.status).toBe("candidate");
    expect(entry.progress.comparisons).toBe(3);
    expect(entry.progress.minimumComparisons).toBe(
      OPEN_SENSE_MAP_QUALIFICATION_GATES.minimumComparisons,
    );
    expect(entry.progress.remainingComparisons).toBe(4);
    expect(entry.progress.distinctDays).toBe(3);
    expect(entry.progress.remainingDistinctDays).toBe(0);
    expect(entry.progress.gate).toBe("comparisons");
  });

  it("bascule sur la porte « jours distincts » quand les comparaisons suffisent", () => {
    // Sept relevés sur une seule journée : le seuil de comparaisons est franchi,
    // les jours distincts ne le sont pas. C'est la porte réellement bloquante.
    const entry = only(evaluate(oneDaySevenComparisons));
    expect(entry.status).toBe("candidate");
    expect(entry.progress.comparisons).toBe(7);
    expect(entry.progress.remainingComparisons).toBe(0);
    expect(entry.progress.distinctDays).toBe(1);
    expect(entry.progress.remainingDistinctDays).toBe(2);
    expect(entry.progress.gate).toBe("distinctDays");
  });

  it("ne compte plus rien à franchir pour un capteur validé", () => {
    const entry = only(evaluate(threeDaysNineComparisons));
    expect(entry.status).toBe("validated");
    expect(entry.progress.gate).toBe("complete");
    expect(entry.progress.remainingComparisons).toBe(0);
    expect(entry.progress.remainingDistinctDays).toBe(0);
    // La preuve chiffrée accompagne le verdict : MAE, biais et borne mesurée.
    expect(entry.evidence.meanAbsoluteErrorC).not.toBeNull();
    expect(entry.evidence.meanBiasC).not.toBeNull();
    expect(entry.evidence.acceptanceBoundC).not.toBeNull();
  });

  it("n'annonce aucune validation à venir pour un capteur exclu", () => {
    const entry = only(evaluate(threeDaysNineComparisonsWithOutliers));
    expect(entry.status).toBe("excluded");
    expect(entry.progress.gate).toBe("excluded");
    expect(entry.progress.remainingComparisons).toBe(0);
    expect(entry.progress.remainingDistinctDays).toBe(0);
    expect(entry.evidence.outlierComparisons).toBeGreaterThan(0);
  });

  it("dérive les restants du seuil réel, jamais d'une constante recopiée", () => {
    const entry = only(evaluate(threeDaysThreeComparisons));
    expect(entry.progress.minimumComparisons).toBe(7);
    expect(entry.progress.minimumDistinctDays).toBe(3);
    expect(entry.progress.remainingComparisons).toBe(7 - entry.progress.comparisons);
    expect(entry.progress.remainingDistinctDays).toBe(3 - entry.progress.distinctDays);
  });

  it("documente que retainedComparisons égale comparisons pour tout candidat", () => {
    // Invariant sur lequel repose le choix de dériver le restant de
    // `evidence.comparisons` : l'élagage robuste ne s'exécute qu'après les deux
    // portes de suffisance, donc un profil encore candidat n'a jamais été élagué.
    // Si cet invariant tombait, le restant affiché devrait être revu.
    const candidates = [threeDaysThreeComparisons, oneDaySevenComparisons];
    for (const observations of candidates) {
      const entry = only(evaluate(observations));
      expect(entry.status).toBe("candidate");
      expect(entry.evidence.retainedComparisons).toBe(entry.evidence.comparisons);
    }
  });

  it("est déterministe : mêmes lignes en entrée, même preuve en sortie", () => {
    const first = evaluate(threeDaysNineComparisons);
    const second = evaluate(threeDaysNineComparisons);
    expect(second).toEqual(first);
  });
});

describe("périmètre des sources évaluées", () => {
  it("n'évalue jamais une source non citoyenne", () => {
    const netatmoRow: QualificationStationRow = {
      stationId: "netatmo-not-citizen",
      source: "netatmo",
      lat: 50.756,
      lon: 2.52,
      refLat: REF_LAT,
      refLon: REF_LON,
    };
    expect(evaluate(threeDaysNineComparisons, netatmoRow)).toEqual([]);
  });

  it("n'évalue un capteur que contre les témoins de sa propre référence", () => {
    // Une station officielle archivée pour une autre référence de favori ne doit
    // jamais servir de témoin, aussi proche soit-elle en apparence.
    const foreignReference = officialRows.map((official) => ({
      ...official,
      refLat: 48.85,
      refLon: 2.35,
    }));
    const entries = buildCitizenQualificationEvidence({
      candidates: [candidateRow],
      officialStations: foreignReference,
      observations: [
        ...officialObservationsFor([{ day: "01", hour: 12 }]),
        ...threeDaysThreeComparisons,
      ],
      asOf: AS_OF,
    });
    const entry = only(entries);
    expect(entry.status).toBe("candidate");
    expect(entry.evidence.comparisons).toBe(0);
    expect(entry.progress.remainingComparisons).toBe(7);
  });
});

describe("indexation pour l'affichage", () => {
  it("retrouve la preuve d'un capteur par son identifiant de station", () => {
    const entries = evaluate(threeDaysNineComparisons);
    const indexed = indexCitizenQualificationEvidence(entries);
    expect(Object.keys(indexed)).toEqual([candidateRow.stationId]);
    expect(indexed[candidateRow.stationId].progress.gate).toBe("complete");
  });

  it("retourne un index vide sans capteur évalué", () => {
    expect(indexCitizenQualificationEvidence([])).toEqual({});
  });
});

describe("progression isolée", () => {
  const baseEvidence = {
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

  function progressFor(
    status: OpenSenseMapQualificationStatus,
    overrides: Partial<typeof baseEvidence>,
  ) {
    return deriveCitizenQualificationProgress(status, { ...baseEvidence, ...overrides });
  }

  it("plafonne les restants à zéro au-delà du seuil", () => {
    // 9 comparaisons pour un seuil de 7 : le restant ne devient jamais négatif.
    const progress = progressFor("candidate", { comparisons: 9, distinctDays: 4 });
    expect(progress.remainingComparisons).toBe(0);
    expect(progress.remainingDistinctDays).toBe(0);
    expect(progress.gate).toBe("complete");
  });

  it("teste les comparaisons avant les jours distincts, comme l'évaluateur", () => {
    // Les deux seuils manquent : la porte annoncée est celle que l'évaluateur
    // teste en premier, donc celle qui bloque réellement.
    const progress = progressFor("candidate", { comparisons: 2, distinctDays: 1 });
    expect(progress.gate).toBe("comparisons");
  });
});
