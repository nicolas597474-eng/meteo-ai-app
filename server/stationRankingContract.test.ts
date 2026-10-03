import { describe, expect, it } from "vitest";
import { getStationRankingContract } from "./stationRankingContract";
import { GROUND_TRUTH_COMPONENT_SHARES } from "./stationService";

const contract = getStationRankingContract();

describe("contrat de classement et de performance station", () => {
  it("décrit les mêmes priorités fixes que les mappers physiques actifs, sans inclure les grilles comme stations", () => {
    expect(contract.sources.map(({ id, sourcePriorityScore }) => [id, sourcePriorityScore])).toEqual([
      ["meteofrance", 92],
      ["metar", 90],
      ["netatmo", 65],
    ]);
    expect(contract.sources.map((source) => source.name)).toEqual([
      "Météo-France StatIC",
      "METAR / observations aéroportuaires",
      "Netatmo",
    ]);
    expect(contract.sources.map((source) => source.id)).not.toContain("synop");
    expect(contract.sources.map((source) => source.id)).not.toContain("openmeteo");
    expect(contract.sources.every((source) => source.interpretation.includes("ce n’est ni une précision météo"))).toBe(true);
  });

  it("appelle le score une priorité technique et conserve les poids de classement existants", () => {
    expect(contract.criteria.map(({ weight }) => weight)).toEqual([40, 30, 20, 10]);
    expect(contract.criteria[1].name).toBe("Priorité technique du réseau/source");
    expect(contract.criteria[1].description).toContain("ne mesure ni la précision météo");
    expect(contract.groundTruthWeights).toEqual({
      distance: GROUND_TRUTH_COMPONENT_SHARES.distance * 100,
      sourcePriority: GROUND_TRUTH_COMPONENT_SHARES.quality * 100,
      freshness: GROUND_TRUTH_COMPONENT_SHARES.freshness * 100,
    });
    expect(contract.groundTruthWeights).toEqual({ distance: 50, sourcePriority: 30, freshness: 20 });
    expect(contract.groundTruthWeightNotes[1]).toContain("ne correspond pas à une qualité historique mesurée par station");
    expect(contract).not.toHaveProperty("groundTruthWeights.qualityHistory");
  });

  it("reflète les filtres actifs sans transformer les seuils opérationnels en preuve météo", () => {
    expect(contract.exclusionRules).toContain("Présélection physique : relevé plus ancien que 180 minutes.");
    expect(contract.exclusionRules.some((rule) => rule.includes("120 minutes"))).toBe(false);
    expect(contract.exclusionRules).toContain("Priorité technique de source inférieure à 40/100 (seuil de présélection, pas une mesure de précision).");
    expect(contract.stationPerformance.statusWhenEvidenceInsufficient).toBe("non_mesuree");
    expect(contract.stationPerformance.unavailableEstimate).toBeNull();
    expect(contract.stationPerformance.operationalProfile).toContain("complétude/continuité/stabilité");
    expect(contract.stationPerformance.operationalProfile).toContain("ne constitue pas une mesure de précision");
    expect(contract.stationPerformance.comparison).toContain("les réseaux co-localisés ne comptent pas séparément");
    expect(contract.stationPerformance.upstreamProviderIndependenceVerified).toBe(false);
    expect(contract.stationPerformance.calculationGatesAreEvidence).toBe(false);
    expect(contract.stationPerformance.calculationGates).toEqual({
      minimumComparisons: 30,
      minimumDistinctDays: 7,
      minimumDistinctReferenceNetworksPerComparison: 2,
      minimumSourcePriorSites: 2,
    });
    expect(contract.stationPerformance).not.toHaveProperty("thresholds");
    expect(contract.stationPerformance.scorePublication).toEqual({
      compositeScorePublished: false,
      publicationThreshold: null,
      calibratedProbabilityPublished: false,
    });
    expect(contract.stationPerformance.precipitationMeasurement).toMatchObject({
      status: "non_mesuree",
      occurrenceAndQuantityMeasured: false,
      distinctEventDayCountExposed: true,
    });
    expect(contract.stationPerformance.sourcePrior).toContain("w = tau² / (tau² + s²)");
    expect(contract.stationPerformance.uncertainty).toContain("alpha 0,05");
    expect(contract.stationPerformance).toMatchObject({
      historySource: "station_observations",
      historyWindowDays: 30,
      readsExistingStationHistoryAtRuntime: true,
      persistsCalculatedData: false,
    });
    expect(contract.stationPerformance.changesProductionForecastsOrWeights).toBe(false);
  });
});
