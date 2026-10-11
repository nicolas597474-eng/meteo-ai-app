import { describe, expect, it } from "vitest";
import {
  getStationDisplayStatus,
  getStationQualificationBadge,
  isCitizenQualificationSource,
  isQualifiedCitizenStation,
  isUnqualifiedCitizenStation,
} from "./stationCandidateStatus";

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

describe("population retirée par le filtre de la carte", () => {
  it("ne reconnaît comme citoyennes que les sources éligibles", () => {
    expect(isCitizenQualificationSource("opensensemap")).toBe(true);
    expect(isCitizenQualificationSource("cwop")).toBe(true);
    expect(isCitizenQualificationSource("netatmo")).toBe(false);
    expect(isCitizenQualificationSource("meteofrance")).toBe(false);
    expect(isCitizenQualificationSource(null)).toBe(false);
    expect(isCitizenQualificationSource(undefined)).toBe(false);
  });

  it("retire les capteurs citoyens en validation et exclus", () => {
    expect(isUnqualifiedCitizenStation({ isActive: false, source: "opensensemap", qualificationStatus: "candidate" })).toBe(true);
    expect(isUnqualifiedCitizenStation({ isActive: false, source: "cwop", qualificationStatus: "candidate" })).toBe(true);
    expect(isUnqualifiedCitizenStation({ isActive: false, source: "opensensemap", qualificationStatus: "excluded" })).toBe(true);
  });

  it("laisse passer les capteurs citoyens qualifiés", () => {
    expect(isUnqualifiedCitizenStation({ isActive: false, source: "opensensemap", qualificationStatus: "validated" })).toBe(false);
    expect(isUnqualifiedCitizenStation({ isActive: true, source: "cwop", qualificationStatus: "validated" })).toBe(false);
  });

  it("ne retire jamais l'étalon officiel ni une source non citoyenne", () => {
    // Les stations officielles définissent la qualification : les masquer
    // retirerait l'étalon qui donne son sens au mot « qualifié ».
    expect(isUnqualifiedCitizenStation({ isActive: true, source: "meteofrance", sourceKind: "physical" })).toBe(false);
    // Une source écartée pour une autre raison n'est pas concernée par ce filtre.
    expect(isUnqualifiedCitizenStation({ isActive: false, source: "netatmo", sourceKind: "physical" })).toBe(false);
    expect(isUnqualifiedCitizenStation({ isActive: true, source: "openmeteo", sourceKind: "reference" })).toBe(false);
  });

  it("un statut d'activité inconnu n'écarte pas un capteur qualifié", () => {
    // Le verdict citoyen ne dépend pas de l'activité : sans information, le
    // capteur qualifié reste affiché.
    expect(isQualifiedCitizenStation({ source: "opensensemap", qualificationStatus: "validated" })).toBe(true);
    expect(isUnqualifiedCitizenStation({ source: "opensensemap", qualificationStatus: "validated" })).toBe(false);
  });
});

describe("comptage des sources écartées (convergence du Classement)", () => {
  /**
   * Changement de comportement assumé par la convergence sur le helper.
   *
   * `qualificationStatus` vaut « validated » par défaut au schéma, pour toutes
   * les sources. L'ancien filtre du Classement portait un garde
   * `!== "validated"` trop large : une station NON citoyenne inactive n'était
   * comptée ni dans « Candidates » ni dans « Écartées ». Elle disparaissait de
   * tous les compteurs — précisément ce que ce dépôt s'interdit.
   *
   * Le helper applique l'intention réellement visée par le commentaire
   * d'origine (« un capteur citoyen validé n'est pas écarté ») : seul un
   * citoyen validé y échappe. Ces stations redeviennent donc visibles.
   */
  it("compte une station non citoyenne inactive comme écartée", () => {
    const inactiveOfficial = { isActive: false, source: "meteofrance", sourceKind: "physical" as const, qualificationStatus: "validated" as const };
    expect(getStationDisplayStatus(inactiveOfficial)).toBe("excluded");
  });

  it("n'écarte jamais un capteur citoyen validé, même inactif dans la fusion", () => {
    const inactiveValidatedCitizen = { isActive: false, source: "opensensemap", qualificationStatus: "validated" as const };
    expect(getStationDisplayStatus(inactiveValidatedCitizen)).toBe("citizen-validated");
    expect(getStationDisplayStatus(inactiveValidatedCitizen)).not.toBe("excluded");
  });

  it("laisse une station active hors des deux populations", () => {
    // Une station officielle active est utilisée : ni candidate, ni écartée.
    const activeOfficial = { isActive: true, source: "meteofrance", sourceKind: "physical" as const, qualificationStatus: "validated" as const };
    expect(getStationDisplayStatus(activeOfficial)).toBe("physical");
    expect(getStationDisplayStatus(activeOfficial)).not.toBe("excluded");
  });
});
