import { describe, expect, it } from "vitest";
import { getHourScrollLeft, getNearestHourIndex } from "./hourlyScrollSync";

describe("synchronisation horaire courbe et cartes", () => {
  it("résout la même heure depuis un défilement de courbe ou de cartes", () => {
    expect(getNearestHourIndex(204, 68, 24)).toBe(3);
    expect(getNearestHourIndex(558, 186, 24)).toBe(3);
  });

  it("cale chaque vue sur la position exacte de l’heure sélectionnée", () => {
    expect(getHourScrollLeft(12, 68, 24)).toBe(816);
    expect(getHourScrollLeft(12, 186, 24)).toBe(2232);
  });

  it("respecte les limites de la première et dernière heure", () => {
    expect(getNearestHourIndex(-20, 68, 5)).toBe(0);
    expect(getNearestHourIndex(9999, 68, 5)).toBe(4);
  });
});
