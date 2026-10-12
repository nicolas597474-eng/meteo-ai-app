import { fetchWeather } from "./weatherFetch";
import { StationSourceCollectionError } from "./stationSourceDiagnostics";

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
  /** Horodatage de mesure fourni par capteur pour chaque variable ; jamais déduit. */
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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type MeasurementKind = "temperature" | "pressure" | "wind" | "other";

function toMetric(value: number, unit: string | undefined, kind: MeasurementKind): number {
  const normalized = (unit ?? "").trim().toLowerCase().replace(/\s/g, "");
  if (kind === "wind" && ["m/s", "ms-1", "m·s⁻¹"].includes(normalized)) return value * 3.6;
  if (kind === "wind" && ["mph", "mi/h"].includes(normalized)) return value * 1.609344;
  if (kind === "wind" && ["kn", "kt", "knots"].includes(normalized)) return value * 1.852;
  if (kind === "pressure" && normalized === "pa") return value / 100;
  if (kind === "pressure" && normalized === "kpa") return value * 10;
  if (kind === "temperature" && ["°f", "fahrenheit"].includes(normalized)) return (value - 32) * 5 / 9;
  return value;
}

function latestValue(sensors: OpenSenseMapSensor[], matcher: RegExp, exclude?: RegExp, kind: MeasurementKind = "other") {
  const matches = sensors
    .filter((sensor) => matcher.test(`${sensor.title ?? ""} ${sensor.unit ?? ""}`.toLowerCase()))
    .filter((sensor) => !exclude?.test(`${sensor.title ?? ""} ${sensor.unit ?? ""}`.toLowerCase()))
    .filter((sensor) => sensor.lastMeasurement?.value != null && String(sensor.lastMeasurement.value).trim() !== "")
    .map((sensor) => {
      const rawDate = sensor.lastMeasurement?.createdAt;
      return {
        value: toMetric(Number(sensor.lastMeasurement?.value), sensor.unit, kind),
        createdAt: rawDate && Number.isFinite(Date.parse(rawDate)) ? rawDate : null,
      };
    })
    .filter((reading) => Number.isFinite(reading.value));
  if (matches.length === 0) return { value: null, createdAt: null };
  return matches.sort((a, b) => (b.createdAt ? Date.parse(b.createdAt) : -Infinity) - (a.createdAt ? Date.parse(a.createdAt) : -Infinity))[0];
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
  const temperature = latestValue(sensors, /temp(?:eratur|erature)?|°c|°f|celsius/, undefined, "temperature");
  const humidity = latestValue(sensors, /humidity|humidit|feuchte|relativ/);
  const pressure = latestValue(sensors, /pressure|press|luftdruck/, undefined, "pressure");
  const windSpeed = latestValue(sensors, /wind(?: speed|speed|geschwindigkeit)?/, /direction|richtung|gust|rafale|b[oö]e/, "wind");
  const windGust = latestValue(sensors, /gust|rafale|b[oö]e/, undefined, "wind");
  const windDirection = latestValue(sensors, /wind.*(?:direction|richtung)|direction.*wind/);
  const precipitation = latestValue(sensors, /precip|rain|pluie|niederschlag/, /rate|intensity|intensit|mm\/h|mm\/hr/);
  const dates = [temperature, humidity, pressure, windSpeed, windGust, windDirection, precipitation]
    .map((measurement) => measurement.createdAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a));

  if ([temperature, humidity, pressure, windSpeed, windGust, windDirection, precipitation].every((reading) => reading.value == null)) return null;
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
    measurementTimes: {
      temperature: temperature.createdAt,
      humidity: humidity.createdAt,
      pressure: pressure.createdAt,
      windSpeed: windSpeed.createdAt,
      windGust: windGust.createdAt,
      windDirection: windDirection.createdAt,
      precipitation: precipitation.createdAt,
    },
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
  if (!response.ok) throw new StationSourceCollectionError("provider_http_error");
  const responseData = await response.json() as unknown;
  if (!Array.isArray(responseData) || responseData.some((box: unknown) => !box || typeof box !== "object" || Array.isArray(box))) {
    throw new StationSourceCollectionError("invalid_response");
  }
  const boxes = responseData as OpenSenseMapBox[];
  return boxes
    .map((box) => mapOpenSenseMapBox(box, lat, lon, radiusKm))
    .filter((candidate): candidate is OpenSenseMapCandidate => candidate !== null);
}
