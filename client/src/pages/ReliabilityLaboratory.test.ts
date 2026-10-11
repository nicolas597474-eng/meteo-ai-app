import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = [
  readFileSync(new URL("./ReliabilityLaboratory.tsx", import.meta.url), "utf8"),
  readFileSync(
    new URL(
      "../components/weather/ReliabilityEvidenceSections.tsx",
      import.meta.url
    ),
    "utf8"
  ),
  readFileSync(
    new URL(
      "../components/weather/ReliabilityComparisonSections.tsx",
      import.meta.url
    ),
    "utf8"
  ),
  readFileSync(
    new URL(
      "../components/weather/StationQualificationSection.tsx",
      import.meta.url
    ),
    "utf8"
  ),
  readFileSync(
    new URL(
      "../components/weather/CitizenFusionImpactSection.tsx",
      import.meta.url
    ),
    "utf8"
  ),
  // Les libellés des badges de qualification vivent dans la lib partagée.
  readFileSync(
    new URL("../lib/stationCandidateStatus.ts", import.meta.url),
    "utf8"
  ),
]
  .join("\n")
  .replace(/\s+/g, " ");

describe("ReliabilityLaboratory — preuves brutes", () => {
  it("sélectionne une fenêtre et un horizon exacts sans repli vers une autre échéance", () => {
    expect(source).toContain('useState<PeriodId>("7d")');
    expect(source).toContain('useState<HorizonId>("6-24h")');
    expect(source).toContain(
      "Aucune échéance voisine ni période extérieure n’est utilisée en repli."
    );
  });

  it("sépare les métriques historiques par modèle, variable et horizon exact", () => {
    expect(source).toContain("Fiabilité historique, vérifiée sur observations");
    expect(source).toContain(
      "MAE, RMSE, biais, effectifs, dates et évolution par modèle × variable × horizon exact"
    );
    expect(source).toContain(
      "Le biais signé est descriptif et n’est jamais appliqué aux prévisions officielles futures."
    );
    expect(source).toContain(
      "Fiabilité historique · modèle × variable × horizon"
    );
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
    expect(source).toContain("Brut non validé · hors preuves");
    expect(source).toContain(
      "Une cellule « — » signifie non disponible, pas zéro."
    );
    expect(source).toContain("Aucune métrique n’est estimée");
    expect(source).toContain("ligne(s) brute(s) non validée(s)");
    expect(source).toContain("row.rawMetrics");
    expect(source).toContain("Plage des MAE brutes");
  });

  it("distingue un horizon non archivé d’une absence de qualification", () => {
    expect(source).toContain("Note globale ·");
    expect(source).toContain("Note horaire");
    expect(source).toContain("Note quotidienne");
    expect(source).toContain("Aucune note n’est inventée");
    expect(source).toContain(
      "Horizon non archivé séparément : les taux de couverture sont indisponibles"
    );
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
    expect(source).toContain(
      "Best Match/agrégateurs, modèles candidats et autres horizons ne sont jamais utilisés comme substituts."
    );
    expect(source).toContain(
      "L’accord inter-modèles décrit une dispersion de prévisions et n’est pas une mesure de fiabilité."
    );
    expect(source).toContain("L’accord inter-modèles");
  });

  it("affiche le badge de qualification réel de chaque station autour du lieu", () => {
    expect(source).toContain("Stations et capteurs autour du lieu");
    expect(source).toContain("Station officielle");
    expect(source).toContain("Capteur citoyen en validation");
    expect(source).toContain("Capteur citoyen validé");
    expect(source).toContain("Exclu");
    expect(source).toContain(
      "Aucun capteur citoyen n’est étiqueté Netatmo, Weather Underground ou station officielle."
    );
    expect(source).toContain("CWOP/MADIS · capteur citoyen");
    expect(source).toContain("Variables présentes");
    expect(source).toContain("Motif d’exclusion");
    // Aucune donnée fabriquée : l’âge et les variables absentes restent explicites.
    expect(source).toContain("Aucune donnée n’est fabriquée");
    expect(source).toContain("Aucun relevé");
    expect(source).toContain("Aucune variable mesurée");
  });

  it("évalue à blanc l’impact des capteurs validés sans jamais modifier la fusion", () => {
    expect(source).toContain("getCitizenFusionImpact");
    expect(source).toContain("Impact à blanc des capteurs citoyens validés");
    // Les deux bras de la comparaison sont explicites, jamais confondus.
    expect(source).toContain("MAE synthèse physique seule");
    expect(source).toContain("MAE avec capteurs validés");
    expect(source).toContain("Amélioration moyenne mesurée");
    expect(source).toContain("distance 50 %");
    expect(source).toContain("priorité de source 30 %");
    // Les verdicts mesurés sont affichés tels quels, sans embellissement.
    expect(source).toContain("AMÉLIORATION MESURÉE");
    expect(source).toContain("AUCUNE AMÉLIORATION MESURÉE");
    expect(source).toContain("HISTORIQUE INSUFFISANT");
    expect(source).toContain("Aucun capteur citoyen validé archivé");
    // Aucune donnée fabriquée et aucun changement implicite de la fusion.
    expect(source).toContain("aucune valeur n’est inventée");
    expect(source).toContain("l’heure d’archive n’est jamais un substitut");
    expect(source).toContain("aucune pondération n’est activée");
    expect(source).toContain("la fusion locale, la vérité terrain et les pondérations restent inchangées");
  });
});
