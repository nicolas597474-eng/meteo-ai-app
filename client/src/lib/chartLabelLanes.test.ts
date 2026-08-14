import { describe, expect, it } from "vitest";
import { getFeltLabelY, getLabelAboveCurveY, getLabelBelowCurveY } from "./chartLabelLanes";

describe("chartLabelLanes", () => {
  it("conserve les libellés de maximum sous la zone d’en-tête lors de températures extrêmes", () => {
    expect(getLabelAboveCurveY(86, 82)).toBe(98);
    expect(getLabelAboveCurveY(150, 82)).toBe(140);
  });

  it("réserve une marge avant le vent et une bande distincte pour le ressenti", () => {
    const minLabelY = getLabelBelowCurveY(219, 82, 230);
    const feltLabelY = getFeltLabelY(230);

    expect(minLabelY).toBeLessThanOrEqual(206);
    expect(feltLabelY).toBe(222);
    expect(feltLabelY - minLabelY).toBeGreaterThanOrEqual(16);
  });
});
