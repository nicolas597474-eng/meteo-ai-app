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
    expect(source).toContain("Statut provisoire");
    expect(source).toContain("Température");
    expect(source).toContain("Pluie");
    expect(source).toContain("Vent");
    expect(source).toContain("ProvisionalTrendCard");
  });
});
