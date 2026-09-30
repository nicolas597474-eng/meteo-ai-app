import { describe, expect, it } from "vitest";
import { getApparentAstronomyPosition, getEuropeanAqiDescriptor, getMinutesInTimeZone, getMoonIllumination, getMoonPhaseDescriptor, roundAltitudeDegrees } from "./environmentalData";

describe("environmentalData", () => {
  it("présente les seuils documentés de l’indice européen de qualité de l’air", () => {
    expect(getEuropeanAqiDescriptor(18).label).toBe("Bon");
    expect(getEuropeanAqiDescriptor(39).label).toBe("Acceptable");
    expect(getEuropeanAqiDescriptor(60).label).toBe("Moyen");
    expect(getEuropeanAqiDescriptor(80).label).toBe("Mauvais");
    expect(getEuropeanAqiDescriptor(100).label).toBe("Très mauvais");
  });

  it("dérive une phase et un éclairage de lune à partir de l’index quotidien réel", () => {
    expect(getMoonPhaseDescriptor(0.5).label).toBe("Pleine lune");
    expect(getMoonIllumination(0)).toBe(0);
    expect(getMoonIllumination(0.5)).toBe(100);
  });

  it("arrondit une altitude astronomique déjà exprimée en degrés sans inventer de valeur absente", () => {
    expect(roundAltitudeDegrees(42.34)).toBe(42.3);
    expect(roundAltitudeDegrees(-8.76)).toBe(-8.8);
    expect(roundAltitudeDegrees(null)).toBeNull();
  });

  it("calcule l’heure locale dans le fuseau fourni par la source géographique", () => {
    const instant = new Date("2026-08-17T12:30:00.000Z");
    expect(getMinutesInTimeZone("UTC", instant)).toBe(750);
    expect(getMinutesInTimeZone("Europe/Paris", instant)).toBe(870);
  });

  it("calcule les coordonnées horizontales apparentes au lieu et à l’instant demandés", () => {
    const paris = { lat: 48.8566, lon: 2.3522 };
    const day = getApparentAstronomyPosition(paris, new Date("2026-06-21T12:00:00.000Z"));
    const night = getApparentAstronomyPosition(paris, new Date("2026-06-21T00:00:00.000Z"));

    expect(day.sun.aboveHorizon).toBe(true);
    expect(day.sun.altitudeDeg).toBeGreaterThan(40);
    expect(day.sun.azimuthDeg).toBeGreaterThan(160);
    expect(day.sun.azimuthDeg).toBeLessThan(230);
    expect(night.sun.aboveHorizon).toBe(false);
    expect(night.sun.altitudeDeg).toBeLessThan(0);
    expect(day.moon.altitudeDeg).not.toBeNull();
    expect(day.moon.azimuthDeg).not.toBeNull();
    expect(day.moon.distanceKm).toBeGreaterThan(350_000);
    expect(day.moon.distanceKm).toBeLessThan(410_000);
    expect(day.moon.aboveHorizon).toBe(day.moon.altitudeDeg! > 0);
    expect(day.trajectory.sun).toHaveLength(49);
    expect(day.trajectory.moon).toHaveLength(49);
    expect(day.trajectory.sun.some((point) => point.aboveHorizon)).toBe(true);
    expect(day.trajectory.moon.every((point) => point.at.endsWith(".000Z"))).toBe(true);
  });

  it("calcule la phase lunaire et les événements depuis la géométrie Astronomy Engine", () => {
    const paris = { lat: 48.8566, lon: 2.3522 };
    const instant = new Date("2026-08-19T08:00:00.000Z");
    const position = getApparentAstronomyPosition(paris, instant);

    expect(position.lunar.angleDeg).toBeGreaterThan(0);
    expect(position.lunar.angleDeg).toBeLessThan(360);
    expect(position.lunar.illuminationPct).toBeGreaterThanOrEqual(0);
    expect(position.lunar.illuminationPct).toBeLessThanOrEqual(100);
    expect(position.lunar.label).not.toBe("Premier quartier");
    expect(position.events.sun.rise).toBeTruthy();
    expect(position.events.sun.culmination).toBeTruthy();
    expect(position.events.sun.set).toBeTruthy();
    expect(position.events.moon.culmination).toBeTruthy();
  });

  it("garde le nom, l’éclairage et l’orientation du rendu alignés sur la géométrie du 30 septembre 2026", () => {
    const position = getApparentAstronomyPosition(
      { lat: 50.89, lon: 2.56 },
      new Date("2026-09-30T04:06:28.000Z"),
    );

    expect(position.lunar.label).toBe("Gibbeuse décroissante");
    expect(position.lunar.illuminationPct).toBe(85);
    expect(position.lunar.waxing).toBe(false);
    expect(position.lunar.brightLimbAngleDeg).toBeCloseTo(41.3, 1);
  });

  it("respecte les variations de lieu, de saison et de latitude dans l’état d’horizon", () => {
    const equatorEquinox = getApparentAstronomyPosition({ lat: 0, lon: 0 }, new Date("2026-03-20T12:00:00.000Z"));
    const northPoleSummer = getApparentAstronomyPosition({ lat: 89, lon: 0 }, new Date("2026-06-21T12:00:00.000Z"));
    const northPoleWinter = getApparentAstronomyPosition({ lat: 89, lon: 0 }, new Date("2026-12-21T12:00:00.000Z"));

    expect(equatorEquinox.sun.aboveHorizon).toBe(true);
    expect(equatorEquinox.sun.altitudeDeg).toBeGreaterThan(80);
    expect(northPoleSummer.sun.aboveHorizon).toBe(true);
    expect(northPoleWinter.sun.aboveHorizon).toBe(false);
    expect(northPoleWinter.sun.altitudeDeg).toBeLessThan(0);
  });
});
