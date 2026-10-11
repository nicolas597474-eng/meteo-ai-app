export const EXPERIMENTAL_FORECAST_CONFIDENCE_WEIGHTS = {
  agreement: 20,
  observationQuality: 20,
  historicalPerformance: 20,
  freshnessCoverage: 15,
  spatialCoherence: 10,
  horizon: 10,
  sampleSize: 5,
} as const;

export type ExperimentalConfidenceComponentKey =
  keyof typeof EXPERIMENTAL_FORECAST_CONFIDENCE_WEIGHTS;
export type ExperimentalConfidenceComponent = {
  key: ExperimentalConfidenceComponentKey;
  label: string;
  weight: number;
  score: number | null;
  evidence: string;
  reason: string | null;
};

export type ExperimentalConfidenceModelValue = {
  modelId?: unknown;
  modelName?: unknown;
  value?: unknown;
  validTime?: unknown;
  availableAt?: unknown;
  horizonMinutes?: unknown;
  horizonBucket?: unknown;
  calibrationLevel?: unknown;
  calibrationStatus?: unknown;
  historicalScore?: {
    mae?: unknown;
    comparisonCount?: unknown;
    evaluatedDays?: unknown;
  } | null;
};

export type ExperimentalConfidenceStation = {
  stationId?: unknown;
  sourceKind?: unknown;
  isActive?: unknown;
  temperature?: unknown;
  reliabilityScore?: unknown;
  measurementTimes?: { temperature?: unknown } | null;
};

export type ExperimentalConfidenceForecastPoint = {
  validAt?: unknown;
  temp?: unknown;
  precipitation?: unknown;
  windSpeed?: unknown;
  weatherCode?: unknown;
  weighting?: {
    variableWeightings?: readonly {
      variable?: unknown;
      expectedModelCount?: unknown;
      availableModelCount?: unknown;
      modelWeights?: readonly ExperimentalConfidenceModelValue[];
    }[];
  } | null;
};

export type ExperimentalForecastConfidenceInput = {
  point: ExperimentalConfidenceForecastPoint | null;
  forecastComputedAt: unknown;
  stations: readonly ExperimentalConfidenceStation[];
  nowMs?: number;
};

export type ExperimentalForecastConfidenceResult = {
  version: "experimental-v2";
  status: "calculated" | "partial" | "unavailable";
  score: number | null;
  calculableWeight: number;
  coveragePercent: number;
  targetValidAt: number | null;
  extremePenalty: number | null;
  extremeReasons: string[];
  components: ExperimentalConfidenceComponent[];
};

const MAX_TEMPERATURE_SPREAD_C = 8;
const MAX_HISTORICAL_MAE_C = 5;
const SAMPLE_SIZE_REFERENCE_DAYS = 30;
const FRESHNESS_REFERENCE_MINUTES = 180;
const STATION_MAX_AGE_MINUTES = 180;
const STATION_ALIGNMENT_MINUTES = 60;
const MAX_FORECAST_HORIZON_MINUTES = 15 * 24 * 60;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseTimestamp(value: unknown): number | null {
  if (finite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

function spreadScore(range: number): number {
  return clampScore(100 * (1 - range / MAX_TEMPERATURE_SPREAD_C));
}

function isPhysicalActiveTemperatureStation(
  station: ExperimentalConfidenceStation
): boolean {
  return (
    station.sourceKind === "physical" &&
    station.isActive === true &&
    finite(station.temperature)
  );
}

function modelValuesAtTarget(
  weighting: {
    modelWeights?: readonly ExperimentalConfidenceModelValue[];
  },
  targetValidAt: number
): { models: ExperimentalConfidenceModelValue[]; duplicateIds: boolean } {
  const byId = new Map<string, ExperimentalConfidenceModelValue>();
  let duplicateIds = false;
  for (const model of weighting?.modelWeights ?? []) {
    const modelId =
      typeof model.modelId === "string" ? model.modelId.trim() : "";
    if (
      !modelId ||
      !finite(model.validTime) ||
      model.validTime !== targetValidAt ||
      !finite(model.value)
    )
      continue;
    if (byId.has(modelId)) {
      duplicateIds = true;
      continue;
    }
    byId.set(modelId, model);
  }
  return { models: Array.from(byId.values()), duplicateIds };
}

function unavailableComponent(
  key: ExperimentalConfidenceComponentKey,
  label: string,
  reason: string,
  evidence = "Aucune preuve exploitable."
): ExperimentalConfidenceComponent {
  return {
    key,
    label,
    weight: EXPERIMENTAL_FORECAST_CONFIDENCE_WEIGHTS[key],
    score: null,
    evidence,
    reason,
  };
}

function availableComponent(
  key: ExperimentalConfidenceComponentKey,
  label: string,
  score: number,
  evidence: string
): ExperimentalConfidenceComponent {
  return {
    key,
    label,
    weight: EXPERIMENTAL_FORECAST_CONFIDENCE_WEIGHTS[key],
    score: clampScore(score),
    evidence,
    reason: null,
  };
}

function buildAgreementComponent(
  modelWeights: readonly ExperimentalConfidenceModelValue[],
  targetValidAt: number | null
): ExperimentalConfidenceComponent {
  if (targetValidAt == null)
    return unavailableComponent(
      "agreement",
      "Accord inter-sources",
      "Échéance UTC exacte absente."
    );
  const { models, duplicateIds } = modelValuesAtTarget(
    { modelWeights },
    targetValidAt
  );
  if (duplicateIds)
    return unavailableComponent(
      "agreement",
      "Accord inter-sources",
      "Plusieurs lignes portent le même modelId; le nombre de modelId distincts est ambigu."
    );
  if (models.length !== modelWeights.length)
    return unavailableComponent(
      "agreement",
      "Accord inter-sources",
      "Au moins une valeur de modèle n’est pas alignée au validAt exact; aucun sous-échantillon n’est utilisé."
    );
  if (models.length < 2)
    return unavailableComponent(
      "agreement",
      "Accord inter-sources",
      "Au moins deux modelId distincts avec une température au même validAt sont requis.",
      `${models.length} modèle(s) distinct(s) exploitable(s) à cette échéance.`
    );
  const values = models.map(model => model.value as number);
  const range = Math.max(...values) - Math.min(...values);
  return availableComponent(
    "agreement",
    "Accord inter-sources",
    spreadScore(range),
    `${models.length} modelId distincts, même validAt; étendue thermique ${range.toFixed(1)} °C. Des identifiants distincts ne prouvent pas une indépendance statistique entre fournisseurs. Échelle expérimentale : 0 °C → 100, 8 °C ou plus → 0.`
  );
}

function buildObservationQualityComponent(
  stations: readonly ExperimentalConfidenceStation[]
): ExperimentalConfidenceComponent {
  const candidates = stations.filter(isPhysicalActiveTemperatureStation);
  if (candidates.length === 0)
    return unavailableComponent(
      "observationQuality",
      "Qualité des observations",
      "Aucune observation de température provenant d’une station physique active."
    );
  if (
    candidates.some(
      station =>
        !finite(station.reliabilityScore) ||
        station.reliabilityScore < 0 ||
        station.reliabilityScore > 100
    )
  ) {
    return unavailableComponent(
      "observationQuality",
      "Qualité des observations",
      "Au moins une station physique active n’a pas de score de qualité source valide.",
      `${candidates.length} station(s) physique(s) active(s) avec température; la qualité n’est pas complète.`
    );
  }
  const mean =
    candidates.reduce(
      (sum, station) => sum + (station.reliabilityScore as number),
      0
    ) / candidates.length;
  return availableComponent(
    "observationQuality",
    "Qualité des observations",
    mean,
    `${candidates.length} station(s) physique(s) active(s); moyenne des scores qualité source existants. Ce score source n’est pas une exactitude historique de la station.`
  );
}

function buildSpatialCoherenceComponent(
  stations: readonly ExperimentalConfidenceStation[],
  nowMs: number
): ExperimentalConfidenceComponent {
  const candidates = stations.filter(isPhysicalActiveTemperatureStation);
  if (candidates.length < 2)
    return unavailableComponent(
      "spatialCoherence",
      "Cohérence spatiale",
      "Deux observations physiques actives de température au minimum sont requises.",
      `${candidates.length} station(s) avec température.`
    );

  const timed = candidates.map(station => ({
    station,
    timestamp: parseTimestamp(station.measurementTimes?.temperature),
  }));
  if (timed.some(({ timestamp }) => timestamp == null)) {
    return unavailableComponent(
      "spatialCoherence",
      "Cohérence spatiale",
      "L’heure de mesure propre à la température manque pour au moins une station; updatedAt n’est pas utilisé comme substitut.",
      `${candidates.length} station(s) avec température, horodatage par variable incomplet.`
    );
  }
  const timestamps = timed.map(({ timestamp }) => timestamp as number);
  if (
    timestamps.some(
      timestamp =>
        timestamp > nowMs ||
        nowMs - timestamp > STATION_MAX_AGE_MINUTES * 60_000
    )
  ) {
    return unavailableComponent(
      "spatialCoherence",
      "Cohérence spatiale",
      "Au moins un relevé thermique est futur ou dépasse la limite de fraîcheur de 180 min."
    );
  }
  const timeRangeMinutes =
    (Math.max(...timestamps) - Math.min(...timestamps)) / 60_000;
  if (timeRangeMinutes > STATION_ALIGNMENT_MINUTES) {
    return unavailableComponent(
      "spatialCoherence",
      "Cohérence spatiale",
      "Les relevés ne sont pas comparables : plus de 60 min séparent leurs heures de mesure.",
      `Écart temporel constaté : ${Math.round(timeRangeMinutes)} min.`
    );
  }
  const values = candidates.map(station => station.temperature as number);
  const range = Math.max(...values) - Math.min(...values);
  return availableComponent(
    "spatialCoherence",
    "Cohérence spatiale",
    spreadScore(range),
    `${candidates.length} stations physiques; mesures propres à la température, fraîches (≤180 min) et espacées de ${Math.round(timeRangeMinutes)} min au plus; étendue ${range.toFixed(1)} °C. Échelle expérimentale : 0 °C → 100, 8 °C ou plus → 0.`
  );
}

function hasQualifiedHistoricalScore(
  model: ExperimentalConfidenceModelValue
): boolean {
  return (
    model.calibrationStatus === "CALIBRATED" &&
    finite(model.historicalScore?.mae) &&
    (model.historicalScore?.mae as number) >= 0 &&
    finite(model.historicalScore?.evaluatedDays) &&
    (model.historicalScore?.evaluatedDays as number) > 0 &&
    finite(model.historicalScore?.comparisonCount) &&
    (model.historicalScore?.comparisonCount as number) > 0
  );
}

function comparableHistoricalModels(
  models: readonly ExperimentalConfidenceModelValue[],
  targetValidAt: number | null
): {
  models: ExperimentalConfidenceModelValue[];
  total: number;
  reason: string | null;
} {
  if (targetValidAt == null)
    return { models: [], total: 0, reason: "Échéance exacte absente." };
  const { models: atTarget, duplicateIds } = modelValuesAtTarget(
    { modelWeights: models },
    targetValidAt
  );
  if (duplicateIds)
    return {
      models: [],
      total: 0,
      reason: "Plusieurs lignes portent le même modelId.",
    };
  if (atTarget.length === 0)
    return {
      models: [],
      total: 0,
      reason: "Aucun modèle température aligné au validAt exact.",
    };
  if (atTarget.length !== models.length)
    return {
      models: [],
      total: 0,
      reason:
        "Au moins une valeur de modèle n’est pas alignée au validAt exact; aucun sous-échantillon n’est utilisé.",
    };
  // Seuls les modèles avec une preuve historique qualifiée portent le facteur :
  // les autres sont exclus de l’agrégat sans annuler la mesure.
  const qualified = atTarget.filter(hasQualifiedHistoricalScore);
  if (qualified.length === 0)
    return {
      models: [],
      total: atTarget.length,
      reason:
        "Aucun modèle aligné n’a de preuve historique qualifiée (CALIBRATED avec MAE et effectifs valides); aucun poids n’est réalloué aux autres facteurs.",
    };

  const levels = new Set(qualified.map(model => model.calibrationLevel));
  if (levels.size !== 1)
    return {
      models: [],
      total: atTarget.length,
      reason:
        "Les modèles avec preuve historique qualifiée utilisent des bases de calibration différentes.",
    };
  const level = qualified[0]?.calibrationLevel;
  if (level === "EXACT_LOCAL_MODEL_VARIABLE_HORIZON") {
    const horizons = qualified.map(model => model.horizonMinutes);
    if (
      horizons.some(horizon => !finite(horizon)) ||
      new Set(horizons).size !== 1
    ) {
      return {
        models: [],
        total: atTarget.length,
        reason:
          "Les horizons exacts des modèles avec preuve historique qualifiée ne sont pas identiques; leurs performances ne sont pas comparables.",
      };
    }
  } else if (level === "EXACT_LOCAL_MODEL_VARIABLE_BUCKET") {
    const buckets = qualified.map(model => model.horizonBucket);
    if (
      buckets.some(
        bucket => typeof bucket !== "string" || bucket.trim() === ""
      ) ||
      new Set(buckets).size !== 1
    ) {
      return {
        models: [],
        total: atTarget.length,
        reason:
          "Les tranches d’horizon des modèles avec preuve historique qualifiée ne sont pas identiques; leurs performances ne sont pas comparables.",
      };
    }
  } else {
    return {
      models: [],
      total: atTarget.length,
      reason:
        "La base locale de calibration n’est pas une preuve exacte modèle × variable × horizon.",
    };
  }
  return { models: qualified, total: atTarget.length, reason: null };
}

function buildHistoricalPerformanceComponent(
  modelWeights: readonly ExperimentalConfidenceModelValue[],
  targetValidAt: number | null
): ExperimentalConfidenceComponent {
  const result = comparableHistoricalModels(modelWeights, targetValidAt);
  if (result.reason)
    return unavailableComponent(
      "historicalPerformance",
      "Performance historique",
      result.reason
    );
  // La MAE est pondérée par la masse de preuve (comparaisons historiques
  // indépendantes) : plus un modèle dispose de preuve qualifiée, plus il pèse.
  const comparisonCount = result.models.reduce(
    (sum, model) => sum + (model.historicalScore!.comparisonCount as number),
    0
  );
  const weightedMae =
    result.models.reduce(
      (sum, model) =>
        sum +
        (model.historicalScore!.mae as number) *
          (model.historicalScore!.comparisonCount as number),
      0
    ) / comparisonCount;
  const level =
    result.models[0]?.calibrationLevel === "EXACT_LOCAL_MODEL_VARIABLE_HORIZON"
      ? "lead exact commun"
      : "tranche locale commune";
  return availableComponent(
    "historicalPerformance",
    "Performance historique",
    100 * (1 - weightedMae / MAX_HISTORICAL_MAE_C),
    `${result.models.length}/${result.total} modèle(s) aligné(s) avec preuve historique qualifiée et ${level}; MAE température pondérée par la masse de preuve : ${weightedMae.toFixed(2)} °C. Les modèles sans preuve qualifiée sont exclus de l’agrégat sans annuler le facteur. Échelle expérimentale : MAE 0 °C → 100, 5 °C ou plus → 0.`
  );
}

function buildFreshnessCoverageComponent(
  modelWeights: readonly ExperimentalConfidenceModelValue[],
  expectedModelCount: unknown,
  availableModelCount: unknown,
  targetValidAt: number | null,
  nowMs: number
): ExperimentalConfidenceComponent {
  if (
    !finite(expectedModelCount) ||
    !Number.isInteger(expectedModelCount) ||
    expectedModelCount <= 0 ||
    !finite(availableModelCount) ||
    !Number.isInteger(availableModelCount) ||
    availableModelCount < 0 ||
    availableModelCount > expectedModelCount
  ) {
    return unavailableComponent(
      "freshnessCoverage",
      "Fraîcheur et couverture",
      "Les effectifs attendus/reçus ne sont pas valides."
    );
  }
  const distinctModelIds = new Set(
    modelWeights.flatMap(model =>
      typeof model.modelId === "string" && model.modelId.trim()
        ? [model.modelId.trim()]
        : []
    )
  );
  if (
    distinctModelIds.size !== availableModelCount ||
    modelWeights.length !== availableModelCount
  ) {
    return unavailableComponent(
      "freshnessCoverage",
      "Fraîcheur et couverture",
      "Les horodatages de tous les modèles comptés ne sont pas exposés; la fraîcheur globale n’est pas estimable sans sous-échantillonnage.",
      `${availableModelCount}/${expectedModelCount} valeur(s) annoncée(s), ${distinctModelIds.size} modelId(s) projeté(s).`
    );
  }
  const { models } =
    targetValidAt == null
      ? { models: [] }
      : modelValuesAtTarget({ modelWeights }, targetValidAt);
  if (modelWeights.length > 0 && models.length !== modelWeights.length) {
    return unavailableComponent(
      "freshnessCoverage",
      "Fraîcheur et couverture",
      "Les valeurs ne sont pas toutes alignées sur un même validAt exact."
    );
  }
  const timestamps = modelWeights.map(model =>
    parseTimestamp(model.availableAt)
  );
  if (
    availableModelCount === 0 ||
    timestamps.some(timestamp => timestamp == null || timestamp > nowMs)
  ) {
    return unavailableComponent(
      "freshnessCoverage",
      "Fraîcheur et couverture",
      "Aucun horodatage de disponibilité valide pour tous les modèles reçus."
    );
  }
  const oldestAgeMinutes = Math.max(
    0,
    (nowMs - Math.min(...(timestamps as number[]))) / 60_000
  );
  const freshnessScore = Math.max(
    0,
    100 * (1 - oldestAgeMinutes / FRESHNESS_REFERENCE_MINUTES)
  );
  const coverageScore = (100 * availableModelCount) / expectedModelCount;
  return availableComponent(
    "freshnessCoverage",
    "Fraîcheur et couverture",
    (freshnessScore + coverageScore) / 2,
    `${availableModelCount}/${expectedModelCount} modèles pour la température; disponibilité la plus ancienne âgée de ${Math.round(oldestAgeMinutes)} min. Score = moyenne égale couverture/fraîcheur; fraîcheur nulle à 180 min.`
  );
}

function buildHorizonComponent(
  targetValidAt: number | null,
  forecastComputedAt: unknown
): ExperimentalConfidenceComponent {
  const referenceAt = parseTimestamp(forecastComputedAt);
  if (
    targetValidAt == null ||
    referenceAt == null ||
    targetValidAt < referenceAt
  ) {
    return unavailableComponent(
      "horizon",
      "Horizon",
      "validAt futur et horodatage du snapshot comparables indisponibles."
    );
  }
  const leadMinutes = (targetValidAt - referenceAt) / 60_000;
  const score = 100 * (1 - leadMinutes / MAX_FORECAST_HORIZON_MINUTES);
  return availableComponent(
    "horizon",
    "Horizon",
    score,
    `Échéance à ${Math.round(leadMinutes)} min du snapshot; repère linéaire 0 min → 100, 15 jours → 0. Ce repère ne mesure pas une fréquence d’erreur calibrée.`
  );
}

function buildSampleSizeComponent(
  modelWeights: readonly ExperimentalConfidenceModelValue[],
  targetValidAt: number | null
): ExperimentalConfidenceComponent {
  const result = comparableHistoricalModels(modelWeights, targetValidAt);
  if (result.reason)
    return unavailableComponent(
      "sampleSize",
      "Taille d’échantillon",
      result.reason
    );
  const minimumDays = Math.min(
    ...result.models.map(
      model => model.historicalScore!.evaluatedDays as number
    )
  );
  const minimumComparisons = Math.min(
    ...result.models.map(
      model => model.historicalScore!.comparisonCount as number
    )
  );
  return availableComponent(
    "sampleSize",
    "Taille d’échantillon",
    (100 * minimumDays) / SAMPLE_SIZE_REFERENCE_DAYS,
    `Borne conservatrice sur les ${result.models.length}/${result.total} modèle(s) avec preuve historique qualifiée : ${minimumDays} jour(s) indépendant(s) et ${minimumComparisons} comparaison(s) au minimum; score saturé à 30 jours. Les jours, pas les heures, portent l’échantillon.`
  );
}

function buildExtremePenalty(
  point: ExperimentalConfidenceForecastPoint | null
): { penalty: number | null; reasons: string[] } {
  if (
    !point ||
    !finite(point.temp) ||
    !finite(point.precipitation) ||
    !finite(point.windSpeed) ||
    !finite(point.weatherCode)
  ) {
    return { penalty: null, reasons: [] };
  }
  const reasons = new Set<string>();
  if (point.windSpeed > 60) reasons.add("vent > 60 km/h");
  if (
    (point.windSpeed > 35 && point.precipitation > 5) ||
    [95, 96, 99].includes(point.weatherCode)
  )
    reasons.add("orage / vent et pluie intenses");
  if (point.precipitation > 5) reasons.add("précipitations > 5 mm sur l’heure");
  if (point.temp < -5) reasons.add("gel intense < −5 °C");
  if (point.temp > 33 && point.precipitation < 0.5)
    reasons.add("chaleur > 33 °C, temps sec");
  if ([66, 67].includes(point.weatherCode))
    reasons.add("pluie verglaçante WMO");
  return {
    penalty: Math.min(30, reasons.size * 10),
    reasons: Array.from(reasons),
  };
}

/**
 * Read-only, explicitly experimental index for one exact next-hour temperature
 * point. Weights are fixed; missing components are never renormalized. The
 * historical-performance and sample-size factors only aggregate the models
 * holding a qualified historical proof (CALIBRATED with valid MAE and sample
 * counts); models without such proof are excluded without voiding the factor,
 * and each proven model is weighted by its evidence mass (comparison count).
 * The score is withheld until every weighted factor and the extreme check are
 * known.
 */
export function calculateExperimentalForecastConfidence(
  input: ExperimentalForecastConfidenceInput
): ExperimentalForecastConfidenceResult {
  const nowMs = finite(input.nowMs) ? input.nowMs : Date.now();
  const targetValidAt =
    input.point && finite(input.point.validAt) ? input.point.validAt : null;
  const temperatureWeighting =
    input.point?.weighting?.variableWeightings?.find(
      item => item.variable === "temperature"
    ) ?? null;
  const modelWeights = temperatureWeighting?.modelWeights ?? [];

  const components: ExperimentalConfidenceComponent[] = [
    buildAgreementComponent(modelWeights, targetValidAt),
    buildObservationQualityComponent(input.stations),
    buildHistoricalPerformanceComponent(modelWeights, targetValidAt),
    buildFreshnessCoverageComponent(
      modelWeights,
      temperatureWeighting?.expectedModelCount,
      temperatureWeighting?.availableModelCount,
      targetValidAt,
      nowMs
    ),
    buildSpatialCoherenceComponent(input.stations, nowMs),
    buildHorizonComponent(targetValidAt, input.forecastComputedAt),
    buildSampleSizeComponent(modelWeights, targetValidAt),
  ];
  const calculableWeight = components.reduce(
    (sum, component) => sum + (component.score == null ? 0 : component.weight),
    0
  );
  const coveragePercent = calculableWeight;
  const { penalty: extremePenalty, reasons: extremeReasons } =
    buildExtremePenalty(input.point);
  const fullyCalculable = calculableWeight === 100 && extremePenalty != null;
  const weightedScore = fullyCalculable
    ? components.reduce(
        (sum, component) => sum + component.weight * (component.score ?? 0),
        0
      ) / 100
    : null;
  const score =
    weightedScore == null ? null : clampScore(weightedScore - extremePenalty!);

  return {
    version: "experimental-v2",
    status: fullyCalculable
      ? "calculated"
      : calculableWeight > 0
        ? "partial"
        : "unavailable",
    score,
    calculableWeight,
    coveragePercent,
    targetValidAt,
    extremePenalty,
    extremeReasons,
    components,
  };
}
