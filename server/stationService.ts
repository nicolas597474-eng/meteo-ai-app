/**
 * Station Service — Multi-source weather station discovery and ground truth calculation
 *
 * Sources interrogated:
 * 1. Open-Meteo grid point (best-match model, always available)
 * 2. OpenDataSoft SYNOP (Météo-France official network, real data, free/no-key)
 * 3. Netatmo public stations (OAuth, when a user connection is active)
 * 4. Open-Meteo multi-point grid references (clearly not physical stations)
 * 5. openSenseMap outdoor citizen sensors (candidates, excluded from ground truth)
 *
 * Ground truth weighting:
 *   50% distance (closer = more weight)
 *   30% historical quality (reliability score)
 *   20% data freshness (how recent the last reading is)
 */

import { fetchOpenSenseMapCandidates } from "./openSenseMapService";
import { WEATHER_SERVICES } from "./weatherServices";
import type { CurrentModelReference } from "./modelReferenceCoherence";

export const HONDEGHEM = { lat: 50.7567, lon: 2.5204 };

export type StationSource =
  | "meteofrance"
  | "netatmo"
  | "wunderground"
  | "cwop"
  | "noaa"
  | "metar"
  | "openmeteo"
  | "synop"
  | "davis"
  | "infoclimat"
  | "opensensemap";

export type StationData = {
  stationId: string;
  source: StationSource;
  name: string;
  lat: number;
  lon: number;
  altitude: number | null;
  distanceKm: number;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDirection: number | null;
  precipitation: number | null;
  updatedAt: string | null; // ISO timestamp
  reliabilityScore: number; // 0-100
  updateFrequencyMin: number;
  dataAvailability: number; // 0-1
  isActive: boolean;
  exclusionReason?: string;
  qualificationStatus?: "candidate" | "validated" | "excluded";
  sourceTier?: 1 | 2 | 3;
};

/**
 * Sources dont les relevés sont associés à une station physique identifiée.
 * Les réseaux personnels simulés et points de grille restent des références de
 * modèle : ils ne doivent jamais être persistés comme observations de station.
 */
export const PHYSICAL_STATION_SOURCES: ReadonlySet<StationSource> = new Set<StationSource>(["meteofrance", "metar", "netatmo"]);

export type StationSourceKind = "physical" | "reference";

export function getStationSourceKind(source: StationSource, stationId?: string): StationSourceKind {
  if (source === "netatmo" && stationId && !stationId.startsWith("netatmo-")) {
    return "reference";
  }
  return PHYSICAL_STATION_SOURCES.has(source) ? "physical" : "reference";
}

export function getPhysicalActiveStations(stations: StationData[]): StationData[] {
  return stations.filter((station) => station.isActive && getStationSourceKind(station.source, station.stationId) === "physical");
}

export function getCandidateStations(stations: StationData[]): StationData[] {
  return stations.filter((station) => station.qualificationStatus === "candidate");
}

export type GroundTruthResult = {
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  windSpeed: number | null;
  windGust: number | null;
  precipitation: number | null;
  stationsUsed: StationContribution[];
  stationsIgnored: StationExclusion[];
  stationCount: number;
  confidenceScore: number;
};

export type StationContribution = {
  stationId: string;
  name: string;
  source: string;
  distanceKm: number;
  weight: number; // 0-1 final weight
  distanceWeight: number;
  qualityWeight: number;
  freshnessWeight: number;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  windSpeed: number | null;
  precipitation: number | null;
};

export type StationExclusion = {
  stationId: string;
  name: string;
  source: string;
  distanceKm: number;
  reason: string;
};

// ─── Haversine distance ───────────────────────────────────────────────────────

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Source reliability defaults ─────────────────────────────────────────────

const SOURCE_DEFAULTS: Record<StationSource, { reliability: number; updateFreqMin: number; availability: number }> = {
  meteofrance:  { reliability: 92, updateFreqMin: 60, availability: 0.98 },
  metar:        { reliability: 90, updateFreqMin: 60, availability: 0.97 },
  synop:        { reliability: 88, updateFreqMin: 60, availability: 0.95 },
  noaa:         { reliability: 85, updateFreqMin: 60, availability: 0.93 },
  infoclimat:   { reliability: 82, updateFreqMin: 30, availability: 0.88 },
  openmeteo:    { reliability: 80, updateFreqMin: 60, availability: 0.90 },
  davis:        { reliability: 78, updateFreqMin: 10, availability: 0.85 },
  netatmo:      { reliability: 65, updateFreqMin: 10, availability: 0.75 },
  cwop:         { reliability: 60, updateFreqMin: 15, availability: 0.70 },
  wunderground: { reliability: 58, updateFreqMin: 5,  availability: 0.65 },
  opensensemap: { reliability: 0, updateFreqMin: 15, availability: 0 },
};

// La même collecte de stations alimente les modes Local et Ultra-local. Un cache
// très court évite de solliciter quatre fournisseurs à chaque changement de filtre,
// sans masquer un relevé durablement obsolète.
export const NEARBY_STATIONS_CACHE_TTL_MS = 90_000;
type NearbyStationsCacheEntry = {
  expiresAt: number;
  stations?: StationData[];
  pending?: Promise<StationData[]>;
};
const nearbyStationsCache = new Map<string, NearbyStationsCacheEntry>();

function makeNearbyStationsCacheKey(
  lat: number,
  lon: number,
  radiusKm: number,
  netatmoUserId?: number,
) {
  return [lat.toFixed(4), lon.toFixed(4), radiusKm.toFixed(1), netatmoUserId ?? "public"].join(":");
}

// ─── Helper: fetch one Open-Meteo grid point ──────────────────────────────────

async function fetchOpenMeteoPoint(lat: number, lon: number, model?: string): Promise<{
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDirection: number | null;
  precipitation: number | null;
  elevation: number | null;
  time: string | null;
} | null> {
  try {
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lon.toString(),
      current: "temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation",
      timezone: "Europe/Paris",
    });
    if (model) params.set("models", model);
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const c = data.current;
    if (!c) return null;
    return {
      temperature: c.temperature_2m ?? null,
      humidity: c.relative_humidity_2m ?? null,
      pressure: c.surface_pressure ?? null,
      windSpeed: c.wind_speed_10m ?? null,
      windGust: c.wind_gusts_10m ?? null,
      windDirection: c.wind_direction_10m ?? null,
      precipitation: c.precipitation ?? null,
      elevation: data.elevation ?? null,
      time: c.time ?? null,
    };
  } catch {
    return null;
  }
}

/** Références des modèles au point demandé : elles ne sont jamais des stations. */
export async function fetchCurrentModelReferences(lat: number, lon: number): Promise<CurrentModelReference[]> {
  const responses = await Promise.allSettled(
    WEATHER_SERVICES.expert.map(async (service) => {
      const point = await fetchOpenMeteoPoint(lat, lon, service.modelId === "best_match" ? undefined : service.modelId);
      if (!point) return null;
      return {
        id: `model-${service.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: service.name,
        temperature: point.temperature,
        humidity: point.humidity,
        pressure: point.pressure,
        windSpeed: point.windSpeed,
        windGust: point.windGust,
        windDirection: point.windDirection,
        precipitation: point.precipitation,
        updatedAt: point.time ? `${point.time}:00` : null,
      } satisfies CurrentModelReference;
    }),
  );

  return responses
    .filter((response): response is PromiseFulfilledResult<CurrentModelReference | null> => response.status === "fulfilled")
    .map((response) => response.value)
    .filter((reference): reference is CurrentModelReference => reference !== null);
}

// ─── 1. Open-Meteo reference grid point ──────────────────────────────────────

async function fetchOpenMeteoNearbyStations(
  lat: number,
  lon: number,
  _radiusKm: number
): Promise<StationData[]> {
  const pt = await fetchOpenMeteoPoint(lat, lon);
  if (!pt) return [];
  return [{
    stationId: `openmeteo-${lat.toFixed(4)}-${lon.toFixed(4)}`,
    source: "openmeteo" as StationSource,
    name: `Open-Meteo (point de grille ${lat.toFixed(3)}°N)`,
    lat,
    lon,
    altitude: pt.elevation,
    distanceKm: 0,
    temperature: pt.temperature,
    humidity: pt.humidity,
    pressure: pt.pressure,
    windSpeed: pt.windSpeed,
    windGust: pt.windGust,
    windDirection: pt.windDirection,
    precipitation: pt.precipitation,
    updatedAt: pt.time ? `${pt.time}:00` : new Date().toISOString(),
    reliabilityScore: SOURCE_DEFAULTS.openmeteo.reliability,
    updateFrequencyMin: SOURCE_DEFAULTS.openmeteo.updateFreqMin,
    dataAvailability: SOURCE_DEFAULTS.openmeteo.availability,
    isActive: true,
  }];
}

// ─── 2. OpenDataSoft SYNOP — real Météo-France official stations ──────────────

async function fetchMeteoFranceStations(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<StationData[]> {
  try {
    // OpenDataSoft SYNOP dataset — correct field names: latitude, longitude, altitude (not lat/lon/alti)
    const bbox = Math.max(radiusKm / 80, 0.5); // degrees, ~111km per degree
    const where = `latitude>${(lat - bbox).toFixed(4)} AND latitude<${(lat + bbox).toFixed(4)} AND longitude>${(lon - bbox).toFixed(4)} AND longitude<${(lon + bbox).toFixed(4)}`;
    const params = new URLSearchParams({
      select: "numer_sta,nom,latitude,longitude,altitude,t,u,pres,ff,raf10,rr1,dd,date",
      where,
      order_by: "date desc",
      limit: "30",
      timezone: "UTC",
    });
    const url = `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/donnees-synop-essentielles-omm/records?${params}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();

    const results: StationData[] = [];
    const seenStations = new Set<string>();

    for (const r of (data.results ?? [])) {
      const stId = `mf-${r.numer_sta}`;
      // Only take the most recent record per station
      if (seenStations.has(stId)) continue;
      seenStations.add(stId);

      const stLat = typeof r.latitude === "number" ? r.latitude : parseFloat(r.latitude ?? "0");
      const stLon = typeof r.longitude === "number" ? r.longitude : parseFloat(r.longitude ?? "0");
      if (!stLat || !stLon) continue;

      const dist = haversineKm(lat, lon, stLat, stLon);
      if (dist > radiusKm) continue;

      // Temperature in Kelvin → Celsius
      const tempC = r.t != null ? Math.round((parseFloat(r.t) - 273.15) * 10) / 10 : null;
      // Wind speed in m/s → km/h
      const windKmh = r.ff != null ? Math.round(parseFloat(r.ff) * 3.6 * 10) / 10 : null;
      const gustKmh = r.raf10 != null ? Math.round(parseFloat(r.raf10) * 3.6 * 10) / 10 : null;
      // Pressure in Pa → hPa
      const presHpa = r.pres != null ? Math.round(parseFloat(r.pres) / 100) : null;

      results.push({
        stationId: stId,
        source: "meteofrance" as StationSource,
        name: r.nom ?? `Station MF ${r.numer_sta}`,
        lat: stLat,
        lon: stLon,
        altitude: r.altitude != null ? parseFloat(r.altitude) : null,
        distanceKm: Math.round(dist * 10) / 10,
        temperature: tempC,
        humidity: r.u != null ? parseFloat(r.u) : null,
        pressure: presHpa,
        windSpeed: windKmh,
        windGust: gustKmh,
        windDirection: r.dd != null ? parseFloat(r.dd) : null,
        precipitation: r.rr1 != null ? parseFloat(r.rr1) : null,
        updatedAt: r.date ?? new Date().toISOString(),
        reliabilityScore: SOURCE_DEFAULTS.meteofrance.reliability,
        updateFrequencyMin: SOURCE_DEFAULTS.meteofrance.updateFreqMin,
        dataAvailability: SOURCE_DEFAULTS.meteofrance.availability,
        isActive: true,
      });
    }
    return results;
  } catch {
    return [];
  }
}

// ─── 3. METAR — official worldwide airport observations (no key required) ─────

export type MetarObservation = {
  icaoId?: string;
  reportTime?: string;
  temp?: number;
  dewp?: number;
  wdir?: number;
  wspd?: number;
  wgst?: number;
  altim?: number;
  lat?: number;
  lon?: number;
  elev?: number;
  name?: string;
};

export function mapMetarObservation(observation: MetarObservation, lat: number, lon: number, radiusKm: number): StationData | null {
  if (!observation.icaoId || typeof observation.lat !== "number" || typeof observation.lon !== "number") return null;
  const distanceKm = haversineKm(lat, lon, observation.lat, observation.lon);
  if (distanceKm > radiusKm) return null;
  const knotsToKmh = (knots: number | undefined) => knots === undefined ? null : Math.round(knots * 1.852 * 10) / 10;
  return {
    stationId: `metar-${observation.icaoId}`,
    source: "metar",
    name: observation.name ? `METAR · ${observation.name}` : `METAR · ${observation.icaoId}`,
    lat: observation.lat,
    lon: observation.lon,
    altitude: observation.elev ?? null,
    distanceKm: Math.round(distanceKm * 10) / 10,
    temperature: observation.temp ?? null,
    humidity: observation.temp !== undefined && observation.dewp !== undefined
      ? Math.max(0, Math.min(100, Math.round(100 - 5 * (observation.temp - observation.dewp))))
      : null,
    pressure: observation.altim ?? null,
    windSpeed: knotsToKmh(observation.wspd),
    windGust: knotsToKmh(observation.wgst),
    windDirection: observation.wdir ?? null,
    precipitation: null,
    updatedAt: observation.reportTime ?? null,
    reliabilityScore: SOURCE_DEFAULTS.metar.reliability,
    updateFrequencyMin: SOURCE_DEFAULTS.metar.updateFreqMin,
    dataAvailability: SOURCE_DEFAULTS.metar.availability,
    isActive: true,
  };
}

async function fetchMetarStations(lat: number, lon: number, radiusKm: number): Promise<StationData[]> {
  try {
    const latitudePadding = Math.max(radiusKm / 111, 0.25);
    const longitudePadding = Math.max(radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2)), 0.25);
    const bbox = [lat - latitudePadding, lon - longitudePadding, lat + latitudePadding, lon + longitudePadding]
      .map((coordinate) => coordinate.toFixed(4))
      .join(",");
    const params = new URLSearchParams({ format: "json", bbox });
    const response = await fetch(`https://aviationweather.gov/api/data/metar?${params}`, {
      headers: { "User-Agent": "MeteoAI/1.0 official-station-collector" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const observations = await response.json() as MetarObservation[];
    return observations
      .map((observation) => mapMetarObservation(observation, lat, lon, radiusKm))
      .filter((station): station is StationData => station !== null);
  } catch {
    return [];
  }
}

// ─── 4. Multi-point Open-Meteo grid references (not physical stations) ─────────
//
// We query Open-Meteo at several geographic offsets around the target location.
// Each offset uses a different NWP model to add diversity. These entries remain
// clearly labeled as model-grid references until a provider returns real station data.

// ─── 5. ECMWF IFS reference point (labeled as SYNOP/WMO) ─────────────────────

async function fetchSYNOPReference(
  lat: number,
  lon: number,
): Promise<StationData[]> {
  const pt = await fetchOpenMeteoPoint(lat, lon, "ecmwf_ifs025");
  if (!pt) return [];
  return [{
    stationId: `synop-ecmwf-${lat.toFixed(3)}-${lon.toFixed(3)}`,
    source: "synop" as StationSource,
    name: `Référence de grille ECMWF IFS`,
    lat,
    lon,
    altitude: pt.elevation,
    distanceKm: 0.2,
    temperature: pt.temperature,
    humidity: pt.humidity,
    pressure: pt.pressure,
    windSpeed: pt.windSpeed,
    windGust: pt.windGust,
    windDirection: pt.windDirection,
    precipitation: pt.precipitation,
    updatedAt: pt.time ? `${pt.time}:00` : new Date().toISOString(),
    reliabilityScore: SOURCE_DEFAULTS.synop.reliability,
    updateFrequencyMin: SOURCE_DEFAULTS.synop.updateFreqMin,
    dataAvailability: SOURCE_DEFAULTS.synop.availability,
    isActive: true,
  }];
}

// ─── Main: collect all stations ───────────────────────────────────────────────

async function collectNearbyStationsUncached(
  lat: number,
  lon: number,
  radiusKm: number = 20,
  townName: string = "Local",
  options: { netatmoUserId?: number; onNetatmoStatus?: (status: import("./netatmoService").NetatmoAvailability) => void } = {},
): Promise<StationData[]> {
  const { fetchNetatmoPublicStations } = await import("./netatmoService");
  // Seules les observations de station et les candidats sont assemblés ici.
  // Les modèles sont exposés séparément par fetchCurrentModelReferences().
  const [meteoFrance, metar, netatmo, openSenseMap] = await Promise.allSettled([
    fetchMeteoFranceStations(lat, lon, radiusKm),
    fetchMetarStations(lat, lon, radiusKm),
    fetchNetatmoPublicStations(options.netatmoUserId, lat, lon, radiusKm, { onStatus: options.onNetatmoStatus }),
    fetchOpenSenseMapCandidates(lat, lon, radiusKm),
  ]);

  const all: StationData[] = [
    ...(meteoFrance.status === "fulfilled" ? meteoFrance.value : []),
    ...(metar.status === "fulfilled" ? metar.value : []),
    ...(netatmo.status === "fulfilled" ? netatmo.value : []),
    ...(openSenseMap.status === "fulfilled" ? openSenseMap.value.map((candidate): StationData => ({
      stationId: `opensensemap-${candidate.providerStationId}`,
      source: "opensensemap",
      name: candidate.name,
      lat: candidate.lat,
      lon: candidate.lon,
      altitude: candidate.altitude,
      distanceKm: candidate.distanceKm,
      temperature: candidate.temperature,
      humidity: candidate.humidity,
      pressure: candidate.pressure,
      windSpeed: candidate.windSpeed,
      windGust: candidate.windGust,
      windDirection: candidate.windDirection,
      precipitation: candidate.precipitation,
      updatedAt: candidate.updatedAt,
      reliabilityScore: SOURCE_DEFAULTS.opensensemap.reliability,
      updateFrequencyMin: SOURCE_DEFAULTS.opensensemap.updateFreqMin,
      dataAvailability: SOURCE_DEFAULTS.opensensemap.availability,
      isActive: false,
      qualificationStatus: "candidate",
      sourceTier: 3,
      exclusionReason: "Capteur citoyen en validation — non utilisé dans la température locale",
    })) : []),
  ];

  // Deduplicate by stationId
  const seen = new Set<string>();
  const unique = all.filter(s => {
    if (seen.has(s.stationId)) return false;
    seen.add(s.stationId);
    return true;
  });

  // Filter to radius
  const inRadius = unique.filter(s => s.distanceKm <= radiusKm);

  // Apply quality exclusion rules
  return inRadius.map(s => {
    if (s.temperature == null && s.windSpeed == null && s.precipitation == null) {
      return { ...s, isActive: false, exclusionReason: "Aucune donnée disponible" };
    }
    const ageMin = s.updatedAt
      ? (Date.now() - new Date(s.updatedAt).getTime()) / 60000
      : 999;
    if (ageMin > 180) {
      return { ...s, isActive: false, exclusionReason: `Données trop anciennes (${Math.round(ageMin)} min)` };
    }
    if (s.reliabilityScore < 40) {
      return { ...s, isActive: false, exclusionReason: `Score de fiabilité trop bas (${s.reliabilityScore}/100)` };
    }
    return s;
  });
}

export async function collectNearbyStations(
  lat: number,
  lon: number,
  radiusKm: number = 20,
  townName: string = "Local",
  options: { netatmoUserId?: number; onNetatmoStatus?: (status: import("./netatmoService").NetatmoAvailability) => void } = {},
): Promise<StationData[]> {
  const cacheKey = makeNearbyStationsCacheKey(lat, lon, radiusKm, options.netatmoUserId);
  const now = Date.now();
  const cached = nearbyStationsCache.get(cacheKey);
  if (cached?.stations && cached.expiresAt > now) {
    options.onNetatmoStatus?.(options.netatmoUserId === undefined ? "not_connected" : "fresh_cache");
    return cached.stations;
  }
  if (cached?.pending) return cached.pending;

  const pending = collectNearbyStationsUncached(lat, lon, radiusKm, townName, options);
  nearbyStationsCache.set(cacheKey, { expiresAt: now + NEARBY_STATIONS_CACHE_TTL_MS, pending });
  try {
    const stations = await pending;
    nearbyStationsCache.set(cacheKey, { expiresAt: Date.now() + NEARBY_STATIONS_CACHE_TTL_MS, stations });
    return stations;
  } catch (error) {
    nearbyStationsCache.delete(cacheKey);
    throw error;
  }
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

export function rankStations(stations: StationData[]): StationData[] {
  return [...stations].sort((a, b) => {
    // Active first
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;

    // Composite rank: 40% distance + 30% reliability + 20% availability + 10% update freq
    const scoreA =
      (1 / (a.distanceKm + 0.1)) * 40 +
      (a.reliabilityScore / 100) * 30 +
      a.dataAvailability * 20 +
      (1 / (a.updateFrequencyMin + 1)) * 10;
    const scoreB =
      (1 / (b.distanceKm + 0.1)) * 40 +
      (b.reliabilityScore / 100) * 30 +
      b.dataAvailability * 20 +
      (1 / (b.updateFrequencyMin + 1)) * 10;
    return scoreB - scoreA;
  });
}

// ─── Ground truth calculation ─────────────────────────────────────────────────

export function calculateGroundTruth(stations: StationData[]): GroundTruthResult {
  const active = stations.filter(s => s.isActive);
  const ignored: StationExclusion[] = stations
    .filter(s => !s.isActive)
    .map(s => ({
      stationId: s.stationId,
      name: s.name,
      source: s.source,
      distanceKm: s.distanceKm,
      reason: s.exclusionReason ?? "Raison inconnue",
    }));

  if (active.length === 0) {
    return {
      temperature: null, humidity: null, pressure: null,
      windSpeed: null, windGust: null, precipitation: null,
      stationsUsed: [], stationsIgnored: ignored,
      stationCount: 0, confidenceScore: 0,
    };
  }

  // Compute raw weights per station
  const now = Date.now();
  const rawWeights = active.map(s => {
    // Distance weight (50%): inverse distance, normalized
    const distW = 1 / (s.distanceKm + 0.5);

    // Quality weight (30%): reliability score 0-100
    const qualW = s.reliabilityScore / 100;

    // Freshness weight (20%): decay based on age
    const ageMin = s.updatedAt
      ? (now - new Date(s.updatedAt).getTime()) / 60000
      : 60;
    const freshW = Math.exp(-ageMin / 60); // half-life = 60 min

    return { distW, qualW, freshW, total: distW * 0.5 + qualW * 0.3 + freshW * 0.2 };
  });

  const totalWeight = rawWeights.reduce((s, w) => s + w.total, 0);

  const contributions: StationContribution[] = active.map((s, i) => ({
    stationId: s.stationId,
    name: s.name,
    source: s.source,
    distanceKm: s.distanceKm,
    weight: Math.round((rawWeights[i].total / totalWeight) * 1000) / 1000,
    distanceWeight: Math.round(rawWeights[i].distW * 1000) / 1000,
    qualityWeight: Math.round(rawWeights[i].qualW * 1000) / 1000,
    freshnessWeight: Math.round(rawWeights[i].freshW * 1000) / 1000,
    temperature: s.temperature,
    humidity: s.humidity,
    pressure: s.pressure,
    windSpeed: s.windSpeed,
    precipitation: s.precipitation,
  }));

  // Weighted average for each variable
  function weightedAvg(field: keyof Pick<StationData, "temperature" | "humidity" | "pressure" | "windSpeed" | "windGust" | "precipitation">): number | null {
    let sum = 0, wSum = 0;
    active.forEach((s, i) => {
      const v = s[field];
      if (v != null) {
        sum += (v as number) * rawWeights[i].total;
        wSum += rawWeights[i].total;
      }
    });
    return wSum > 0 ? Math.round((sum / wSum) * 10) / 10 : null;
  }

  // Confidence: higher when more stations agree (low std dev) and many stations
  const temps = active.map(s => s.temperature).filter((v): v is number => v != null);
  const tempMean = temps.length > 0 ? temps.reduce((a, b) => a + b) / temps.length : 0;
  const tempStd = temps.length > 1
    ? Math.sqrt(temps.reduce((s, v) => s + (v - tempMean) ** 2, 0) / temps.length)
    : 0;
  const confidenceScore = Math.max(0, Math.min(100, Math.round(
    100 - tempStd * 10 - Math.max(0, 5 - active.length) * 5
  )));

  return {
    temperature: weightedAvg("temperature"),
    humidity: weightedAvg("humidity"),
    pressure: weightedAvg("pressure"),
    windSpeed: weightedAvg("windSpeed"),
    windGust: weightedAvg("windGust"),
    precipitation: weightedAvg("precipitation"),
    stationsUsed: contributions,
    stationsIgnored: ignored,
    stationCount: active.length,
    confidenceScore,
  };
}
