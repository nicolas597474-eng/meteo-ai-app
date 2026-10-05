import { describe, it, expect } from "vitest";
import {
  haversineKm,
  rankStations,
  calculateGroundTruth,
  getCandidateStations,
  getPhysicalActiveStations,
  getStationSourceKind,
  mapSynopRecord,
  mapMetarObservation,
  type StationData,
} from "./stationService";

// ─── Test data helpers ────────────────────────────────────────────────────────

function makeStation(overrides: Partial<StationData> = {}): StationData {
  const updatedAt = overrides.updatedAt !== undefined ? overrides.updatedAt : new Date().toISOString();
  const measurementTimes = overrides.measurementTimes ?? {
    temperature: updatedAt,
    humidity: updatedAt,
    pressure: updatedAt,
    windSpeed: updatedAt,
    windGust: updatedAt,
    windDirection: updatedAt,
    precipitation: updatedAt,
  };
  return {
    stationId: "test-001",
    source: "openmeteo",
    name: "Test Station",
    lat: 50.76,
    lon: 2.52,
    altitude: 30,
    distanceKm: 2.0,
    temperature: 18.5,
    humidity: 72,
    pressure: 1013,
    windSpeed: 15,
    windGust: 22,
    windDirection: 270,
    precipitation: 0,
    updatedAt,
    reliabilityScore: 80,
    updateFrequencyMin: 60,
    dataAvailability: 0.95,
    isActive: true,
    ...overrides,
    measurementTimes,
  };
}

// ─── haversineKm ─────────────────────────────────────────────────────────────

describe("haversineKm", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineKm(50.76, 2.52, 50.76, 2.52)).toBe(0);
  });

  it("returns ~111 km for 1 degree latitude difference at equator", () => {
    const dist = haversineKm(0, 0, 1, 0);
    expect(dist).toBeGreaterThan(110);
    expect(dist).toBeLessThan(112);
  });

  it("calculates Hondeghem to Hazebrouck (~8 km)", () => {
    // Hondeghem: 50.7567, 2.5204 — Hazebrouck: 50.7239, 2.5387
    const dist = haversineKm(50.7567, 2.5204, 50.7239, 2.5387);
    expect(dist).toBeGreaterThan(3);
    expect(dist).toBeLessThan(10);
  });

  it("is symmetric", () => {
    const d1 = haversineKm(50.76, 2.52, 51.0, 3.0);
    const d2 = haversineKm(51.0, 3.0, 50.76, 2.52);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
  });
});

describe("getStationSourceKind", () => {
  it("distingue les observations physiques des références de modèle", () => {
    expect(getStationSourceKind("meteofrance")).toBe("physical");
    expect(getStationSourceKind("metar")).toBe("physical");
    expect(getStationSourceKind("openmeteo")).toBe("reference");
    expect(getStationSourceKind("netatmo")).toBe("physical");
    expect(getStationSourceKind("synop")).toBe("reference");
    expect(getStationSourceKind("cwop")).toBe("reference");
    expect(getStationSourceKind("wunderground")).toBe("reference");
    expect(getStationSourceKind("opensensemap")).toBe("reference");
  });
});

describe("mapMetarObservation", () => {
  it("convertit une observation aéroportuaire officielle en station physique et convertit le vent en km/h", () => {
    const station = mapMetarObservation({
      icaoId: "LFAC",
      reportTime: "2026-08-12T06:30:00.000Z",
      temp: 20,
      dewp: 12,
      wdir: 70,
      wspd: 10,
      wgst: 15,
      altim: 1022,
      lat: 50.962,
      lon: 1.954,
      elev: 12,
      name: "Calais-Dunkerque Arpt, FR",
    }, 50.95, 1.96, 30);

    expect(station).toMatchObject({ source: "metar", stationId: "metar-LFAC", windSpeed: 18.5, windGust: 27.8, pressure: 1022, isActive: true });
    expect(station?.measurementTimes?.windDirection).toBe("2026-08-12T06:30:00.000Z");
    expect(station?.distanceKm).toBeLessThan(30);
  });

  it("écarte une observation officielle au-delà du rayon choisi", () => {
    expect(mapMetarObservation({ icaoId: "LFAC", lat: 50.962, lon: 1.954 }, 50.7567, 2.5204, 10)).toBeNull();
  });

  it("ne remplace pas un reportTime absent par l’heure de collecte", () => {
    const station = mapMetarObservation({ icaoId: "LFAC", temp: 20, lat: 50.962, lon: 1.954 }, 50.95, 1.96, 30);
    expect(station?.updatedAt).toBeNull();
    expect(station?.measurementTimes?.temperature).toBeNull();
    expect(station?.measurementTimes?.windSpeed).toBeNull();
    expect(station?.measurementTimes?.windDirection).toBeNull();
  });
});

// ─── rankStations ─────────────────────────────────────────────────────────────

describe("rankStations", () => {
  it("places active stations before inactive ones", () => {
    const stations = [
      makeStation({ stationId: "inactive", isActive: false, distanceKm: 0.5 }),
      makeStation({ stationId: "active", isActive: true, distanceKm: 5.0 }),
    ];
    const ranked = rankStations(stations);
    expect(ranked[0].stationId).toBe("active");
    expect(ranked[1].stationId).toBe("inactive");
  });

  it("ranks closer stations higher when reliability is equal", () => {
    const stations = [
      makeStation({ stationId: "far", distanceKm: 15.0, reliabilityScore: 80 }),
      makeStation({ stationId: "near", distanceKm: 1.0, reliabilityScore: 80 }),
    ];
    const ranked = rankStations(stations);
    expect(ranked[0].stationId).toBe("near");
  });

  it("ranks a higher-priority station 8 km away above a near station at the minimum active priority", () => {
    const now = Date.parse("2026-10-05T08:00:00.000Z");
    const stations = [
      makeStation({ stationId: "reliable-far", distanceKm: 8.0, reliabilityScore: 95, updatedAt: new Date(now).toISOString() }),
      makeStation({ stationId: "low-priority-near", distanceKm: 0.5, reliabilityScore: 40, updatedAt: new Date(now).toISOString() }),
    ];
    const ranked = rankStations(stations, now);
    expect(ranked.map((station) => station.stationId)).toEqual(["reliable-far", "low-priority-near"]);
  });

  it("does not mutate the input array", () => {
    const stations = [
      makeStation({ stationId: "b", distanceKm: 10 }),
      makeStation({ stationId: "a", distanceKm: 1 }),
    ];
    const original = [...stations];
    rankStations(stations);
    expect(stations[0].stationId).toBe(original[0].stationId);
  });
});

// ─── Physical station evidence ───────────────────────────────────────────────

describe("getPhysicalActiveStations", () => {
  it("conserve les stations physiques actives tout en excluant les références et relevés inactifs", () => {
    const stations = [
      makeStation({ stationId: "mf-1", source: "meteofrance" }),
      makeStation({ stationId: "grid-1", source: "openmeteo" }),
      makeStation({ stationId: "netatmo-personal-1", source: "netatmo" }),
      makeStation({ stationId: "mf-old", source: "meteofrance", isActive: false }),
    ];

    expect(getPhysicalActiveStations(stations).map((station) => station.stationId)).toEqual(["mf-1", "netatmo-personal-1"]);
  });

  it("ne classe pas une ancienne référence de grille comme une station Netatmo physique", () => {
    expect(getStationSourceKind("netatmo", "grid-local-est")).toBe("reference");
    expect(getStationSourceKind("netatmo", "netatmo-public-42")).toBe("physical");
  });
});

describe("getCandidateStations", () => {
  it("conserve les capteurs citoyens candidats sans les transformer en station physique", () => {
    const candidates = getCandidateStations([
      makeStation({ stationId: "opensensemap-box-1", source: "opensensemap", isActive: false, qualificationStatus: "candidate", sourceTier: 3 }),
      makeStation({ stationId: "metar-LFAC", source: "metar", qualificationStatus: "validated", sourceTier: 1 }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].stationId).toBe("opensensemap-box-1");
    expect(getStationSourceKind(candidates[0].source, candidates[0].stationId)).toBe("reference");
  });
});

describe("mapSynopRecord", () => {
  const record = {
    numer_sta: "12345",
    nom: "Station de test",
    latitude: 50.76,
    longitude: 2.52,
    altitude: 40,
    t: 293.15,
    u: 70,
    pres: 101325,
    ff: 5,
    raf10: 7,
    dd: 180,
    rr1: 0,
    date: "2026-10-05T08:00:00Z",
  };

  it.each([
    { sourceField: "t", stationField: "temperature", rawValue: "NaN" },
    { sourceField: "u", stationField: "humidity", rawValue: "Infinity" },
    { sourceField: "pres", stationField: "pressure", rawValue: "-Infinity" },
    { sourceField: "ff", stationField: "windSpeed", rawValue: "NaN" },
    { sourceField: "raf10", stationField: "windGust", rawValue: "Infinity" },
    { sourceField: "dd", stationField: "windDirection", rawValue: "-Infinity" },
    { sourceField: "rr1", stationField: "precipitation", rawValue: "NaN" },
    { sourceField: "altitude", stationField: "altitude", rawValue: "Infinity" },
    { sourceField: "t", stationField: "temperature", rawValue: Number.MAX_VALUE },
    { sourceField: "ff", stationField: "windSpeed", rawValue: Number.MAX_VALUE },
  ] as const)("convertit le champ SYNOP $sourceField non fini en null", ({ sourceField, stationField, rawValue }) => {
    const station = mapSynopRecord({ ...record, [sourceField]: rawValue }, 50.76, 2.52, 20);

    expect(station).not.toBeNull();
    expect(station?.[stationField]).toBeNull();
  });

  it("n’active pas un enregistrement dont toutes les mesures activantes sont non finies", () => {
    const station = mapSynopRecord({
      ...record,
      t: "NaN",
      ff: "Infinity",
      rr1: "-Infinity",
    }, 50.76, 2.52, 20);

    expect(station).toMatchObject({
      temperature: null,
      windSpeed: null,
      precipitation: null,
      isActive: false,
      exclusionReason: "Aucune donnée disponible",
    });
  });

  it("préserve les valeurs finies et leurs conversions existantes", () => {
    const station = mapSynopRecord(record, 50.76, 2.52, 20);

    expect(station).toMatchObject({
      temperature: 20,
      humidity: 70,
      pressure: 1013,
      windSpeed: 18,
      windGust: 25.2,
      windDirection: 180,
      precipitation: 0,
      isActive: true,
    });
  });
});

// ─── calculateGroundTruth ─────────────────────────────────────────────────────

describe("calculateGroundTruth", () => {
  it("returns zero confidence and null values when no active stations", () => {
    const result = calculateGroundTruth([
      makeStation({ isActive: false, exclusionReason: "No data" }),
    ]);
    expect(result.stationCount).toBe(0);
    expect(result.confidenceScore).toBe(0);
    expect(result.temperature).toBeNull();
    expect(result.stationsIgnored).toHaveLength(1);
    expect(result.stationsUsed).toHaveLength(0);
  });

  it("returns the single station's values when only one active station", () => {
    const result = calculateGroundTruth([
      makeStation({ temperature: 20.0, humidity: 65, pressure: 1015 }),
    ]);
    expect(result.stationCount).toBe(1);
    expect(result.temperature).toBe(20.0);
    expect(result.humidity).toBe(65);
    expect(result.pressure).toBe(1015);
    expect(result.stationsUsed).toHaveLength(1);
    expect(result.stationsUsed[0].weight).toBeCloseTo(1.0, 1);
  });

  it("exclut une température vieille ou sans date sans retirer l’humidité récente des mêmes stations", () => {
    const now = Date.now();
    const recent = new Date(now - 5 * 60_000).toISOString();
    const old = new Date(now - 181 * 60_000).toISOString();
    const result = calculateGroundTruth([
      makeStation({
        stationId: "recent",
        temperature: 20,
        humidity: 80,
        updatedAt: recent,
        measurementTimes: { temperature: recent, humidity: recent },
      }),
      makeStation({
        stationId: "old-temperature",
        temperature: 40,
        humidity: 20,
        updatedAt: recent,
        measurementTimes: { temperature: old, humidity: recent },
      }),
      makeStation({
        stationId: "unknown-temperature",
        temperature: 60,
        humidity: 50,
        updatedAt: recent,
        measurementTimes: { temperature: null, humidity: recent },
      }),
    ]);

    expect(result.temperature).toBe(20);
    expect(result.humidity).toBe(50);
    expect(result.stationCount).toBe(1);
    const oldTemperature = result.stationsUsed.find((station) => station.stationId === "old-temperature")!;
    const unknownTemperature = result.stationsUsed.find((station) => station.stationId === "unknown-temperature")!;
    expect(oldTemperature.temperature).toBe(40);
    expect(oldTemperature.fieldWeights?.temperature).toBeUndefined();
    expect(oldTemperature.fieldWeights?.humidity).toBeGreaterThan(0);
    expect(unknownTemperature.temperature).toBe(60);
    expect(unknownTemperature.observedAt).toBeNull();
    expect(unknownTemperature.measurementTimes?.temperature).toBeNull();
    expect(unknownTemperature.measurementAgeByField?.temperature).toMatchObject({ observedAt: null, ageMinutes: null, status: "unknown" });
    expect(unknownTemperature.fieldWeights?.temperature).toBeUndefined();
    expect(unknownTemperature.fieldWeights?.humidity).toBeGreaterThan(0);
  });

  it("weights closer stations more heavily", () => {
    const near = makeStation({ stationId: "near", distanceKm: 1.0, temperature: 20.0 });
    const far = makeStation({ stationId: "far", distanceKm: 20.0, temperature: 30.0 });
    const result = calculateGroundTruth([near, far]);
    // Weighted average should be closer to 20 (near station)
    expect(result.temperature).toBeLessThan(25);
    expect(result.temperature).toBeGreaterThan(20);
  });

  it("normalise chaque composante avant d’appliquer les parts distance 50 %, qualité 30 % et fraîcheur 20 %", () => {
    const now = new Date().toISOString();
    const result = calculateGroundTruth([
      makeStation({ stationId: "near", distanceKm: 0.5, temperature: 20, reliabilityScore: 80, updatedAt: now }),
      makeStation({ stationId: "far", distanceKm: 10, temperature: 30, reliabilityScore: 80, updatedAt: now }),
    ]);
    const near = result.stationsUsed.find((station) => station.stationId === "near")!;
    const far = result.stationsUsed.find((station) => station.stationId === "far")!;

    // Chaque composante est une distribution normalisée entre les stations actives.
    expect(near.distanceWeight + far.distanceWeight).toBeCloseTo(1, 2);
    expect(near.qualityWeight + far.qualityWeight).toBeCloseTo(1, 2);
    expect(near.freshnessWeight + far.freshnessWeight).toBeCloseTo(1, 2);
    expect(near.weight + far.weight).toBeCloseTo(1, 2);

    // Avec qualité et fraîcheur identiques, l’IDW p=2 ne peut représenter que
    // les 50 % annoncés : la station proche pèse ~75 %, jamais ~100 %.
    expect(near.weight).toBeGreaterThan(0.74);
    expect(near.weight).toBeLessThan(0.76);
    expect(far.weight).toBeGreaterThan(0.24);
    expect(far.weight).toBeLessThan(0.26);
    expect(result.temperature).toBeCloseTo(22.5, 1);
  });

  it("rend la qualité et la fraîcheur réellement influentes après normalisation", () => {
    const now = Date.now();
    const result = calculateGroundTruth([
      makeStation({ stationId: "recent-reliable", distanceKm: 3, temperature: 20, reliabilityScore: 100, updatedAt: new Date(now).toISOString() }),
      makeStation({ stationId: "old-less-reliable", distanceKm: 3, temperature: 30, reliabilityScore: 40, updatedAt: new Date(now - 120 * 60_000).toISOString() }),
    ]);
    const recentReliable = result.stationsUsed.find((station) => station.stationId === "recent-reliable")!;
    const oldLessReliable = result.stationsUsed.find((station) => station.stationId === "old-less-reliable")!;
    expect(recentReliable.distanceWeight).toBeCloseTo(oldLessReliable.distanceWeight, 2);
    expect(recentReliable.qualityWeight).toBeGreaterThan(oldLessReliable.qualityWeight);
    expect(recentReliable.freshnessWeight).toBeGreaterThan(oldLessReliable.freshnessWeight);
    expect(recentReliable.weight).toBeGreaterThan(oldLessReliable.weight);
    expect(result.temperature).toBeLessThan(25);
  });

  it("handles null values gracefully (skips nulls in weighted average)", () => {
    const s1 = makeStation({ stationId: "s1", temperature: 18, humidity: null });
    const s2 = makeStation({ stationId: "s2", temperature: 22, humidity: 70 });
    const result = calculateGroundTruth([s1, s2]);
    expect(result.temperature).not.toBeNull();
    // humidity only from s2
    expect(result.humidity).toBe(70);
  });

  it.each([
    "temperature",
    "humidity",
    "pressure",
    "windSpeed",
    "windGust",
    "precipitation",
  ] as const)("convertit la mesure non finie %s en absence avant contribution et moyenne", (field) => {
    const result = calculateGroundTruth([
      makeStation({ stationId: "finite", [field]: 20 }),
      makeStation({ stationId: "non-finite", [field]: Number.POSITIVE_INFINITY }),
    ]);

    expect(result[field]).toBe(20);
    expect(result.stationsUsed.find((station) => station.stationId === "non-finite")?.[field]).toBeNull();
  });

  it("n’active ni ne couvre une station dont les seules mesures activantes sont non finies", () => {
    const result = calculateGroundTruth([
      makeStation({
        temperature: Number.NaN,
        windSpeed: Number.POSITIVE_INFINITY,
        precipitation: Number.NEGATIVE_INFINITY,
      }),
    ]);

    expect(result.stationCount).toBe(0);
    expect(result.stationsUsed).toHaveLength(0);
    expect(result.temperature).toBeNull();
    expect(result.windSpeed).toBeNull();
    expect(result.precipitation).toBeNull();
    expect(result.stationsIgnored[0]?.reason).toContain("Aucune mesure exploitable");
  });

  it("moves ignored stations to stationsIgnored list", () => {
    const result = calculateGroundTruth([
      makeStation({ stationId: "active" }),
      makeStation({ stationId: "ignored", isActive: false, exclusionReason: "Too old" }),
    ]);
    expect(result.stationsUsed.map(s => s.stationId)).toContain("active");
    expect(result.stationsIgnored.map(s => s.stationId)).toContain("ignored");
    expect(result.stationsIgnored[0].reason).toBe("Too old");
  });

  it("confidence score is higher with more agreeing stations", () => {
    const agreeing = [
      makeStation({ stationId: "a", temperature: 18.0 }),
      makeStation({ stationId: "b", temperature: 18.2 }),
      makeStation({ stationId: "c", temperature: 17.9 }),
    ];
    const disagreeing = [
      makeStation({ stationId: "x", temperature: 10.0 }),
      makeStation({ stationId: "y", temperature: 25.0 }),
    ];
    const r1 = calculateGroundTruth(agreeing);
    const r2 = calculateGroundTruth(disagreeing);
    expect(r1.confidenceScore).toBeGreaterThan(r2.confidenceScore);
  });
});
