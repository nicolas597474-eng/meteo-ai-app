import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FavoriteLocation, StationObservation, WeatherStation } from "../drizzle/schema";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getAllFavoriteLocations: vi.fn(),
    getCitizenStationsForQualification: vi.fn(),
    getValidatedOfficialStationsNearReference: vi.fn(),
    getStationObservationsForQualification: vi.fn(),
    upsertCitizenVariableQualification: vi.fn(),
  };
});

import { evaluateCitizenVariableQualifications } from "./scheduledHandlers";
import {
  getAllFavoriteLocations,
  getCitizenStationsForQualification,
  getStationObservationsForQualification,
  getValidatedOfficialStationsNearReference,
  upsertCitizenVariableQualification,
} from "./db";
import { CITIZEN_VARIABLE_QUALIFICATION_VERSION } from "./citizenVariableQualificationService";

// Fixtures de test only : favoris, stations et relevés synthétiques, aucune
// observation réelle. Horodatage figé : l'évaluation est déterministe.

const AS_OF = Date.parse("2026-10-11T12:00:00Z");
const REFERENCE = { lat: 50.7567, lon: 2.5204 };
const BROKEN_REFERENCE = { lat: 45.764, lon: 4.3559 };

const CITIZEN_STATION_ID = "osm-6740";
const OFFICIAL_STATION_IDS = ["mf-70260", "mf-70290"] as const;
/** Témoins officiels constants : humidité 70/74 % (médiane 72), pression 1013.0/1013.4 hPa (médiane 1013.2), vent 10/14 km/h (médiane 12). */
const OFFICIAL_VALUES = {
  "mf-70260": { humidity: 70, pressure: 1013.0, windSpeed: 10 },
  "mf-70290": { humidity: 74, pressure: 1013.4, windSpeed: 14 },
};
/** Jours de référence : 9 jours distincts × 3 heures → 27 comparaisons alignées par grandeur. */
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
    qualificationStatus: "candidate",
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
  values: { humidity: number; pressure: number; windSpeed: number },
  id: number,
): StationObservation {
  const measuredAt = `${day}T${String(hour).padStart(2, "0")}:00:00Z`;
  return {
    id,
    stationId,
    observedAt: Date.parse(measuredAt),
    temperature: null,
    humidity: values.humidity,
    pressure: values.pressure,
    windSpeed: values.windSpeed,
    windGust: null,
    windDirection: null,
    precipitation: null,
    measurementTimes: { humidity: measuredAt, pressure: measuredAt, windSpeed: measuredAt },
    collectedAt: new Date(measuredAt),
  };
}

/**
 * Construit l'historique aligné du capteur citoyen et de ses deux témoins
 * officiels : même heure de mesure propre à chaque grandeur à chaque point.
 * Les erreurs du capteur suivent la parité — MAE 0,5 %, 0,1 hPa, 0,5 km/h —
 * toutes sous la borne d'acceptation mesurée de leur grandeur.
 */
function observationRowsFixture(days: readonly string[]): StationObservation[] {
  const rows: StationObservation[] = [];
  let nextId = 1;
  days.forEach((day, dayIndex) => {
    MEASUREMENT_HOURS_UTC.forEach((hour, hourIndex) => {
      const sign = (dayIndex + hourIndex) % 2 === 0 ? 1 : -1;
      rows.push(observationRowFixture(CITIZEN_STATION_ID, day, hour, {
        humidity: 72 + 0.5 * sign,
        pressure: 1013.2 + 0.1 * sign,
        windSpeed: 12 + 0.5 * sign,
      }, nextId++));
      for (const stationId of OFFICIAL_STATION_IDS) {
        rows.push(observationRowFixture(stationId, day, hour, OFFICIAL_VALUES[stationId], nextId++));
      }
    });
  });
  return rows;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(upsertCitizenVariableQualification).mockResolvedValue(1);
});

describe("evaluateCitizenVariableQualifications", () => {
  it("archive un profil définitif par grandeur, jamais pour une référence sans capteur citoyen", async () => {
    vi.mocked(getAllFavoriteLocations).mockResolvedValue([
      favoriteFixture(1, REFERENCE.lat, REFERENCE.lon),
    ]);
    vi.mocked(getCitizenStationsForQualification).mockResolvedValue([
      citizenStationFixture(CITIZEN_STATION_ID),
    ]);
    vi.mocked(getValidatedOfficialStationsNearReference).mockResolvedValue(
      OFFICIAL_STATION_IDS.map((stationId) => officialStationFixture(stationId)),
    );
    vi.mocked(getStationObservationsForQualification).mockResolvedValue(
      observationRowsFixture(BASELINE_DAYS),
    );

    const summary = await evaluateCitizenVariableQualifications(AS_OF);

    expect(summary).toEqual({ evaluatedReferences: 1, evaluatedCandidates: 1, persisted: 3 });
    expect(upsertCitizenVariableQualification).toHaveBeenCalledTimes(3);
    const rows = vi.mocked(upsertCitizenVariableQualification).mock.calls.map((call) => call[0]);
    expect(rows.map((row) => row.variable).sort()).toEqual(["humidity", "pressure", "windSpeed"]);
    for (const row of rows) {
      expect(row.status).toBe("validated");
      expect(row.version).toBe(CITIZEN_VARIABLE_QUALIFICATION_VERSION);
      expect(row.stationId).toBe(CITIZEN_STATION_ID);
      expect(row.refLat).toBeCloseTo(REFERENCE.lat, 4);
      expect(row.refLon).toBeCloseTo(REFERENCE.lon, 4);
      expect(row.evaluatedAt).toBe(AS_OF);
    }

    // Humidité : désaccord officiel 2 % → borne clamp(2 × 2 + 5, [5, 20]) = 9 %.
    const humidity = rows.find((row) => row.variable === "humidity");
    expect(humidity?.comparisons).toBe(27);
    expect(humidity?.distinctDays).toBe(9);
    expect(humidity?.acceptanceBound).toBeCloseTo(9, 6);
    expect(humidity?.meanAbsoluteError).toBeCloseTo(0.5, 6);
    expect(humidity?.officialStationsUsed).toEqual(["mf-70260", "mf-70290"]);
    expect(humidity?.firstComparedAt).toBe("2026-09-29T09:00:00.000Z");
    expect(humidity?.lastComparedAt).toBe("2026-10-07T11:00:00.000Z");

    // Pression : désaccord officiel 0,2 hPa → borne clamp(0,9, [1, 3]) = 1 hPa.
    const pressure = rows.find((row) => row.variable === "pressure");
    expect(pressure?.acceptanceBound).toBeCloseTo(1, 6);
    expect(pressure?.meanAbsoluteError).toBeCloseTo(0.1, 6);

    // Vent : désaccord officiel 2 km/h → borne clamp(2 × 2 + 3, [3, 15]) = 7 km/h.
    const windSpeed = rows.find((row) => row.variable === "windSpeed");
    expect(windSpeed?.acceptanceBound).toBeCloseTo(7, 6);
    expect(windSpeed?.meanAbsoluteError).toBeCloseTo(0.5, 6);
  });

  it("une référence en erreur n'interrompt jamais les autres", async () => {
    vi.mocked(getAllFavoriteLocations).mockResolvedValue([
      favoriteFixture(1, BROKEN_REFERENCE.lat, BROKEN_REFERENCE.lon),
      favoriteFixture(2, REFERENCE.lat, REFERENCE.lon),
    ]);
    vi.mocked(getCitizenStationsForQualification).mockImplementation(async (lat: number) => {
      if (Math.abs(lat - BROKEN_REFERENCE.lat) < 0.001) throw new Error("base indisponible : test");
      return [citizenStationFixture(CITIZEN_STATION_ID)];
    });
    vi.mocked(getValidatedOfficialStationsNearReference).mockResolvedValue(
      OFFICIAL_STATION_IDS.map((stationId) => officialStationFixture(stationId)),
    );
    vi.mocked(getStationObservationsForQualification).mockResolvedValue(
      observationRowsFixture(BASELINE_DAYS),
    );

    const summary = await evaluateCitizenVariableQualifications(AS_OF);

    expect(summary).toEqual({ evaluatedReferences: 1, evaluatedCandidates: 1, persisted: 3 });
    expect(upsertCitizenVariableQualification).toHaveBeenCalledTimes(3);
  });

  it("un profil candidat n'est jamais archivé : l'historique continue de s'accumuler", async () => {
    vi.mocked(getAllFavoriteLocations).mockResolvedValue([
      favoriteFixture(1, REFERENCE.lat, REFERENCE.lon),
    ]);
    vi.mocked(getCitizenStationsForQualification).mockResolvedValue([
      citizenStationFixture(CITIZEN_STATION_ID),
    ]);
    vi.mocked(getValidatedOfficialStationsNearReference).mockResolvedValue(
      OFFICIAL_STATION_IDS.map((stationId) => officialStationFixture(stationId)),
    );
    // Deux jours d'historique seulement : 6 comparaisons sur 2 jours distincts,
    // chaque grandeur reste candidate — aucun verdict, aucune écriture.
    vi.mocked(getStationObservationsForQualification).mockResolvedValue(
      observationRowsFixture(["2026-09-29", "2026-09-30"]),
    );

    const summary = await evaluateCitizenVariableQualifications(AS_OF);

    expect(summary).toEqual({ evaluatedReferences: 1, evaluatedCandidates: 1, persisted: 0 });
    expect(upsertCitizenVariableQualification).not.toHaveBeenCalled();
  });
});
