import { GROUND_TRUTH_COMPONENT_SHARES, PHYSICAL_STATION_SOURCES, getStationSourcePriorityDefaults, type StationSource } from "./stationService";
import { STATION_PERFORMANCE_CALCULATION_GATES } from "./stationPerformanceService";

const PHYSICAL_SOURCE_NAMES: Record<StationSource, string> = {
  meteofrance: "Météo-France StatIC",
  metar: "METAR / observations aéroportuaires",
  netatmo: "Netatmo",
  synop: "Référence ECMWF de grille (non station)",
  noaa: "NOAA / référence non station",
  infoclimat: "Infoclimat",
  openmeteo: "Open-Meteo / référence de grille",
  davis: "Davis Instruments",
  cwop: "CWOP / APRS",
  wunderground: "Weather Underground PWS",
  opensensemap: "openSenseMap",
};

/** Describes existing production heuristics and the separate empirical station measurement contract. */
export function getStationRankingContract() {
  const physicalSourcePriorities = Array.from(PHYSICAL_STATION_SOURCES).map((source) => {
    const defaults = getStationSourcePriorityDefaults(source);
    return {
      id: source,
      name: PHYSICAL_SOURCE_NAMES[source],
      sourcePriorityScore: defaults.reliability,
      updateFreqMin: defaults.updateFreqMin,
      estimatedAvailability: defaults.availability,
      interpretation: "Priorité technique fixe de la source; ce n’est ni une précision météo ni une performance individuelle de station.",
    };
  });

  return {
    version: "station-ranking-contract-v2" as const,
    criteria: [
      { name: "Distance", weight: 40, description: "Le tri existant favorise les stations proches (inverse de la distance)." },
      { name: "Priorité technique du réseau/source", weight: 30, description: "Priorité fixe par origine utilisée par le classement; ne mesure ni la précision météo ni la performance individuelle de la station." },
      { name: "Disponibilité estimée de la source", weight: 20, description: "Valeur par défaut de disponibilité du réseau, pas un résultat météorologique mesuré pour cette station." },
      { name: "Cadence nominale", weight: 10, description: "Cadence de mise à jour déclarée pour la source; ne mesure pas l’exactitude des relevés." },
    ],
    groundTruthWeights: {
      distance: GROUND_TRUTH_COMPONENT_SHARES.distance * 100,
      sourcePriority: GROUND_TRUTH_COMPONENT_SHARES.quality * 100,
      freshness: GROUND_TRUTH_COMPONENT_SHARES.freshness * 100,
    },
    groundTruthWeightNotes: [
      "Chaque composante est normalisée entre stations, les parts sont appliquées, puis les poids finaux sont renormalisés.",
      "La part sourcePriority vient du reliabilityScore fixe du réseau; elle ne correspond pas à une qualité historique mesurée par station.",
    ],
    exclusionRules: [
      "Aucune donnée disponible lorsque température, vent et précipitations sont tous absents.",
      "Présélection physique : relevé plus ancien que 180 minutes.",
      "Priorité technique de source inférieure à 40/100 (seuil de présélection, pas une mesure de précision).",
      "Contrôle spatial de la synthèse : écart de température supérieur à 8 °C lorsque comparable.",
    ],
    sourcePriorityDefinition: "Les valeurs sourcePriorityScore viennent des valeurs par défaut des mappers actifs. Elles servent aux heuristiques de tri/pondération déjà en production; elles ne sont ni des probabilités, ni des pourcentages de précision, ni des scores individuels de station.",
    sources: physicalSourcePriorities,
    stationPerformance: {
      statusWhenEvidenceInsufficient: "non_mesuree" as const,
      unavailableEstimate: null,
      metric: "Pour les variables couvertes : MAE poolée, MAE moyenne par jour utilisée pour le shrinkage, RMSE et biais en unités physiques natives; aucun score individuel composite 0–100 n’est dérivé.",
      comparison: "Comparaison horaire à la médiane de réseaux physiques distincts; le réseau et le site exact de la station cible sont exclus, et les réseaux co-localisés ne comptent pas séparément.",
      upstreamProviderIndependenceVerified: false,
      sourcePrior: "Moyenne empirique des MAE de sites distincts du même réseau, évalués contre des réseaux différents; la cible est exclue. Shrinkage normal-normal empirique : w = tau² / (tau² + s²), estimation = w × MAE cible + (1 − w) × prior réseau.",
      uncertainty: "Intervalle bilatéral nominal à 95 % (alpha 0,05) avec quantile t de Student et degrés de liberté min(jours distincts − 1, sites du prior − 1); approximation à blocs journaliers, non calibrée empiriquement et non interprétable comme probabilité.",
      calculationGates: {
        minimumComparisons: STATION_PERFORMANCE_CALCULATION_GATES.minimumComparisons,
        minimumDistinctDays: STATION_PERFORMANCE_CALCULATION_GATES.minimumDistinctDays,
        minimumDistinctReferenceNetworksPerComparison: STATION_PERFORMANCE_CALCULATION_GATES.minimumDistinctReferenceNetworksPerComparison,
        minimumSourcePriorSites: STATION_PERFORMANCE_CALCULATION_GATES.minimumSourcePriorSites,
      },
      calculationGatesAreEvidence: false,
      scorePublication: {
        compositeScorePublished: false,
        publicationThreshold: null,
        calibratedProbabilityPublished: false,
      },
      precipitationMeasurement: {
        status: "non_mesuree" as const,
        reason: "aucun minimum d’échantillon défendable n’est documenté",
        occurrenceAndQuantityMeasured: false,
        distinctEventDayCountExposed: true,
      },
      operationalProfile: "Le profil complétude/continuité/stabilité décrit la disponibilité et la régularité des relevés; il ne constitue pas une mesure de précision météorologique.",
      historySource: "station_observations",
      historyWindowDays: 30,
      readsExistingStationHistoryAtRuntime: true,
      persistsCalculatedData: false,
      changesProductionForecastsOrWeights: false,
    },
  };
}
