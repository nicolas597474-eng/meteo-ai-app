import { describe, expect, it } from "vitest";
import {
  CITIZEN_QUALIFIED_VARIABLES,
  CITIZEN_VARIABLE_QUALIFICATION_VERSION,
  deriveCitizenVariableQualifications,
  type CitizenVariableQualificationProfile,
} from "./citizenVariableQualificationService";
import type {
  QualificationObservationRow,
  QualificationStationRow,
} from "./openSenseMapQualificationApplier";
import type { StationMeasurementTimes } from "./stationMeasurementFreshness";

// Fixtures de test only : stations et relevés synthétiques, aucune observation
// réelle. Horodatage figé : l'évaluation est déterministe.

const AS_OF = Date.parse("2026-10-11T12:00:00Z");
const REFERENCE = { lat: 50.7567, lon: 2.5204 };
const OTHER_REFERENCE = { lat: 48.8566, lon: 2.3522 };
const CITIZEN_STATION_ID = "osm-6740";
const OFFICIAL_STATION_IDS = ["mf-70260", "mf-70290"] as const;

/** Jours de référence : 9 jours distincts × 3 heures → 27 comparaisons alignées. */
const BASELINE_DAYS = [
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
  "2026-10-05",
  "2026-10-06",
  "2026-10-07",
];
const MEASUREMENT_HOURS_UTC = [9, 10, 11];

function stationRowFixture(
  stationId: string,
  source: string,
  reference: { lat: number; lon: number } = REFERENCE,
): QualificationStationRow {
  return { stationId, source, lat: 50.76, lon: 2.52, refLat: reference.lat, refLon: reference.lon };
}

function variableObservationFixture(
  stationId: string,
  day: string,
  hour: number,
  values: Partial<Record<"humidity" | "pressure" | "windSpeed", number>>,
): QualificationObservationRow {
  const measuredAt = `${day}T${String(hour).padStart(2, "0")}:00:00Z`;
  const measurementTimes: StationMeasurementTimes = {};
  for (const key of Object.keys(values) as Array<"humidity" | "pressure" | "windSpeed">) {
    measurementTimes[key] = measuredAt;
  }
  return {
    stationId,
    observedAt: Date.parse(measuredAt),
    temperature: null,
    humidity: values.humidity ?? null,
    pressure: values.pressure ?? null,
    windSpeed: values.windSpeed ?? null,
    measurementTimes,
  };
}

function historyRows(
  days: readonly string[],
  hours: readonly number[],
  build: (day: string, dayIndex: number, hour: number, hourIndex: number) => QualificationObservationRow[],
): QualificationObservationRow[] {
  const rows: QualificationObservationRow[] = [];
  days.forEach((day, dayIndex) => {
    hours.forEach((hour, hourIndex) => {
      rows.push(...build(day, dayIndex, hour, hourIndex));
    });
  });
  return rows;
}

/** Humidité officielle 70/74 % → médiane 72, désaccord 2 ; vent 10/14 km/h → médiane 12, désaccord 2. */
function officialValuesFixture(variable: "humidity" | "pressure" | "windSpeed") {
  if (variable === "humidity") return { "mf-70260": 70, "mf-70290": 74 };
  if (variable === "pressure") return { "mf-70260": 1013.0, "mf-70290": 1013.4 };
  return { "mf-70260": 10, "mf-70290": 14 };
}

function referenceInputs(observations: QualificationObservationRow[]) {
  return {
    candidates: [stationRowFixture(CITIZEN_STATION_ID, "opensensemap")],
    officialStations: OFFICIAL_STATION_IDS.map((stationId) => stationRowFixture(stationId, "meteofrance")),
    observations,
    asOf: AS_OF,
  };
}

describe("deriveCitizenVariableQualifications", () => {
  it("qualifie l'humidité et le vent sur la même preuve alignée que la température", () => {
    const observations = historyRows(BASELINE_DAYS, MEASUREMENT_HOURS_UTC, (day, dayIndex, hour, hourIndex) => {
      // Erreur ±0,5 selon la parité : MAE 0,5 sans écart aberrant sur la MAD plancher.
      const sign = (dayIndex + hourIndex) % 2 === 0 ? 0.5 : -0.5;
      return [
        variableObservationFixture(CITIZEN_STATION_ID, day, hour, { humidity: 72 + sign, windSpeed: 12 + sign }),
        variableObservationFixture("mf-70260", day, hour, { humidity: 70, windSpeed: 10 }),
        variableObservationFixture("mf-70290", day, hour, { humidity: 74, windSpeed: 14 }),
      ];
    });

    const profiles = deriveCitizenVariableQualifications(referenceInputs(observations));

    expect(profiles).toHaveLength(CITIZEN_QUALIFIED_VARIABLES.length);
    const humidity = profiles.find((profile) => profile.variable === "humidity");
    const windSpeed = profiles.find((profile) => profile.variable === "windSpeed");
    const pressure = profiles.find((profile) => profile.variable === "pressure");
    expect(humidity?.status).toBe("validated");
    expect(windSpeed?.status).toBe("validated");
    // Sans relevé de pression, la grandeur reste candidate à preuve vide :
    // aucune donnée n'est fabriquée.
    expect(pressure?.status).toBe("candidate");
    expect(pressure?.evidence.comparisons).toBe(0);

    // Humidité : désaccord officiel 2 % → borne clamp(2 × 2 + 5, [5, 20]) = 9 %.
    expect(humidity?.version).toBe(CITIZEN_VARIABLE_QUALIFICATION_VERSION);
    expect(humidity?.evidence.comparisons).toBe(27);
    expect(humidity?.evidence.retainedComparisons).toBe(27);
    expect(humidity?.evidence.outlierComparisons).toBe(0);
    expect(humidity?.evidence.distinctDays).toBe(9);
    expect(humidity?.evidence.meanOfficialDisagreement).toBeCloseTo(2, 6);
    expect(humidity?.evidence.acceptanceBound).toBeCloseTo(9, 6);
    expect(humidity?.evidence.meanAbsoluteError).toBeCloseTo(0.5, 6);
    expect(humidity?.evidence.officialStationsUsed).toEqual(["mf-70260", "mf-70290"]);

    // Vent : désaccord officiel 2 km/h → borne clamp(2 × 2 + 3, [3, 15]) = 7 km/h.
    expect(windSpeed?.evidence.acceptanceBound).toBeCloseTo(7, 6);
    expect(windSpeed?.evidence.meanAbsoluteError).toBeCloseTo(0.5, 6);
  });

  it("exclut la pression d'un capteur décalé : l'erreur mesurée dépasse la borne dérivée du désaccord officiel", () => {
    const observations = historyRows(BASELINE_DAYS, MEASUREMENT_HOURS_UTC, (day, _dayIndex, hour, _hourIndex) => [
      // Erreur constante +5,0 hPa : MAD nul, plancher 0,1 → aucun élagage, l'erreur entière est mesurée.
      variableObservationFixture(CITIZEN_STATION_ID, day, hour, { pressure: 1018.2 }),
      variableObservationFixture("mf-70260", day, hour, { pressure: 1013.0 }),
      variableObservationFixture("mf-70290", day, hour, { pressure: 1013.4 }),
    ]);

    const profiles = deriveCitizenVariableQualifications(referenceInputs(observations));
    const pressure = profiles.find((profile) => profile.variable === "pressure");

    expect(pressure?.status).toBe("excluded");
    expect(pressure?.reason).toContain("Erreur trop grande");
    // Désaccord officiel 0,2 hPa → borne clamp(0,9, [1, 3]) = 1 hPa.
    expect(pressure?.evidence.acceptanceBound).toBeCloseTo(1, 6);
    expect(pressure?.evidence.meanOfficialDisagreement).toBeCloseTo(0.2, 6);
    expect(pressure?.evidence.meanAbsoluteError).toBeCloseTo(5, 6);
    expect(pressure?.evidence.outlierComparisons).toBe(0);
    expect(pressure?.evidence.comparisons).toBe(27);
  });

  it("garde candidate une grandeur sans historique suffisant : 2 comparaisons n'ont jamais remplacé 7", () => {
    const observations = historyRows(["2026-09-29", "2026-09-30"], [9], (day, _dayIndex, hour, _hourIndex) => [
      variableObservationFixture(CITIZEN_STATION_ID, day, hour, { windSpeed: 12 }),
      variableObservationFixture("mf-70260", day, hour, { windSpeed: 10 }),
      variableObservationFixture("mf-70290", day, hour, { windSpeed: 14 }),
    ]);

    const profiles = deriveCitizenVariableQualifications(referenceInputs(observations));
    const windSpeed = profiles.find((profile) => profile.variable === "windSpeed");

    expect(windSpeed?.status).toBe("candidate");
    expect(windSpeed?.reason).toContain("Historique insuffisant : 2/7");
    expect(windSpeed?.evidence.comparisons).toBe(2);
    expect(windSpeed?.evidence.distinctDays).toBe(2);
    expect(windSpeed?.evidence.firstComparedAt).toBe("2026-09-29T09:00:00.000Z");
  });

  it("exige l'heure de mesure propre à la grandeur et ignore les officiels d'une autre référence", () => {
    const observations = historyRows(BASELINE_DAYS, MEASUREMENT_HOURS_UTC, (day, _dayIndex, hour, _hourIndex) => [
      // Valeur d'humidité présente mais sans heure de mesure propre : jamais un substitut d'archive.
      {
        ...variableObservationFixture(CITIZEN_STATION_ID, day, hour, {}),
        humidity: 72,
      },
      variableObservationFixture("mf-70260", day, hour, { humidity: 70 }),
      variableObservationFixture("mf-70290", day, hour, { humidity: 74 }),
    ]);

    const profiles = deriveCitizenVariableQualifications({
      candidates: [stationRowFixture(CITIZEN_STATION_ID, "opensensemap")],
      // Témoins officiels persistés pour une autre référence d'archivage :
      // jamais témoins d'un capteur, aussi proches soient-ils en apparence.
      officialStations: OFFICIAL_STATION_IDS.map((stationId) => stationRowFixture(stationId, "meteofrance", OTHER_REFERENCE)),
      observations,
      asOf: AS_OF,
    });

    expect(profiles).toHaveLength(CITIZEN_QUALIFIED_VARIABLES.length);
    for (const profile of profiles) {
      expect(profile.status).toBe("candidate");
      expect(profile.evidence.comparisons).toBe(0);
      expect(profile.evidence.officialStationsUsed).toEqual([]);
      expect(profile.reason).toContain("Aucune comparaison alignée");
    }
  });

  it("n'évalue jamais une source non citoyenne : le chemin reste réservé à openSenseMap et CWOP", () => {
    const observations = historyRows(BASELINE_DAYS, MEASUREMENT_HOURS_UTC, (day, dayIndex, hour, hourIndex) => {
      const sign = (dayIndex + hourIndex) % 2 === 0 ? 0.5 : -0.5;
      return [
        variableObservationFixture("nat-1122", day, hour, { humidity: 72 + sign }),
        variableObservationFixture("mf-70260", day, hour, { humidity: 70 }),
        variableObservationFixture("mf-70290", day, hour, { humidity: 74 }),
      ];
    });

    const profiles = deriveCitizenVariableQualifications({
      candidates: [stationRowFixture("nat-1122", "netatmo")],
      officialStations: OFFICIAL_STATION_IDS.map((stationId) => stationRowFixture(stationId, "meteofrance")),
      observations,
      asOf: AS_OF,
    });

    expect(profiles).toHaveLength(0);
  });
});
