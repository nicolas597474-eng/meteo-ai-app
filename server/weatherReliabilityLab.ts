import { getHourlyForecastEvaluationHistory, makeLocationKey } from "./db";
import {
  getLaboratoryHorizon,
  LABORATORY_HORIZONS,
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
  const history = await getHourlyForecastEvaluationHistory(locationKey, trendStartDate, throughDate, [], { includeLegacy: true });
  const summarizeCell = (
    rows: readonly unknown[],
    model: { name: string; modelId: string },
    variable: (typeof HOURLY_FORECAST_VARIABLES)[number],
    storageBucket: string,
  ) => summarizeHourlyHistoricalEvidence([...rows] as HourlyHistoricalScoreRow[], {
    modelName: model.name,
    modelId: model.modelId,
    variable,
    horizonBucket: storageBucket,
    beforeDate,
    periodStartDate: startDate,
    historyAvailable: history.available,
  });
  const minimumComparisons = PUBLIC_RANKING_EVIDENCE_THRESHOLDS.minimumComparisons;
  const minimumComparableDays = PUBLIC_RANKING_EVIDENCE_THRESHOLDS.minimumComparableDays;
  const expectedEvidenceCellCount = OFFICIAL_HOURLY_MODELS.length * HOURLY_FORECAST_VARIABLES.length;
  const horizonEvidence = LABORATORY_HORIZONS.map((horizon) => {
    const base = {
      id: horizon.id,
      label: horizon.label,
      storageBucket: horizon.storageBucket,
      expectedCellCount: expectedEvidenceCellCount,
    };
    if (!history.available) {
      return {
        ...base,
        status: "history_unavailable" as const,
        rawEvidenceCellCount: null,
        qualifiedCellCount: null,
        insufficientEvidenceCellCount: null,
        incompleteMetricCellCount: null,
        noEvidenceCellCount: null,
      };
    }
    if (!horizon.storageBucket) {
      return {
        ...base,
        status: "horizon_not_stored" as const,
        rawEvidenceCellCount: null,
        qualifiedCellCount: null,
        insufficientEvidenceCellCount: null,
        incompleteMetricCellCount: null,
        noEvidenceCellCount: null,
      };
    }

    let rawEvidenceCellCount = 0;
    let qualifiedCellCount = 0;
    let insufficientEvidenceCellCount = 0;
    let incompleteMetricCellCount = 0;
    let noEvidenceCellCount = 0;
    for (const model of OFFICIAL_HOURLY_MODELS) {
      for (const variable of HOURLY_FORECAST_VARIABLES) {
        const summary = summarizeCell(history.rows, model, variable, horizon.storageBucket);
        const rawCellMetrics = summary.metrics
          ?? summarizeCell(history.legacyRows, model, variable, horizon.storageBucket).metrics;
        if (rawCellMetrics) rawEvidenceCellCount += 1;
        if (summary.status === "qualified") qualifiedCellCount += 1;
        else if (summary.status === "insufficient_evidence") insufficientEvidenceCellCount += 1;
        else if (summary.status === "incomplete_metrics") incompleteMetricCellCount += 1;
        else if (summary.status === "no_evidence") noEvidenceCellCount += 1;
      }
    }
    return {
      ...base,
      status: "available" as const,
      rawEvidenceCellCount,
      qualifiedCellCount,
      insufficientEvidenceCellCount,
      incompleteMetricCellCount,
      noEvidenceCellCount,
    };
  });

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
        legacyUnversionedRowCount: 0,
        metrics: null,
        rawMetrics: null,
        minimumComparisons,
        minimumComparableDays,
        firstScoreDate: null,
        latestScoreDate: null,
        latestComputedAt: null,
        incompleteMetricRows: 0,
        trend: null,
      };
    }
    const summary = summarizeCell(history.rows, model, variable, selectedHorizon.storageBucket);
    const unvalidatedSummary = summary.metrics == null
      ? summarizeCell(history.legacyRows, model, variable, selectedHorizon.storageBucket)
      : null;
    const legacyUnversionedRows = (history.legacyRows as HourlyHistoricalScoreRow[]).filter((row) =>
      row.sourceName === "open-meteo"
      && row.modelName === model.name
      && row.modelId === model.modelId
      && row.variable === variable
      && row.horizonBucket === selectedHorizon.storageBucket
      && row.date >= startDate
      && row.date <= throughDate,
    );
    const legacyUnversionedRowCount = legacyUnversionedRows.length;
    const rawMetrics = summary.metrics ?? unvalidatedSummary?.metrics ?? null;
    const rawNote = summary.metrics == null && rawMetrics != null
      ? `Données brutes non validées consultables (${rawMetrics.comparisonCount} comparaisons sur ${rawMetrics.evaluatedDays} jour(s)); sans version de validation stricte, elles restent exclues des preuves actuelles et des poids officiels.`
      : null;
    const legacyNote = legacyUnversionedRowCount > 0
      ? `${legacyUnversionedRowCount} ligne(s) brute(s) non validée(s) archivée(s) sur cette maille, exclue(s) des preuves actuelles et des poids officiels.`
      : null;
    const reason = summary.status === "history_unavailable"
      ? "Historique illisible ou indisponible; aucune preuve actuelle n’est qualifiée."
      : summary.status === "no_evidence"
        ? rawNote ?? legacyNote ?? "Aucune ligne complète modèle × variable × horizon n’est archivée sur cette période."
        : summary.status === "incomplete_metrics"
          ? `Des lignes versionnées existent, mais au moins une métrique requise est absente ou invalide.${legacyNote ? ` ${legacyNote}` : ""}`
          : summary.status === "insufficient_evidence"
            ? `Valeurs brutes versionnées disponibles; qualification non atteinte (${summary.metrics?.comparisonCount ?? 0}/${minimumComparisons} comparaisons, ${summary.metrics?.evaluatedDays ?? 0}/${minimumComparableDays} jours).${legacyNote ? ` ${legacyNote}` : ""}`
            : legacyNote;
    return {
      ...base,
      ...summary,
      rawMetrics,
      status: summary.status === "no_evidence" && legacyUnversionedRowCount > 0 ? "legacy_unversioned_only" as const : summary.status,
      legacyUnversionedRowCount,
      horizonLabel: selectedHorizon.label,
      reason,
    };
  }));

  return {
    locationKey,
    period: { id: input.period, ...period, startDate, endDate: throughDate },
    trendWindowStartDate: trendStartDate,
    selectedHorizon,
    horizonEvidence,
    evidence: {
      status: history.available ? "available" as const : "history_unavailable" as const,
      source: "hourly_forecast_evaluation_scores" as const,
      expectedModelCount: OFFICIAL_HOURLY_MODELS.length,
      includedModels: OFFICIAL_HOURLY_MODELS.map((model) => model.name),
      bestMatchIncluded: false as const,
      variables: HOURLY_FORECAST_VARIABLES.map((variable) => ({ key: variable, label: VARIABLE_LABELS[variable], unit: VARIABLE_UNITS[variable] })),
      minimumComparisons,
      minimumComparableDays,
      note: "Seuls les scores horaires portant la version de validation stricte courante alimentent les preuves et les poids officiels. Les données brutes « non validées » restent consultables séparément dans le diagnostic, mais ne sont jamais traitées comme preuve actuelle. MAE/RMSE/biais ne sont pas fusionnés en note; Best Match et agrégateurs sont exclus.",
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
