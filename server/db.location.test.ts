import { describe, expect, it } from "vitest";
import { REFERENCE_COORDINATE_TOLERANCE, referenceCoordinateBounds } from "./db";

describe("coordonnées de référence des stations", () => {
  it("conserve une tolérance faible autour du lieu demandé pour absorber les arrondis SQL", () => {
    const bounds = referenceCoordinateBounds(50.67601);
    expect(bounds).toEqual({
      min: 50.67601 - REFERENCE_COORDINATE_TOLERANCE,
      max: 50.67601 + REFERENCE_COORDINATE_TOLERANCE,
    });
    expect(bounds.min).toBeLessThan(50.67601);
    expect(bounds.max).toBeGreaterThan(50.67601);
  });
});
