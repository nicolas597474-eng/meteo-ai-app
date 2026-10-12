import { describe, expect, it } from "vitest";
import type { StationData, StationSource } from "./stationService";
import { composeLocalSynthesisSources } from "./citizenFusionActivationService";

// Fixtures de test only : stations synthétiques, aucune observation réelle.

function stationFixture(
  stationId: string,
  source: StationSource,
  overrides: Partial<StationData> = {},
): StationData {
  return {
    stationId,
    source,
    name: `${stationId} · station de test`,
    lat: 50.76,
    lon: 2.52,
    altitude: 20,
    distanceKm: 3,
    temperature: 15.4,
    humidity: null,
    pressure: null,
    windSpeed: null,
    windGust: null,
    windDirection: null,
    precipitation: null,
    updatedAt: "2026-10-11T11:00:00Z",
    reliabilityScore: 60,
    updateFrequencyMin: 60,
    dataAvailability: 0.95,
    isActive: false,
    exclusionReason: "Capteur citoyen en validation — non utilisé dans la température locale",
    ...overrides,
  };
}

describe("composeLocalSynthesisSources · suspension d'anomalie (bloc 6)", () => {
  const PHYSICAL: StationData[] = [
    stationFixture("netatmo-public-42", "netatmo", { isActive: true, reliabilityScore: 65 }),
  ];
  const CITIZENS: StationData[] = [
    stationFixture("opensensemap-6740", "opensensemap", {
      reliabilityScore: 0,
      qualificationStatus: "candidate",
    }),
  ];
  const VERDICTS = new Map([
    ["opensensemap-6740", { stationId: "opensensemap-6740", qualificationStatus: "validated" }],
  ]);
  const ACTIVATED = { status: "activated" as const };

  it("suspend temporairement le capteur validé porteur d'une anomalie aiguë persistée", () => {
    const sources = composeLocalSynthesisSources({
      physicalStations: PHYSICAL,
      citizenStations: CITIZENS,
      activation: ACTIVATED,
      verdictByStationId: VERDICTS,
      anomalousStationIds: new Set(["opensensemap-6740"]),
    });
    expect(sources.map((station) => station.stationId)).toEqual(["netatmo-public-42"]);
  });

  it("ne suspend jamais une station physique, même si son identifiant figure dans les anomalies", () => {
    const sources = composeLocalSynthesisSources({
      physicalStations: PHYSICAL,
      citizenStations: CITIZENS,
      activation: ACTIVATED,
      verdictByStationId: VERDICTS,
      anomalousStationIds: new Set(["netatmo-public-42", "opensensemap-6740"]),
    });
    expect(sources.map((station) => station.stationId)).toEqual(["netatmo-public-42"]);
  });

  it("compose sans changement quand aucune anomalie n'est persistée", () => {
    const sources = composeLocalSynthesisSources({
      physicalStations: PHYSICAL,
      citizenStations: CITIZENS,
      activation: ACTIVATED,
      verdictByStationId: VERDICTS,
      anomalousStationIds: new Set(),
    });
    expect(sources.map((station) => station.stationId)).toEqual(["netatmo-public-42", "opensensemap-6740"]);

    // Paramètre absent : comportement inchangé, aucune valeur inventée.
    const withoutParameter = composeLocalSynthesisSources({
      physicalStations: PHYSICAL,
      citizenStations: CITIZENS,
      activation: ACTIVATED,
      verdictByStationId: VERDICTS,
    });
    expect(withoutParameter.map((station) => station.stationId)).toEqual(["netatmo-public-42", "opensensemap-6740"]);
  });
});
