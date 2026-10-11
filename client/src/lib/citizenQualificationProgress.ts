/**
 * Présentation de la progression de qualification d'un capteur citoyen.
 *
 * Ce module ne calcule aucun seuil : les bornes et le restant viennent du
 * serveur, qui les dérive de `OPEN_SENSE_MAP_QUALIFICATION_GATES`. Le client se
 * contente de mettre en forme — recopier un seuil ici le ferait diverger du
 * moteur de qualification.
 */

export type CitizenQualificationGate = "comparisons" | "distinctDays" | "complete" | "excluded";

export type CitizenQualificationProgressView = {
  comparisons: number;
  minimumComparisons: number;
  remainingComparisons: number;
  distinctDays: number;
  minimumDistinctDays: number;
  remainingDistinctDays: number;
  gate: CitizenQualificationGate;
};

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/**
 * Avancement vers les deux portes, entre 0 et 1. Les portes étant cumulatives,
 * l'avancement global est le plus faible des deux : afficher la moyenne
 * suggérerait une progression que la porte la plus lente ne permet pas.
 */
export function qualificationCompletionRatio(progress: CitizenQualificationProgressView): number {
  if (progress.gate === "excluded") return 0;
  const comparisonsRatio = progress.minimumComparisons > 0
    ? progress.comparisons / progress.minimumComparisons
    : 1;
  const distinctDaysRatio = progress.minimumDistinctDays > 0
    ? progress.distinctDays / progress.minimumDistinctDays
    : 1;
  return Math.max(0, Math.min(1, Math.min(comparisonsRatio, distinctDaysRatio)));
}

/** Parité mesurée / requise, par exemple « 3/7 comparaisons · 1/3 jours ». */
export function formatQualificationParity(progress: CitizenQualificationProgressView): string {
  return `${progress.comparisons}/${progress.minimumComparisons} comparaisons · ${progress.distinctDays}/${progress.minimumDistinctDays} jours`;
}

/**
 * Phrase du restant exact, ou `null` quand il n'y a plus rien à franchir : un
 * capteur validé n'annonce aucun restant, un capteur exclu non plus — l'écran
 * ne doit jamais laisser croire qu'une validation approche pour un capteur écarté.
 */
export function formatQualificationRemaining(
  progress: CitizenQualificationProgressView,
): string | null {
  if (progress.gate === "complete" || progress.gate === "excluded") return null;
  const parts: string[] = [];
  if (progress.remainingComparisons > 0) {
    parts.push(plural(progress.remainingComparisons, "comparaison", "comparaisons"));
  }
  if (progress.remainingDistinctDays > 0) {
    parts.push(plural(progress.remainingDistinctDays, "jour distinct", "jours distincts"));
  }
  if (parts.length === 0) return null;
  return `Encore ${parts.join(" et ")} avant validation.`;
}

/** Libellé de la porte bloquante, en clair. */
export function qualificationGateLabel(progress: CitizenQualificationProgressView): string {
  switch (progress.gate) {
    case "comparisons":
      return "Comparaisons alignées insuffisantes";
    case "distinctDays":
      return "Jours distincts insuffisants";
    case "complete":
      return "Qualification acquise";
    case "excluded":
      return "Capteur écarté";
  }
}
