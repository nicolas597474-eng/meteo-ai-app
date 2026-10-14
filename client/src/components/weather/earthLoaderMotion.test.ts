import { describe, expect, it } from "vitest";
import {
  EARTH_INITIAL_ROTATION,
  EARTH_ORBITS,
  EARTH_RADIUS,
  MAX_CANVAS_SIZE,
  MAX_FRAME_RATE,
  MAX_PIXEL_RATIO,
  getAnimationStep,
  getEarthLoaderRotation,
  getOrbitPoint,
} from "./earthLoaderMotion";

describe("Earth loader — rotation et orbites 3D", () => {
  it("fait tourner TOUTES les particules dans le sens inverse du globe", () => {
    const start = getEarthLoaderRotation(0);
    const end = getEarthLoaderRotation(12);
    expect(start.earth).toBe(EARTH_INITIAL_ROTATION);
    const globeDelta = end.earth - start.earth;
    expect(globeDelta).toBeGreaterThan(0);
    end.orbits.forEach((rotation, i) => {
      expect((rotation - start.orbits[i]) * globeDelta).toBeLessThan(0);
    });
    expect(end.clouds - start.clouds).toBeGreaterThan(0);
  });

  it("est indépendant de la cadence des frames", () => {
    expect(getEarthLoaderRotation(3 + 4)).toEqual(getEarthLoaderRotation(7));
    const half = getEarthLoaderRotation(5),
      full = getEarthLoaderRotation(10);
    expect(full.earth - EARTH_INITIAL_ROTATION).toBeCloseTo(
      2 * (half.earth - EARTH_INITIAL_ROTATION)
    );
  });

  it("place des orbites fermées hors de la surface avec une profondeur positive et négative", () => {
    EARTH_ORBITS.forEach(orbit => {
      expect(orbit.radius).toBeGreaterThan(EARTH_RADIUS);
      for (let i = 0; i < 100; i++) {
        const point = getOrbitPoint((i / 100) * Math.PI * 2, orbit.radius);
        expect(Math.hypot(...point)).toBeCloseTo(orbit.radius);
      }
      expect(getOrbitPoint(Math.PI / 2, orbit.radius)[2]).toBeGreaterThan(0);
      expect(getOrbitPoint((3 * Math.PI) / 2, orbit.radius)[2]).toBeLessThan(0);
      expect(getOrbitPoint(0, orbit.radius)[0]).toBeCloseTo(
        getOrbitPoint(Math.PI * 2, orbit.radius)[0]
      );
    });
  });

  it("reprend sans saut après une pause et borne un retard de frame", () => {
    expect(getAnimationStep(null, 100000)).toBe(0);
    expect(getAnimationStep(1000, 1040)).toBeCloseTo(0.04);
    expect(getAnimationStep(1000, 100000)).toBe(0.1);
    expect(getAnimationStep(1000, 999)).toBe(0);
    expect(getEarthLoaderRotation(-3)).toEqual(getEarthLoaderRotation(0));
    expect(getEarthLoaderRotation(NaN)).toEqual(getEarthLoaderRotation(0));
  });

  it("borne le travail GPU sur les appareils mobiles", () => {
    expect(MAX_FRAME_RATE).toBeLessThanOrEqual(30);
    expect(MAX_PIXEL_RATIO).toBeLessThanOrEqual(1.5);
    expect(MAX_CANVAS_SIZE).toBeLessThanOrEqual(900);
  });
});
