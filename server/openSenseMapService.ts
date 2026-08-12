import { fetchWeather } from "./weatherFetch";

type OpenSenseMapMeasurement = {
  value?: string | number;
  createdAt?: string;
};

type OpenSenseMapSensor = {
  title?: string;
  unit?: string;
  lastMeasurement?: OpenSenseMapMeasurement | null;
};

export type OpenSenseMapBox = {
  _id?: string;
  name?: string;
  exposure?: string;
  currentLocation?: { coordinates?: [number, number, number?] | number[] };
  sensors?: OpenSenseMapSensor[];
};

export type OpenSenseMapCandidate = {
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
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function latestValue(sensors: OpenSenseMapSensor[], matcher: RegExp) {
  const matches = sensors
    .filter((sensor) => matcher.test(`${sensor.title ?? ""} ${sensor.unit ?? ""}`.toLowerCase()))
    .map((sensor) => ({
      value: Number(sensor.lastMeasurement?.value),
      createdAt: sensor.lastMeasurement?.createdAt ?? null,
    }))
    .filter((reading) => Number.isFinite(reading.value));
  if (matches.length === 0) return { value: null, createdAt: null };
  return matches.sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""))[0];
}

export function mapOpenSenseMapBox(
  box: OpenSenseMapBox,
  referenceLat: number,
  referenceLon: number,
  radiusKm: number,
): OpenSenseMapCandidate | null {
  if (!box._id || box.exposure !== "outdoor") return null;
  const coordinates = box.currentLocation?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;
  const [lon, lat, altitude] = coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const distanceKm = haversineKm(referenceLat, referenceLon, lat, lon);
  if (distanceKm > radiusKm) return null;

  const sensors = box.sensors ?? [];
  const temperature = latestValue(sensors, /temp(?:eratur|erature)?|°c|celsius/);
  const humidity = latestValue(sensors, /humidity|humidit|feuchte|relativ/);
  const pressure = latestValue(sensors, /pressure|press|luftdruck/);
  const windSpeed = latestValue(sensors, /wind(?: speed|speed|geschwindigkeit)?/);
  const windGust = latestValue(sensors, /gust|rafale|b[oö]e/);
  const windDirection = latestValue(sensors, /wind.*(?:direction|richtung)|direction.*wind/);
  const precipitation = latestValue(sensors, /precip|rain|pluie|niederschlag/);
  const dates = [temperature, humidity, pressure, windSpeed, windGust, windDirection, precipitation]
    .map((measurement) => measurement.createdAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a));

  if (temperature.value == null && windSpeed.value == null && precipitation.value == null) return null;
  return {
    providerStationId: box._id,
    name: box.name?.trim() || "Capteur openSenseMap",
    lat,
    lon,
    altitude: Number.isFinite(altitude) ? altitude ?? null : null,
    distanceKm: Math.round(distanceKm * 10) / 10,
    temperature: temperature.value,
    humidity: humidity.value,
    pressure: pressure.value,
    windSpeed: windSpeed.value,
    windGust: windGust.value,
    windDirection: windDirection.value,
    precipitation: precipitation.value,
    updatedAt: dates[0] ?? null,
  };
}

export async function fetchOpenSenseMapCandidates(lat: number, lon: number, radiusKm: number) {
  const params = new URLSearchParams({
    near: `${lon},${lat}`,
    maxDistance: String(Math.round(radiusKm * 1000)),
    exposure: "outdoor",
    classify: "true",
    full: "true",
  });
  const response = await fetchWeather(`https://api.opensensemap.org/boxes?${params}`, {}, { timeoutMs: 8_000, attempts: 2 });
  if (!response.ok) return [];
  const boxes = await response.json() as OpenSenseMapBox[];
  return boxes
    .map((box) => mapOpenSenseMapBox(box, lat, lon, radiusKm))
    .filter((candidate): candidate is OpenSenseMapCandidate => candidate !== null);
}
