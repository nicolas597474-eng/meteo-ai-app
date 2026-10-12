import { describe, expect, it } from "vitest";
import {
  applyCitizenVariableQualificationAdmission,
  composeLocalSynthesisSources,
} from "./citizenFusionActivationService";
import { calculateUltraLocal } from "./ultraLocalService";
import type { StationData } from "./stationService";

function station(overrides: Partial<StationData>): StationData {
  const timestamp = new Date().toISOString();
  return {
    stationId: "station",
    source: "meteofrance",
    name: "Station de test",
    lat: 50.75,
    lon: 2.52,
    altitude: 40,
    distanceKm: 1,
    temperature: 20,
    humidity: 60,
    pressure: 1015,
    windSpeed: 10,
    windGust: 15,
    windDirection: 180,
    precipitation: 0,
    updatedAt: timestamp,
    measurementTimes: {
      temperature: timestamp,
      humidity: timestamp,
      pressure: timestamp,
      windSpeed: timestamp,
      windGust: timestamp,
      windDirection: timestamp,
      precipitation: timestamp,
    },
    reliabilityScore: 80,
    updateFrequencyMin: 10,
    dataAvailability: 0.95,
    isActive: true,
    qualificationStatus: "validated",
    sourceTier: 1,
    ...overrides,
  };
}

describe("applyCitizenVariableQualificationAdmission", () => {
  it("neutralise les grandeurs citoyennes excluded/candidate/absentes avant Ultra-local, sans toucher au vent validé ni au physique", () => {
    const physical = station({
      stationId: "mf-physical",
      humidity: 55,
      pressure: 1012,
      windSpeed: 8,
    });
    const citizen = station({
      stationId: "citizen",
      source: "cwop",
      humidity: 90,
      pressure: 1030,
      windSpeed: 40,
      qualificationStatus: "validated",
    });
    const admitted = applyCitizenVariableQualificationAdmission({
      stations: [physical, citizen],
      variableVerdicts: [
        { stationId: "citizen", variable: "humidity", status: "excluded" },
        { stationId: "citizen", variable: "pressure", status: "candidate" },
        { stationId: "citizen", variable: "windSpeed", status: "validated" },
      ],
    });

    expect(admitted.stations[0]).toBe(physical);
    expect(admitted.stations[1]).toMatchObject({ humidity: null, pressure: null, windSpeed: 40 });
    expect(admitted.exclusions).toEqual([
      { stationId: "citizen", variable: "humidity", status: "excluded", reason: "qualification_excluded" },
      { stationId: "citizen", variable: "pressure", status: "candidate", reason: "qualification_candidate" },
    ]);

    const result = calculateUltraLocal(admitted.stations, "local", 50.75, 2.52, 40, null, {
      recordStationReadings: false,
    });
    expect(result.humidity).toBe(55);
    expect(result.pressure).toBe(1012);
    // Le vent citizen validé reste une contribution réelle, pas une valeur redistribuée.
    expect(result.windSpeed).toBeGreaterThan(8);
    const citizenContribution = result.stationsUsed.find((item) => item.stationId === "citizen");
    expect(citizenContribution?.fieldWeights?.humidity).toBeUndefined();
    expect(citizenContribution?.fieldWeights?.pressure).toBeUndefined();
    expect(citizenContribution?.fieldWeights?.windSpeed).toBeGreaterThan(0);
  });

  it("échoue fermée quand un verdict par grandeur est absent, tout en préservant température et autres variables non couvertes", () => {
    const citizen = station({
      stationId: "citizen",
      source: "opensensemap",
      temperature: 18,
      humidity: 70,
      pressure: 1008,
      windSpeed: 12,
      windGust: 22,
      precipitation: 1.2,
    });
    const { stations, exclusions } = applyCitizenVariableQualificationAdmission({
      stations: [citizen],
      variableVerdicts: [],
    });

    expect(stations[0]).toMatchObject({
      temperature: 18,
      humidity: null,
      pressure: null,
      windSpeed: null,
      windGust: 22,
      precipitation: 1.2,
    });
    expect(exclusions.map((item) => [item.variable, item.reason])).toEqual([
      ["humidity", "qualification_missing"],
      ["pressure", "qualification_missing"],
      ["windSpeed", "qualification_missing"],
    ]);
  });

  it("gère 0/1 source citoyenne et aucun champ citoyen admissible sans inventer de contribution", () => {
    const noCitizen = applyCitizenVariableQualificationAdmission({ stations: [], variableVerdicts: [] });
    expect(noCitizen).toEqual({ stations: [], exclusions: [] });

    const citizen = station({
      stationId: "citizen",
      source: "cwop",
      temperature: null,
      humidity: 70,
      pressure: 1008,
      windSpeed: 12,
      windGust: null,
      precipitation: null,
    });
    const admitted = applyCitizenVariableQualificationAdmission({
      stations: [citizen],
      variableVerdicts: [
        { stationId: "citizen", variable: "humidity", status: "excluded" },
        { stationId: "citizen", variable: "pressure", status: "candidate" },
        { stationId: "citizen", variable: "windSpeed", status: null },
      ],
    });
    const result = calculateUltraLocal(admitted.stations, "local", 50.75, 2.52, 40, null, {
      recordStationReadings: false,
    });

    expect(admitted.exclusions).toHaveLength(3);
    expect(result.stationsUsed).toEqual([]);
    expect(result.humidity).toBeNull();
    expect(result.pressure).toBeNull();
    expect(result.windSpeed).toBeNull();
  });

  it("se compose après l’activation température sans modifier le filtre physique ou la suspension existante", () => {
    const physical = station({ stationId: "mf-physical" });
    const citizen = station({
      stationId: "citizen",
      source: "cwop",
      isActive: false,
      qualificationStatus: "candidate",
      humidity: 70,
      windSpeed: 18,
    });
    const composed = composeLocalSynthesisSources({
      physicalStations: [physical],
      citizenStations: [citizen],
      activation: { status: "activated" },
      verdictByStationId: new Map([["citizen", { stationId: "citizen", qualificationStatus: "validated" }]]),
    });
    const admitted = applyCitizenVariableQualificationAdmission({
      stations: composed,
      variableVerdicts: [
        { stationId: "citizen", variable: "humidity", status: "excluded" },
        { stationId: "citizen", variable: "pressure", status: "validated" },
        { stationId: "citizen", variable: "windSpeed", status: "validated" },
      ],
    });

    expect(admitted.stations.map((item) => item.stationId)).toEqual(["mf-physical", "citizen"]);
    expect(admitted.stations[0].humidity).toBe(60);
    expect(admitted.stations[1]).toMatchObject({ isActive: true, temperature: 20, humidity: null, windSpeed: 18 });
  });
});
