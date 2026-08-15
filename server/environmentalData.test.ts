import { describe, expect, it } from "vitest";
import { getEuropeanAqiDescriptor, getMoonIllumination, getMoonPhaseDescriptor } from "./environmentalData";

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
});
