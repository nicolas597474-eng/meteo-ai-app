import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FavoriteLocation, StationObservation, WeatherStation } from "../drizzle/schema";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getAllFavoriteLocations: vi.fn(),
    getValidatedCitizenStationsNearReference: vi.fn(),
    getCitizenStationsForQualification: vi.fn(),
    getValidatedOfficialStationsNearReference: vi.fn(),
    getStationObservationsForQualification: vi.fn(),
    upsertCitizenSensorAnomaly: vi.fn(),
  };
});

import { evaluateCitizenSensorAnomalies } from "./scheduledHandlers";
import {
  getAllFavoriteLocations,
  getCitizenStationsForQualification,
  getStationObservationsForQualification,
  getValidatedCitizenStationsNearReference,
  getValidatedOfficialStationsNearReference,
  upsertCitizenSensorAnomaly,
} from "./db";
import { CITIZEN_ANOMALY_DETECTION_VERSION } from "./citizenSensorAnomalyService";

// Fixtures de test only : favoris, stations et relevés synthétiques, aucune
// observation réelle. Horodatage figé : l'évaluation est déterministe.

const AS_OF = Date.parse("2026-10-11T12:00:00Z");
const REFERENCE = { lat: 50.7567, lon: 2.5204 };
const EMPTY_REFERENCE = { lat: 48.8566, lon: 2.3522 };
const BROKEN_REFERENCE = { lat: 45.764, lon: 4.3559 };

const CITIZEN_STATION_ID = "osm-6740";
const OFFICIAL_STATION_IDS = ["mf-70260", "mf-70290"] as const;
/** Températures officielles constantes : médiane 15,4 °C, désaccord 0,4 °C, borne d'acceptation 1,3 °C. */
const OFFICIAL_TEMPERATURES_C: Record<string, number> = { "mf-70260": 15.0, "mf-70290": 15.8 };
const OFFICIAL_MEDIAN_C = 15.4;
/** Jours de référence du capteur : erreur ±0,2 °C selon la parité, MAE 0,2 °C sur 9 jours distincts. */
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
/** Jours récents : erreur constante +2,0 °C, MAE récent 2,0 °C au-delà de la borne d'anomalie 1,5 °C. */
const RECENT_DAYS = ["2026-10-09", "2026-10-10", "2026-10-11"];
const MEASUREMENT_HOURS_UTC = [9, 10, 11];

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

function officialStationFixture(stationId: string): WeatherStation {
  return {
    id: 2,
    stationId,
    source: "meteofrance",
    name: stationId + " · station officielle de test",
    lat: 50.77,
    lon: 2.53,
    altitude: 45,
    refLat: REFERENCE.lat,
    refLon: REFERENCE.lon,
    distanceKm: 8,
    reliabilityScore: 95,
    updateFrequencyMin: 60,
    dataAvailability: 0.99,
    isActive: 1,
    exclusionReason: null,
    qualificationStatus: "validated",
    sourceTier: 1,
    firstSeen: new Date("2026-09-01T00:00:00Z"),
    lastSeen: new Date("2026-10-11T00:00:00Z"),
  };
}

function observationRowFixture(
  stationId: string,
  day: string,
  hour: number,
  temperature: number,
  id: number,
): StationObservation {
  const measuredAt = `${day}T${String(hour).padStart(2, "0")}:00:00Z`;
  return {
    id,
    stationId,
    observedAt: Date.parse(measuredAt),
    temperature,
    humidity: null,
    pressure: null,
    windSpeed: null,
    windGust: null,
    windDirection: null,
    precipitation: null,
    measurementTimes: { temperature: measuredAt },
    collectedAt: new Date(measuredAt),
  };
}

/**
 * Construit l'historique aligné du capteur citoyen et de ses deux témoins
 * officiels : même heure de mesure propre à la température à chaque point.
 */
function observationRowsFixture(options: { includeRecentDays: boolean }): StationObservation[] {
  const days = options.includeRecentDays ? [...BASELINE_DAYS, ...RECENT_DAYS] : [...BASELINE_DAYS];
  const rows: StationObservation[] = [];
  let nextId = 1;
  days.forEach((day, dayIndex) => {
    MEASUREMENT_HOURS_UTC.forEach((hour, hourIndex) => {
      const errorC = RECENT_DAYS.includes(day)
        ? 2.0
        : (dayIndex + hourIndex) % 2 === 0 ? 0.2 : -0.2;
      rows.push(observationRowFixture(CITIZEN_STATION_ID, day, hour, OFFICIAL_MEDIAN_C + errorC, nextId++));
      for (const stationId of OFFICIAL_STATION_IDS) {
        rows.push(observationRowFixture(stationId, day, hour, OFFICIAL_TEMPERATURES_C[stationId], nextId++));
      }
    });
  });
  return rows;
}

function mockNominalReferenceReads(includeRecentDays: boolean) {
  vi.mocked(getCitizenStationsForQualification).mockResolvedValue([citizenStationFixture(CITIZEN_STATION_ID)]);
  vi.mocked(getValidatedOfficialStationsNearReference).mockResolvedValue(
    OFFICIAL_STATION_IDS.map((stationId) => officialStationFixture(stationId)),
  );
  vi.mocked(getStationObservationsForQualification).mockResolvedValue(
    observationRowsFixture({ includeRecentDays }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(upsertCitizenSensorAnomaly).mockResolvedValue(1);
});

describe("evaluateCitizenSensorAnomalies", () => {
  it("archive un signal « anomaly » mesuré, jamais pour une référence sans capteur validé", async () => {
    vi.mocked(getAllFavoriteLocations).mockResolvedValue([
      favoriteFixture(1, REFERENCE.lat, REFERENCE.lon),
      favoriteFixture(2, EMPTY_REFERENCE.lat, EMPTY_REFERENCE.lon),
    ]);
    vi.mocked(getValidatedCitizenStationsNearReference).mockImplementation(async (lat: number) =>
      Math.abs(lat - REFERENCE.lat) < 0.001 ? [citizenStationFixture(CITIZEN_STATION_ID)] : []);
    mockNominalReferenceReads(true);

    const summary = await evaluateCitizenSensorAnomalies(AS_OF);

    expect(summary).toEqual({ evaluatedReferences: 1, evaluatedSensors: 1, flagged: 1, persisted: 1 });
    expect(upsertCitizenSensorAnomaly).toHaveBeenCalledTimes(1);
    const row = vi.mocked(upsertCitizenSensorAnomaly).mock.calls[0][0];
    expect(row.stationId).toBe(CITIZEN_STATION_ID);
    expect(row.refLat).toBeCloseTo(REFERENCE.lat, 4);
    expect(row.refLon).toBeCloseTo(REFERENCE.lon, 4);
    expect(row.version).toBe(CITIZEN_ANOMALY_DETECTION_VERSION);
    expect(row.status).toBe("anomaly");
    // MAE récent 2,0 °C au-delà de la borne d'anomalie max(1,3 ; 2 × 0,5 + 0,5 = 1,5) °C.
    expect(row.recentMaeC).toBeCloseTo(2.0, 6);
    expect(row.anomalyThresholdC).toBeCloseTo(1.5, 6);
    expect(row.baselineMaeC).toBeCloseTo(0.2, 6);
    expect(row.baselineAcceptanceBoundC).toBeCloseTo(1.3, 6);
    expect(row.recentComparisons).toBe(9);
    expect(row.recentDistinctDays).toBe(3);
    expect(row.recentMeanOfficialDisagreementC).toBeCloseTo(0.4, 6);
    expect(row.baselineWindowDays).toBe(30);
    expect(row.recentWindowDays).toBe(3);
    expect(row.evaluatedAt).toBe(AS_OF);
    expect(row.firstComparedAt).toBe("2026-10-09T09:00:00.000Z");
    expect(row.lastComparedAt).toBe("2026-10-11T11:00:00.000Z");
  });

  it("une référence en erreur n'interrompt jamais les autres", async () => {
    vi.mocked(getAllFavoriteLocations).mockResolvedValue([
      favoriteFixture(1, BROKEN_REFERENCE.lat, BROKEN_REFERENCE.lon),
      favoriteFixture(2, REFERENCE.lat, REFERENCE.lon),
    ]);
    vi.mocked(getValidatedCitizenStationsNearReference).mockImplementation(async (lat: number) =>
      Math.abs(lat - REFERENCE.lat) < 0.001 || Math.abs(lat - BROKEN_REFERENCE.lat) < 0.001
        ? [citizenStationFixture(CITIZEN_STATION_ID)]
        : []);
    vi.mocked(getCitizenStationsForQualification).mockImplementation(async (lat: number) => {
      if (Math.abs(lat - BROKEN_REFERENCE.lat) < 0.001) throw new Error("base indisponible : test");
      return [citizenStationFixture(CITIZEN_STATION_ID)];
    });
    vi.mocked(getValidatedOfficialStationsNearReference).mockResolvedValue(
      OFFICIAL_STATION_IDS.map((stationId) => officialStationFixture(stationId)),
    );
    vi.mocked(getStationObservationsForQualification).mockResolvedValue(
      observationRowsFixture({ includeRecentDays: true }),
    );

    const summary = await evaluateCitizenSensorAnomalies(AS_OF);

    expect(summary).toEqual({ evaluatedReferences: 1, evaluatedSensors: 1, flagged: 1, persisted: 1 });
    expect(upsertCitizenSensorAnomaly).toHaveBeenCalledTimes(1);
  });

  it("un signal « unproven » n'est jamais archivé : la décision précédente demeure", async () => {
    vi.mocked(getAllFavoriteLocations).mockResolvedValue([
      favoriteFixture(1, REFERENCE.lat, REFERENCE.lon),
    ]);
    vi.mocked(getValidatedCitizenStationsNearReference).mockResolvedValue([
      citizenStationFixture(CITIZEN_STATION_ID),
    ]);
    // Historique complet hors fenêtre récente : la preuve de référence reste
    // mesurée, mais la fenêtre récente est vide — aucune anomalie n'est
    // décrétée, et aucun acquittement n'est archivé.
    mockNominalReferenceReads(false);

    const summary = await evaluateCitizenSensorAnomalies(AS_OF);

    expect(summary).toEqual({ evaluatedReferences: 1, evaluatedSensors: 1, flagged: 0, persisted: 0 });
    expect(upsertCitizenSensorAnomaly).not.toHaveBeenCalled();
  });
});
