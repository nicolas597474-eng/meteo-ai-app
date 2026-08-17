import { describe, expect, it } from "vitest";
import {
  getLaboratoryHorizon,
  getProvisionalEvidenceScore,
  getStatisticalConfidence,
  LABORATORY_SCORE_WEIGHT_TOTAL,
  LABORATORY_SCORE_WEIGHTS,
  MINIMUM_RELIABILITY_COMPARISONS,
  PUBLIC_RANKING_EVIDENCE_THRESHOLDS,
  isPublicModelRankingEligible,
} from "./weatherReliabilityConfig";

describe("weatherReliabilityConfig", () => {
  it("conserve exactement 100 % de pondération pour le score normalisé", () => {
    expect(LABORATORY_SCORE_WEIGHT_TOTAL).toBeCloseTo(1, 10);
    expect(LABORATORY_SCORE_WEIGHTS).toEqual({
      temperature: 0.30,
      precipitation: 0.25,
      wind: 0.20,
      gusts: 0.10,
      humidity: 0.10,
      pressure: 0.05,
    });
  });

  it("refuse tout classement sous le minimum de comparaisons physiques", () => {
    const confidence = getStatisticalConfidence({
      comparisons: MINIMUM_RELIABILITY_COMPARISONS - 1,
      evaluatedDays: 2,
    });
    expect(confidence.level).toBe("insufficient");
    expect(confidence.isRankable).toBe(false);
    expect(confidence.minimumMissing).toBe(1);
  });

  it("réserve les classements publics aux preuves physiques suffisamment longues", () => {
    expect(isPublicModelRankingEligible({
      comparisons: PUBLIC_RANKING_EVIDENCE_THRESHOLDS.minimumComparisons - 1,
      evaluatedDays: 30,
    })).toBe(false);
    expect(isPublicModelRankingEligible({
      comparisons: 300,
      evaluatedDays: PUBLIC_RANKING_EVIDENCE_THRESHOLDS.minimumComparableDays - 1,
    })).toBe(false);
    expect(isPublicModelRankingEligible({ comparisons: 30, evaluatedDays: 7 })).toBe(true);
  });

  it("qualifie les niveaux faible, moyen et élevé uniquement avec assez de durée et de comparaisons", () => {
    expect(getStatisticalConfidence({ comparisons: 18, evaluatedDays: 2 }).level).toBe("low");
    expect(getStatisticalConfidence({ comparisons: 72, evaluatedDays: 7 }).level).toBe("medium");
    expect(getStatisticalConfidence({ comparisons: 180, evaluatedDays: 30 }).level).toBe("high");
  });

  it("mesure la couverture provisoire sans la confondre avec une performance de modèle", () => {
    expect(getProvisionalEvidenceScore({ comparisons: 43, evaluatedDays: 2 })).toBe(29);
    expect(getProvisionalEvidenceScore({ comparisons: 72, evaluatedDays: 7 })).toBe(100);
    expect(getStatisticalConfidence({ comparisons: 43, evaluatedDays: 2 }).evidenceScore).toBe(29);
  });

  it("n’assimile pas les horizons non archivés séparément à un horizon voisin", () => {
    expect(getLaboratoryHorizon("6-24h")?.storageBucket).toBe("6-24h");
    expect(getLaboratoryHorizon("24-48h")?.storageBucket).toBeNull();
    expect(getLaboratoryHorizon("8-10d")?.storageBucket).toBeNull();
  });
});
