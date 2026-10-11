import { describe, expect, it } from "vitest";
import type { StationMeasurementTimes } from "./stationMeasurementFreshness";
import {
  CITIZEN_FUSION_IMPACT_GATES,
  CITIZEN_FUSION_IMPACT_HISTORY_WINDOW_DAYS,
  CITIZEN_FUSION_IMPACT_VERSION,
  deriveCitizenFusionImpactReport,
  type ImpactObservationRow,
  type ImpactStationRow,
} from "./citizenFusionImpactService";

// Fixtures de test only : stations et relevés synthétiques, aucune observation réelle.
// Horodatage figé : l'évaluation est déterministe et l'heure d'archive (observedAt)
// diffère toujours de l'heure de mesure pour prouver qu'elle n'est jamais un substitut.

const AS_OF = Date.parse("2026-10-11T12:00:00Z");

const MEASURED_HOURS = [
  "2026-10-05T09:00:00Z",
  "2026-10-05T10:00:00Z",
  "2026-10-05T11:00:00Z",
  "2026-10-06T09:00:00Z",
  "2026-10-06T10:00:00Z",
  "2026-10-06T11:00:00Z",
  "2026-10-07T09:00:00Z",
  "2026-10-07T10:00:00Z",
  "2026-10-07T11:00:00Z",
];

function stationRow(
  stationId: string,
  source: string,
  distanceKm: number,
  reliabilityScore: number,
): ImpactStationRow {
  return { stationId, source, lat: 50.76, lon: 2.52, distanceKm, reliabilityScore };
}

function observationRow(stationId: string, measuredAtIso: string, temperature: number): ImpactObservationRow {
  const measurementTimes: StationMeasurementTimes = { temperature: measuredAtIso };
  return {
    stationId,
    // L'heure d'archive diffère de l'heure de mesure : elle ne doit jamais servir.
    observedAt: Date.parse(measuredAtIso) + 5 * 60 * 1000,
    measurementTimes,
    temperature,
  };
}

function buildObservations(hours: readonly string[]): ImpactObservationRow[] {
  const rows: ImpactObservationRow[] = [];
  for (const hour of hours) {
    rows.push(observationRow("mf-70260", hour, 15.0));
    rows.push(observationRow("mf-70290", hour, 15.6));
    rows.push(observationRow("netatmo-public-42", hour, 16.4));
    rows.push(observationRow("opensensemap-6740", hour, 15.4));
  }
  return rows;
}

const OFFICIAL_STATIONS: ImpactStationRow[] = [
  stationRow("mf-70260", "meteofrance", 12, 92),
  stationRow("mf-70290", "meteofrance", 18, 88),
];

const PHYSICAL_STATIONS: ImpactStationRow[] = [
  stationRow("mf-70260", "meteofrance", 12, 92),
  stationRow("mf-70290", "meteofrance", 18, 88),
  stationRow("netatmo-public-42", "netatmo", 2, 65),
];

const VALIDATED_CITIZENS: ImpactStationRow[] = [
  stationRow("opensensemap-6740", "opensensemap", 1.5, 60),
];

describe("deriveCitizenFusionImpactReport", () => {
  it("ne mesure rien sans capteur citoyen validé pour la référence", () => {
    const report = deriveCitizenFusionImpactReport({
      referenceLat: 50.7567,
      referenceLon: 2.5204,
      physicalStations: PHYSICAL_STATIONS,
      validatedCitizens: [],
      officialStations: OFFICIAL_STATIONS,
      observations: buildObservations(MEASURED_HOURS),
      asOf: AS_OF,
    });

    expect(report.status).toBe("no-validated-citizens");
    expect(report.comparisons).toBe(0);
    expect(report.baselineMaeC).toBeNull();
    expect(report.withCitizenMaeC).toBeNull();
    expect(report.improvementC).toBeNull();
    expect(report.reason).toContain("aucune valeur n'est inventée");
  });

  it("mesure une amélioration quand le capteur validé rapproche la synthèse de la médiane officielle", () => {
    const report = deriveCitizenFusionImpactReport({
      referenceLat: 50.7567,
      referenceLon: 2.5204,
      physicalStations: PHYSICAL_STATIONS,
      validatedCitizens: VALIDATED_CITIZENS,
      officialStations: OFFICIAL_STATIONS,
      observations: buildObservations(MEASURED_HOURS),
      asOf: AS_OF,
    });

    expect(report.version).toBe(CITIZEN_FUSION_IMPACT_VERSION);
    expect(report.status).toBe("improves");
    expect(report.comparisons).toBe(MEASURED_HOURS.length);
    expect(report.distinctDays).toBe(3);
    expect(report.windowDays).toBe(CITIZEN_FUSION_IMPACT_HISTORY_WINDOW_DAYS);
    // Les MAE sont mesurées, pas estimées : le capteur proche de la médiane
    // officielle (15,4 °C) compense la Netatmo chaude (16,4 °C).
    expect(report.baselineMaeC).toBeCloseTo(0.676, 3);
    expect(report.withCitizenMaeC).toBeCloseTo(0.373, 3);
    expect(report.improvementC).toBeCloseTo(0.303, 3);
    expect(report.improvementC! > 0).toBe(true);
    expect(report.officialStationsUsed).toEqual(["mf-70260", "mf-70290"]);
    expect(report.physicalStationsUsed).toContain("netatmo-public-42");
    expect(report.validatedCitizenStations).toEqual(["opensensemap-6740"]);
    expect(report.firstComparedAt).toBe("2026-10-05T09:00:00.000Z");
    expect(report.lastComparedAt).toBe("2026-10-07T11:00:00.000Z");
    expect(report.reason).toContain("rien n'est activé ici");
  });

  it("mesure l'absence d'amélioration quand le capteur validé éloigne la synthèse de la médiane officielle", () => {
    const observations = buildObservations(MEASURED_HOURS).map((row) =>
      row.stationId === "opensensemap-6740" ? { ...row, temperature: 17.5 } : row,
    );
    const report = deriveCitizenFusionImpactReport({
      referenceLat: 50.7567,
      referenceLon: 2.5204,
      physicalStations: PHYSICAL_STATIONS,
      validatedCitizens: VALIDATED_CITIZENS,
      officialStations: OFFICIAL_STATIONS,
      observations,
      asOf: AS_OF,
    });

    expect(report.status).toBe("no-improvement");
    expect(report.baselineMaeC).toBeCloseTo(0.676, 3);
    expect(report.withCitizenMaeC).toBeCloseTo(1.228, 3);
    expect(report.improvementC).toBeCloseTo(-0.552, 3);
    expect(report.reason).toContain("restent hors de la fusion locale");
  });

  it("exige sept comparaisons alignées avant tout verdict", () => {
    const sixHours = MEASURED_HOURS.slice(0, 6);
    const report = deriveCitizenFusionImpactReport({
      referenceLat: 50.7567,
      referenceLon: 2.5204,
      physicalStations: PHYSICAL_STATIONS,
      validatedCitizens: VALIDATED_CITIZENS,
      officialStations: OFFICIAL_STATIONS,
      observations: buildObservations(sixHours),
      asOf: AS_OF,
    });

    expect(report.status).toBe("insufficient-history");
    expect(report.comparisons).toBe(sixHours.length);
    expect(report.distinctDays).toBe(2);
    expect(report.reason).toContain(`6/${CITIZEN_FUSION_IMPACT_GATES.minimumComparisons}`);
  });

  it("exige trois jours distincts : un après-midi unique ne prouve rien", () => {
    const oneDay = ["2026-10-05T09:00:00Z", "2026-10-05T10:00:00Z", "2026-10-05T11:00:00Z", "2026-10-05T12:00:00Z", "2026-10-05T13:00:00Z", "2026-10-05T14:00:00Z", "2026-10-05T15:00:00Z", "2026-10-05T16:00:00Z"];
    const report = deriveCitizenFusionImpactReport({
      referenceLat: 50.7567,
      referenceLon: 2.5204,
      physicalStations: PHYSICAL_STATIONS,
      validatedCitizens: VALIDATED_CITIZENS,
      officialStations: OFFICIAL_STATIONS,
      observations: buildObservations(oneDay),
      asOf: AS_OF,
    });

    expect(report.status).toBe("insufficient-history");
    expect(report.comparisons).toBe(oneDay.length);
    expect(report.distinctDays).toBe(1);
    expect(report.reason).toContain(`1/${CITIZEN_FUSION_IMPACT_GATES.minimumDistinctDays}`);
  });

  it("n'utilise jamais l'heure d'archive comme substitut d'heure de mesure", () => {
    const archiveOnly = buildObservations(MEASURED_HOURS).map((row) =>
      row.stationId === "opensensemap-6740" ? { ...row, measurementTimes: null } : row,
    );
    const report = deriveCitizenFusionImpactReport({
      referenceLat: 50.7567,
      referenceLon: 2.5204,
      physicalStations: PHYSICAL_STATIONS,
      validatedCitizens: VALIDATED_CITIZENS,
      officialStations: OFFICIAL_STATIONS,
      observations: archiveOnly,
      asOf: AS_OF,
    });

    expect(report.status).toBe("insufficient-history");
    expect(report.comparisons).toBe(0);
    expect(report.baselineMaeC).toBeNull();
    expect(report.withCitizenMaeC).toBeNull();
    expect(report.reason).toContain("l'heure d'archive n'est jamais un substitut");
  });

  it("signale l'absence de relevé physique sans inventer de synthèse", () => {
    const report = deriveCitizenFusionImpactReport({
      referenceLat: 50.7567,
      referenceLon: 2.5204,
      physicalStations: PHYSICAL_STATIONS,
      validatedCitizens: VALIDATED_CITIZENS,
      officialStations: OFFICIAL_STATIONS,
      observations: buildObservations(MEASURED_HOURS).filter(
        (row) => row.stationId.startsWith("opensensemap") || row.stationId.startsWith("mf-"),
      ).map((row) => (row.stationId.startsWith("mf-") ? { ...row, temperature: null } : row)),
      asOf: AS_OF,
    });

    expect(report.status).toBe("insufficient-history");
    expect(report.comparisons).toBe(0);
    expect(report.reason).toContain("Aucun relevé physique exploitable");
  });
});
