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
  // Les libellÃ©s des badges de qualification vivent dans la lib partagÃ©e.
  readFileSync(
    new URL("../lib/stationCandidateStatus.ts", import.meta.url),
    "utf8"
  ),
]
  .join("\n")
  .replace(/\s+/g, " ");

describe("ReliabilityLaboratory â preuves brutes", () => {
  it("sÃ©lectionne une fenÃªtre et un horizon exacts sans repli vers une autre Ã©chÃ©ance", () => {
    expect(source).toContain('useState<PeriodId>("7d")');
    expect(source).toContain('useState<HorizonId>("6-24h")');
    expect(source).toContain(
      "Aucune Ã©chÃ©ance voisine ni pÃ©riode extÃ©rieure nâest utilisÃ©e en repli."
    );
  });

  it("sÃ©pare les mÃ©triques historiques par modÃ¨le, variable et horizon exact", () => {
    expect(source).toContain("FiabilitÃ© historique, vÃ©rifiÃ©e sur observations");
    expect(source).toContain(
      "MAE, RMSE, biais, effectifs, dates et Ã©volution par modÃ¨le Ã variable Ã horizon exact"
    );
    expect(source).toContain(
      "Le biais signÃ© est descriptif et nâest jamais appliquÃ© aux prÃ©visions officielles futures."
    );
    expect(source).toContain(
      "FiabilitÃ© historique Â· modÃ¨le Ã variable Ã horizon"
    );
    expect(source).toContain("row.modelId");
    expect(source).toContain("row.variableLabel");
    expect(source).toContain("row.horizonId");
    expect(source).not.toContain("normalizedScore");
    expect(source).not.toContain("averageScore");
    expect(source).not.toContain("Meilleur modÃ¨le");
    expect(source).not.toContain("/100");
  });

  it("montre des statuts explicites et ne transforme pas les valeurs indisponibles en zÃ©ro", () => {
    expect(source).toContain("Seuil dâÃ©vidence atteint");
    expect(source).toContain("DonnÃ©es insuffisantes");
    expect(source).toContain("Horizon non archivÃ© sÃ©parÃ©ment");
    expect(source).toContain("Historique indisponible");
    expect(source).toContain("Brut non validÃ© Â· hors preuves");
    expect(source).toContain(
      "Une cellule Â« â Â» signifie non disponible, pas zÃ©ro."
    );
    expect(source).toContain("Aucune mÃ©trique nâest estimÃ©e");
    expect(source).toContain("ligne(s) brute(s) non validÃ©e(s)");
    expect(source).toContain("row.rawMetrics");
    expect(source).toContain("Plage des MAE brutes");
  });

  it("distingue un horizon non archivÃ© dâune absence de qualification", () => {
    expect(source).toContain("Note globale Â·");
    expect(source).toContain("Note horaire");
    expect(source).toContain("Note quotidienne");
    expect(source).toContain("Aucune note nâest inventÃ©e");
    expect(source).toContain(
      "Horizon non archivÃ© sÃ©parÃ©ment : les taux de couverture sont indisponibles"
    );
  });

  it("conserve la porte dâÃ©vidence, les effectifs distincts et les dates des scores", () => {
    expect(source).toContain("minimumComparisons");
    expect(source).toContain("minimumComparableDays");
    expect(source).toContain("comparisonCount");
    expect(source).toContain("evaluatedDays");
    expect(source).toContain("firstScoreDate");
    expect(source).toContain("latestScoreDate");
    expect(source).toContain("latestComputedAt");
    expect(source).toContain("FenÃªtre");
  });

  it("exclut Best Match et distingue la dispersion de lâerreur face aux observations", () => {
    expect(source).toContain(
      "Best Match/agrÃ©gateurs, modÃ¨les candidats et autres horizons ne sont jamais utilisÃ©s comme substituts."
    );
    expect(source).toContain(
      "Lâaccord inter-modÃ¨les dÃ©crit une dispersion de prÃ©visions et nâest pas une mesure de fiabilitÃ©."
    );
    expect(source).toContain("Lâaccord inter-modÃ¨les");
  });

  it("affiche le badge de qualification rÃ©el de chaque station autour du lieu", () => {
    expect(source).toContain("Stations et capteurs autour du lieu");
    expect(source).toContain("Station officielle");
    expect(source).toContain("Capteur citoyen en validation");
    expect(source).toContain("Capteur citoyen validÃ©");
    expect(source).toContain("Exclu");
    expect(source).toContain(
      "Aucun capteur citoyen nâest Ã©tiquetÃ© Netatmo, Weather Underground ou station officielle."
    );
    expect(source).toContain("CWOP/MADIS Â· capteur citoyen");
    expect(source).toContain("Variables prÃ©sentes");
    expect(source).toContain("Motif dâexclusion");
    // Aucune donnÃ©e fabriquÃ©e : lâÃ¢ge et les variables absentes restent explicites.
    expect(source).toContain("Aucune donnÃ©e nâest fabriquÃ©e");
    expect(source).toContain("Aucun relevÃ©");
    expect(source).toContain("Aucune variable mesurÃ©e");
  });

  it("Ã©value Ã  blanc lâimpact des capteurs validÃ©s sans jamais modifier la fusion", () => {
    expect(source).toContain("getCitizenFusionImpact");
    expect(source).toContain("Impact Ã  blanc des capteurs citoyens validÃ©s");
    // Les deux bras de la comparaison sont explicites, jamais confondus.
    expect(source).toContain("MAE synthÃ¨se physique seule");
    expect(source).toContain("MAE avec capteurs validÃ©s");
    expect(source).toContain("AmÃ©lioration moyenne mesurÃ©e");
    expect(source).toContain("distance 50 %");
    expect(source).toContain("prioritÃ© de source 30 %");
    // Les verdicts mesurÃ©s sont affichÃ©s tels quels, sans embellissement.
    expect(source).toContain("AMÃLIORATION MESURÃE");
    expect(source).toContain("AUCUNE AMÃLIORATION MESURÃE");
    expect(source).toContain("HISTORIQUE INSUFFISANT");
    expect(source).toContain("Aucun capteur citoyen validÃ© archivÃ©");
    // Aucune donnÃ©e fabriquÃ©e et aucun changement implicite de la fusion.
    expect(source).toContain("aucune valeur nâest inventÃ©e");
    expect(source).toContain("lâheure dâarchive nâest jamais un substitut");
    // La décision d’activation persistée est affichée à côté du rapport
    // mesuré, sans jamais être recalculée côté client.
    expect(source).toContain("Décision d’activation archivée");
    expect(source).toContain("ACTIFS DANS LA TEMPÉRATURE LOCALE");
    expect(source).toContain("HORS DE LA TEMPÉRATURE LOCALE");
    expect(source).toContain("aucune décision d’activation archivée");
    expect(source).toContain("data.activation.reason");
    expect(source).toContain("réévaluée à chaque cycle planifié");
    expect(source).toContain("la vérité terrain horaire archivée reste physique uniquement");
  });
});

