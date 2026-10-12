import { describe, expect, it } from "vitest";
import { mapOpenSenseMapBox, type OpenSenseMapBox } from "./openSenseMapService";
const box = (sensors: OpenSenseMapBox["sensors"]): OpenSenseMapBox => ({ _id: "synthetic-test", exposure: "outdoor", currentLocation: { coordinates: [2.52, 50.756] }, sensors });
const map = (sensors: OpenSenseMapBox["sensors"]) => mapOpenSenseMapBox(box(sensors), 50.7567, 2.5204, 5);
const date = "2026-10-12T07:00:00Z";

describe("openSenseMap measurement integrity", () => {
 it("does not turn empty or null measurements into zero", () => {
  expect(map([{ title: "Temperature", unit: "°C", lastMeasurement: { value: "" } }])).toBeNull();
  expect(map([{ title: "Temperature", unit: "°C", lastMeasurement: { value: null as any } }])).toBeNull();
 });
 it("retains a genuine zero and does not invent its measurement time", () => {
  expect(map([{ title: "Temperature", unit: "°C", lastMeasurement: { value: "0", createdAt: "bad-date" } }])).toMatchObject({ temperature: 0, measurementTimes: { temperature: null } });
 });
 it("keeps humidity-only candidates without inventing a temperature", () => {
  expect(map([{ title: "Humidity", unit: "%", lastMeasurement: { value: "55", createdAt: date } }])).toMatchObject({ temperature: null, humidity: 55, measurementTimes: { humidity: date, temperature: null } });
 });
 it("does not confuse wind direction or gust with speed; converts explicit m/s", () => {
  const result = map([
   { title: "Wind direction", unit: "°", lastMeasurement: { value: 270, createdAt: date } },
   { title: "Wind gust", unit: "m/s", lastMeasurement: { value: 10, createdAt: date } },
   { title: "Wind speed", unit: "m/s", lastMeasurement: { value: 5, createdAt: date } },
  ]);
  expect(result).toMatchObject({ windDirection: 270, windGust: 36, windSpeed: 18, temperature: null });
 });
 it("normalizes pressure Pa and temperature Fahrenheit, excludes rain rate", () => {
  const result = map([
   { title: "Pressure", unit: "Pa", lastMeasurement: { value: 101325, createdAt: date } },
   { title: "Temperature", unit: "°F", lastMeasurement: { value: 68, createdAt: date } },
   { title: "Rain intensity", unit: "mm/h", lastMeasurement: { value: 5, createdAt: date } },
  ]);
  expect(result).toMatchObject({ pressure: 1013.25, temperature: 20, precipitation: null });
 });
});
