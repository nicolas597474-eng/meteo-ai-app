import { describe, expect, it } from "vitest";
import { compareTraceWeights } from "./weightComparison";

describe("compareTraceWeights", () => {
  it("calcule les variations positives, négatives et les sources ajoutées ou retirées", () => {
    const before = {
      parameterSources: {
        temperature: [
          { id: "a", name: "AROME", finalWeight: 0.7 },
          { id: "b", name: "ECMWF", finalWeight: 0.3 },
        ],
        precipitation: [{ id: "b", name: "ECMWF", finalWeight: 1 }],
        wind: [{ id: "a", name: "AROME", finalWeight: 1 }],
      },
    };
    const after = {
      parameterSources: {
        temperature: [
          { id: "a", name: "AROME", finalWeight: 0.5 },
          { id: "c", name: "ICON", finalWeight: 0.5 },
        ],
        precipitation: [{ id: "b", name: "ECMWF", finalWeight: 0.8 }, { id: "c", name: "ICON", finalWeight: 0.2 }],
        wind: [{ id: "a", name: "AROME", finalWeight: 1 }],
      },
    };

    const comparison = compareTraceWeights(before, after);
    const temperature = comparison.find((entry) => entry.parameter === "temperature")!;
    const arome = temperature.sourceChanges.find((source) => source.name === "AROME")!;
    const ecmwf = temperature.sourceChanges.find((source) => source.name === "ECMWF")!;
    const icon = temperature.sourceChanges.find((source) => source.name === "ICON")!;

    expect(arome.delta).toBeCloseTo(-0.2);
    expect(ecmwf.status).toBe("removed");
    expect(icon.status).toBe("added");
    expect(icon.delta).toBeCloseTo(0.5);
  });
});
