import { describe, expect, it } from "vitest";
import {
  formatQualificationParity,
  formatQualificationRemaining,
  qualificationCompletionRatio,
  qualificationGateLabel,
  type CitizenQualificationProgressView,
} from "./citizenQualificationProgress";

function progress(overrides: Partial<CitizenQualificationProgressView> = {}): CitizenQualificationProgressView {
  return {
    comparisons: 0,
    minimumComparisons: 7,
    remainingComparisons: 7,
    distinctDays: 0,
    minimumDistinctDays: 3,
    remainingDistinctDays: 3,
    gate: "comparisons",
    ...overrides,
  };
}

describe("restant avant validation", () => {
  it("annonce le nombre exact de comparaisons restantes au singulier", () => {
    expect(
      formatQualificationRemaining(
        progress({ comparisons: 6, remainingComparisons: 1, distinctDays: 3, remainingDistinctDays: 0 }),
      ),
    ).toBe("Encore 1 comparaison avant validation.");
  });

  it("annonce les comparaisons restantes au pluriel", () => {
    expect(
      formatQualificationRemaining(
        progress({ comparisons: 3, remainingComparisons: 4, distinctDays: 3, remainingDistinctDays: 0 }),
      ),
    ).toBe("Encore 4 comparaisons avant validation.");
  });

  it("cite les deux manques quand la porte est sur les jours", () => {
    // Sept comparaisons sur une seule journée : la porte bascule sur les jours,
    // le restant doit citer les jours et pas seulement les comparaisons.
    expect(
      formatQualificationRemaining(
        progress({ comparisons: 7, remainingComparisons: 0, distinctDays: 1, remainingDistinctDays: 2, gate: "distinctDays" }),
      ),
    ).toBe("Encore 2 jours distincts avant validation.");
  });

  it("n'annonce aucun restant pour un capteur validé", () => {
    expect(
      formatQualificationRemaining(
        progress({ comparisons: 9, remainingComparisons: 0, distinctDays: 4, remainingDistinctDays: 0, gate: "complete" }),
      ),
    ).toBeNull();
  });

  it("n'annonce aucune validation à venir pour un capteur écarté", () => {
    // Le capteur est sorti du chemin : l'écran ne doit jamais laisser croire
    // qu'une validation approche.
    expect(
      formatQualificationRemaining(
        progress({ comparisons: 9, remainingComparisons: 0, distinctDays: 3, remainingDistinctDays: 0, gate: "excluded" }),
      ),
    ).toBeNull();
  });
});

describe("parité mesurée / requise", () => {
  it("affiche les deux portes sur une seule ligne", () => {
    expect(formatQualificationParity(progress({ comparisons: 3, distinctDays: 1 }))).toBe(
      "3/7 comparaisons · 1/3 jours",
    );
  });
});

describe("avancement", () => {
  it("retient la porte la plus lente, jamais une moyenne", () => {
    // 6/7 comparaisons mais 2/3 jours : la moyenne suggérerait 88 %, alors que
    // les jours ne sont qu'aux deux tiers.
    const ratio = qualificationCompletionRatio(
      progress({ comparisons: 6, distinctDays: 2, gate: "distinctDays" }),
    );
    expect(ratio).toBeCloseTo(2 / 3, 5);
  });

  it("atteint 1 quand les deux portes sont franchies", () => {
    expect(
      qualificationCompletionRatio(
        progress({ comparisons: 7, distinctDays: 3, gate: "complete" }),
      ),
    ).toBe(1);
  });

  it("plafonne à 1 même au-delà des seuils", () => {
    expect(
      qualificationCompletionRatio(
        progress({ comparisons: 30, distinctDays: 20, gate: "complete" }),
      ),
    ).toBe(1);
  });

  it("reste à 0 pour un capteur écarté", () => {
    expect(
      qualificationCompletionRatio(progress({ comparisons: 9, distinctDays: 3, gate: "excluded" })),
    ).toBe(0);
  });
});

describe("libellé de la porte", () => {
  it("nomme la porte réellement bloquante", () => {
    expect(qualificationGateLabel(progress({ gate: "comparisons" }))).toBe(
      "Comparaisons alignées insuffisantes",
    );
    expect(qualificationGateLabel(progress({ gate: "distinctDays" }))).toBe(
      "Jours distincts insuffisants",
    );
    expect(qualificationGateLabel(progress({ gate: "complete" }))).toBe("Qualification acquise");
    expect(qualificationGateLabel(progress({ gate: "excluded" }))).toBe("Capteur écarté");
  });
});
