import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ReliabilityLaboratory.tsx", import.meta.url), "utf8");

describe("ReliabilityLaboratory — preuves brutes", () => {
  it("sélectionne une fenêtre et un horizon exacts sans repli vers une autre échéance", () => {
    expect(source).toContain('useState<PeriodId>("30d")');
    expect(source).toContain('useState<HorizonId>("6-24h")');
    expect(source).toContain("Aucune échéance voisine ni période extérieure n’est utilisée en repli.");
  });

  it("sépare les métriques historiques par modèle, variable et horizon sans score global", () => {
    expect(source).toContain("Fiabilité historique, sans note globale");
    expect(source).toContain("MAE, RMSE, biais, effectifs, dates et évolution par modèle × variable × horizon exact");
    expect(source).toContain("Le biais signé est descriptif et n’est jamais appliqué aux prévisions officielles futures.");
    expect(source).toContain("Fiabilité historique · modèle × variable × horizon");
    expect(source).toContain("row.modelId");
    expect(source).toContain("row.variableLabel");
    expect(source).toContain("row.horizonId");
    expect(source).not.toContain("normalizedScore");
    expect(source).not.toContain("averageScore");
    expect(source).not.toContain("Meilleur modèle");
    expect(source).not.toContain("/100");
  });

  it("montre des statuts explicites et ne transforme pas les valeurs indisponibles en zéro", () => {
    expect(source).toContain("Seuil d’évidence atteint");
    expect(source).toContain("Données insuffisantes");
    expect(source).toContain("Horizon non archivé séparément");
    expect(source).toContain("Historique indisponible");
    expect(source).toContain("Historique non versionné · exclu");
    expect(source).toContain("Une cellule « — » signifie non disponible, pas zéro.");
    expect(source).toContain("Aucune métrique n’est estimée");
    expect(source).toContain("score(s) historique(s) sans version ignoré(s)");
  });

  it("conserve la porte d’évidence, les effectifs distincts et les dates des scores", () => {
    expect(source).toContain("minimumComparisons");
    expect(source).toContain("minimumComparableDays");
    expect(source).toContain("comparisonCount");
    expect(source).toContain("evaluatedDays");
    expect(source).toContain("firstScoreDate");
    expect(source).toContain("latestScoreDate");
    expect(source).toContain("latestComputedAt");
    expect(source).toContain("Fenêtre");
  });

  it("exclut Best Match et distingue la dispersion de l’erreur face aux observations", () => {
    expect(source).toContain("Best Match/agrégateurs, modèles candidats et autres horizons ne sont jamais utilisés comme substituts.");
    expect(source).toContain("L’accord inter-modèles décrit une dispersion de prévisions et n’est pas une mesure de fiabilité.");
    expect(source).toContain("L’accord inter-modèles");
  });
});
