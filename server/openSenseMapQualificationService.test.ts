import { describe, expect, it } from "vitest";
import {
  deriveOpenSenseMapQualificationProfile,
  OPEN_SENSE_MAP_QUALIFICATION_GATES,
  OPEN_SENSE_MAP_QUALIFICATION_VERSION,
} from "./openSenseMapQualificationService";

// Fixtures explicitement marquées : données de test only, aucun appel réseau,
// aucune valeur de production. Les heures de mesure viennent des capteurs simulés.
const AS_OF = Date.parse("2026-10-03T23:00:00.000Z");

function officialReadings(days: string[], hours: number[], value: number) {
  return days.flatMap((day) => hours.map((hour) => ({
    measurementTimes: { temperature: `2026-10-0${day}T${String(hour).padStart(2, "0")}:00:00.000Z` },
    temperature: value,
  })));
}

function candidateReading(day: string, hour: number, minute: number, temperature: number) {
  return {
    measurementTimes: {
      temperature: `2026-10-0${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`,
    },
    temperature,
  };
}

// Deux stations officielles SYNOP dont le désaccord réel vaut 0,1 °C.
const OFFICIAL_STATIONS = [
  {
    stationId: "mf-a",
    source: "meteofrance",
    lat: 50.75,
    lon: 2.5,
    readings: officialReadings(["1", "2", "3"], [12, 13, 14, 15, 16, 17, 18], 18.0),
  },
  {
    stationId: "mf-b",
    source: "meteofrance",
    lat: 50.76,
    lon: 2.53,
    readings: officialReadings(["1", "2", "3"], [12, 13, 14, 15, 16, 17, 18], 18.2),
  },
];

function makeCandidate(readings: Array<Record<string, unknown>>, source = "opensensemap") {
  return {
    stationId: "opensensemap-box-test",
    source,
    lat: 50.756,
    lon: 2.52,
    readings,
  };
}

describe("qualification openSenseMap par historique MAE vs SYNOP", () => {
  it("qualifie un capteur après 7 comparaisons sur 3 jours avec une MAE sous la borne mesurée", () => {
    const profile = deriveOpenSenseMapQualificationProfile({
      candidate: makeCandidate([
        candidateReading("1", 12, 5, 18.1),
        candidateReading("1", 14, 5, 18.1),
        candidateReading("2", 12, 5, 18.1),
        candidateReading("2", 14, 5, 18.1),
        candidateReading("3", 12, 5, 18.1),
        candidateReading("3", 16, 5, 18.1),
        candidateReading("3", 18, 5, 18.1),
      ]),
      officialStations: OFFICIAL_STATIONS,
      asOf: AS_OF,
    });

    expect(profile.version).toBe(OPEN_SENSE_MAP_QUALIFICATION_VERSION);
    expect(profile.status).toBe("validated");
    expect(profile.reason).toContain("Capteur qualifié");
    expect(profile.evidence).toMatchObject({
      comparisons: 7,
      retainedComparisons: 7,
      outlierComparisons: 0,
      distinctDays: 3,
      officialStationsUsed: ["mf-a", "mf-b"],
      meanOfficialDisagreementC: 0.1,
      acceptanceBoundC: 1,
      meanAbsoluteErrorC: 0,
      meanBiasC: 0,
    });
  });

  it("garde le capteur candidat tant que 7 comparaisons ne sont pas atteintes", () => {
    const profile = deriveOpenSenseMapQualificationProfile({
      candidate: makeCandidate([
        candidateReading("1", 12, 5, 18.1),
        candidateReading("1", 14, 5, 18.1),
        candidateReading("2", 12, 5, 18.1),
        candidateReading("2", 14, 5, 18.1),
        candidateReading("3", 12, 5, 18.1),
        candidateReading("3", 16, 5, 18.1),
      ]),
      officialStations: OFFICIAL_STATIONS,
      asOf: AS_OF,
    });

    expect(profile.status).toBe("candidate");
    expect(profile.reason).toContain(`6/${OPEN_SENSE_MAP_QUALIFICATION_GATES.minimumComparisons}`);
    expect(profile.evidence.comparisons).toBe(6);
  });

  it("exige 3 jours distincts : sept heures d'un même après-midi ne qualifient pas", () => {
    const profile = deriveOpenSenseMapQualificationProfile({
      candidate: makeCandidate([
        candidateReading("1", 12, 5, 18.1),
        candidateReading("1", 13, 5, 18.1),
        candidateReading("1", 14, 5, 18.1),
        candidateReading("1", 15, 5, 18.1),
        candidateReading("1", 16, 5, 18.1),
        candidateReading("1", 17, 5, 18.1),
        candidateReading("1", 18, 5, 18.1),
      ]),
      officialStations: OFFICIAL_STATIONS,
      asOf: AS_OF,
    });

    expect(profile.status).toBe("candidate");
    expect(profile.reason).toContain("1/3 jour(s)");
    expect(profile.reason).toContain("les jours, pas les heures, portent l'échantillon");
    expect(profile.evidence.comparisons).toBe(7);
    expect(profile.evidence.distinctDays).toBe(1);
  });

  it("exclut un capteur biaisé dont la MAE dépasse la borne d'acceptation mesurée", () => {
    const profile = deriveOpenSenseMapQualificationProfile({
      candidate: makeCandidate([
        candidateReading("1", 12, 5, 22.1),
        candidateReading("1", 14, 5, 22.1),
        candidateReading("2", 12, 5, 22.1),
        candidateReading("2", 14, 5, 22.1),
        candidateReading("3", 12, 5, 22.1),
        candidateReading("3", 16, 5, 22.1),
        candidateReading("3", 18, 5, 22.1),
      ]),
      officialStations: OFFICIAL_STATIONS,
      asOf: AS_OF,
    });

    expect(profile.status).toBe("excluded");
    expect(profile.reason).toContain("MAE 4 °C");
    expect(profile.reason).toContain("au-delà de la borne d'acceptation 1 °C");
    expect(profile.evidence.meanAbsoluteErrorC).toBe(4);
    expect(profile.evidence.acceptanceBoundC).toBe(1);
  });

  it("exclut une comparaison aberrante sans annuler la qualification", () => {
    const profile = deriveOpenSenseMapQualificationProfile({
      candidate: makeCandidate([
        candidateReading("1", 12, 5, 18.1),
        candidateReading("1", 14, 5, 18.1),
        candidateReading("2", 12, 5, 18.1),
        candidateReading("2", 13, 5, 24.1),
        candidateReading("2", 14, 5, 18.1),
        candidateReading("3", 12, 5, 18.1),
        candidateReading("3", 16, 5, 18.1),
        candidateReading("3", 18, 5, 18.1),
      ]),
      officialStations: OFFICIAL_STATIONS,
      asOf: AS_OF,
    });

    expect(profile.status).toBe("validated");
    expect(profile.evidence).toMatchObject({
      comparisons: 8,
      retainedComparisons: 7,
      outlierComparisons: 1,
      meanAbsoluteErrorC: 0,
    });
    expect(profile.reason).toContain("7/8 comparaison(s)");
    expect(profile.reason).toContain("sans annuler la qualification");
  });

  it("exclut un capteur dont les divergences se répètent au-delà de 30 % des comparaisons", () => {
    const profile = deriveOpenSenseMapQualificationProfile({
      candidate: makeCandidate([
        candidateReading("1", 12, 5, 18.1),
        candidateReading("1", 13, 5, 24.1),
        candidateReading("1", 14, 5, 18.1),
        candidateReading("1", 15, 5, 24.1),
        candidateReading("2", 12, 5, 18.1),
        candidateReading("2", 13, 5, 24.1),
        candidateReading("2", 14, 5, 18.1),
        candidateReading("3", 12, 5, 18.1),
        candidateReading("3", 13, 5, 24.1),
        candidateReading("3", 14, 5, 18.1),
      ]),
      officialStations: OFFICIAL_STATIONS,
      asOf: AS_OF,
    });

    expect(profile.status).toBe("excluded");
    expect(profile.reason).toContain("Divergences répétées");
    expect(profile.reason).toContain("4/10");
    expect(profile.evidence.outlierComparisons).toBe(4);
  });

  it("ignore les relevés sans heure de mesure propre, futurs ou sans valeur, sans fabriquer de comparaison", () => {
    const profile = deriveOpenSenseMapQualificationProfile({
      candidate: makeCandidate([
        candidateReading("1", 12, 5, 18.1),
        { temperature: 18.1, measurementTimes: { temperature: null } },
        { temperature: 18.1, measurementTimes: { temperature: "2026-10-04T12:00:00.000Z" } },
        { temperature: null, measurementTimes: { temperature: "2026-10-02T12:05:00.000Z" } },
        { temperature: 18.1 },
      ]),
      officialStations: OFFICIAL_STATIONS,
      asOf: AS_OF,
    });

    expect(profile.status).toBe("candidate");
    expect(profile.evidence.comparisons).toBe(1);
    expect(profile.reason).toContain(`1/${OPEN_SENSE_MAP_QUALIFICATION_GATES.minimumComparisons}`);
  });

  it("n'évalue qu'un capteur openSenseMap, jamais une autre source", () => {
    const profile = deriveOpenSenseMapQualificationProfile({
      candidate: makeCandidate([
        candidateReading("1", 12, 5, 18.1),
        candidateReading("1", 14, 5, 18.1),
        candidateReading("2", 12, 5, 18.1),
        candidateReading("2", 14, 5, 18.1),
        candidateReading("3", 12, 5, 18.1),
        candidateReading("3", 16, 5, 18.1),
        candidateReading("3", 18, 5, 18.1),
      ], "netatmo"),
      officialStations: OFFICIAL_STATIONS,
      asOf: AS_OF,
    });

    expect(profile.status).toBe("candidate");
    expect(profile.reason).toContain("openSenseMap");
    expect(profile.evidence.comparisons).toBe(0);
  });

  it("reste candidat sans aucune comparaison alignée et l'explique sans substitution d'heure", () => {
    const profile = deriveOpenSenseMapQualificationProfile({
      candidate: makeCandidate([]),
      officialStations: OFFICIAL_STATIONS,
      asOf: AS_OF,
    });

    expect(profile.status).toBe("candidate");
    expect(profile.reason).toContain("Aucune comparaison alignée");
    expect(profile.reason).toContain("l'heure d'archive n'est pas un substitut");
    expect(profile.evidence.comparisons).toBe(0);
  });
});
