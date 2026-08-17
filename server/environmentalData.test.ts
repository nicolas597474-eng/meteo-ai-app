import { describe, expect, it } from "vitest";
import { getEuropeanAqiDescriptor, getMinutesInTimeZone, getMoonIllumination, getMoonPhaseDescriptor, roundAltitudeDegrees } from "./environmentalData";

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
});
