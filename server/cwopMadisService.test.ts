import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCwopCoverageReport,
  extractCwopLatestOb,
  fetchCwopCandidates,
  mapCwopLatestOb,
  parseCwopInventoryFeature,
  resetCwopInventoryCache,
  validateCwopInventoryResponse,
  type CwopCoverageStation,
} from "./cwopMadisService";
import { StationSourceCollectionError } from "./stationSourceDiagnostics";

vi.mock("./weatherFetch", () => ({ fetchWeather: vi.fn() }));
// Le mock de fetchWeather est importé après la déclaration vi.mock : le service
// sous test n'appelle jamais le réseau, seul le mock répond.
import { fetchWeather } from "./weatherFetch";

const fetchWeatherMock = vi.mocked(fetchWeather);

// Fixtures de test explicitement marquées comme données de test :
// elles imitent le format GeoJSON documenté de l'IEM et ne sont jamais
// utilisées en production.
const HONDEGHEM = { lat: 50.7567, lon: 2.5204 };

function fixtureFeature(overrides: Record<string, unknown> = {}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [2.53, 50.76, 42] },
    properties: { sid: "EW1234", name: "HONDEGHEM TEST", elevation: 25, online: true },
    ...overrides,
  };
}

describe("CWOP/MADIS — mesure de couverture", () => {
  it("mappe une station identifiée dans le rayon sans lui inventer de mesure", () => {
    const station = parseCwopInventoryFeature(
      fixtureFeature(),
      HONDEGHEM.lat,
      HONDEGHEM.lon,
      5,
    );
    expect(station).toMatchObject({
      providerStationId: "EW1234",
      name: "HONDEGHEM TEST",
      online: true,
      elevationM: 25,
    });
    expect(station?.distanceKm).toBe(0.8);
    expect(station?.lat).toBe(50.76);
    expect(station?.lon).toBe(2.53);
  });

  it("refuse les stations sans identifiant fournisseur réel ou sans coordonnées valides", () => {
    expect(parseCwopInventoryFeature(
      fixtureFeature({ properties: { sid: "  " } }),
      HONDEGHEM.lat, HONDEGHEM.lon, 5,
    )).toBeNull();
    expect(parseCwopInventoryFeature(
      fixtureFeature({ properties: {} }),
      HONDEGHEM.lat, HONDEGHEM.lon, 5,
    )).toBeNull();
    expect(parseCwopInventoryFeature(
      fixtureFeature({ geometry: { type: "Point", coordinates: [] } }),
      HONDEGHEM.lat, HONDEGHEM.lon, 5,
    )).toBeNull();
    expect(parseCwopInventoryFeature(
      fixtureFeature({ geometry: { type: "Point", coordinates: ["abc", "def"] } }),
      HONDEGHEM.lat, HONDEGHEM.lon, 5,
    )).toBeNull();
  });

  it("borne la mesure au rayon demandé", () => {
    // Paris est à environ 212 km de Hondeghem : hors d'un rayon de 5 km.
    expect(parseCwopInventoryFeature(
      fixtureFeature({ geometry: { type: "Point", coordinates: [2.3522, 48.8566] } }),
      HONDEGHEM.lat, HONDEGHEM.lon, 5,
    )).toBeNull();
    expect(parseCwopInventoryFeature(
      fixtureFeature({ geometry: { type: "Point", coordinates: [2.3522, 48.8566] } }),
      HONDEGHEM.lat, HONDEGHEM.lon, 300,
    )).not.toBeNull();
  });

  it("laisse null toute valeur non fournie au lieu de la deviner", () => {
    const station = parseCwopInventoryFeature(
      fixtureFeature({ properties: { sid: "EW5678" }, geometry: { type: "Point", coordinates: [2.53, 50.76] } }),
      HONDEGHEM.lat, HONDEGHEM.lon, 5,
    );
    expect(station).toMatchObject({ providerStationId: "EW5678", name: null, online: null, elevationM: null });
  });

  it("déduplique les identifiants dupliqués en gardant la première occurrence", () => {
    const report = buildCwopCoverageReport(
      [
        fixtureFeature({ properties: { sid: "EW1234", name: "PREMIÈRE", elevation: 25, online: true } }),
        fixtureFeature({ properties: { sid: "EW1234", name: "SECONDE", elevation: 30, online: false } }),
      ],
      HONDEGHEM.lat, HONDEGHEM.lon, 5, "2026-10-11T12:00:00.000Z",
    );
    expect(report.totalInRadius).toBe(1);
    expect(report.stations[0]?.name).toBe("PREMIÈRE");
  });

  it("trie par distance, compte les stations et n'expose que l'inventaire", () => {
    const report = buildCwopCoverageReport(
      [
        fixtureFeature({ geometry: { type: "Point", coordinates: [2.53, 50.76, 42] }, properties: { sid: "EW1234", online: true } }),
        fixtureFeature({ geometry: { type: "Point", coordinates: [2.521, 50.757, 42] }, properties: { sid: "EW9999", online: false } }),
      ],
      HONDEGHEM.lat, HONDEGHEM.lon, 5, "2026-10-11T12:00:00.000Z",
    );
    expect(report.totalInRadius).toBe(2);
    expect(report.onlineInRadius).toBe(1);
    expect(report.stations.map((station) => station.providerStationId)).toEqual(["EW9999", "EW1234"]);
    // Aucune grandeur d'observation ne doit exister dans le rapport.
    const serialized = JSON.stringify(report);
    for (const forbidden of ["temperature", "humidity", "pressure", "windSpeed", "precipitation"]) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
  });

  it("rend le compte en ligne non estimable quand l'indicateur manque", () => {
    const report = buildCwopCoverageReport(
      [
        fixtureFeature({ properties: { sid: "EW1234", online: true } }),
        fixtureFeature({ properties: { sid: "EW5678" } }),
      ],
      HONDEGHEM.lat, HONDEGHEM.lon, 5, "2026-10-11T12:00:00.000Z",
    );
    expect(report.totalInRadius).toBe(2);
    expect(report.onlineInRadius).toBeNull();
  });

  it("accepte une collection vide mais refuse une réponse invalide", () => {
    expect(validateCwopInventoryResponse({ type: "FeatureCollection", features: [] })).toEqual([]);
    for (const invalid of [
      null,
      [],
      { type: "Feature" },
      { type: "FeatureCollection", features: "nope" },
      { type: "FeatureCollection", features: [null] },
      { type: "FeatureCollection", features: [["array"]] },
    ]) {
      expect(() => validateCwopInventoryResponse(invalid)).toThrow(StationSourceCollectionError);
    }
  });
});

// ─── Phase 2 : observations réelles et candidats citoyens ────────────────────
// Fixtures explicitement marquées : données de test only. L'enveloppe imite le
// service current.py documenté de l'IEM ; aucune valeur n'est déduite.

const COVERAGE_STATION: CwopCoverageStation = {
  providerStationId: "EW1234",
  name: "HONDEGHEM TEST",
  lat: 50.76,
  lon: 2.53,
  elevationM: 25,
  online: true,
  distanceKm: 0.8,
};

function obFixture(overrides: Record<string, unknown> = {}) {
  return {
    utc_valid: "2026-10-11T12:53:00Z",
    "airtemp[F]": 68,
    "windspeed[kt]": 6,
    "winddirection[deg]": 140,
    "mslp[mb]": 1011.3,
    "altimeter[in]": 29.88,
    ...overrides,
  };
}

function inventoryFeature(sid: string, index: number) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [2.521 + index * 0.001, 50.757, 42] },
    properties: { sid, name: `STATION ${sid}`, elevation: 25, online: true },
  };
}

function mockedResponse(payload: unknown, ok = true) {
  return { ok, json: async () => payload } as unknown as Response;
}

function mockCwopFetches(features: Array<Record<string, unknown>>, obsByStation: Record<string, unknown>) {
  fetchWeatherMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("geojson/network.py")) return mockedResponse({ type: "FeatureCollection", features });
    const station = url.match(/station=([^&]+)/)?.[1] ?? "";
    const decoded = decodeURIComponent(station);
    if (url.includes("json/current.py")) {
      const payload = obsByStation[decoded];
      if (payload === "http_error") return mockedResponse({}, false);
      return mockedResponse(payload ?? {});
    }
    throw new Error(`URL inattendue dans le test : ${url}`);
  });
}

describe("CWOP/MADIS — observations réelles et candidats citoyens", () => {
  afterEach(() => {
    resetCwopInventoryCache();
    fetchWeatherMock.mockReset();
  });

  it("mappe l'observation documentée en conversions exactes, sans déduire l'absent", () => {
    const candidate = mapCwopLatestOb(obFixture(), COVERAGE_STATION);
    expect(candidate).toMatchObject({
      providerStationId: "EW1234",
      name: "HONDEGHEM TEST",
      lat: 50.76,
      lon: 2.53,
      altitude: 25,
      distanceKm: 0.8,
      temperature: 20,
      humidity: null,
      pressure: 1011.3,
      windSpeed: 11.1,
      windGust: null,
      windDirection: 140,
      precipitation: null,
      updatedAt: "2026-10-11T12:53:00Z",
    });
    expect(candidate?.measurementTimes).toEqual({
      temperature: "2026-10-11T12:53:00Z",
      humidity: null,
      pressure: "2026-10-11T12:53:00Z",
      windSpeed: "2026-10-11T12:53:00Z",
      windGust: null,
      windDirection: "2026-10-11T12:53:00Z",
      precipitation: null,
    });
  });

  it("replie la pression sur altimeter converti, puis reste null si rien n'est fourni", () => {
    const altimeterOnly = mapCwopLatestOb(obFixture({ "mslp[mb]": null }), COVERAGE_STATION);
    expect(altimeterOnly?.pressure).toBe(1011.9);
    expect(altimeterOnly?.measurementTimes?.pressure).toBe("2026-10-11T12:53:00Z");

    const neither = mapCwopLatestOb(obFixture({ "mslp[mb]": null, "altimeter[in]": null }), COVERAGE_STATION);
    expect(neither?.pressure).toBeNull();
    expect(neither?.measurementTimes?.pressure).toBeNull();
  });

  it("refuse une observation sans heure de mesure réelle ou sans mesure activante", () => {
    const sansHeure = mapCwopLatestOb(obFixture({ utc_valid: null }), COVERAGE_STATION);
    expect(sansHeure).toBeNull();
    const heureInvalide = mapCwopLatestOb(obFixture({ utc_valid: "pas-une-date" }), COVERAGE_STATION);
    expect(heureInvalide).toBeNull();
    const sansMesure = mapCwopLatestOb(obFixture({ "airtemp[F]": null, "windspeed[kt]": null }), COVERAGE_STATION);
    expect(sansMesure).toBeNull();
    // null ou chaîne vide ne deviennent jamais 0 : -17.8 °C ne sort pas d'un
    // champ absent, une grandeur non fournie reste absente.
    const videPasZero = mapCwopLatestOb(obFixture({ "airtemp[F]": "", "windspeed[kt]": "" }), COVERAGE_STATION);
    expect(videPasZero).toBeNull();
  });

  it("extrait last_ob seulement quand l'enveloppe la fournit", () => {
    expect(extractCwopLatestOb(null)).toBeNull();
    expect(extractCwopLatestOb([])).toBeNull();
    expect(extractCwopLatestOb({})).toBeNull();
    expect(extractCwopLatestOb({ last_ob: null })).toBeNull();
    const ob = extractCwopLatestOb({ generated_at: "2026-10-11T13:00:00Z", last_ob: obFixture() });
    expect(ob).toMatchObject({ utc_valid: "2026-10-11T12:53:00Z", "airtemp[F]": 68 });
  });

  it("échoue la source entière quand l'inventaire est en panne", async () => {
    fetchWeatherMock.mockResolvedValue(mockedResponse({}, false));
    await expect(fetchCwopCandidates(HONDEGHEM.lat, HONDEGHEM.lon, 5)).rejects.toThrow(StationSourceCollectionError);
  });

  it("collecte les candidats triés par distance avec une lecture d'observation par station", async () => {
    mockCwopFetches(
      [inventoryFeature("EW1234", 0), inventoryFeature("EW9999", 5)],
      { EW1234: { last_ob: obFixture() }, EW9999: { last_ob: obFixture({ "airtemp[F]": 71 }) } },
    );
    const candidates = await fetchCwopCandidates(HONDEGHEM.lat, HONDEGHEM.lon, 5);
    expect(candidates.map((candidate) => candidate.providerStationId)).toEqual(["EW1234", "EW9999"]);
    expect(candidates[1]?.temperature).toBe(21.7);
    expect(fetchWeatherMock).toHaveBeenCalledTimes(3);
  });

  it("borne la charge fournisseur aux 8 stations les plus proches", async () => {
    const features = Array.from({ length: 10 }, (_, index) => inventoryFeature(`EW-${index}`, index));
    mockCwopFetches(features, {});
    await fetchCwopCandidates(HONDEGHEM.lat, HONDEGHEM.lon, 5);
    const observationCalls = fetchWeatherMock.mock.calls.filter(([input]) => String(input).includes("json/current.py"));
    expect(observationCalls).toHaveLength(8);
    expect(fetchWeatherMock).toHaveBeenCalledTimes(9);
  });

  it("écarte sans annuler les stations sans observation ou en échec", async () => {
    const features = Array.from({ length: 8 }, (_, index) => inventoryFeature(`EW-${index}`, index));
    mockCwopFetches(features, {
      "EW-0": { last_ob: obFixture() },
      "EW-1": {},
      "EW-2": "http_error",
      "EW-3": { last_ob: obFixture() },
      "EW-4": { last_ob: obFixture() },
      "EW-5": { last_ob: obFixture() },
      "EW-6": { last_ob: obFixture() },
      "EW-7": { last_ob: obFixture() },
    });
    const candidates = await fetchCwopCandidates(HONDEGHEM.lat, HONDEGHEM.lon, 5);
    expect(candidates).toHaveLength(6);
    expect(candidates.map((candidate) => candidate.providerStationId)).not.toContain("EW-1");
    expect(candidates.map((candidate) => candidate.providerStationId)).not.toContain("EW-2");
  });
});
