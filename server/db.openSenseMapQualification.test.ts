import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeDatabase = vi.hoisted(() => {
  const insert = vi.fn();
  const insertValues = vi.fn();
  const select = vi.fn();
  const update = vi.fn();
  const updateSet = vi.fn();
  const drizzle = vi.fn();
  const db = { insert, select, update };
  return { db, drizzle, insert, insertValues, select, update, updateSet, results: [] as unknown[][] };
});

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: fakeDatabase.drizzle }));

import {
  applyOpenSenseMapQualificationVerdicts,
  getCandidateOpenSenseMapStations,
  getCitizenStationsForQualification,
  getCitizenQualificationEffectiveTimesNearReference,
  getStationObservationsForQualification,
  getValidatedOfficialStationsNearReference,
  getWeatherStationQualificationVerdicts,
  type OpenSenseMapQualificationVerdictUpdate,
} from "./db";

const qualificationReferences = new Map([
  ["opensensemap-box-a", { refLat: 50.756, refLon: 2.521 }],
  ["opensensemap-box-b", { refLat: 50.756, refLon: 2.521 }],
]);

function makeThenableSelect(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  const query: Record<string, any> = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.then = (onFulfilled: any, onRejected: any) => promise.then(onFulfilled, onRejected);
  return query;
}

describe("base de données indisponible", () => {
  // Ce describe doit rester déclaré en premier : la connexion drizzle est mise
  // en cache au niveau du module, et ce test vérifie le comportement sans base
  // tant qu'aucune connexion n'a encore été établie.
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DATABASE_URL;
  });

  it("ne lève jamais depuis les lecteurs et n'applique aucun verdict", async () => {
    await expect(getCandidateOpenSenseMapStations()).resolves.toEqual([]);
    await expect(getCitizenStationsForQualification(50.756, 2.521)).resolves.toEqual([]);
    await expect(getValidatedOfficialStationsNearReference(50.756, 2.521)).resolves.toEqual([]);
    await expect(getStationObservationsForQualification(["opensensemap-box-a"], 0)).resolves.toEqual([]);
    await expect(getWeatherStationQualificationVerdicts(["opensensemap-box-a"])).resolves.toEqual([]);

    const verdict: OpenSenseMapQualificationVerdictUpdate = {
      stationId: "opensensemap-box-a",
      qualificationStatus: "validated",
      isActive: 1,
      exclusionReason: null,
    };
    await applyOpenSenseMapQualificationVerdicts([verdict], qualificationReferences);
    expect(fakeDatabase.update).not.toHaveBeenCalled();
  });
});

describe("lecteurs et writer des verdicts de qualification openSenseMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeDatabase.results = [];
    fakeDatabase.drizzle.mockReturnValue(fakeDatabase.db);
    fakeDatabase.select.mockImplementation(() => makeThenableSelect(fakeDatabase.results.shift() ?? []));
    fakeDatabase.update.mockImplementation(() => ({ set: fakeDatabase.updateSet }));
    fakeDatabase.updateSet.mockImplementation(() => ({ where: vi.fn(() => Promise.resolve()) }));
    fakeDatabase.insertValues.mockResolvedValue(undefined);
    fakeDatabase.insert.mockReturnValue({ values: fakeDatabase.insertValues });
    process.env.DATABASE_URL = "mysql://unit.test.invalid/meteoai";
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("restitue les capteurs candidats openSenseMap depuis la table des stations", async () => {
    const candidates = [{ stationId: "opensensemap-box-a", source: "opensensemap", qualificationStatus: "candidate" }];
    fakeDatabase.results = [candidates];

    await expect(getCandidateOpenSenseMapStations()).resolves.toEqual(candidates);
  });

  it("restitue les capteurs citoyens de la référence, tous statuts confondus", async () => {
    // Le lecteur de preuve doit voir aussi les capteurs déjà promus ou écartés :
    // filtrer sur « candidat » priverait l'affichage de leur preuve recalculée.
    const citizens = [
      { stationId: "opensensemap-box-a", source: "opensensemap", qualificationStatus: "candidate" },
      { stationId: "cwop-lfqq", source: "cwop", qualificationStatus: "validated" },
      { stationId: "opensensemap-box-b", source: "opensensemap", qualificationStatus: "excluded" },
    ];
    fakeDatabase.results = [citizens];

    await expect(getCitizenStationsForQualification(50.756, 2.521)).resolves.toEqual(citizens);
  });

  it("restitue les stations officielles validées de la même référence de favori", async () => {
    const officials = [{ stationId: "mf-a", source: "meteofrance", qualificationStatus: "validated", isActive: 1 }];
    fakeDatabase.results = [officials];

    await expect(getValidatedOfficialStationsNearReference(50.756, 2.521)).resolves.toEqual(officials);
  });

  it("restitue les relevés archivés inchangés, heures de mesure propres comprises", async () => {
    const measurementTimes = {
      temperature: "2026-10-05T12:01:00.000Z",
      humidity: null,
      pressure: null,
      windSpeed: null,
      windGust: null,
      windDirection: null,
      precipitation: null,
    };
    const rows = [{ stationId: "opensensemap-box-a", observedAt: Date.parse("2026-10-05T12:05:00.000Z"), temperature: 18, measurementTimes }];
    fakeDatabase.results = [rows];

    const observations = await getStationObservationsForQualification(["opensensemap-box-a", "mf-a"], Date.parse("2026-09-05T00:00:00.000Z"));

    expect(observations).toEqual(rows);
    expect(observations[0]?.measurementTimes).toEqual(measurementTimes);
  });

  it("restitue les statuts de qualification persistés sans les réécrire", async () => {
    const verdicts = [{ stationId: "opensensemap-box-a", qualificationStatus: "excluded", exclusionReason: "Divergences répétées." }];
    fakeDatabase.results = [verdicts];

    await expect(getWeatherStationQualificationVerdicts(["opensensemap-box-a"])).resolves.toEqual(verdicts);
  });

  it("archive chaque verdict avant de mettre à jour sa projection courante", async () => {
    const validated: OpenSenseMapQualificationVerdictUpdate = {
      stationId: "opensensemap-box-a",
      qualificationStatus: "validated",
      isActive: 1,
      exclusionReason: null,
    };
    const excluded: OpenSenseMapQualificationVerdictUpdate = {
      stationId: "opensensemap-box-b",
      qualificationStatus: "excluded",
      isActive: 0,
      exclusionReason: "Divergences répétées : 4/10 comparaison(s).",
    };

    await applyOpenSenseMapQualificationVerdicts([validated, excluded], qualificationReferences);

    expect(fakeDatabase.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      referenceKey: "50.756000,2.521000",
      kind: "variable",
      stationId: "opensensemap-box-a",
      variable: "temperature",
      payload: expect.objectContaining({ qualificationStatus: "validated" }),
    }));
    expect(fakeDatabase.insert.mock.invocationCallOrder[0]).toBeLessThan(fakeDatabase.update.mock.invocationCallOrder[0]!);
    expect(fakeDatabase.update).toHaveBeenCalledTimes(2);
    expect(fakeDatabase.updateSet).toHaveBeenCalledWith({
      qualificationStatus: "validated",
      isActive: 1,
      exclusionReason: null,
    });
    expect(fakeDatabase.updateSet).toHaveBeenCalledWith({
      qualificationStatus: "excluded",
      isActive: 0,
      exclusionReason: "Divergences répétées : 4/10 comparaison(s).",
    });
  });

  it("n'écrit rien sans verdict à appliquer", async () => {
    await applyOpenSenseMapQualificationVerdicts([], qualificationReferences);

    expect(fakeDatabase.update).not.toHaveBeenCalled();
  });

  it("retient createdAt au début de la dernière séquence continue validée, jamais evaluatedAt", async () => {
    fakeDatabase.results = [[
      { id: 1, stationId: "opensensemap-box-a", payload: { qualificationStatus: "validated" }, createdAt: new Date("2026-10-10T10:00:00.000Z") },
      { id: 2, stationId: "opensensemap-box-a", payload: { qualificationStatus: "validated" }, createdAt: new Date("2026-10-10T11:00:00.000Z") },
      { id: 3, stationId: "opensensemap-box-a", payload: { qualificationStatus: "excluded" }, createdAt: new Date("2026-10-10T12:00:00.000Z") },
      { id: 4, stationId: "opensensemap-box-a", payload: { qualificationStatus: "validated", recordedAt: 0 }, createdAt: new Date("2026-10-10T13:00:00.000Z") },
      { id: 5, stationId: "opensensemap-box-b", payload: { qualificationStatus: "validated" }, createdAt: new Date("2026-10-10T14:00:00.000Z") },
    ]];

    const effectiveTimes = await getCitizenQualificationEffectiveTimesNearReference(50.756, 2.521);

    expect(effectiveTimes).toEqual(new Map([
      ["opensensemap-box-a", Date.parse("2026-10-10T13:00:00.000Z")],
      ["opensensemap-box-b", Date.parse("2026-10-10T14:00:00.000Z")],
    ]));
  });
});
