import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ReliabilityLaboratory.tsx", import.meta.url), "utf8");

describe("ReliabilityLaboratory", () => {
  it("ouvre la période de fiabilité sur 7 jours", () => {
    expect(source).toContain('useState<PeriodId>("7d")');
  });

  it("privilégie une synthèse courte et des modèles effectivement classables", () => {
    expect(source).toContain("Fiabilité en bref");
    expect(source).toContain("Classement en préparation");
    expect(source).toContain("Modèles classables");
    expect(source).toContain("slice(0, 3)");
  });

  it("retire les cartes de métriques secondaires du résumé mobile", () => {
    expect(source).not.toContain("RMSE");
    expect(source).not.toContain("MiniBar label=\"Précipitations\"");
    expect(source).not.toContain("SectionHeading title=\"Évolution des scores\"");
  });

  it("affiche les tendances mesurées sans les présenter comme un classement validé", () => {
    expect(source).toContain("Tendances provisoires");
    expect(source).toContain("Couverture provisoire des preuves");
    expect(source).not.toContain("Notes par modèle");
    expect(source).not.toContain("Note {evidenceScore}/100");
    expect(source).not.toContain("Note de preuve de ${model.name}: ${evidenceScore}/100");
    expect(source).toContain("Température");
    expect(source).toContain("Pluie");
    expect(source).toContain("Vent");
    expect(source).toContain("Humidité");
    expect(source).toContain("Scores globaux par modèle");
    expect(source).toContain("GLOBAL_SCORE_MODEL_PALETTES");
    expect(source).toContain("palette.bar");
    expect(source).toContain("formatFrenchDayMonth");
    expect(source).toContain("normalizedScore");
    expect(source).toContain("averageScore");
    expect(source).toContain("right.averageScore - left.averageScore");
    expect(source).toContain("Meilleur modèle");
    expect(source.indexOf('id="scores-globaux"')).toBeLessThan(source.indexOf('id="tendances-provisoires"'));
    expect(source.indexOf('id="tendances-provisoires"')).toBeLessThan(source.indexOf('id="vue-generale"'));
    expect(source).toContain("Scores globaux indisponibles");
    expect(source).toContain("ProvisionalTrendCard");
  });

  it("utilise des accents bleu-vert pour les états de préparation et provisoires", () => {
    expect(source).toContain("border-sky-500/30");
    expect(source).not.toContain("border-sky-400/35");
    expect(source).not.toContain("amber-500");
  });
});
