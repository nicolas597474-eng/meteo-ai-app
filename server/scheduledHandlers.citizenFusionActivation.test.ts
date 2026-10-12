import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FavoriteLocation, StationObservation, WeatherStation } from "../drizzle/schema";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getAllFavoriteLocations: vi.fn(),
    getValidatedCitizenStationsNearReference: vi.fn(),
    getActivePhysicalStationsNearReference: vi.fn(),
    getValidatedOfficialStationsNearReference: vi.fn(),
    getStationObservationsForQualification: vi.fn(),
    getCitizenFusionActivationNearReference: vi.fn(),
    upsertCitizenFusionActivation: vi.fn(),
  };
});

import { evaluateCitizenFusionActivations } from "./scheduledHandlers";
import {
  getAllFavoriteLocations,
  getActivePhysicalStationsNearReference,
  getCitizenFusionActivationNearReference,
  getStationObservationsForQualification,
  getValidatedCitizenStationsNearReference,
  getValidatedOfficialStationsNearReference,
  upsertCitizenFusionActivation,
} from "./db";

// Fixtures de test only : favoris, stations et relevés synthétiques, aucune observation réelle.
// Horodatage figé : l'évaluation est déterministe, la fenêtre de 30 jours couvre
// tous les relevés et l'heure d'archive (observedAt) diffère toujours de
// l'heure de mesure pour prouver qu'elle n'est jamais un substitut.

const AS_OF = Date.parse("2026-10-11T12:00:00Z");
const REFERENCE = { lat: 50.7567, lon: 2.5204 };

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

function favoriteFixture(userId: number, lat: number = REFERENCE.lat, lon: number = REFERENCE.lon): FavoriteLocation {
  return {
    id: userId,
    userId,
    name: "Hondeghem",
    customName: null,
    lat,
    lon,
    isDefault: 1,
    position: 0,
    localMode: "local",
    radiusKm: 20,
    preferredModels: null,
    tempUnit: "celsius",
    alertsEnabled: 1,
    alertThresholds: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  };
}

function stationFixture(
  stationId: string,
  source: "meteofrance" | "netatmo" | "opensensemap" | "cwop",
  distanceKm: number,
  reliabilityScore: number,
): WeatherStation {
  return {
    id: 1,
    stationId,
    source,
    name: `${stationId} · station de test`,
    lat: 50.76,
    lon: 2.52,
    altitude: 20,
    refLat: REFERENCE.lat,
    refLon: REFERENCE.lon,
    distanceKm,
    reliabilityScore,
    updateFrequencyMin: 60,
    dataAvailability: 0.95,
    isActive: 1,
    exclusionReason: null,
    qualificationStatus: "validated",
    sourceTier: source === "opensensemap" ? 3 : 1,
    firstSeen: new Date("2026-10-01T00:00:00Z"),
    lastSeen: new Date("2026-10-11T00:00:00Z"),
  };
}

function observationFixture(stationId: string, measuredAtIso: string, temperature: number): StationObservation {
  return {
    id: 1,
    stationId,
    // L'heure d'archive diffère de l'heure de mesure : elle ne doit jamais servir.
    observedAt: Date.parse(measuredAtIso) + 5 * 60 * 1000,
    temperature,
    humidity: null,
    pressure: null,
    windSpeed: null,
    windGust: null,
    windDirection: null,
    precipitation: null,
    measurementTimes: { temperature: measuredAtIso },
    collectedAt: new Date("2026-10-11T00:00:00Z"),
  };
}

function observationsFixture(): StationObservation[] {
  const rows: StationObservation[] = [];
  for (const hour of MEASURED_HOURS) {
    rows.push(observationFixture("mf-70260", hour, 15.0));
    rows.push(observationFixture("mf-70290", hour, 15.6));
    rows.push(observationFixture("netatmo-public-42", hour, 16.4));
    rows.push(observationFixture("opensensemap-6740", hour, 15.4));
  }
  return rows;
}

beforeEach(() => {
  vi.mocked(getAllFavoriteLocations).mockReset();
  vi.mocked(getValidatedCitizenStationsNearReference).mockReset();
  vi.mocked(getActivePhysicalStationsNearReference).mockReset();
  vi.mocked(getValidatedOfficialStationsNearReference).mockReset();
  vi.mocked(getStationObservationsForQualification).mockReset();
  vi.mocked(getCitizenFusionActivationNearReference).mockReset();
  vi.mocked(upsertCitizenFusionActivation).mockReset();
  vi.mocked(getAllFavoriteLocations).mockResolvedValue([]);
  vi.mocked(getCitizenFusionActivationNearReference).mockResolvedValue(null);
});

describe("evaluateCitizenFusionActivations · activation automatique par métriques", () => {
  it("passe toute référence sans capteur validé ni décision archivée, sans rien lire ni écrire", async () => {
    vi.mocked(getAllFavoriteLocations).mockResolvedValue([favoriteFixture(1)]);
    vi.mocked(getValidatedCitizenStationsNearReference).mockResolvedValue([]);

    const summary = await evaluateCitizenFusionActivations(AS_OF);

    expect(summary).toEqual({ evaluatedReferences: 0, activated: 0, persisted: 0 });
    expect(getValidatedCitizenStationsNearReference).toHaveBeenCalledTimes(1);
    expect(getCitizenFusionActivationNearReference).toHaveBeenCalledTimes(1);
    // Aucun historique n'est parcouru et aucune décision n'est écrite.
    expect(getActivePhysicalStationsNearReference).not.toHaveBeenCalled();
    expect(getValidatedOfficialStationsNearReference).not.toHaveBeenCalled();
    expect(getStationObservationsForQualification).not.toHaveBeenCalled();
    expect(upsertCitizenFusionActivation).not.toHaveBeenCalled();
  });

  it("évalue chaque référence distincte une seule fois, décide depuis le rapport mesuré et archive la décision", async () => {
    // Deux utilisateurs partagent la même référence de favori : une seule évaluation.
    vi.mocked(getAllFavoriteLocations).mockResolvedValue([favoriteFixture(1), favoriteFixture(2)]);
    vi.mocked(getValidatedCitizenStationsNearReference).mockResolvedValue([
      stationFixture("opensensemap-6740", "opensensemap", 1.5, 60),
    ]);
    vi.mocked(getActivePhysicalStationsNearReference).mockResolvedValue([
      stationFixture("mf-70260", "meteofrance", 12, 92),
      stationFixture("mf-70290", "meteofrance", 18, 88),
      stationFixture("netatmo-public-42", "netatmo", 2, 65),
    ]);
    vi.mocked(getValidatedOfficialStationsNearReference).mockResolvedValue([
      stationFixture("mf-70260", "meteofrance", 12, 92),
      stationFixture("mf-70290", "meteofrance", 18, 88),
    ]);
    vi.mocked(getStationObservationsForQualification).mockResolvedValue(observationsFixture());

    const summary = await evaluateCitizenFusionActivations(AS_OF);

    expect(summary).toEqual({ evaluatedReferences: 1, activated: 1, persisted: 1 });
    expect(getValidatedCitizenStationsNearReference).toHaveBeenCalledTimes(1);
    expect(upsertCitizenFusionActivation).toHaveBeenCalledTimes(1);
    const [row] = vi.mocked(upsertCitizenFusionActivation).mock.calls[0];
    expect(row).toMatchObject({
      refLat: REFERENCE.lat,
      refLon: REFERENCE.lon,
      status: "activated",
      version: "citizen-fusion-activation-v1",
      comparisons: MEASURED_HOURS.length,
      distinctDays: 3,
      windowDays: 30,
      baselineMaeC: 0.676,
      withCitizenMaeC: 0.373,
      improvementC: 0.303,
      validatedCitizenStations: ["opensensemap-6740"],
      firstComparedAt: "2026-10-05T09:00:00.000Z",
      lastComparedAt: "2026-10-07T11:00:00.000Z",
      evaluatedAt: AS_OF,
    });
    expect(row.reason).toContain("participent à la synthèse de température locale");
  });

  it("laisse une erreur isolée de référence sans interrompre les autres évaluations", async () => {
    vi.mocked(getAllFavoriteLocations).mockResolvedValue([
      favoriteFixture(1, 50.1234, 3.4567),
      favoriteFixture(2),
    ]);
    vi.mocked(getValidatedCitizenStationsNearReference).mockImplementation(async (lat: number) => {
      if (lat === 50.1234) throw new Error("Base indisponible pour cette référence");
      return [stationFixture("opensensemap-6740", "opensensemap", 1.5, 60)];
    });
    vi.mocked(getActivePhysicalStationsNearReference).mockResolvedValue([
      stationFixture("mf-70260", "meteofrance", 12, 92),
      stationFixture("mf-70290", "meteofrance", 18, 88),
      stationFixture("netatmo-public-42", "netatmo", 2, 65),
    ]);
    vi.mocked(getValidatedOfficialStationsNearReference).mockResolvedValue([
      stationFixture("mf-70260", "meteofrance", 12, 92),
      stationFixture("mf-70290", "meteofrance", 18, 88),
    ]);
    vi.mocked(getStationObservationsForQualification).mockResolvedValue(observationsFixture());

    const summary = await evaluateCitizenFusionActivations(AS_OF);

    // Seule la référence saine est évaluée et persistée ; l'erreur isolée
    // n'interrompt jamais le cycle et n'écrit aucune décision partielle.
    expect(summary).toEqual({ evaluatedReferences: 1, activated: 1, persisted: 1 });
    expect(upsertCitizenFusionActivation).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertCitizenFusionActivation).mock.calls[0][0].refLat).toBe(REFERENCE.lat);
  });
});
