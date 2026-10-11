import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import type { NearbyStationsCollection, StationData } from "../stationService";

vi.mock("../stationService", async () => {
  const actual = await vi.importActual<typeof import("../stationService")>("../stationService");
  return {
    ...actual,
    collectNearbyStationsWithDiagnostics: vi.fn(),
    fetchCurrentModelReferences: vi.fn(),
  };
});

vi.mock("../db", async () => {
  const actual = await vi.importActual<typeof import("../db")>("../db");
  return {
    ...actual,
    getWeatherStationQualificationVerdicts: vi.fn(),
  };
});

import { weatherRouter } from "./weather";
import { collectNearbyStationsWithDiagnostics, fetchCurrentModelReferences } from "../stationService";
import { getWeatherStationQualificationVerdicts } from "../db";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// Fixtures de test only : stations synthétiques, aucune observation réelle.

function stationFixture(): StationData {
  const now = new Date().toISOString();
  return {
    stationId: "netatmo-public-42",
    source: "netatmo",
    name: "Netatmo · Station de test",
    lat: 50.76,
    lon: 2.52,
    altitude: 10,
    distanceKm: 3,
    temperature: 18,
    humidity: 65,
    pressure: 1018,
    windSpeed: 9,
    windGust: 15,
    windDirection: 180,
    precipitation: null,
    updatedAt: now,
    measurementTimes: {
      temperature: now,
      humidity: now,
      pressure: now,
      windSpeed: now,
      windGust: now,
      windDirection: now,
      precipitation: now,
    },
    reliabilityScore: 65,
    updateFrequencyMin: 10,
    dataAvailability: 0.75,
    isActive: true,
  };
}

function citizenStationFixture(stationId: string, source: "opensensemap" | "cwop", distanceKm: number): StationData {
  const now = new Date().toISOString();
  return {
    stationId,
    source,
    name: `${source} · capteur citoyen de test`,
    lat: 50.755,
    lon: 2.522,
    altitude: 20,
    distanceKm,
    temperature: 18.2,
    humidity: null,
    pressure: 1013.1,
    windSpeed: 9.4,
    windGust: null,
    windDirection: 210,
    precipitation: null,
    updatedAt: now,
    measurementTimes: {
      temperature: now,
      humidity: null,
      pressure: now,
      windSpeed: now,
      windGust: null,
      windDirection: now,
      precipitation: null,
    },
    reliabilityScore: 60,
    updateFrequencyMin: 15,
    dataAvailability: 0.7,
    isActive: false,
    qualificationStatus: "candidate",
    sourceTier: 3,
    exclusionReason: "Capteur citoyen en validation — non utilisé dans la température locale",
  };
}

beforeEach(() => {
  vi.mocked(collectNearbyStationsWithDiagnostics).mockReset();
  vi.mocked(fetchCurrentModelReferences).mockReset();
  vi.mocked(fetchCurrentModelReferences).mockResolvedValue([]);
  vi.mocked(getWeatherStationQualificationVerdicts).mockReset();
  vi.mocked(getWeatherStationQualificationVerdicts).mockResolvedValue([]);
});

describe("weather.searchStations · verdicts de qualification persistés", () => {
  it("surcharge le statut live des capteurs citoyens avec le verdict persisté, sans toucher aux stations physiques", async () => {
    const collection: NearbyStationsCollection = {
      stations: [
        citizenStationFixture("opensensemap-6740", "opensensemap", 1.8),
        citizenStationFixture("cwop-EW1234", "cwop", 4.2),
        citizenStationFixture("opensensemap-9999", "opensensemap", 6.5),
        stationFixture(),
      ],
      sourceDiagnostics: [
        { source: "meteofrance", status: "success_empty", stationCount: 0 },
        { source: "netatmo", status: "success_with_data", stationCount: 1 },
        { source: "opensensemap", status: "success_with_data", stationCount: 2 },
        { source: "cwop", status: "success_with_data", stationCount: 1 },
      ],
      cacheHit: false,
    };
    vi.mocked(collectNearbyStationsWithDiagnostics).mockResolvedValue(collection);
    vi.mocked(getWeatherStationQualificationVerdicts).mockResolvedValue([
      {
        stationId: "opensensemap-6740",
        qualificationStatus: "validated",
        exclusionReason: null,
      },
      {
        stationId: "cwop-EW1234",
        qualificationStatus: "excluded",
        exclusionReason:
          "Erreur trop grande : MAE 2.9 °C au-delà de la borne d'acceptation 1.5 °C, dérivée du désaccord officiel mesuré (0.5 °C).",
      },
    ]);

    const result = await weatherRouter.createCaller(createPublicContext()).searchStations({
      lat: 50.76,
      lon: 2.52,
      radiusKm: 20,
    });

    // Seuls les capteurs citoyens sont interrogés, jamais la station physique.
    expect(getWeatherStationQualificationVerdicts).toHaveBeenCalledTimes(1);
    const requestedIds = vi.mocked(getWeatherStationQualificationVerdicts).mock.calls[0][0];
    expect(requestedIds).toContain("opensensemap-6740");
    expect(requestedIds).toContain("cwop-EW1234");
    expect(requestedIds).toContain("opensensemap-9999");
    expect(requestedIds).not.toContain("netatmo-public-42");

    const byStationId = new Map(result.stations.map((station) => [station.stationId, station]));

    // Capteur validé : le verdict persisté remplace le statut live « candidate »
    // et son motif live ; isActive n'est jamais réactivé par la vue.
    const validated = byStationId.get("opensensemap-6740");
    expect(validated).toMatchObject({
      source: "opensensemap",
      qualificationStatus: "validated",
      exclusionReason: null,
      isActive: false,
      sourceTier: 3,
    });

    // Capteur exclu : statut et motif persistés repris tels quels.
    const excluded = byStationId.get("cwop-EW1234");
    expect(excluded).toMatchObject({
      source: "cwop",
      qualificationStatus: "excluded",
      exclusionReason:
        "Erreur trop grande : MAE 2.9 °C au-delà de la borne d'acceptation 1.5 °C, dérivée du désaccord officiel mesuré (0.5 °C).",
      isActive: false,
    });

    // Candidat sans verdict persisté : le statut live reste la vérité.
    const untouchedCandidate = byStationId.get("opensensemap-9999");
    expect(untouchedCandidate).toMatchObject({
      source: "opensensemap",
      qualificationStatus: "candidate",
      exclusionReason: "Capteur citoyen en validation — non utilisé dans la température locale",
      isActive: false,
    });

    // Station physique : aucun overlay, aucune écriture du statut.
    const physical = byStationId.get("netatmo-public-42");
    expect(physical).toMatchObject({
      source: "netatmo",
      isActive: true,
      qualificationStatus: undefined,
    });
    expect(physical?.exclusionReason).toBeFalsy();
  });

  it("n’interroge jamais les verdicts persistés quand aucune station citoyenne n’est collectée", async () => {
    const collection: NearbyStationsCollection = {
      stations: [stationFixture()],
      sourceDiagnostics: [
        { source: "meteofrance", status: "success_empty", stationCount: 0 },
        { source: "netatmo", status: "success_with_data", stationCount: 1 },
        { source: "opensensemap", status: "success_empty", stationCount: 0 },
        { source: "cwop", status: "success_empty", stationCount: 0 },
      ],
      cacheHit: false,
    };
    vi.mocked(collectNearbyStationsWithDiagnostics).mockResolvedValue(collection);

    const result = await weatherRouter.createCaller(createPublicContext()).searchStations({
      lat: 50.76,
      lon: 2.52,
      radiusKm: 20,
    });

    expect(getWeatherStationQualificationVerdicts).not.toHaveBeenCalled();
    expect(result.stations.map((station) => station.stationId)).toEqual(["netatmo-public-42"]);
    expect(result.stations[0].qualificationStatus).toBeUndefined();
  });
});
