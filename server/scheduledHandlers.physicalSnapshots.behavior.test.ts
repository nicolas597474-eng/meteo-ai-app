import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectNearbyStations: vi.fn(),
  getPhysicalActiveStations: vi.fn(),
  calculateGroundTruth: vi.fn(),
  getTodayParis: vi.fn(),
  getParisHour: vi.fn(),
  makeLocationKey: vi.fn(),
  upsertWeatherStation: vi.fn(),
  upsertStationObservation: vi.fn(),
  insertStationObservationIfMissing: vi.fn(),
  refreshStationQualityProfiles: vi.fn(),
  upsertQualifiedObservationSnapshot: vi.fn(),
  insertQualifiedObservationSnapshotIfMissing: vi.fn(),
  getQualifiedObservationSnapshotsForDate: vi.fn(),
  getPhysicalSnapshotCollectionTracesByDateRange: vi.fn(),
  upsertPhysicalSnapshotCollectionTrace: vi.fn(),
  insertPhysicalSnapshotCollectionTraceIfMissing: vi.fn(),
  getWeatherStationQualificationVerdicts: vi.fn(),
  getCandidateOpenSenseMapStations: vi.fn(),
  getValidatedOfficialStationsNearReference: vi.fn(),
  getStationObservationsForQualification: vi.fn(),
  applyOpenSenseMapQualificationVerdicts: vi.fn(),
  notifyOwner: vi.fn(),
}));

vi.mock("./stationService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stationService")>()),
  collectNearbyStations: mocks.collectNearbyStations,
  getPhysicalActiveStations: mocks.getPhysicalActiveStations,
  calculateGroundTruth: mocks.calculateGroundTruth,
}));

vi.mock("./weatherTime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./weatherTime")>()),
  getParisDate: mocks.getTodayParis,
  getParisHour: mocks.getParisHour,
}));

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  makeLocationKey: mocks.makeLocationKey,
  upsertWeatherStation: mocks.upsertWeatherStation,
  upsertStationObservation: mocks.upsertStationObservation,
  insertStationObservationIfMissing: mocks.insertStationObservationIfMissing,
  refreshStationQualityProfiles: mocks.refreshStationQualityProfiles,
  upsertQualifiedObservationSnapshot: mocks.upsertQualifiedObservationSnapshot,
  insertQualifiedObservationSnapshotIfMissing: mocks.insertQualifiedObservationSnapshotIfMissing,
  getQualifiedObservationSnapshotsForDate: mocks.getQualifiedObservationSnapshotsForDate,
  getPhysicalSnapshotCollectionTracesByDateRange: mocks.getPhysicalSnapshotCollectionTracesByDateRange,
  upsertPhysicalSnapshotCollectionTrace: mocks.upsertPhysicalSnapshotCollectionTrace,
  insertPhysicalSnapshotCollectionTraceIfMissing: mocks.insertPhysicalSnapshotCollectionTraceIfMissing,
  getWeatherStationQualificationVerdicts: mocks.getWeatherStationQualificationVerdicts,
  getCandidateOpenSenseMapStations: mocks.getCandidateOpenSenseMapStations,
  getValidatedOfficialStationsNearReference: mocks.getValidatedOfficialStationsNearReference,
  getStationObservationsForQualification: mocks.getStationObservationsForQualification,
  applyOpenSenseMapQualificationVerdicts: mocks.applyOpenSenseMapQualificationVerdicts,
}));

vi.mock("./_core/notification", () => ({ notifyOwner: mocks.notifyOwner }));

import { collectPhysicalObservationSnapshotsForFavorites } from "./scheduledHandlers";

const emptySynthesis = {
  stationCount: 0,
  confidenceScore: 0,
  temperature: null,
  humidity: null,
  pressure: null,
  windSpeed: null,
  windGust: null,
  precipitation: null,
  stationsUsed: [],
};

const qualifiedSynthesis = {
  stationCount: 2,
  confidenceScore: 0.92,
  temperature: 18.4,
  humidity: 71,
  pressure: 1016,
  windSpeed: 12,
  windGust: 20,
  precipitation: 0,
  stationsUsed: [],
};

const favorite = (lat: number, lon: number) => ({
  id: lat,
  userId: 1,
  name: `Lieu ${lat}`,
  customName: null,
  lat,
  lon,
  radiusKm: 20,
});

async function settleWithRetries<T>(pending: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return pending;
}

describe("comportement des cinq tentatives de snapshots physiques", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.getTodayParis.mockReturnValue("2026-08-27");
    mocks.getParisHour.mockReturnValue(16);
    mocks.makeLocationKey.mockImplementation((lat: number, lon: number) => `${lat}_${lon}`);
    mocks.collectNearbyStations.mockResolvedValue([]);
    mocks.getPhysicalActiveStations.mockImplementation((stations: unknown[]) => stations);
    mocks.calculateGroundTruth.mockReturnValue(emptySynthesis);
    mocks.getQualifiedObservationSnapshotsForDate.mockResolvedValue([]);
    mocks.getPhysicalSnapshotCollectionTracesByDateRange.mockResolvedValue([]);
    mocks.upsertWeatherStation.mockResolvedValue(undefined);
    mocks.upsertStationObservation.mockResolvedValue(undefined);
    mocks.insertStationObservationIfMissing.mockResolvedValue(true);
    mocks.refreshStationQualityProfiles.mockResolvedValue(undefined);
    mocks.upsertQualifiedObservationSnapshot.mockResolvedValue(undefined);
    mocks.insertQualifiedObservationSnapshotIfMissing.mockResolvedValue(true);
    mocks.upsertPhysicalSnapshotCollectionTrace.mockResolvedValue(undefined);
    mocks.insertPhysicalSnapshotCollectionTraceIfMissing.mockResolvedValue(true);
    mocks.getWeatherStationQualificationVerdicts.mockResolvedValue([]);
    mocks.getCandidateOpenSenseMapStations.mockResolvedValue([]);
    mocks.getValidatedOfficialStationsNearReference.mockResolvedValue([]);
    mocks.getStationObservationsForQualification.mockResolvedValue([]);
    mocks.applyOpenSenseMapQualificationVerdicts.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("effectue cinq essais au plus et enregistre le snapshot lorsque le cinquième réussit", async () => {
    mocks.calculateGroundTruth
      .mockReturnValueOnce(emptySynthesis)
      .mockReturnValueOnce(emptySynthesis)
      .mockReturnValueOnce(emptySynthesis)
      .mockReturnValueOnce(emptySynthesis)
      .mockReturnValueOnce(qualifiedSynthesis);

    const result = await settleWithRetries(
      collectPhysicalObservationSnapshotsForFavorites([favorite(50.756, 2.521)] as any, "scheduled"),
    );

    expect(mocks.collectNearbyStations).toHaveBeenCalledTimes(5);
    expect(result.status).toBe("completed");
    expect(result.locations).toEqual([expect.objectContaining({ stored: true, attempts: 5, stationCount: 2 })]);
    expect(mocks.insertPhysicalSnapshotCollectionTraceIfMissing).toHaveBeenCalledWith(expect.objectContaining({ status: "stored", attempts: 5 }));
  });

  it("s’arrête dès le premier succès sans consommer de relance inutile", async () => {
    mocks.calculateGroundTruth.mockReturnValue(qualifiedSynthesis);

    const result = await collectPhysicalObservationSnapshotsForFavorites([favorite(50.756, 2.521)] as any, "scheduled");

    expect(mocks.collectNearbyStations).toHaveBeenCalledTimes(1);
    expect(result.locations).toEqual([expect.objectContaining({ stored: true, attempts: 1 })]);
  });

  it("archive les timestamps exacts par champ et conserve null sans substituer updatedAt", async () => {
    const measurementTimes = {
      temperature: "2026-08-27T15:41:00.000Z",
      humidity: null,
      windSpeed: "timestamp-fourni-invalide",
    };
    mocks.collectNearbyStations.mockResolvedValue([{
      stationId: "netatmo-field-times",
      source: "netatmo",
      name: "Station témoin",
      lat: 50.75,
      lon: 2.5,
      altitude: null,
      distanceKm: 1,
      temperature: 18,
      humidity: 61,
      pressure: null,
      windSpeed: 10,
      windGust: null,
      windDirection: null,
      precipitation: null,
      updatedAt: "2026-08-27T15:45:00.000Z",
      measurementTimes,
      reliabilityScore: 90,
      updateFrequencyMin: 5,
      dataAvailability: 1,
      isActive: true,
      qualificationStatus: "validated",
    }]);
    mocks.calculateGroundTruth.mockReturnValue({
      ...qualifiedSynthesis,
      stationsUsed: [{ stationId: "netatmo-field-times", measurementTimes }],
    });

    await collectPhysicalObservationSnapshotsForFavorites([favorite(50.756, 2.521)] as any, "scheduled");

    expect(mocks.insertStationObservationIfMissing).toHaveBeenCalledWith(expect.objectContaining({
      stationId: "netatmo-field-times",
      observedAt: Date.parse("2026-08-27T15:45:00.000Z"),
      measurementTimes,
    }));
  });

  it("archive les capteurs citoyens candidats avec leur heure de mesure propre sans les compter comme stations physiques", async () => {
    const candidateMeasurementTimes = {
      temperature: "2026-08-27T15:40:00.000Z",
      humidity: null,
      pressure: null,
      windSpeed: "2026-08-27T15:41:00.000Z",
      windGust: null,
      windDirection: null,
      precipitation: null,
    };
    mocks.collectNearbyStations.mockResolvedValue([{
      stationId: "mf-officielle",
      source: "meteofrance",
      name: "Station officielle témoin",
      lat: 50.75,
      lon: 2.5,
      altitude: null,
      distanceKm: 2,
      temperature: 18.2,
      humidity: null,
      pressure: null,
      windSpeed: null,
      windGust: null,
      windDirection: null,
      precipitation: null,
      updatedAt: "2026-08-27T15:45:00.000Z",
      reliabilityScore: 92,
      updateFrequencyMin: 60,
      dataAvailability: 0.98,
      isActive: true,
      qualificationStatus: "validated",
    }, {
      stationId: "opensensemap-box-citoyen",
      source: "opensensemap",
      name: "Capteur citoyen témoin",
      lat: 50.757,
      lon: 2.51,
      altitude: null,
      distanceKm: 0.8,
      temperature: 18.4,
      humidity: null,
      pressure: null,
      windSpeed: 9,
      windGust: null,
      windDirection: null,
      precipitation: null,
      updatedAt: "2026-08-27T15:44:00.000Z",
      measurementTimes: candidateMeasurementTimes,
      reliabilityScore: 0,
      updateFrequencyMin: 15,
      dataAvailability: 0,
      isActive: false,
      qualificationStatus: "candidate",
      sourceTier: 3,
      exclusionReason: "Capteur citoyen en validation — non utilisé dans la température locale",
    }]);
    mocks.calculateGroundTruth.mockReturnValue(qualifiedSynthesis);

    const result = await collectPhysicalObservationSnapshotsForFavorites([favorite(50.756, 2.521)] as any, "scheduled");

    expect(mocks.upsertWeatherStation).toHaveBeenCalledWith(expect.objectContaining({
      stationId: "opensensemap-box-citoyen",
      qualificationStatus: "candidate",
      isActive: 0,
    }));
    expect(mocks.insertStationObservationIfMissing).toHaveBeenCalledWith(expect.objectContaining({
      stationId: "opensensemap-box-citoyen",
      observedAt: Date.parse("2026-08-27T15:44:00.000Z"),
      measurementTimes: candidateMeasurementTimes,
    }));
    expect(result.locations).toEqual([expect.objectContaining({ stored: true, stationCount: 2 })]);
  });

  it("archive une station CWOP candidate comme capteur citoyen, sans la compter comme station physique", async () => {
    const cwopMeasurementTimes = {
      temperature: "2026-08-27T15:40:00.000Z",
      humidity: null,
      pressure: "2026-08-27T15:40:00.000Z",
      windSpeed: "2026-08-27T15:40:00.000Z",
      windGust: null,
      windDirection: "2026-08-27T15:40:00.000Z",
      precipitation: null,
    };
    mocks.collectNearbyStations.mockResolvedValue([{
      stationId: "cwop-EW1234",
      source: "cwop",
      name: "Station CWOP témoin",
      lat: 50.757,
      lon: 2.51,
      altitude: 25,
      distanceKm: 0.8,
      temperature: 18.4,
      humidity: null,
      pressure: 1011.3,
      windSpeed: 11.1,
      windGust: null,
      windDirection: 140,
      precipitation: null,
      updatedAt: "2026-08-27T15:40:00.000Z",
      measurementTimes: cwopMeasurementTimes,
      reliabilityScore: 60,
      updateFrequencyMin: 15,
      dataAvailability: 0.7,
      isActive: false,
      qualificationStatus: "candidate",
      sourceTier: 3,
      exclusionReason: "Capteur citoyen en validation — non utilisé dans la température locale",
    }]);
    mocks.calculateGroundTruth.mockReturnValue(qualifiedSynthesis);

    const result = await collectPhysicalObservationSnapshotsForFavorites([favorite(50.756, 2.521)] as any, "scheduled");

    expect(mocks.upsertWeatherStation).toHaveBeenCalledWith(expect.objectContaining({
      stationId: "cwop-EW1234",
      source: "cwop",
      qualificationStatus: "candidate",
      isActive: 0,
      sourceTier: 3,
    }));
    expect(mocks.insertStationObservationIfMissing).toHaveBeenCalledWith(expect.objectContaining({
      stationId: "cwop-EW1234",
      observedAt: Date.parse("2026-08-27T15:40:00.000Z"),
      measurementTimes: cwopMeasurementTimes,
    }));
    expect(result.locations).toEqual([expect.objectContaining({ stored: true, attempts: 1 })]);
  });

  it("classe l’absence persistante de station comme no_station après cinq essais, sans alerte technique", async () => {
    const result = await settleWithRetries(
      collectPhysicalObservationSnapshotsForFavorites([favorite(50.756, 2.521)] as any, "scheduled"),
    );

    expect(mocks.collectNearbyStations).toHaveBeenCalledTimes(5);
    expect(result.status).toBe("completed");
    expect(result.errors).toBeUndefined();
    expect(result.locations).toEqual([expect.objectContaining({ stored: false, attempts: 5, reason: "Aucune station physique qualifiée" })]);
    expect(mocks.insertPhysicalSnapshotCollectionTraceIfMissing).toHaveBeenCalledWith(expect.objectContaining({ status: "no_station", attempts: 5 }));
    expect(mocks.notifyOwner).not.toHaveBeenCalled();
  });

  it("isole cinq erreurs techniques d’un favori sans empêcher le snapshot du suivant", async () => {
    mocks.collectNearbyStations.mockImplementation(async (lat: number) => {
      if (lat === 50.756) throw new Error("Fournisseur indisponible");
      return [];
    });
    mocks.calculateGroundTruth.mockReturnValue(qualifiedSynthesis);

    const result = await settleWithRetries(
      collectPhysicalObservationSnapshotsForFavorites([
        favorite(50.756, 2.521),
        favorite(50.676, 2.845),
      ] as any, "scheduled"),
    );

    expect(result.status).toBe("partial");
    expect(result.locations).toEqual(expect.arrayContaining([
      expect.objectContaining({ locationKey: "50.756_2.521", stored: false, attempts: 5, reason: expect.stringContaining("Erreur de collecte après relance") }),
      expect.objectContaining({ locationKey: "50.676_2.845", stored: true, attempts: 1 }),
    ]));
    expect(mocks.insertPhysicalSnapshotCollectionTraceIfMissing).toHaveBeenCalledWith(expect.objectContaining({ locationKey: "50.756_2.521", status: "failed", attempts: 5 }));
    expect(mocks.insertPhysicalSnapshotCollectionTraceIfMissing).toHaveBeenCalledWith(expect.objectContaining({ locationKey: "50.676_2.845", status: "stored", attempts: 1 }));
  });

  it("ignore une nouvelle exécution planifiée lorsque le snapshot horaire existe déjà", async () => {
    mocks.getQualifiedObservationSnapshotsForDate.mockResolvedValue([{ hour: 16 }]);

    const result = await collectPhysicalObservationSnapshotsForFavorites([favorite(50.756, 2.521)] as any, "scheduled");

    expect(mocks.collectNearbyStations).not.toHaveBeenCalled();
    expect(result.locations).toEqual([expect.objectContaining({ skipped: true, snapshotPreserved: true, attempts: 0 })]);
  });

  it("autorise la reprise après une trace no_station et remplace seulement la trace opérationnelle après succès", async () => {
    mocks.getPhysicalSnapshotCollectionTracesByDateRange.mockResolvedValue([{ hour: 16, status: "no_station" }]);
    mocks.calculateGroundTruth.mockReturnValue(qualifiedSynthesis);

    const result = await collectPhysicalObservationSnapshotsForFavorites([favorite(50.756, 2.521)] as any, "recovery");

    expect(mocks.collectNearbyStations).toHaveBeenCalledTimes(1);
    expect(result.locations).toEqual([expect.objectContaining({ stored: true, attempts: 1 })]);
    expect(mocks.upsertPhysicalSnapshotCollectionTrace).toHaveBeenCalledWith(expect.objectContaining({ status: "stored" }));
  });
});

describe("application des verdicts de qualification openSenseMap", () => {
  // Fixtures explicitement marquées : données de test only, aucun appel réseau.

  const liveOfficialStation = {
    stationId: "mf-officielle",
    source: "meteofrance",
    name: "Station officielle témoin",
    lat: 50.75,
    lon: 2.5,
    altitude: null,
    distanceKm: 2,
    temperature: 18.2,
    humidity: null,
    pressure: null,
    windSpeed: null,
    windGust: null,
    windDirection: null,
    precipitation: null,
    updatedAt: "2026-08-27T15:45:00.000Z",
    reliabilityScore: 92,
    updateFrequencyMin: 60,
    dataAvailability: 0.98,
    isActive: true,
    qualificationStatus: "validated",
  };

  const liveCandidateStation = (stationId: string, source = "opensensemap") => ({
    stationId,
    source,
    name: "Capteur citoyen témoin",
    lat: 50.757,
    lon: 2.51,
    altitude: null,
    distanceKm: 0.8,
    temperature: 18.4,
    humidity: null,
    pressure: null,
    windSpeed: null,
    windGust: null,
    windDirection: null,
    precipitation: null,
    updatedAt: "2026-08-27T15:44:00.000Z",
    measurementTimes: {
      temperature: "2026-08-27T15:40:00.000Z",
      humidity: null,
      pressure: null,
      windSpeed: null,
      windGust: null,
      windDirection: null,
      precipitation: null,
    },
    reliabilityScore: 0,
    updateFrequencyMin: 15,
    dataAvailability: 0,
    isActive: false,
    qualificationStatus: "candidate",
    sourceTier: 3,
    exclusionReason: "Capteur citoyen en validation — non utilisé dans la température locale",
  });

  const archivedCandidateRow = {
    stationId: "opensensemap-box-citoyen",
    source: "opensensemap",
    name: "Capteur citoyen archivé",
    lat: 50.757,
    lon: 2.51,
    refLat: 50.756,
    refLon: 2.521,
  };

  const archivedOfficialRow = (stationId: string) => ({
    stationId,
    source: "meteofrance",
    name: `Station officielle ${stationId}`,
    lat: 50.75,
    lon: 2.5,
    refLat: 50.756,
    refLon: 2.521,
  });

  const qualificationObservation = (stationId: string, day: string, hour: number, minute: number, temperature: number) => ({
    stationId,
    observedAt: Date.parse(`2026-10-0${day}T${String(hour)}:${String(minute).padStart(2, "0")}:00.000Z`),
    temperature,
    measurementTimes: {
      temperature: `2026-10-0${day}T${String(hour)}:${String(minute).padStart(2, "0")}:00.000Z`,
      humidity: null,
      pressure: null,
      windSpeed: null,
      windGust: null,
      windDirection: null,
      precipitation: null,
    },
  });

  const archivedOfficialObservations = (stationId: string, value: number) =>
    ["1", "2", "3"].flatMap((day) => [12, 13, 14, 15, 16, 17, 18].map((hour) => qualificationObservation(stationId, day, hour, 0, value)));

  const archivedCandidateObservations = [
    qualificationObservation("opensensemap-box-citoyen", "1", 12, 5, 18.1),
    qualificationObservation("opensensemap-box-citoyen", "1", 14, 5, 18.1),
    qualificationObservation("opensensemap-box-citoyen", "2", 12, 5, 18.1),
    qualificationObservation("opensensemap-box-citoyen", "2", 14, 5, 18.1),
    qualificationObservation("opensensemap-box-citoyen", "3", 12, 5, 18.1),
    qualificationObservation("opensensemap-box-citoyen", "3", 16, 5, 18.1),
    qualificationObservation("opensensemap-box-citoyen", "3", 18, 5, 18.1),
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.getTodayParis.mockReturnValue("2026-08-27");
    mocks.getParisHour.mockReturnValue(16);
    mocks.makeLocationKey.mockImplementation((lat: number, lon: number) => `${lat}_${lon}`);
    mocks.collectNearbyStations.mockResolvedValue([]);
    mocks.getPhysicalActiveStations.mockImplementation((stations: unknown[]) => stations);
    mocks.calculateGroundTruth.mockReturnValue(emptySynthesis);
    mocks.getQualifiedObservationSnapshotsForDate.mockResolvedValue([]);
    mocks.getPhysicalSnapshotCollectionTracesByDateRange.mockResolvedValue([]);
    mocks.upsertWeatherStation.mockResolvedValue(undefined);
    mocks.upsertStationObservation.mockResolvedValue(undefined);
    mocks.insertStationObservationIfMissing.mockResolvedValue(true);
    mocks.refreshStationQualityProfiles.mockResolvedValue(undefined);
    mocks.upsertQualifiedObservationSnapshot.mockResolvedValue(undefined);
    mocks.insertQualifiedObservationSnapshotIfMissing.mockResolvedValue(true);
    mocks.upsertPhysicalSnapshotCollectionTrace.mockResolvedValue(undefined);
    mocks.insertPhysicalSnapshotCollectionTraceIfMissing.mockResolvedValue(true);
    mocks.getWeatherStationQualificationVerdicts.mockResolvedValue([]);
    mocks.getCandidateOpenSenseMapStations.mockResolvedValue([]);
    mocks.getValidatedOfficialStationsNearReference.mockResolvedValue([]);
    mocks.getStationObservationsForQualification.mockResolvedValue([]);
    mocks.applyOpenSenseMapQualificationVerdicts.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("conserve le verdict d'exclusion persisté sans rétrograder le capteur en candidat", async () => {
    mocks.collectNearbyStations.mockResolvedValue([
      liveOfficialStation,
      liveCandidateStation("opensensemap-box-exclu"),
    ]);
    mocks.calculateGroundTruth.mockReturnValue(qualifiedSynthesis);
    mocks.getWeatherStationQualificationVerdicts.mockResolvedValue([{
      stationId: "opensensemap-box-exclu",
      qualificationStatus: "excluded",
      exclusionReason: "Divergences répétées : 4/10 comparaison(s) s'écartent de la médiane.",
    }]);

    await collectPhysicalObservationSnapshotsForFavorites([favorite(50.756, 2.521)] as any, "scheduled");

    expect(mocks.upsertWeatherStation).toHaveBeenCalledWith(expect.objectContaining({
      stationId: "opensensemap-box-exclu",
      qualificationStatus: "excluded",
      isActive: 0,
      exclusionReason: "Divergences répétées : 4/10 comparaison(s) s'écartent de la médiane.",
    }));
  });

  it("archive un capteur validé comme actif, sans raison d'exclusion", async () => {
    mocks.collectNearbyStations.mockResolvedValue([
      liveOfficialStation,
      liveCandidateStation("opensensemap-box-valide"),
    ]);
    mocks.calculateGroundTruth.mockReturnValue(qualifiedSynthesis);
    mocks.getWeatherStationQualificationVerdicts.mockResolvedValue([{
      stationId: "opensensemap-box-valide",
      qualificationStatus: "validated",
      exclusionReason: null,
    }]);

    await collectPhysicalObservationSnapshotsForFavorites([favorite(50.756, 2.521)] as any, "scheduled");

    expect(mocks.upsertWeatherStation).toHaveBeenCalledWith(expect.objectContaining({
      stationId: "opensensemap-box-valide",
      qualificationStatus: "validated",
      isActive: 1,
      exclusionReason: null,
    }));
  });

  it("applique le verdict de qualification dès que l'historique archivé suffit", async () => {
    mocks.collectNearbyStations.mockResolvedValue([liveOfficialStation]);
    mocks.calculateGroundTruth.mockReturnValue(qualifiedSynthesis);
    mocks.getCandidateOpenSenseMapStations.mockResolvedValue([archivedCandidateRow]);
    mocks.getValidatedOfficialStationsNearReference.mockResolvedValue([
      archivedOfficialRow("mf-a"),
      archivedOfficialRow("mf-b"),
    ]);
    mocks.getStationObservationsForQualification.mockResolvedValue([
      ...archivedOfficialObservations("mf-a", 18.0),
      ...archivedOfficialObservations("mf-b", 18.2),
      ...archivedCandidateObservations,
    ]);

    await collectPhysicalObservationSnapshotsForFavorites([favorite(50.756, 2.521)] as any, "scheduled");

    expect(mocks.applyOpenSenseMapQualificationVerdicts).toHaveBeenCalledWith([expect.objectContaining({
      stationId: "opensensemap-box-citoyen",
      qualificationStatus: "validated",
      isActive: 1,
      exclusionReason: null,
    })]);
  });

  it("applique la même qualification à une station CWOP candidate dont l'historique suffit", async () => {
    const cwopArchivedCandidateRow = { ...archivedCandidateRow, stationId: "cwop-EW1234", source: "cwop" };
    const cwopArchivedCandidateObservations = archivedCandidateObservations.map((observation) => ({
      ...observation,
      stationId: "cwop-EW1234",
    }));
    mocks.collectNearbyStations.mockResolvedValue([liveOfficialStation]);
    mocks.calculateGroundTruth.mockReturnValue(qualifiedSynthesis);
    mocks.getCandidateOpenSenseMapStations.mockResolvedValue([cwopArchivedCandidateRow]);
    mocks.getValidatedOfficialStationsNearReference.mockResolvedValue([
      archivedOfficialRow("mf-a"),
      archivedOfficialRow("mf-b"),
    ]);
    mocks.getStationObservationsForQualification.mockResolvedValue([
      ...archivedOfficialObservations("mf-a", 18.0),
      ...archivedOfficialObservations("mf-b", 18.2),
      ...cwopArchivedCandidateObservations,
    ]);

    await collectPhysicalObservationSnapshotsForFavorites([favorite(50.756, 2.521)] as any, "scheduled");

    expect(mocks.applyOpenSenseMapQualificationVerdicts).toHaveBeenCalledWith([expect.objectContaining({
      stationId: "cwop-EW1234",
      qualificationStatus: "validated",
      isActive: 1,
      exclusionReason: null,
    })]);
  });

  it("n'écrit aucun verdict tant que l'historique archivé du capteur reste insuffisant", async () => {
    mocks.collectNearbyStations.mockResolvedValue([liveOfficialStation]);
    mocks.calculateGroundTruth.mockReturnValue(qualifiedSynthesis);
    mocks.getCandidateOpenSenseMapStations.mockResolvedValue([archivedCandidateRow]);
    mocks.getValidatedOfficialStationsNearReference.mockResolvedValue([
      archivedOfficialRow("mf-a"),
      archivedOfficialRow("mf-b"),
    ]);
    mocks.getStationObservationsForQualification.mockResolvedValue([
      ...archivedOfficialObservations("mf-a", 18.0),
      ...archivedOfficialObservations("mf-b", 18.2),
      qualificationObservation("opensensemap-box-citoyen", "1", 12, 5, 18.1),
    ]);

    await collectPhysicalObservationSnapshotsForFavorites([favorite(50.756, 2.521)] as any, "scheduled");

    expect(mocks.applyOpenSenseMapQualificationVerdicts).not.toHaveBeenCalled();
  });

  it("isole une panne du lecteur de candidats sans interrompre la collecte horaire", async () => {
    mocks.collectNearbyStations.mockResolvedValue([liveOfficialStation]);
    mocks.calculateGroundTruth.mockReturnValue(qualifiedSynthesis);
    mocks.getCandidateOpenSenseMapStations.mockRejectedValue(new Error("Lecteur de candidats indisponible"));

    const result = await collectPhysicalObservationSnapshotsForFavorites([favorite(50.756, 2.521)] as any, "scheduled");

    expect(result.status).toBe("completed");
    expect(result.locations).toEqual([expect.objectContaining({ stored: true, attempts: 1 })]);
  });
});
