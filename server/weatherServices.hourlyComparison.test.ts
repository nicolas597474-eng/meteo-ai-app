import { describe, expect, it } from "vitest";
import { buildHourlyTemperatureComparison } from "./weatherServices";

describe("buildHourlyTemperatureComparison", () => {
  it("identifie les deux contributeurs min et max de l’écart", () => {
    expect(buildHourlyTemperatureComparison(17.8, 20.8)).toMatchObject({
      lower: { name: "Open-Meteo Best Match", temperature: 17.8 },
      higher: { name: "AROME", temperature: 20.8 },
    });
  });

  it("n’invente pas de comparaison lorsqu’un contributeur manque", () => {
    expect(buildHourlyTemperatureComparison(17.8, null)).toBeNull();
  });
});
