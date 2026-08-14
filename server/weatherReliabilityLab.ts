import {
  getLaboratoryModelAggregates,
  getLaboratoryModelArchive,
  getLaboratoryScoreTimeline,
  getPhysicalStationHistory,
  getQualifiedEvidenceStatus,
  getQualifiedLeadTimeScoresForLocation,
  getStationQualityProfiles,
  makeLocationKey,
} from "./db";
import {
  getLaboratoryHorizon,
  getStatisticalConfidence,
  LABORATORY_HORIZONS,
  LABORATORY_SCORE_WEIGHTS,
  MINIMUM_RELIABILITY_COMPARISONS,
  type LaboratoryHorizonId,
} from "./weatherReliabilityConfig";
import { VALIDATION_WEATHER_MODELS, WEATHER_SERVICES } from "./weatherServices";
import { getParisDateDaysAgo } from "./weatherTime";

export const LABORATORY_PERIODS = {
  "24h": { label: "24 h", days: 1 },
  "7d": { label: "7 jours", days: 7 },
  "30d": { label: "30 jours", days: 30 },
  "90d": { label: "90 jours", days: 90 },
  "365d": { label: "365 jours", days: 365 },
} as const;

export type LaboratoryPeriodId = keyof typeof LABORATORY_PERIODS;

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value: number | null, precision = 1): number | null {
  if (value === null) return null;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function insufficiencyReason(input: {
  archivedRuns: number;
  comparisons: number;
  normalizedScore: number | null;
  isRankable: boolean;
}) {
  if (input.archivedRuns === 0) return "Aucune prévision archivée pour cette période.";
  if (input.comparisons === 0) return "Aucune comparaison à une observation physique qualifiée n’est encore archivée.";
  if (input.normalizedScore === null) return "Les six variables du score normalisé ne sont pas encore toutes archivées sur les mêmes comparaisons.";
  if (!input.isRankable) return `Échantillon insuffisant : ${input.comparisons}/${MINIMUM_RELIABILITY_COMPARISONS} comparaisons qualifiées.`;
  return null;
}

/**
 * Single read model for the reliability laboratory. It does not recalculate or
 * blend forecasts: it only exposes the same physically qualified evidence that
 * feeds the central scoring path.
 */
export async function buildReliabilityLaboratory(input: {
  lat: number;
  lon: number;
  period: LaboratoryPeriodId;
  horizon: LaboratoryHorizonId;
}) {
  const period = LABORATORY_PERIODS[input.period];
  const startDate = getParisDateDaysAgo(period.days - 1);
  const locationKey = makeLocationKey(input.lat, input.lon);
  const horizon = getLaboratoryHorizon(input.horizon);

  const [archiveRows, aggregateRows, timeline, leadTimeRows, evidenceStatus, stationData] = await Promise.all([
    getLaboratoryModelArchive(locationKey, startDate),
    getLaboratoryModelAggregates(locationKey, startDate),
    getLaboratoryScoreTimeline(locationKey, startDate),
    getQualifiedLeadTimeScoresForLocation(locationKey, period.days),
    getQualifiedEvidenceStatus(locationKey),
    getPhysicalStationHistory(input.lat, input.lon, Date.now() - period.days * 24 * 60 * 60 * 1000),
  ]);
  const qualityProfiles = await getStationQualityProfiles(stationData.stations.map((station) => station.stationId));

  const archivesByModel = new Map(archiveRows.map((row) => [row.serviceName, row]));
  const aggregatesByModel = new Map(aggregateRows.map((row) => [row.serviceName, row]));
  const profilesByStation = new Map(qualityProfiles.map((profile) => [profile.stationId, profile]));

  const modelCatalog = [
    ...WEATHER_SERVICES.expert.map((model) => ({
      name: model.name,
      provider: "Open-Meteo",
      modelId: model.modelId,
      status: "actif" as const,
    })),
    ...VALIDATION_WEATHER_MODELS.map((model) => ({
      name: model.name,
      provider: "Open-Meteo",
      modelId: model.modelId,
      status: "validation" as const,
    })),
  ];

  const models = modelCatalog.map((model) => {
    const archive = archivesByModel.get(model.name);
    const aggregate = aggregatesByModel.get(model.name);
    const comparisons = numberOrNull(aggregate?.comparisons) ?? 0;
    const evaluatedDays = numberOrNull(aggregate?.evaluatedDays) ?? 0;
    const confidence = getStatisticalConfidence({ comparisons, evaluatedDays });
    const normalizedScore = numberOrNull(aggregate?.averageNormalizedScore);
    return {
      ...model,
      archive: {
        runs: numberOrNull(archive?.archivedRuns) ?? 0,
        firstValidDate: archive?.firstValidDate ?? null,
        latestValidDate: archive?.latestValidDate ?? null,
      },
      evidence: {
        comparisons,
        evaluatedDays,
        scoreRows: numberOrNull(aggregate?.scoreRows) ?? 0,
        latestScoreDate: aggregate?.latestScoreDate ?? null,
      },
      normalizedScore,
      operationalScore: numberOrNull(aggregate?.averageOperationalScore),
      confidence,
      metrics: {
        temperature: {
          mae: round(numberOrNull(aggregate?.averageMaeTemp), 2),
          rmse: round(numberOrNull(aggregate?.averageRmseTemp), 2),
          bias: round(numberOrNull(aggregate?.averageBiasTemp), 2),
        },
        precipitation: {
          score: round(numberOrNull(aggregate?.averagePrecipScore), 1),
          pod: round(numberOrNull(aggregate?.averagePrecipPod), 2),
          far: round(numberOrNull(aggregate?.averagePrecipFar), 2),
          falsePositives: numberOrNull(aggregate?.falsePositives),
          falseNegatives: numberOrNull(aggregate?.falseNegatives),
        },
        wind: {
          mae: round(numberOrNull(aggregate?.averageMaeWind), 2),
          gustMae: round(numberOrNull(aggregate?.averageMaeGusts), 2),
        },
        humidityScore: round(numberOrNull(aggregate?.averageHumidityScore), 1),
        pressureScore: round(numberOrNull(aggregate?.averagePressureScore), 1),
      },
      insufficiencyReason: insufficiencyReason({
        archivedRuns: numberOrNull(archive?.archivedRuns) ?? 0,
        comparisons,
        normalizedScore,
        isRankable: confidence.isRankable,
      }),
    };
  });

  const rankedModels = [...models]
    .filter((model) => model.status === "actif" && model.confidence.isRankable && model.normalizedScore !== null)
    .sort((left, right) => (right.normalizedScore ?? -1) - (left.normalizedScore ?? -1));
  const ranks = new Map(rankedModels.map((model, index) => [model.name, index + 1]));

  const stations = stationData.stations.map((station) => {
    const profile = profilesByStation.get(station.stationId);
    const observations = profile?.observationCount ?? 0;
    const evaluatedDays = Math.max(0, Math.floor((profile?.windowHours ?? 0) / 24));
    return {
      stationId: station.stationId,
      name: station.name,
      source: station.source,
      lat: station.lat,
      lon: station.lon,
      altitude: station.altitude,
      distanceKm: round(station.distanceKm, 1),
      availability: station.dataAvailability === null ? null : round(station.dataAvailability * 100, 1),
      latest: station.readings.at(-1) ?? null,
      quality: profile ? {
        status: profile.status,
        observationCount: observations,
        continuityScore: round(profile.continuityScore, 1),
        completenessScore: round(profile.completenessScore, 1),
        stabilityScore: round(profile.stabilityScore, 1),
        windowHours: profile.windowHours,
      } : null,
      confidence: getStatisticalConfidence({ comparisons: observations, evaluatedDays }),
    };
  });

  const leadTimeByBucket = new Map(leadTimeRows.map((row) => [`${row.serviceName}:${row.bucket}`, row]));
  const horizonAnalysis = LABORATORY_HORIZONS.map((definition) => {
    if (!definition.storageBucket) {
      return {
        ...definition,
        available: false,
        reason: "Cet horizon n’est pas encore archivé séparément par le moteur central.",
        models: [],
      };
    }
    const modelRows = WEATHER_SERVICES.expert.map((model) => {
      const row = leadTimeByBucket.get(`${model.name}:${definition.storageBucket}`);
      const comparisons = numberOrNull(row?.totalSamples) ?? 0;
      return {
        name: model.name,
        comparisons,
        confidence: getStatisticalConfidence({ comparisons, evaluatedDays: comparisons > 0 ? 1 : 0 }),
        temperatureMae: round(numberOrNull(row?.avgMaeTemp), 2),
        precipitationMae: round(numberOrNull(row?.avgMaePrecip), 2),
        windMae: round(numberOrNull(row?.avgMaeWind), 2),
        latestScoreDate: row?.latestScoreDate ?? null,
      };
    });
    return {
      ...definition,
      available: modelRows.some((model) => model.comparisons > 0),
      reason: modelRows.some((model) => model.comparisons > 0) ? null : "Aucune comparaison physique qualifiée n’est archivée pour cet horizon.",
      models: modelRows,
    };
  });

  return {
    locationKey,
    period: { id: input.period, ...period, startDate },
    selectedHorizon: horizon,
    evidence: {
      policy: "Seules les observations physiques qualifiées sont admises dans les classements du laboratoire.",
      status: evidenceStatus,
      totalComparisons: models.reduce((total, model) => total + model.evidence.comparisons, 0),
      evaluatedModelCount: rankedModels.length,
    },
    scoreDefinition: {
      weights: LABORATORY_SCORE_WEIGHTS,
      minimumComparisons: MINIMUM_RELIABILITY_COMPARISONS,
      missingMetricRule: "Une composante absente rend le score normalisé indisponible ; elle n’est jamais remplacée par une valeur estimée.",
    },
    bestModel: rankedModels[0] ?? null,
    models: models.map((model) => ({ ...model, rank: ranks.get(model.name) ?? null })),
    scoreTimeline: timeline.map((point) => ({
      ...point,
      comparisons: numberOrNull(point.comparisons) ?? 0,
      normalizedScore: round(numberOrNull(point.normalizedScore), 1),
      operationalScore: round(numberOrNull(point.operationalScore), 1),
      maeTemp: round(numberOrNull(point.maeTemp), 2),
      rmseTemp: round(numberOrNull(point.rmseTemp), 2),
      maeWind: round(numberOrNull(point.maeWind), 2),
    })),
    horizons: horizonAnalysis,
    stations,
    stationEvidence: stationData.latestGroundTruth ?? null,
    availability: {
      situations: "Données insuffisantes : aucun découpage statistique par situation météo n’est encore archivé.",
      seasons: "Données insuffisantes : aucun découpage statistique saisonnier n’est encore archivé.",
      modelObservationReplay: "Données insuffisantes : les comparaisons horaires qualifiées seront exposées dès que les premiers scores complets auront été persistés.",
    },
  };
}
