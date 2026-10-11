import { describe, expect, it } from "vitest";
import { mapOpenSenseMapBox } from "./openSenseMapService";

describe("openSenseMap candidate mapping", () => {
  it("mappe un capteur extérieur identifié sans lui attribuer une provenance officielle", () => {
    const candidate = mapOpenSenseMapBox({
      _id: "box-42",
      name: "Jardin test",
      exposure: "outdoor",
      currentLocation: { coordinates: [2.52, 50.756, 25] },
      sensors: [{ title: "Temperature", unit: "°C", lastMeasurement: { value: 18.4, createdAt: "2026-08-12T12:00:00.000Z" } }],
    }, 50.7567, 2.5204, 5);

    expect(candidate).toMatchObject({ providerStationId: "box-42", temperature: 18.4, name: "Jardin test" });
  });

  it("écarte les capteurs intérieurs, hors rayon ou sans mesure météo", () => {
    expect(mapOpenSenseMapBox({ _id: "in", exposure: "indoor", currentLocation: { coordinates: [2.52, 50.756] } }, 50.7567, 2.5204, 5)).toBeNull();
    expect(mapOpenSenseMapBox({ _id: "empty", exposure: "outdoor", currentLocation: { coordinates: [2.52, 50.756] }, sensors: [] }, 50.7567, 2.5204, 5)).toBeNull();
  });

  it("conserve l'heure de mesure propre à chaque variable sans la déduire d'une autre", () => {
    const candidate = mapOpenSenseMapBox({
      _id: "box-times",
      exposure: "outdoor",
      currentLocation: { coordinates: [2.52, 50.756] },
      sensors: [
        { title: "Temperature", unit: "°C", lastMeasurement: { value: 18.1, createdAt: "2026-08-12T12:04:00.000Z" } },
        { title: "humidity", unit: "%", lastMeasurement: { value: 55, createdAt: "2026-08-12T12:10:00.000Z" } },
      ],
    }, 50.7567, 2.5204, 5);

    expect(candidate?.measurementTimes).toEqual({
      temperature: "2026-08-12T12:04:00.000Z",
      humidity: "2026-08-12T12:10:00.000Z",
      pressure: null,
      windSpeed: null,
      windGust: null,
      windDirection: null,
      precipitation: null,
    });
    expect(candidate?.updatedAt).toBe("2026-08-12T12:10:00.000Z");
  });
});
