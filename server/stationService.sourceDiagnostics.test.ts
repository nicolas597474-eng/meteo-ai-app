import { afterEach, describe, expect, it, vi } from "vitest";
import { resetWeatherFetchCache } from "./weatherFetch";
import { collectNearbyStationsWithDiagnostics, type StationData } from "./stationService";

type SyntheticReply = unknown | Error;
type SyntheticSource = "meteofrance" | "metar" | "opensensemap";

function getInputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function installSyntheticSources(replies: Record<SyntheticSource, SyntheticReply>): void {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = getInputUrl(input);
    const source: SyntheticSource | null = url.includes("public.opendatasoft.com")
      ? "meteofrance"
      : url.includes("aviationweather.gov")
        ? "metar"
        : url.includes("api.opensensemap.org")
          ? "opensensemap"
          : null;
    if (!source) throw new Error("Unexpected synthetic test request.");
    const reply = replies[source];
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}

function currentIso(): string {
  return new Date().toISOString();
}

function synopRecord(lat: number, lon: number) {
  return {
    numer_sta: "59000",
    nom: "Station SYNOP synthétique",
    latitude: lat,
    longitude: lon,
    altitude: 25,
    t: 293.15,
    u: 70,
    pres: 101325,
    ff: 5,
    raf10: 7,
    dd: 180,
    rr1: 0,
    date: currentIso(),
  };
}

function metarRecord(lat: number, lon: number) {
  return {
    icaoId: "LFAC",
    reportTime: currentIso(),
    temp: 18,
    dewp: 12,
    wdir: 180,
    wspd: 5,
    wgst: 8,
    altim: 1018,
    lat,
    lon,
    elev: 10,
    name: "Aéroport synthétique",
  };
}

async function collectAt(lat: number) {
  return collectNearbyStationsWithDiagnostics(lat, 2.52, 20, "test synthétique");
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetWeatherFetchCache();
});

describe("diagnostics des collecteurs de stations", () => {
  it("distingue les sources qui retournent des stations de celles qui réussissent sans résultat", async () => {
    const lat = 50.7511;
    installSyntheticSources({
      meteofrance: { results: [synopRecord(lat, 2.52)] },
      metar: [metarRecord(lat, 2.52)],
      opensensemap: [],
    });

    const result = await collectAt(lat);

    expect(result.sourceDiagnostics).toEqual([
      { source: "meteofrance", status: "success_with_data", stationCount: 1 },
      { source: "metar", status: "success_with_data", stationCount: 1 },
      { source: "netatmo", status: "not_configured", stationCount: 0 },
      { source: "opensensemap", status: "success_empty", stationCount: 0 },
    ]);
    expect(result.stations.map((station) => station.stationId)).toEqual(["mf-59000", "metar-LFAC"]);
    expect(result.cacheHit).toBe(false);
  });

  it("qualifie une réponse vide légitime séparément d’une source non configurée", async () => {
    const lat = 50.7512;
    installSyntheticSources({
      meteofrance: { results: [] },
      metar: [],
      opensensemap: [],
    });

    const result = await collectAt(lat);

    expect(result.stations).toEqual([]);
    expect(result.sourceDiagnostics).toEqual([
      { source: "meteofrance", status: "success_empty", stationCount: 0 },
      { source: "metar", status: "success_empty", stationCount: 0 },
      { source: "netatmo", status: "not_configured", stationCount: 0 },
      { source: "opensensemap", status: "success_empty", stationCount: 0 },
    ]);
  });

  it("capture une panne réseau Météo-France sans message brut et conserve les stations METAR", async () => {
    const lat = 50.7513;
    installSyntheticSources({
      meteofrance: new TypeError("fetch failed https://provider.invalid/path?token=synthetic-secret"),
      metar: [metarRecord(lat, 2.52)],
      opensensemap: [],
    });

    const result = await collectAt(lat);

    expect(result.sourceDiagnostics).toContainEqual({
      source: "meteofrance",
      status: "error",
      stationCount: 0,
      reason: "network_error",
    });
    expect(result.stations.map((station) => station.stationId)).toContain("metar-LFAC");
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
    expect(JSON.stringify(result)).not.toContain("provider.invalid");
  });

  it("isole un rejet de promesse openSenseMap sans écraser les stations Météo-France déjà réussies", async () => {
    const lat = 50.7514;
    installSyntheticSources({
      meteofrance: { results: [synopRecord(lat, 2.52)] },
      metar: [],
      opensensemap: new TypeError("network rejection with private provider details"),
    });

    const result = await collectAt(lat);

    expect(result.sourceDiagnostics).toContainEqual({
      source: "opensensemap",
      status: "error",
      stationCount: 0,
      reason: "network_error",
    });
    expect(result.sourceDiagnostics).toContainEqual({ source: "meteofrance", status: "success_with_data", stationCount: 1 });
    expect(result.stations.map((station) => station.stationId)).toEqual(["mf-59000"]);
  });

  it("normalise une réponse HTTP non réussie sans l’assimiler à une source vide", async () => {
    const lat = 50.7515;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = getInputUrl(input);
      if (url.includes("public.opendatasoft.com")) {
        return new Response("private provider response", { status: 503 });
      }
      if (url.includes("aviationweather.gov") || url.includes("api.opensensemap.org")) {
        return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error("Unexpected synthetic test request.");
    }));

    const result = await collectAt(lat);

    expect(result.sourceDiagnostics).toContainEqual({
      source: "meteofrance",
      status: "error",
      stationCount: 0,
      reason: "provider_http_error",
    });
    expect(JSON.stringify(result)).not.toContain("private provider response");
  });
});
