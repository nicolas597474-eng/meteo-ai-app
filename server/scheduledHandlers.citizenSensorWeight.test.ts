import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CitizenQualificationEvidenceReadModel } from "./citizenQualificationEvidenceLoader";
import type { OpenSenseMapQualificationEvidence } from "./openSenseMapQualificationService";
import type { FavoriteLocation, WeatherStation } from "../drizzle/schema";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getAllFavoriteLocations: vi.fn(),
    getValidatedCitizenStationsNearReference: vi.fn(),
    upsertCitizenSensorWeight: vi.fn(),
  };
});

vi.mock("./citizenQualificationEvidenceLoader", () => ({
  loadCitizenQualificationEvidence: vi.fn(),
}));

import { evaluateCitizenSensorWeights } from "./scheduledHandlers";
import { getAllFavoriteLocations, getValidatedCitizenStationsNearReference, upsertCitizenSensorWeight } from "./db";
import { loadCitizenQualificationEvidence } from "./citizenQualificationEvidenceLoader";
import { CITIZEN_SENSOR_WEIGHTING_VERSION } from "./citizenSensorWeightingService";

// Fixtures de test only : favoris, stations et preuves synthétiques, aucune
// observation réelle. Horodatage figé : l'évaluation est déterministe.

const AS_OF = Date.parse("2026-10-11T12:00:00Z");
const REFERENCE = { lat: 50.7567, lon: 2.5204 };
const EMPTY_REFERENCE = { lat: 48.8566, lon: 2.3522 };
const BROKEN_REFERENCE = { lat: 45.764, lon: 4.3559 };

function favoriteFixture(userId: number, lat: number, lon: number): FavoriteLocation {
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

function citizenStationFixture(stationId: string): WeatherStation {
  return {
    id: 1,
    stationId,
    source: "opensensemap",
    name: stationId + " · capteur de test",
    lat: 50.76,
    lon: 2.52,
    altitude: 20,
    refLat: REFERENCE.lat,
    refLon: REFERENCE.lon,
    distanceKm: 3,
    reliabilityScore: 50,
    updateFrequencyMin: 60,
    dataAvailability: 0.95,
    isActive: 1,
    exclusionReason: null,
    qualificationStatus: "validated",
    sourceTier: 3,
    firstSeen: new Date("2026-10-01T00:00:00Z"),
    lastSeen: new Date("2026-10-11T00:00:00Z"),
  };
}

function evidenceFixture(overrides: Partial<OpenSenseMapQualificationEvidence> = {}): OpenSenseMapQualificationEvidence {
  return {
    comparisons: 9,
    retainedComparisons: 9,
    outlierComparisons: 0,
    distinctDays: 3,
    officialStationsUsed: ["mf-70260", "mf-70290"],
    meanOfficialDisagreementC: 0.4,
    acceptanceBoundC: 1.3,
    meanAbsoluteErrorC: 0.5,
    meanBiasC: 0.05,
    firstComparedAt: "2026-10-05T09:00:00.000Z",
    lastComparedAt: "2026-10-07T11:00:00.000Z",
    ...overrides,
  };
}

function evidenceModelFixture(): CitizenQualificationEvidenceReadModel {
  return {
    entries: [
      {
        stationId: "osm-6740",
        status: "validated",
        reason: "Capteur de test validé.",
        evidence: evidenceFixture(),
        progress: {
          comparisons: 9,
          minimumComparisons: 7,
          remainingComparisons: 0,
          distinctDays: 3,
          minimumDistinctDays: 3,
          remainingDistinctDays: 0,
          gate: "complete",
        },
      },
      {
        stationId: "osm-999",
        status: "candidate",
        reason: "Capteur de test encore candidat.",
        evidence: evidenceFixture({ comparisons: 2, retainedComparisons: 2, meanAbsoluteErrorC: null, meanBiasC: null }),
        progress: {
          comparisons: 2,
          minimumComparisons: 7,
          remainingComparisons: 5,
          distinctDays: 1,
          minimumDistinctDays: 3,
          remainingDistinctDays: 2,
          gate: "comparisons",
        },
      },
    ],
    historyWindowDays: 30,
    asOf: AS_OF,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(upsertCitizenSensorWeight).mockResolvedValue(1);
});

describe("evaluateCitizenSensorWeights", () => {
  it("archive un poids par capteur validé, jamais pour un candidat ni une référence vide", async () => {
    vi.mocked(getAllFavoriteLocations).mockResolvedValue([
      favoriteFixture(1, REFERENCE.lat, REFERENCE.lon),
      favoriteFixture(2, EMPTY_REFERENCE.lat, EMPTY_REFERENCE.lon),
    ]);
    vi.mocked(getValidatedCitizenStationsNearReference).mockImplementation(async (lat: number) =>
      Math.abs(lat - REFERENCE.lat) < 0.001 ? [citizenStationFixture("osm-6740")] : []);
    vi.mocked(loadCitizenQualificationEvidence).mockResolvedValue(evidenceModelFixture());

    const summary = await evaluateCitizenSensorWeights(AS_OF);

    expect(summary).toEqual({ evaluatedReferences: 1, weightedSensors: 1, persisted: 1 });
    expect(loadCitizenQualificationEvidence).toHaveBeenCalledTimes(1);
    expect(upsertCitizenSensorWeight).toHaveBeenCalledTimes(1);
    const row = vi.mocked(upsertCitizenSensorWeight).mock.calls[0][0];
    expect(row.stationId).toBe("osm-6740");
    expect(row.refLat).toBeCloseTo(REFERENCE.lat, 4);
    expect(row.refLon).toBeCloseTo(REFERENCE.lon, 4);
    expect(row.version).toBe(CITIZEN_SENSOR_WEIGHTING_VERSION);
    // MAE 0,5 seul capteur validé → MAE régularisé 0,5 → 1/0,5 plafonné à 2.
    expect(row.performanceMultiplier).toBeCloseTo(2, 6);
    expect(row.windowDays).toBe(30);
    expect(row.evaluatedAt).toBe(AS_OF);
    expect(row.meanBiasC).toBeCloseTo(0.05, 10);
  });

  it("une référence en erreur n'interrompt jamais les autres", async () => {
    vi.mocked(getAllFavoriteLocations).mockResolvedValue([
      favoriteFixture(1, BROKEN_REFERENCE.lat, BROKEN_REFERENCE.lon),
      favoriteFixture(2, REFERENCE.lat, REFERENCE.lon),
    ]);
    vi.mocked(getValidatedCitizenStationsNearReference).mockImplementation(async (lat: number) =>
      Math.abs(lat - REFERENCE.lat) < 0.001 || Math.abs(lat - BROKEN_REFERENCE.lat) < 0.001
        ? [citizenStationFixture("osm-6740")]
        : []);
    vi.mocked(loadCitizenQualificationEvidence).mockImplementation(async (lat: number) => {
      if (Math.abs(lat - BROKEN_REFERENCE.lat) < 0.001) throw new Error("base indisponible : test");
      return evidenceModelFixture();
    });

    const summary = await evaluateCitizenSensorWeights(AS_OF);

    expect(summary).toEqual({ evaluatedReferences: 1, weightedSensors: 1, persisted: 1 });
    expect(upsertCitizenSensorWeight).toHaveBeenCalledTimes(1);
  });
});
