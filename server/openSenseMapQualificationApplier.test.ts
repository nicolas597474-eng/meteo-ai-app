import { describe, expect, it } from "vitest";
import {
  buildQualificationStation,
  deriveOpenSenseMapVerdicts,
  groupQualificationObservationsByStation,
  OPEN_SENSE_MAP_QUALIFICATION_HISTORY_WINDOW_DAYS,
  toPersistedOpenSenseMapVerdict,
  WEATHER_STATION_EXCLUSION_REASON_MAX_LENGTH,
  type QualificationObservationRow,
  type QualificationStationRow,
} from "./openSenseMapQualificationApplier";
import { OPEN_SENSE_MAP_QUALIFICATION_VERSION, type OpenSenseMapQualificationProfile } from "./openSenseMapQualificationService";

// Fixtures explicitement marquées : données de test only, aucun appel réseau,
// aucune valeur de production. Les heures de mesure viennent des capteurs simulés.
const AS_OF = Date.parse("2026-10-03T23:00:00.000Z");

const candidateRow: QualificationStationRow = {
  stationId: "opensensemap-box-test",
  source: "opensensemap",
  lat: 50.756,
  lon: 2.52,
  refLat: 50.756,
  refLon: 2.521,
};

const officialRows: QualificationStationRow[] = [
  { stationId: "mf-a", source: "meteofrance", lat: 50.75, lon: 2.5, refLat: 50.756, refLon: 2.521 },
  { stationId: "mf-b", source: "meteofrance", lat: 50.76, lon: 2.53, refLat: 50.756, refLon: 2.521 },
];

function officialObservations(stationId: string, value: number): QualificationObservationRow[] {
  return ["1", "2", "3"].flatMap((day) => [12, 13, 14, 15, 16, 17, 18].map((hour) => ({
    stationId,
    observedAt: Date.parse(`2026-10-0${day}T${String(hour)}:00:00.000Z`) + 40 * 60 * 1000,
    temperature: value,
    measurementTimes: { temperature: `2026-10-0${day}T${String(hour)}:00:00.000Z`, humidity: null, pressure: null, windSpeed: null, windGust: null, windDirection: null, precipitation: null },
  })));
}

function candidateObservation(day: string, hour: number, temperature: number): QualificationObservationRow {
  return {
    stationId: candidateRow.stationId,
    observedAt: Date.parse(`2026-10-0${day}T${String(hour)}:05:00.000Z`),
    temperature,
    measurementTimes: { temperature: `2026-10-0${day}T${String(hour)}:05:00.000Z`, humidity: null, pressure: null, windSpeed: null, windGust: null, windDirection: null, precipitation: null },
  };
}

const sufficientCandidateObservations = [
  candidateObservation("1", 12, 18.1),
  candidateObservation("1", 14, 18.1),
  candidateObservation("2", 12, 18.1),
  candidateObservation("2", 14, 18.1),
  candidateObservation("3", 12, 18.1),
  candidateObservation("3", 16, 18.1),
  candidateObservation("3", 18, 18.1),
];

const archivedObservations = [
  ...officialObservations("mf-a", 18.0),
  ...officialObservations("mf-b", 18.2),
  ...sufficientCandidateObservations,
];

function makeProfile(status: "candidate" | "validated" | "excluded", reason: string): OpenSenseMapQualificationProfile {
  return {
    version: OPEN_SENSE_MAP_QUALIFICATION_VERSION,
    stationId: candidateRow.stationId,
    status,
    reason,
    evidence: {
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
    },
  };
}

describe("conversion des profils en verdicts persistables", () => {
  it("convertit un profil validé en verdict actif sans raison d'exclusion", () => {
    expect(toPersistedOpenSenseMapVerdict(makeProfile("validated", "Capteur qualifié sur 7/7 comparaison(s)."))).toEqual({
      stationId: candidateRow.stationId,
      qualificationStatus: "validated",
      isActive: 1,
      exclusionReason: null,
    });
  });

  it("convertit un profil exclu en verdict inactif avec sa raison", () => {
    expect(toPersistedOpenSenseMapVerdict(makeProfile("excluded", "Erreur trop grande : MAE 4 °C."))).toEqual({
      stationId: candidateRow.stationId,
      qualificationStatus: "excluded",
      isActive: 0,
      exclusionReason: "Erreur trop grande : MAE 4 °C.",
    });
  });

  it("tronque la raison d'exclusion à la longueur de la colonne, sans jamais la rallonger", () => {
    const longReason = "x".repeat(WEATHER_STATION_EXCLUSION_REASON_MAX_LENGTH + 44);
    const verdict = toPersistedOpenSenseMapVerdict(makeProfile("excluded", longReason));
    expect(verdict?.exclusionReason).toHaveLength(WEATHER_STATION_EXCLUSION_REASON_MAX_LENGTH);
    expect(verdict?.exclusionReason).toBe(longReason.slice(0, WEATHER_STATION_EXCLUSION_REASON_MAX_LENGTH));
  });

  it("ne produit aucun verdict pour un capteur toujours candidat", () => {
    expect(toPersistedOpenSenseMapVerdict(makeProfile("candidate", "Historique insuffisant : 6/7."))).toBeNull();
  });
});

describe("dérivation des verdicts depuis les lignes persistées", () => {
  it("qualifie un capteur dont l'historique archivé suffit et produit le verdict validé actif", () => {
    const { profiles, verdicts } = deriveOpenSenseMapVerdicts({
      candidates: [candidateRow],
      officialStations: officialRows,
      observations: archivedObservations,
      asOf: AS_OF,
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.status).toBe("validated");
    expect(profiles[0]?.evidence).toMatchObject({ comparisons: 7, distinctDays: 3, officialStationsUsed: ["mf-a", "mf-b"] });
    expect(verdicts).toEqual([{
      stationId: candidateRow.stationId,
      qualificationStatus: "validated",
      isActive: 1,
      exclusionReason: null,
    }]);
  });

  it("qualifie une station CWOP candidate avec les mêmes preuves mesurées", () => {
    const cwopCandidateRow: QualificationStationRow = {
      stationId: "cwop-EW1234",
      source: "cwop",
      lat: 50.757,
      lon: 2.51,
      refLat: 50.756,
      refLon: 2.521,
    };
    const cwopObservations = sufficientCandidateObservations.map((observation) => ({
      ...observation,
      stationId: cwopCandidateRow.stationId,
    }));

    const { profiles, verdicts } = deriveOpenSenseMapVerdicts({
      candidates: [cwopCandidateRow],
      officialStations: officialRows,
      observations: [...officialObservations("mf-a", 18.0), ...officialObservations("mf-b", 18.2), ...cwopObservations],
      asOf: AS_OF,
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.status).toBe("validated");
    expect(profiles[0]?.evidence).toMatchObject({ comparisons: 7, distinctDays: 3, officialStationsUsed: ["mf-a", "mf-b"] });
    expect(verdicts).toEqual([{
      stationId: "cwop-EW1234",
      qualificationStatus: "validated",
      isActive: 1,
      exclusionReason: null,
    }]);
  });

  it("n'utilise jamais une station officielle persistée pour une autre référence d'archivage", () => {
    const { profiles, verdicts } = deriveOpenSenseMapVerdicts({
      candidates: [candidateRow],
      officialStations: [
        { stationId: "mf-loin", source: "meteofrance", lat: 48.85, lon: 2.35, refLat: 48.85, refLon: 2.35 },
      ],
      observations: archivedObservations,
      asOf: AS_OF,
    });

    expect(profiles[0]?.status).toBe("candidate");
    expect(profiles[0]?.evidence.comparisons).toBe(0);
    expect(verdicts).toEqual([]);
  });

  it("n'écrit aucun verdict tant que l'historique du capteur reste insuffisant", () => {
    const { verdicts } = deriveOpenSenseMapVerdicts({
      candidates: [candidateRow],
      officialStations: officialRows,
      observations: [...officialObservations("mf-a", 18.0), ...officialObservations("mf-b", 18.2), candidateObservation("1", 12, 18.1)],
      asOf: AS_OF,
    });

    expect(verdicts).toEqual([]);
  });

  it("exclut un capteur biaisé au-delà de la borne mesurée et persiste sa raison", () => {
    const { verdicts } = deriveOpenSenseMapVerdicts({
      candidates: [candidateRow],
      officialStations: officialRows,
      observations: [
        ...officialObservations("mf-a", 18.0),
        ...officialObservations("mf-b", 18.2),
        candidateObservation("1", 12, 22.1),
        candidateObservation("1", 14, 22.1),
        candidateObservation("2", 12, 22.1),
        candidateObservation("2", 14, 22.1),
        candidateObservation("3", 12, 22.1),
        candidateObservation("3", 16, 22.1),
        candidateObservation("3", 18, 22.1),
      ],
      asOf: AS_OF,
    });

    expect(verdicts).toEqual([{
      stationId: candidateRow.stationId,
      qualificationStatus: "excluded",
      isActive: 0,
      exclusionReason: expect.stringContaining("MAE 4 °C"),
    }]);
  });

  it("ignore toute ligne candidate d'une autre source sans l'évaluer ni l'écrire", () => {
    const { profiles, verdicts } = deriveOpenSenseMapVerdicts({
      candidates: [{ ...candidateRow, stationId: "netatmo-persiste", source: "netatmo" }],
      officialStations: officialRows,
      observations: archivedObservations,
      asOf: AS_OF,
    });

    expect(profiles).toEqual([]);
    expect(verdicts).toEqual([]);
  });
});

describe("outils purs du pont d'application", () => {
  it("groupe les relevés par station sans mélanger les capteurs ni les témoins", () => {
    const grouped = groupQualificationObservationsByStation(archivedObservations);
    expect(Array.from(grouped.keys()).sort()).toEqual(["mf-a", "mf-b", "opensensemap-box-test"]);
    expect(grouped.get("mf-a")).toHaveLength(21);
    expect(grouped.get(candidateRow.stationId)).toHaveLength(7);
  });

  it("transmet l'heure d'archive et les heures de mesure telles quelles, sans les déduire", () => {
    const station = buildQualificationStation(candidateRow, [candidateObservation("1", 12, 18.1)]);
    expect(station.readings[0]?.observedAt).toBe(Date.parse("2026-10-01T12:05:00.000Z"));
    expect(station.readings[0]?.measurementTimes?.temperature).toBe("2026-10-01T12:05:00.000Z");
  });

  it("documente une fenêtre d'historique alignée sur les profils de qualité", () => {
    expect(OPEN_SENSE_MAP_QUALIFICATION_HISTORY_WINDOW_DAYS).toBe(30);
  });
});
