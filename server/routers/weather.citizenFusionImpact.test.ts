import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import type { StationObservation, WeatherStation } from "../../drizzle/schema";

vi.mock("../db", async () => {
  const actual = await vi.importActual<typeof import("../db")>("../db");
  return {
    ...actual,
    getValidatedCitizenStationsNearReference: vi.fn(),
    getActivePhysicalStationsNearReference: vi.fn(),
    getValidatedOfficialStationsNearReference: vi.fn(),
    getStationObservationsForQualification: vi.fn(),
  };
});

import { weatherRouter } from "./weather";
import {
  getActivePhysicalStationsNearReference,
  getStationObservationsForQualification,
  getValidatedCitizenStationsNearReference,
  getValidatedOfficialStationsNearReference,
} from "../db";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// Fixtures de test only : stations et relevés synthétiques, aucune observation réelle.

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
  vi.mocked(getValidatedCitizenStationsNearReference).mockReset();
  vi.mocked(getActivePhysicalStationsNearReference).mockReset();
  vi.mocked(getValidatedOfficialStationsNearReference).mockReset();
  vi.mocked(getStationObservationsForQualification).mockReset();
});

describe("weather.getCitizenFusionImpact · évaluation à blanc des capteurs validés", () => {
  it("ne mesure rien et n'interroge pas davantage la base sans capteur validé pour la référence", async () => {
    vi.mocked(getValidatedCitizenStationsNearReference).mockResolvedValue([]);

    const report = await weatherRouter
      .createCaller(createPublicContext())
      .getCitizenFusionImpact({ lat: REFERENCE.lat, lon: REFERENCE.lon });

    expect(getValidatedCitizenStationsNearReference).toHaveBeenCalledTimes(1);
    expect(getValidatedCitizenStationsNearReference).toHaveBeenCalledWith(REFERENCE.lat, REFERENCE.lon);
    // Sans capteur validé, aucun autre lecteur n'est sollicité : rien n'est mesuré.
    expect(getActivePhysicalStationsNearReference).not.toHaveBeenCalled();
    expect(getValidatedOfficialStationsNearReference).not.toHaveBeenCalled();
    expect(getStationObservationsForQualification).not.toHaveBeenCalled();

    expect(report.status).toBe("no-validated-citizens");
    expect(report.comparisons).toBe(0);
    expect(report.baselineMaeC).toBeNull();
    expect(report.withCitizenMaeC).toBeNull();
    expect(report.improvementC).toBeNull();
  });

  it("mesure l'écart des deux bras sur l'historique archivé sans jamais écrire en base", async () => {
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

    const report = await weatherRouter
      .createCaller(createPublicContext())
      .getCitizenFusionImpact({ lat: REFERENCE.lat, lon: REFERENCE.lon });

    // Les relevés couvrent capteurs validés, stations physiques et références
    // officielles de la même référence de favori.
    expect(getStationObservationsForQualification).toHaveBeenCalledTimes(1);
    const [requestedIds] = vi.mocked(getStationObservationsForQualification).mock.calls[0];
    expect(requestedIds).toContain("opensensemap-6740");
    expect(requestedIds).toContain("netatmo-public-42");
    expect(requestedIds).toContain("mf-70260");
    expect(requestedIds).toContain("mf-70290");

    // Le rapport est mesuré, pas estimé : mêmes lignes en entrée, même rapport.
    expect(report.status).toBe("improves");
    expect(report.comparisons).toBe(MEASURED_HOURS.length);
    expect(report.distinctDays).toBe(3);
    expect(report.baselineMaeC).toBeCloseTo(0.676, 3);
    expect(report.withCitizenMaeC).toBeCloseTo(0.373, 3);
    expect(report.improvementC).toBeCloseTo(0.303, 3);
    expect(report.reason).toContain("rien n'est activé ici");
  });
});
