/**
 * CWOP/MADIS — mesure de couverture (phase 1 du plan d'intégration).
 *
 * Cet adaptateur mesure uniquement la disponibilité des stations CWOP autour
 * d'un lieu favori, via le service GeoJSON public et documenté de l'Iowa
 * Environmental Mesonet (réseau CWOP, observations publiquement accessibles,
 * sans compte ni jeton). Il ne produit AUCUNE valeur d'observation : aucune
 * température, vent ni précipitation n'est lue, déduite ou fabriquée ici.
 * Les stations identifiées restent des inventaires ; rien n'entre dans la
 * fusion, la vérité terrain ou l'affichage utilisateur à ce stade.
 *
 * L'étape suivante (observations réelles + statut candidate) ne sera franchie
 * qu'après la mesure de couverture, conformément au plan du dépôt.
 */

import { fetchWeather } from "./weatherFetch";
import { StationSourceCollectionError } from "./stationSourceDiagnostics";

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
