import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ReliabilityLaboratory.tsx", import.meta.url), "utf8");

describe("ReliabilityLaboratory", () => {
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
    expect(source).toContain("Note de preuve provisoire");
    expect(source).toContain("Note {evidenceScore}/100");
    expect(source).toContain("preuve {Number(model.confidence?.evidenceScore ?? 0)}/100");
    expect(source).toContain("Température");
    expect(source).toContain("Pluie");
    expect(source).toContain("Vent");
    expect(source).toContain("ProvisionalTrendCard");
  });

  it("utilise des accents bleu-vert pour les états de préparation et provisoires", () => {
    expect(source).toContain("border-sky-500/30");
    expect(source).toContain("border-sky-400/35");
    expect(source).not.toContain("amber-500");
  });
});
