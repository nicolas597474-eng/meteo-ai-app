import { describe, expect, it } from "vitest";
import { meanAbsoluteDeltaC } from "./ReliabilityEvidenceSections";

describe("meanAbsoluteDeltaC", () => {
  it("calcule seulement les paires de températures réellement disponibles", () => {
    expect(meanAbsoluteDeltaC([
      { stationTemperature: 12, officialTemperature: 10 },
      { stationTemperature: null, officialTemperature: 7 },
      { stationTemperature: 5, officialTemperature: null },
      { stationTemperature: 6, officialTemperature: 9 },
    ])).toBe(2.5);
  });

  it("retourne indisponible lorsqu’aucune paire exploitable n’existe", () => {
    expect(meanAbsoluteDeltaC([
      { stationTemperature: null, officialTemperature: 8 },
      { stationTemperature: 7, officialTemperature: null },
      { stationTemperature: Number.NaN, officialTemperature: 4 },
    ])).toBeNull();
  });
});
