/**
 * CWOP/MADIS — intégration en deux phases du plan du dépôt.
 *
 * Phase 1 — mesure de couverture : la disponibilité des stations CWOP autour
 * d'un lieu favori se mesure via le service GeoJSON public et documenté de
 * l'Iowa Environmental Mesonet (réseau CWOP, observations publiquement
 * accessibles, sans compte ni jeton). Cette mesure ne produit AUCUNE valeur
 * d'observation : aucune température, vent ni précipitation n'est lue, déduite
 * ou fabriquée à ce stade.
 *
 * Phase 2 — observations réelles et statut candidat : franchie après la mesure
 * de couverture, elle lit pour chaque station proche sa dernière observation
 * réelle sur le service current.py documenté du même IEM (utc_valid = heure de
 * mesure fournie par la station, jamais l'heure de collecte). Seules les
 * grandeurs explicitement fournies sont conservées, avec leurs unités
 * converties ; toute valeur absente reste null, aucune n'est déduite. Ces
 * relevés alimentent des capteurs citoyens candidats : jamais actifs, jamais
 * physiques, la qualification MAE vs SYNOP décidera seule de leur promotion.
 */

import { fetchWeather } from "./weatherFetch";
import { StationSourceCollectionError } from "./stationSourceDiagnostics";
import { parseStrictMeasurementEpoch } from "./openSenseMapQualificationService";

/** Service GeoJSON documenté de l'IEM pour le réseau CWOP. */
const CWOP_INVENTORY_URL = "https://mesonet.agron.iastate.edu/geojson/network.py?network=CWOP";
/** L'inventaire de stations évolue lentement : une lecture suffit par fenêtre. */
const CWOP_INVENTORY_CACHE_TTL_MS = 30 * 60_000;

export type CwopInventoryFeature = {
  type?: unknown;
  geometry?: { type?: unknown; coordinates?: unknown };
  properties?: Record<string, unknown> | null;
};

export type CwopCoverageStation = {
  /** Vrai identifiant CWOP tel que fourni par le fournisseur ; jamais déduit. */
  providerStationId: string;
  name: string | null;
  lat: number;
  lon: number;
  elevationM: number | null;
  /** Indicateur en ligne du fournisseur s'il est exposé ; jamais deviné. */
  online: boolean | null;
  distanceKm: number;
};

export type CwopCoverageReport = {
  lat: number;
  lon: number;
  radiusKm: number;
  fetchedAt: string;
  totalInRadius: number;
  /** Nombre en ligne si chaque station expose l'indicateur ; sinon null. */
  onlineInRadius: number | null;
  stations: CwopCoverageStation[];
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Valide la réponse d'inventaire sans exposer de détail fournisseur. */
export function validateCwopInventoryResponse(payload: unknown): CwopInventoryFeature[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new StationSourceCollectionError("invalid_response");
  }
  const collection = payload as { type?: unknown; features?: unknown };
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new StationSourceCollectionError("invalid_response");
  }
  if (collection.features.some((feature: unknown) => !feature || typeof feature !== "object" || Array.isArray(feature))) {
    throw new StationSourceCollectionError("invalid_response");
  }
  return collection.features as CwopInventoryFeature[];
}

/**
 * Mappe une entrée d'inventaire CWOP en station de couverture. Exige un
 * identifiant fournisseur réel et des coordonnées valides ; toute valeur
 * absente reste null — aucune grandeur n'est déduite.
 */
export function parseCwopInventoryFeature(
  feature: CwopInventoryFeature,
  referenceLat: number,
  referenceLon: number,
  radiusKm: number,
): CwopCoverageStation | null {
  const properties = feature.properties ?? {};
  const sid = typeof properties.sid === "string" ? properties.sid.trim() : "";
  if (!sid) return null;

  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lon = parseFiniteNumber(coordinates[0]);
  const lat = parseFiniteNumber(coordinates[1]);
  if (lat == null || lon == null) return null;

  const distanceKm = haversineKm(referenceLat, referenceLon, lat, lon);
  if (!Number.isFinite(distanceKm) || distanceKm > radiusKm) return null;

  const elevation = parseFiniteNumber(properties.elevation)
    ?? (coordinates.length >= 3 ? parseFiniteNumber(coordinates[2]) : null);
  const online = typeof properties.online === "boolean" ? properties.online : null;
  const name = typeof properties.name === "string" && properties.name.trim() !== ""
    ? properties.name.trim()
    : null;

  return {
    providerStationId: sid,
    name,
    lat,
    lon,
    elevationM: elevation,
    online,
    distanceKm: Math.round(distanceKm * 10) / 10,
  };
}

/** Construit le rapport de couverture à partir d'un inventaire déjà validé. */
export function buildCwopCoverageReport(
  features: readonly CwopInventoryFeature[],
  lat: number,
  lon: number,
  radiusKm: number,
  fetchedAt: string,
): CwopCoverageReport {
  const byId = new Map<string, CwopCoverageStation>();
  for (const feature of features) {
    const station = parseCwopInventoryFeature(feature, lat, lon, radiusKm);
    if (!station || byId.has(station.providerStationId)) continue;
    byId.set(station.providerStationId, station);
  }
  const stations = Array.from(byId.values()).sort((left, right) => left.distanceKm - right.distanceKm);
  const allFlagsExposed = stations.every((station) => station.online !== null);
  return {
    lat,
    lon,
    radiusKm,
    fetchedAt,
    totalInRadius: stations.length,
    onlineInRadius: allFlagsExposed ? stations.filter((station) => station.online === true).length : null,
    stations,
  };
}

let inventoryCache: { expiresAt: number; features: CwopInventoryFeature[] } | null = null;

/** Vide le cache d'inventaire : utilitaire d'isolement des tests. */
export function resetCwopInventoryCache() {
  inventoryCache = null;
}

async function fetchCwopInventoryFeatures(): Promise<CwopInventoryFeature[]> {
  if (inventoryCache && inventoryCache.expiresAt > Date.now()) return inventoryCache.features;
  const response = await fetchWeather(CWOP_INVENTORY_URL, {}, { timeoutMs: 20_000, attempts: 2 });
  if (!response.ok) throw new StationSourceCollectionError("provider_http_error");
  const features = validateCwopInventoryResponse(await response.json() as unknown);
  inventoryCache = { expiresAt: Date.now() + CWOP_INVENTORY_CACHE_TTL_MS, features };
  return features;
}

/** Mesure la couverture CWOP autour d'un point : inventaire réel, zéro mesure. */
export async function fetchCwopCoverage(
  lat: number,
  lon: number,
  radiusKm: number,
): Promise<CwopCoverageReport> {
  const features = await fetchCwopInventoryFeatures();
  return buildCwopCoverageReport(features, lat, lon, radiusKm, new Date().toISOString());
}

// ─── Phase 2 : observations réelles et candidats citoyens ────────────────────

/** Service legacy documenté de l'IEM : dernière observation d'une station. */
const CWOP_LATEST_OBSERVATION_URL = "https://mesonet.agron.iastate.edu/json/current.py";
/**
 * Bornage de la charge fournisseur : seules les stations CWOP les plus
 * proches du favori reçoivent une lecture d'observation par collecte.
 */
const CWOP_CANDIDATES_MAX_PER_LOCATION = 8;

export type CwopCandidate = {
  providerStationId: string;
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
  updatedAt: string | null;
  /** Horodatage de mesure fourni par la station pour chaque variable ; jamais déduit. */
  measurementTimes: {
    temperature: string | null;
    humidity: string | null;
    pressure: string | null;
    windSpeed: string | null;
    windGust: string | null;
    windDirection: string | null;
    precipitation: string | null;
  };
};

function fahrenheitToCelsius(value: number): number {
  return Math.round(((value - 32) * 5) / 9 * 10) / 10;
}

function knotsToKmh(value: number): number {
  return Math.round(value * 1.852 * 10) / 10;
}

function inchesOfMercuryToHpa(value: number): number {
  return Math.round(value * 33.8638866667 * 10) / 10;
}

/**
 * Extrait l'observation la plus récente d'une réponse current.py. Une réponse
 * sans last_ob exploitable (station sans donnée récente, enveloppe inattendue)
 * rend null : aucune valeur n'est devinée ni fabriquée.
 */
export function extractCwopLatestOb(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const lastOb = (payload as { last_ob?: unknown }).last_ob;
  if (!lastOb || typeof lastOb !== "object" || Array.isArray(lastOb)) return null;
  return lastOb as Record<string, unknown>;
}

/**
 * Valeur strictement fournie par le service : null ou chaîne vide ne deviennent
 * JAMAIS 0 — une grandeur absente reste absente, aucune n'est déduite.
 */
function parseProvidedFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Mappe la dernière observation documentée d'une station CWOP en candidat
 * citoyen. Seules les variables explicitement fournies avec l'heure de mesure
 * de l'observation (utc_valid) sont conservées : température (airtemp[F] en
 * Fahrenheit convertie en °C), vent (windspeed[kt] en nœuds converti en km/h),
 * direction (winddirection[deg]) et pression (mslp[mb] en hPa, à défaut
 * altimeter[in] converti en hPa). L'humidité, les rafales et la précipitation
 * ne sont pas diffusées par ce service avec des clés vérifiées : elles restent
 * null, jamais déduites. Sans heure de mesure réelle ni mesure activante
 * (température ou vent), la station n'est pas candidate.
 */
export function mapCwopLatestOb(
  ob: Record<string, unknown>,
  station: CwopCoverageStation,
): CwopCandidate | null {
  const utcValidRaw = typeof ob.utc_valid === "string" ? ob.utc_valid : null;
  if (utcValidRaw == null || parseStrictMeasurementEpoch(utcValidRaw) === null) return null;

  const temperatureF = parseProvidedFiniteNumber(ob["airtemp[F]"]);
  const windSpeedKt = parseProvidedFiniteNumber(ob["windspeed[kt]"]);
  const windDirection = parseProvidedFiniteNumber(ob["winddirection[deg]"]);
  const mslpMb = parseProvidedFiniteNumber(ob["mslp[mb]"]);
  const altimeterIn = parseProvidedFiniteNumber(ob["altimeter[in]"]);
  const temperature = temperatureF == null ? null : fahrenheitToCelsius(temperatureF);
  const windSpeed = windSpeedKt == null ? null : knotsToKmh(windSpeedKt);
  const pressure = mslpMb != null ? Math.round(mslpMb * 10) / 10 : altimeterIn == null ? null : inchesOfMercuryToHpa(altimeterIn);

  if (temperature == null && windSpeed == null) return null;

  return {
    providerStationId: station.providerStationId,
    name: station.name ?? `Station CWOP ${station.providerStationId}`,
    lat: station.lat,
    lon: station.lon,
    altitude: station.elevationM,
    distanceKm: station.distanceKm,
    temperature,
    humidity: null,
    pressure,
    windSpeed,
    windGust: null,
    windDirection,
    precipitation: null,
    updatedAt: utcValidRaw,
    measurementTimes: {
      temperature: temperature == null ? null : utcValidRaw,
      humidity: null,
      pressure: pressure == null ? null : utcValidRaw,
      windSpeed: windSpeed == null ? null : utcValidRaw,
      windGust: null,
      windDirection: windDirection == null ? null : utcValidRaw,
      precipitation: null,
    },
  };
}

async function fetchCwopLatestOb(providerStationId: string): Promise<Record<string, unknown> | null> {
  const url = `${CWOP_LATEST_OBSERVATION_URL}?station=${encodeURIComponent(providerStationId)}&network=CWOP`;
  const response = await fetchWeather(url, {}, { timeoutMs: 8_000, attempts: 2 });
  if (!response.ok) throw new StationSourceCollectionError("provider_http_error");
  return extractCwopLatestOb(await response.json() as unknown);
}

/**
 * Collecte les candidats citoyens CWOP autour d'un lieu favori : l'inventaire
 * réel fournit les stations dans le rayon, puis chaque station la plus proche
 * reçoit une lecture de sa dernière observation réelle. Une station sans
 * observation exploitable ou en échec est écartée sans annuler la collecte ;
 * seule une panne de l'inventaire fait échouer la source.
 */
export async function fetchCwopCandidates(lat: number, lon: number, radiusKm: number): Promise<CwopCandidate[]> {
  const coverage = await fetchCwopCoverage(lat, lon, radiusKm);
  const nearest = coverage.stations.slice(0, CWOP_CANDIDATES_MAX_PER_LOCATION);
  const settled = await Promise.allSettled(
    nearest.map(async (station) => mapCwopLatestOb((await fetchCwopLatestOb(station.providerStationId)) ?? {}, station)),
  );
  return settled
    .filter((result): result is PromiseFulfilledResult<CwopCandidate | null> => result.status === "fulfilled")
    .map((result) => result.value)
    .filter((candidate): candidate is CwopCandidate => candidate !== null);
}
