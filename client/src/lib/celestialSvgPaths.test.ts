import { describe, expect, it } from "vitest";
import {
  buildTerrainPath,
  buildTrajectoryPath,
  projectApparentBodyOnArc,
} from "./celestialSvgPaths";

describe("celestial SVG paths", () => {
  it("projects finite above-horizon positions and rejects invalid coordinates", () => {
    expect(
      projectApparentBodyOnArc({
        aboveHorizon: true,
        altitudeDeg: 30,
        azimuthDeg: 90,
      })
    ).toEqual({
      left: 8,
      bottom: 78,
    });
    expect(
      projectApparentBodyOnArc({
        aboveHorizon: true,
        altitudeDeg: Number.NaN,
        azimuthDeg: 90,
      })
    ).toBeNull();
    expect(
      projectApparentBodyOnArc({
        aboveHorizon: true,
        altitudeDeg: 30,
        azimuthDeg: Number.POSITIVE_INFINITY,
      })
    ).toBeNull();
    expect(
      projectApparentBodyOnArc({
        aboveHorizon: false,
        altitudeDeg: 30,
        azimuthDeg: 90,
      })
    ).toBeNull();
  });

  it("breaks the trajectory around invalid and below-horizon points", () => {
    const path = buildTrajectoryPath([
      {
        at: "2026-09-29T08:00:00Z",
        aboveHorizon: true,
        altitudeDeg: 30,
        azimuthDeg: 90,
      },
      {
        at: "2026-09-29T09:00:00Z",
        aboveHorizon: true,
        altitudeDeg: Number.NaN,
        azimuthDeg: 100,
      },
      {
        at: "2026-09-29T10:00:00Z",
        aboveHorizon: true,
        altitudeDeg: 45,
        azimuthDeg: 180,
      },
    ]);

    expect(path).toBe("M8.00 82.00 M50.00 56.32");
    expect(path).not.toMatch(/NaN|Infinity/);
  });

  it("skips malformed terrain samples and returns no path when none are usable", () => {
    const path = buildTerrainPath([
      { azimuthDeg: 0, elevationDeg: 10 },
      { azimuthDeg: Number.NaN, elevationDeg: 15 },
      { azimuthDeg: 90, elevationDeg: Number.POSITIVE_INFINITY },
      { azimuthDeg: 180, elevationDeg: 20 },
    ]);

    expect(path).toMatch(/^M50\.00 /);
    expect(path).toContain(" L50.00 ");
    expect(path).toMatch(/ L100 158 L0 158 Z$/);
    expect(path).not.toMatch(/NaN|Infinity/);
    expect(
      buildTerrainPath([{ azimuthDeg: Number.NaN, elevationDeg: 10 }])
    ).toBe("");
  });
});
