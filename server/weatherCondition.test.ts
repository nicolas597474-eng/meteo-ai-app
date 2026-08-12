import { describe, expect, it } from "vitest";
import { findNextConditionChange } from "../client/src/lib/weatherCondition";

describe("findNextConditionChange", () => {
  it("retourne le premier créneau de condition différente", () => {
    const result = findNextConditionChange([
      { hour: "08:00", condition: "Ensoleillé" },
      { hour: "09:00", condition: "Ensoleillé" },
      { hour: "10:00", condition: "Partiellement nuageux" },
    ], "08:00");

    expect(result).toEqual({ hour: "10:00", condition: "Partiellement nuageux" });
  });

  it("retourne null si aucun changement n’est prévu", () => {
    expect(findNextConditionChange([
      { hour: "08:00", condition: "Ensoleillé" },
      { hour: "09:00", condition: "Ensoleillé" },
    ], "08:00")).toBeNull();
  });

  it("cherche le premier créneau futur lorsque l’heure courante manque", () => {
    const result = findNextConditionChange([
      { hour: "09:00", condition: "Nuageux" },
      { hour: "10:00", condition: "Pluie" },
    ], "08:00");

    expect(result?.hour).toBe("10:00");
  });
});
