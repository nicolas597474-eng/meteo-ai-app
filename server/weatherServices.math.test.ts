import { describe, expect, it } from "vitest";
import { circularMeanDegrees } from "./weatherServices";

describe("circularMeanDegrees", () => {
  it("préserve la proximité de directions autour du nord", () => {
    expect(circularMeanDegrees([350, 10])).toBe(0);
  });

  it("ignore les directions non finies et retourne null sans donnée exploitable", () => {
    expect(circularMeanDegrees([90, Number.NaN, Number.POSITIVE_INFINITY])).toBe(90);
    expect(circularMeanDegrees([Number.NaN])).toBeNull();
  });
});
