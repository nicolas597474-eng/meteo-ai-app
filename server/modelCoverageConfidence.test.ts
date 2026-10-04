import { describe, expect, it } from "vitest";
import { getModelCountCoverageLabel, getModelCountCoverageLevel } from "../shared/modelCoverageConfidence";

describe("model count coverage/confidence indicator", () => {
  it.each([
    { count: 0, level: "NONE", label: "indisponible" },
    { count: 1, level: "SINGLE_MODEL", label: "prévision d’un modèle unique" },
    { count: 2, level: "LIMITED", label: "confiance réduite" },
    { count: 3, level: "MODERATE", label: "confiance moyenne" },
    { count: 4, level: "MODERATE", label: "confiance moyenne" },
    { count: 5, level: "BROAD", label: "confiance élevée" },
    { count: 7, level: "BROAD", label: "confiance élevée" },
  ])("maps $count actual contributors to $level", ({ count, level, label }) => {
    const actualLevel = getModelCountCoverageLevel(count);
    expect(actualLevel).toBe(level);
    expect(getModelCountCoverageLabel(actualLevel)).toBe(label);
  });
});
