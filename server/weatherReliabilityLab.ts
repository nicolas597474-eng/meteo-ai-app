import { getHourlyForecastEvaluationHistory, makeLocationKey } from "./db";
import {
  getLaboratoryHorizon,
  PUBLIC_RANKING_EVIDENCE_THRESHOLDS,
  type LaboratoryHorizonId,
} from "./weatherReliabilityConfig";
import { HOURLY_FORECAST_VARIABLES } from "./hourlyForecastRunScoring";
import { OFFICIAL_HOURLY_MODELS } from "./weatherServices";
import { getParisDateDaysAgo } from "./weatherTime";
import { summarizeHourlyHistoricalEvidence, type HourlyHistoricalScoreRow } from "./hourlyHistoricalEvidence";

export const LABORATORY_PERIODS = {
  "24h": { label: "24 h", days: 1 },
  "7d": { label: "7 jours", days: 7 },
  "30d": { label: "30 jours", days: 30 },
  "90d": { label: "90 jours", days: 90 },
  "365d": { label: "365 jours", days: 365 },
} as const;

export type LaboratoryPeriodId = keyof typeof LABORATORY_PERIODS;

export function normalizeLaboratoryServiceName(name: string): string {
  if (name === "best_match") return "Open-Meteo";
  return name.replace(/\s*·\s*validation\s*$/i, "").trim();
}

const VARIABLE_LABELS: Record<(typeof HOURLY_FORECAST_VARIABLES)[number], string> = {
  temperature: "Température",
  precipitation: "Précipitations",
  wind_speed: "Vent moyen",
  wind_gust: "Rafales",
  humidity: "Humidité",
  pressure: "Pression",
};

const VARIABLE_UNITS: Record<(typeof HOURLY_FORECAST_VARIABLES)[number], string> = {
  temperature: "°C",
  precipitation: "mm",
  wind_speed: "km/h",
  wind_gust: "km/h",
  humidity: "%",
  pressure: "hPa",
};

export async function buildReliabilityLaboratory(input: {
  lat: number;
  lon: number;
  period: LaboratoryPeriodId;
  horizon: LaboratoryHorizonId;
}) {
  const period = LABORATORY_PERIODS[input.period];
  const startDate = getParisDateDaysAgo(period.days);
  const throughDate = getParisDateDaysAgo(1);
  const beforeDate = getParisDateDaysAgo(0);
  const locationKey = makeLocationKey(input.lat, input.lon);
  const selectedHorizon = getLaboratoryHorizon(input.horizon);
  const trendStartDate = getParisDateDaysAgo(Math.max(period.days, 60));
  const history = await getHourlyForecastEvaluationHistory(locationKey, trendStartDate, throughDate);
  const minimumComparisons = PUBLIC_RANKING_EVIDENCE_THRESHOLDS.minimumComparisons;
  const minimumComparableDays = PUBLIC_RANKING_EVIDENCE_THRESHOLDS.minimumComparableDays;

  const evidence = OFFICIAL_HOURLY_MODELS.flatMap((model) => HOURLY_FORECAST_VARIABLES.map((variable) => {
    const base = {
      modelName: model.name,
      modelId: model.modelId,
      variable,
      variableLabel: VARIABLE_LABELS[variable],
      unit: VARIABLE_UNITS[variable],
      horizonId: input.horizon,
      horizonLabel: selectedHorizon?.label ?? input.horizon,
      periodStartDate: startDate,
      periodEndDate: throughDate,
    };
    if (!selectedHorizon?.storageBucket) {
      return {
        ...base,
        horizonBucket: null,
        status: "horizon_not_stored" as const,
        reason: "Cet horizon n’est pas archivé séparément; aucune échéance voisine n’est utilisée en repli.",
        metrics: null,
        minimumComparisons,
        minimumComparableDays,
        firstScoreDate: null,
        latestScoreDate: null,
        latestComputedAt: null,
        incompleteMetricRows: 0,
        trend: null,
      };
    }
    const summary = summarizeHourlyHistoricalEvidence(history.rows as HourlyHistoricalScoreRow[], {
      modelName: model.name,
      modelId: model.modelId,
      variable,
      horizonBucket: selectedHorizon.storageBucket,
      beforeDate,
      periodStartDate: startDate,
      historyAvailable: history.available,
    });
    return {
      ...base,
      ...summary,
      horizonLabel: selectedHorizon.label,
      reason: summary.status === "history_unavailable"
        ? "Historique illisible ou indisponible; statut séparé de l’absence de comparaisons."
        : summary.status === "no_evidence"
          ? "Aucune ligne complète modèle × variable × horizon n’est archivée sur cette période."
          : summary.status === "incomplete_metrics"
            ? "Des lignes existent, mais au moins une métrique requise est absente ou invalide."
            : summary.status === "insufficient_evidence"
              ? `Valeurs brutes disponibles; qualification non atteinte (${summary.metrics?.comparisonCount ?? 0}/${minimumComparisons} comparaisons, ${summary.metrics?.evaluatedDays ?? 0}/${minimumComparableDays} jours).`
              : null,
    };
  }));

  return {
    locationKey,
    period: { id: input.period, ...period, startDate, endDate: throughDate },
    trendWindowStartDate: trendStartDate,
    selectedHorizon,
    evidence: {
      status: history.available ? "available" as const : "history_unavailable" as const,
      source: "hourly_forecast_evaluation_scores" as const,
      expectedModelCount: OFFICIAL_HOURLY_MODELS.length,
      includedModels: OFFICIAL_HOURLY_MODELS.map((model) => model.name),
      bestMatchIncluded: false as const,
      variables: HOURLY_FORECAST_VARIABLES.map((variable) => ({ key: variable, label: VARIABLE_LABELS[variable], unit: VARIABLE_UNITS[variable] })),
      minimumComparisons,
      minimumComparableDays,
      note: "Les valeurs restent brutes et exactes au grain modèle × variable × horizon. MAE/RMSE/biais ne sont pas fusionnés en note; Best Match et agrégateurs sont exclus.",
    },
    metrics: evidence,
    availability: {
      history: history.available ? "Historique lisible" : "Historique indisponible",
      dailyHorizon: "Les prévisions journalières sans horodatage d’émission exact ne sont pas converties en preuves horaires par horizon.",
      selectedHorizon: selectedHorizon?.storageBucket ? "Horizon archivé séparément" : "Horizon non archivé séparément",
      trend: "Les fenêtres récentes et précédentes sont lues séparément sur 60 jours minimum; leur différence n’est calculée que si chacune atteint les seuils d’évidence.",
    },
  };
}
