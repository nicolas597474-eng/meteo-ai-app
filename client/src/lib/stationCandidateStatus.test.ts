import { describe, expect, it } from "vitest";
import { getStationDisplayStatus } from "./stationCandidateStatus";

describe("statut d’affichage des sources de stations", () => {
  it("distingue un capteur candidat d’une source exclue", () => {
    expect(getStationDisplayStatus({ isActive: false, sourceKind: "reference", qualificationStatus: "candidate" })).toBe("candidate");
    expect(getStationDisplayStatus({ isActive: false, sourceKind: "reference", qualificationStatus: "excluded" })).toBe("excluded");
  });
});
