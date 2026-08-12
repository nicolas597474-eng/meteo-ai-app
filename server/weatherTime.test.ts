import { describe, expect, it } from "vitest";
import { getParisDate, getParisHour } from "./weatherTime";

describe("weatherTime — conventions Europe/Paris", () => {
  it("conserve la date métier parisienne au passage de minuit UTC", () => {
    const instant = new Date("2026-01-01T23:30:00.000Z");
    expect(getParisDate(instant)).toBe("2026-01-02");
    expect(getParisHour(instant)).toBe(0);
  });

  it("respecte l'heure d'été française", () => {
    const instant = new Date("2026-07-01T22:15:00.000Z");
    expect(getParisDate(instant)).toBe("2026-07-02");
    expect(getParisHour(instant)).toBe(0);
  });
});
