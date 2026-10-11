import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import type { NearbyStationsCollection, StationData } from "../stationService";
import type { CitizenFusionActivation } from "../../drizzle/schema";

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
    getCitizenFusionActivationNearReference: vi.fn(),
  };
});

import { weatherRouter } from "./weather";
import { collectNearbyStationsWithDiagnostics, fetchCurrentModelReferences } from "../stationService";
import { getCitizenFusionActivationNearReference, getWeatherStationQualificationVerdicts } from "../db";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// Fixtures de test only : stations synthÃ©tiques, aucune observation rÃ©elle.

function stationFixture(): StationData {
  const now = new Date().toISOString();
  return {
    stationId: "netatmo-public-42",
    source: "netatmo",
    name: "Netatmo Â· Station de test",
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
    name: `${source} Â· capteur citoyen de test`,
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
    exclusionReason: "Capteur citoyen en validation â non utilisÃ© dans la tempÃ©rature locale",
  };
}

beforeEach(() => {
  vi.mocked(collectNearbyStationsWithDiagnostics).mockReset();
  vi.mocked(fetchCurrentModelReferences).mockReset();
  vi.mocked(fetchCurrentModelReferences).mockResolvedValue([]);
  vi.mocked(getWeatherStationQualificationVerdicts).mockReset();
  vi.mocked(getWeatherStationQualificationVerdicts).mockResolvedValue([]);
  vi.mocked(getCitizenFusionActivationNearReference).mockReset();
  vi.mocked(getCitizenFusionActivationNearReference).mockResolvedValue(null);
});

describe("weather.searchStations Â· verdicts de qualification persistÃ©s", () => {
  it("surcharge le statut live des capteurs citoyens avec le verdict persistÃ©, sans toucher aux stations physiques", async () => {
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
          "Erreur trop grande : MAE 2.9 Â°C au-delÃ  de la borne d'acceptation 1.5 Â°C, dÃ©rivÃ©e du dÃ©saccord officiel mesurÃ© (0.5 Â°C).",
      },
    ]);

    const result = await weatherRouter.createCaller(createPublicContext()).searchStations({
      lat: 50.76,
      lon: 2.52,
      radiusKm: 20,
    });

    // Seuls les capteurs citoyens sont interrogÃ©s, jamais la station physique.
    expect(getWeatherStationQualificationVerdicts).toHaveBeenCalledTimes(1);
    const requestedIds = vi.mocked(getWeatherStationQualificationVerdicts).mock.calls[0][0];
    expect(requestedIds).toContain("opensensemap-6740");
    expect(requestedIds).toContain("cwop-EW1234");
    expect(requestedIds).toContain("opensensemap-9999");
    expect(requestedIds).not.toContain("netatmo-public-42");

    const byStationId = new Map(result.stations.map((station) => [station.stationId, station]));

    // Capteur validÃ© : le verdict persistÃ© remplace le statut live Â« candidate Â»
    // et son motif live ; isActive n'est jamais rÃ©activÃ© par la vue.
    const validated = byStationId.get("opensensemap-6740");
    expect(validated).toMatchObject({
      source: "opensensemap",
      qualificationStatus: "validated",
      exclusionReason: null,
      isActive: false,
      sourceTier: 3,
    });

    // Capteur exclu : statut et motif persistÃ©s repris tels quels.
    const excluded = byStationId.get("cwop-EW1234");
    expect(excluded).toMatchObject({
      source: "cwop",
      qualificationStatus: "excluded",
      exclusionReason:
        "Erreur trop grande : MAE 2.9 Â°C au-delÃ  de la borne d'acceptation 1.5 Â°C, dÃ©rivÃ©e du dÃ©saccord officiel mesurÃ© (0.5 Â°C).",
      isActive: false,
    });

    // Candidat sans verdict persistÃ© : le statut live reste la vÃ©ritÃ©.
    const untouchedCandidate = byStationId.get("opensensemap-9999");
    expect(untouchedCandidate).toMatchObject({
      source: "opensensemap",
      qualificationStatus: "candidate",
      exclusionReason: "Capteur citoyen en validation â non utilisÃ© dans la tempÃ©rature locale",
      isActive: false,
    });

    // Station physique : aucun overlay, aucune Ã©criture du statut.
    const physical = byStationId.get("netatmo-public-42");
    expect(physical).toMatchObject({
      source: "netatmo",
      isActive: true,
      qualificationStatus: undefined,
    });
    expect(physical?.exclusionReason).toBeFalsy();
  });

  it("nâinterroge jamais les verdicts persistÃ©s quand aucune station citoyenne nâest collectÃ©e", async () => {
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

  it("compose la température locale avec le capteur validé uniquement quand la décision activée est persistée", async () => {
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

    const caller = weatherRouter.createCaller(createPublicContext());

    // Sans décision activée persistée, la synthèse live reste strictement
    // physique : aucun capteur citoyen ne rejoint la température locale.
    const withoutActivation = await caller.searchStations({ lat: 50.76, lon: 2.52, radiusKm: 20 });
    expect(withoutActivation.citizenFusionActivation).toBeNull();
    expect(withoutActivation.groundTruth.stationsUsed.map((station) => station.stationId))
      .toEqual(["netatmo-public-42"]);

    // Fixtures de test only : décision activée persistée par le cycle planifié.
    const activationRow: CitizenFusionActivation = {
      id: 7,
      refLat: 50.76,
      refLon: 2.52,
      status: "activated",
      version: "citizen-fusion-activation-v1",
      reason: "Amélioration mesurée : capteurs validés activés dans la synthèse locale.",
      comparisons: 9,
      distinctDays: 3,
      windowDays: 30,
      baselineMaeC: 0.676,
      withCitizenMaeC: 0.373,
      improvementC: 0.303,
      validatedCitizenStations: ["opensensemap-6740"],
      firstComparedAt: "2026-10-05T09:00:00Z",
      lastComparedAt: "2026-10-07T11:00:00Z",
      evaluatedAt: Date.parse("2026-10-11T12:00:00Z"),
      createdAt: new Date("2026-10-11T12:00:00Z"),
      updatedAt: new Date("2026-10-11T12:00:00Z"),
    };
    vi.mocked(getCitizenFusionActivationNearReference).mockResolvedValue(activationRow);

    const withActivation = await caller.searchStations({ lat: 50.76, lon: 2.52, radiusKm: 20 });
    expect(withActivation.citizenFusionActivation).toEqual({
      status: "activated",
      reason: activationRow.reason,
      evaluatedAt: activationRow.evaluatedAt,
    });
    // Seul le capteur validé rejoint la synthèse : le capteur exclu et le
    // candidat sans verdict persisté restent hors, la priorité technique
    // reste celle de la collecte.
    expect(withActivation.groundTruth.stationsUsed.map((station) => station.stationId).sort())
      .toEqual(["netatmo-public-42", "opensensemap-6740"]);
  });
});

