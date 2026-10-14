/** Decorative animation only: never coupled to the weather loading state. */
export const EARTH_RADIUS = 1.3;
export const EARTH_INITIAL_ROTATION = -Math.PI / 2 - 0.24;
export const EARTH_RADIANS_PER_SECOND = 0.065;
export const ORBIT_RADIANS_PER_SECOND = -0.24;
export const MAX_FRAME_RATE = 30;
export const MAX_PIXEL_RATIO = 1.5;
export const MAX_CANVAS_SIZE = 900;
export const SCENE_START_DELAY_MS = 350;

export const EARTH_ORBITS = [
  { radius: 1.66, inclination: 0.24, tilt: -0.2, speed: 1, phase: 0.5 },
  { radius: 1.91, inclination: -0.28, tilt: 0.18, speed: 0.78, phase: 2.4 },
  { radius: 1.48, inclination: 0.56, tilt: -0.12, speed: 1.16, phase: 4.1 },
] as const;

/** Same signed axis convention for the globe and each orbital plane. */
export function getEarthLoaderRotation(elapsedSeconds: number) {
  const seconds = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0;
  return {
    earth: EARTH_INITIAL_ROTATION + seconds * EARTH_RADIANS_PER_SECOND,
    clouds:
      EARTH_INITIAL_ROTATION + seconds * (EARTH_RADIANS_PER_SECOND + 0.006),
    orbits: EARTH_ORBITS.map(
      orbit => orbit.phase + seconds * ORBIT_RADIANS_PER_SECOND * orbit.speed
    ),
  };
}

/** A real circular orbit in the XZ plane, not a screen-space CSS rotation. */
export function getOrbitPoint(angle: number, radius: number) {
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius] as const;
}

/** A bounded clock prevents a jump after a tab has been hidden. */
export function getAnimationStep(previousMs: number | null, nowMs: number) {
  if (previousMs === null) return 0;
  return Math.min(Math.max((nowMs - previousMs) / 1000, 0), 0.1);
}
