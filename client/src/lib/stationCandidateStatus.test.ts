import { describe, expect, it } from "vitest";
import { getStationDisplayStatus, getStationQualificationBadge } from "./stationCandidateStatus";

describe("statut d’affichage des sources de stations", () => {
  it("distingue un capteur candidat d’une source exclue", () => {
    expect(getStationDisplayStatus({ isActive: false, sourceKind: "reference", qualificationStatus: "candidate" })).toBe("candidate");
    expect(getStationDisplayStatus({ isActive: false, sourceKind: "reference", qualificationStatus: "excluded" })).toBe("excluded");
  });

  it("garde un capteur citoyen validé distinct d’une source exclue", () => {
    // Fixtures de test only : capteurs citoyens synthétiques.
    expect(getStationDisplayStatus({ isActive: false, source: "opensensemap", qualificationStatus: "validated" })).toBe("citizen-validated");
    expect(getStationDisplayStatus({ isActive: false, source: "cwop", qualificationStatus: "validated" })).toBe("citizen-validated");
    // Un statut « validated » hors sources citoyennes éligibles n’usurpe pas le badge citoyen.
    expect(getStationDisplayStatus({ isActive: false, source: "netatmo", qualificationStatus: "validated" })).toBe("excluded");
  });

  it("étiquette chaque station avec son badge de qualification réel, sans confusion de réseau", () => {
    expect(getStationQualificationBadge({ isActive: true, source: "meteofrance", sourceKind: "physical" })).toEqual({ kind: "official", label: "Station officielle" });
    expect(getStationQualificationBadge({ isActive: true, source: "netatmo", sourceKind: "physical" })).toEqual({ kind: "netatmo", label: "Station Netatmo" });
    expect(getStationQualificationBadge({ isActive: true, source: "openmeteo", sourceKind: "reference" })).toEqual({ kind: "reference", label: "Référence de modèle" });
    expect(getStationQualificationBadge({ isActive: false, source: "opensensemap", qualificationStatus: "candidate" })).toEqual({ kind: "citizen-candidate", label: "Capteur citoyen en validation" });
    expect(getStationQualificationBadge({ isActive: false, source: "cwop", qualificationStatus: "candidate" })).toEqual({ kind: "citizen-candidate", label: "Capteur citoyen en validation" });
    expect(getStationQualificationBadge({ isActive: false, source: "cwop", qualificationStatus: "validated" })).toEqual({ kind: "citizen-validated", label: "Capteur citoyen validé" });
    // Le motif d’exclusion persisté est repris tel quel, sans réécriture.
    expect(getStationQualificationBadge({
      isActive: false,
      source: "opensensemap",
      qualificationStatus: "excluded",
      exclusionReason: "Erreur trop grande : MAE 2.9 °C au-delà de la borne d'acceptation 1.5 °C, dérivée du désaccord officiel mesuré (0.5 °C).",
    })).toEqual({
      kind: "excluded",
      label: "Exclu",
      detail: "Erreur trop grande : MAE 2.9 °C au-delà de la borne d'acceptation 1.5 °C, dérivée du désaccord officiel mesuré (0.5 °C).",
    });
  });
});
