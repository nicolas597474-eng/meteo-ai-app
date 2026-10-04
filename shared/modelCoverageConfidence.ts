export const MODEL_COUNT_COVERAGE_LEVELS = [
  "NONE",
  "SINGLE_MODEL",
  "LIMITED",
  "MODERATE",
  "BROAD",
] as const;

export type ModelCountCoverageLevel = (typeof MODEL_COUNT_COVERAGE_LEVELS)[number];

const MODEL_COUNT_COVERAGE_LABELS: Record<ModelCountCoverageLevel, string> = {
  NONE: "indisponible",
  SINGLE_MODEL: "prévision d’un modèle unique",
  LIMITED: "confiance réduite",
  MODERATE: "confiance moyenne",
  BROAD: "confiance élevée",
};

/** Descriptive bucket by actual positive-weight contributors, never a skill score. */
export function getModelCountCoverageLevel(modelCount: number): ModelCountCoverageLevel {
  const count = Number.isFinite(modelCount) ? Math.max(0, Math.floor(modelCount)) : 0;
  if (count === 0) return "NONE";
  if (count === 1) return "SINGLE_MODEL";
  if (count === 2) return "LIMITED";
  if (count <= 4) return "MODERATE";
  return "BROAD";
}

export function getModelCountCoverageLabel(level: ModelCountCoverageLevel): string {
  return MODEL_COUNT_COVERAGE_LABELS[level];
}
