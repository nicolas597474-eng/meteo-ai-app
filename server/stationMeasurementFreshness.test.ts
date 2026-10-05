import { describe, expect, it } from "vitest";
import {
  getStationMeasurementAgeState,
  getValidStationMeasurementTimestamp,
  hasFreshStationMeasurement,
} from "./stationMeasurementFreshness";

const now = Date.parse("2026-10-05T10:00:00.000Z");

describe("station measurement freshness", () => {
  it("uses only the timestamp belonging to the measured field", () => {
    const measurementTimes = {
      temperature: "2026-10-05T08:00:00.000Z",
      humidity: "2026-10-05T09:55:00.000Z",
    };

    expect(hasFreshStationMeasurement(measurementTimes, "temperature", 60, now)).toBe(false);
    expect(hasFreshStationMeasurement(measurementTimes, "humidity", 10, now)).toBe(true);
    expect(getStationMeasurementAgeState(measurementTimes, "humidity", now)).toEqual({
      observedAt: "2026-10-05T09:55:00.000Z",
      ageMinutes: 5,
      status: "known",
    });
  });

  it("reports missing, invalid and future timestamps as unknown", () => {
    expect(getStationMeasurementAgeState({}, "temperature", now)).toEqual({
      observedAt: null,
      ageMinutes: null,
      status: "unknown",
    });
    expect(getStationMeasurementAgeState({ temperature: "not-a-date" }, "temperature", now)).toEqual({
      observedAt: "not-a-date",
      ageMinutes: null,
      status: "unknown",
    });
    expect(getStationMeasurementAgeState({ temperature: "2026-10-05T10:00:01.000Z" }, "temperature", now)).toEqual({
      observedAt: "2026-10-05T10:00:01.000Z",
      ageMinutes: null,
      status: "unknown",
    });
    expect(getValidStationMeasurementTimestamp({ temperature: "not-a-date" }, "temperature", now)).toBeNull();
    expect(hasFreshStationMeasurement({ temperature: "not-a-date" }, "temperature", 60, now)).toBe(false);
  });

  it("keeps an observation at the established cutoff and excludes one just beyond it", () => {
    const atCutoff = new Date(now - 30 * 60_000).toISOString();
    const beyondCutoff = new Date(now - 30 * 60_000 - 1).toISOString();
    expect(hasFreshStationMeasurement({ temperature: atCutoff }, "temperature", 30, now)).toBe(true);
    expect(hasFreshStationMeasurement({ temperature: beyondCutoff }, "temperature", 30, now)).toBe(false);
  });
});
