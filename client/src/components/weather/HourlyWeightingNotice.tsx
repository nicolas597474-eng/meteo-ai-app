import React from "react";
import type { ManualHourlyOverride } from "@shared/hourlyModelMetrics";
import {
  getModelCountCoverageLabel,
  MODEL_COUNT_COVERAGE_LEVELS,
  type ModelCountCoverageLevel,
} from "@shared/modelCoverageConfidence";

type HourlyWeightingNoticeProps = {
  weighting?: {
    status?: "historical_skill" | "mixed" | "robust_fallback" | "single_model" | "unavailable";
    availabilityStatus?: "FUSED" | "SINGLE_MODEL" | "UNAVAILABLE";
    calibrationStatus?: "CALIBRATED" | "PARTIALLY_CALIBRATED" | "UNCALIBRATED_ROBUST" | "UNAVAILABLE";
    historyStatus?: "available" | "unavailable";
    minimumComparisons?: number;
    minimumComparableDays?: number;
    bestMatchIncluded?: false;
    manualOverride?: ManualHourlyOverride | null;
    modelsWithData?: readonly string[];
    horizons?: readonly {
      variable: string;
      horizonBucket: string | null;
      method: "historical_skill" | "mixed" | "robust_fallback" | "single_model" | "unavailable";
      availabilityStatus?: "FUSED" | "SINGLE_MODEL" | "UNAVAILABLE";
      calibrationStatus?: "CALIBRATED" | "PARTIALLY_CALIBRATED" | "UNCALIBRATED_ROBUST" | "UNAVAILABLE";
      unavailableReason: string | null;
      hourCount: number;
      availableModelCount?: number;
      evidenceEligibleModelCount?: number;
      contributingModelCount?: number;
      coverageLevelCounts?: Partial<Record<ModelCountCoverageLevel, number>>;
      modelNamesWithData: readonly string[];
    }[];
  } | null;
};

const VARIABLE_LABELS: Record<string, string> = {
  temperature: "température",
  precipitation: "précipitations",
  wind_speed: "vent",
  wind_gust: "rafales",
  humidity: "humidité",
  pressure: "pression",
};

const REASON_LABELS: Record<string, string> = {
  insufficient_historical_evidence: "historique de calibration insuffisant",
  history_unavailable: "historique de calibration indisponible",
  horizon_not_scored: "horizon sans bucket historique",
  incomparable_horizons: "horizons différents, évalués séparément",
  no_wet_models: "aucun modèle disponible ne prévoit au moins 0,1 mm",
  no_model_data: "aucune valeur réelle reçue pour cette variable et cette échéance",
};

function formatGroups(
  rows: NonNullable<HourlyWeightingNoticeProps["weighting"]>["horizons"],
  calibrationStatus: "CALIBRATED" | "PARTIALLY_CALIBRATED" | "UNCALIBRATED_ROBUST" | "UNAVAILABLE",
): string {
  const groups = new Map<string, Set<string>>();
  for (const row of rows ?? []) {
    const rowStatus = row.calibrationStatus
      ?? (row.method === "historical_skill" ? "CALIBRATED" : row.method === "mixed" ? "PARTIALLY_CALIBRATED" : row.method === "robust_fallback" ? "UNCALIBRATED_ROBUST" : "UNAVAILABLE");
    if (rowStatus !== calibrationStatus) continue;
    const label = VARIABLE_LABELS[row.variable] ?? row.variable;
    const horizons = groups.get(label) ?? new Set<string>();
    horizons.add(row.horizonBucket ?? "bucket historique non disponible");
    groups.set(label, horizons);
  }
  return Array.from(groups, ([variable, horizons]) => `${variable} (${Array.from(horizons).join(", ")})`).join("; ");
}

function formatUnavailableDetails(rows: NonNullable<HourlyWeightingNoticeProps["weighting"]>["horizons"]): string {
  const groups = new Map<string, Set<string>>();
  for (const row of rows ?? []) {
    if (row.availabilityStatus !== "UNAVAILABLE" && row.method !== "unavailable") continue;
    const reason = REASON_LABELS[row.unavailableReason ?? ""] ?? "aucune valeur disponible";
    const variable = VARIABLE_LABELS[row.variable] ?? row.variable;
    const item = `${variable} (${row.horizonBucket ?? "échéance exacte"})`;
    const variables = groups.get(reason) ?? new Set<string>();
    variables.add(item);
    groups.set(reason, variables);
  }
  return Array.from(groups, ([reason, variables]) => `${reason} : ${Array.from(variables).join(", ")}`).join("; ");
}

function formatCoverageLevelDistribution(rows: NonNullable<HourlyWeightingNoticeProps["weighting"]>["horizons"]): string {
  const groups = new Map<string, { variable: string; horizon: string; counts: Record<ModelCountCoverageLevel, number> }>();
  for (const row of rows ?? []) {
    if (!row.coverageLevelCounts) continue;
    const horizon = row.horizonBucket ?? "échéance exacte";
    const key = `${row.variable}|${horizon}`;
    const group = groups.get(key) ?? {
      variable: VARIABLE_LABELS[row.variable] ?? row.variable,
      horizon,
      counts: { NONE: 0, SINGLE_MODEL: 0, LIMITED: 0, MODERATE: 0, BROAD: 0 },
    };
    for (const level of MODEL_COUNT_COVERAGE_LEVELS) {
      group.counts[level] += row.coverageLevelCounts[level] ?? 0;
    }
    groups.set(key, group);
  }

  const displayOrder: ModelCountCoverageLevel[] = ["BROAD", "MODERATE", "LIMITED", "SINGLE_MODEL", "NONE"];
  return Array.from(groups.values()).map(({ variable, horizon, counts }) => {
    const distribution = displayOrder.flatMap((level) => {
      const count = counts[level];
      if (count <= 0) return [];
      return [`${getModelCountCoverageLabel(level)} sur ${count} échéance${count === 1 ? "" : "s"}`];
    });
    return `${variable} (${horizon}) : ${distribution.join(", ")}`;
  }).join("; ");
}

export function HourlyWeightingNotice({ weighting }: HourlyWeightingNoticeProps) {
  if (!weighting) return null;

  const minimumComparisons = weighting.minimumComparisons ?? 30;
  const minimumDays = weighting.minimumComparableDays ?? 7;
  const calibrated = formatGroups(weighting.horizons, "CALIBRATED");
  const partiallyCalibrated = formatGroups(weighting.horizons, "PARTIALLY_CALIBRATED");
  const robust = formatGroups(weighting.horizons, "UNCALIBRATED_ROBUST");
  const unavailable = formatUnavailableDetails(weighting.horizons);
  const coverageDistribution = formatCoverageLevelDistribution(weighting.horizons);
  const modelsWithData = Array.from(new Set([
    ...(weighting.modelsWithData ?? []),
    ...(weighting.horizons ?? []).flatMap((row) => row.modelNamesWithData),
  ]));
  const modelsLabel = modelsWithData.length > 0 ? modelsWithData.join(", ") : "aucun modèle";
  const hasInsufficientHistory = (weighting.horizons ?? []).some((row) =>
    row.unavailableReason === "insufficient_historical_evidence"
      || row.calibrationStatus === "PARTIALLY_CALIBRATED"
      || row.calibrationStatus === "UNCALIBRATED_ROBUST",
  );
  const evidenceLabel = weighting.historyStatus === "unavailable"
    ? "L’historique de calibration n’est pas disponible."
    : hasInsufficientHistory
      ? `L’historique comparable n’atteint pas toujours le seuil de ${minimumComparisons} comparaisons sur ${minimumDays} jours.`
      : `Les preuves historiques qualifiées sont propres à la variable et à l’horizon (seuil : ${minimumComparisons} comparaisons sur ${minimumDays} jours).`;
  const availabilityMessage = "La disponibilité physique est évaluée séparément de la fiabilité : une absence normale hors portée du modèle n’est ni une erreur ni un échec de score, et n’entre pas dans les dénominateurs de classement.";

  return (
    <div role="note" className="rounded-lg border border-sky-200/10 bg-sky-200/[0.035] px-2.5 py-2 text-[10px] leading-relaxed text-slate-400">
      {weighting.manualOverride && <p className="mb-1 rounded-md border border-amber-200/20 bg-amber-200/[0.05] px-2 py-1 text-amber-100"><span className="font-semibold">Override horaire manuel explicite appliqué.</span> {weighting.manualOverride.reason} Série officielle d’origine conservée ({weighting.manualOverride.officialOriginalPointCount} échéances; calcul officiel du {weighting.manualOverride.officialOriginalComputedAt}).</p>}
      {coverageDistribution && <div className="mb-1 rounded-md border border-sky-200/10 bg-black/10 px-2 py-1">
        <p><span className="font-semibold text-sky-100">Niveau de couverture/confiance indicatif selon le nombre réel de contributeurs, par variable et horizon :</span> {coverageDistribution}.</p>
        <p>Ces catégories décrivent uniquement le nombre de modèles : elles ne sont ni une probabilité ni une confiance statistiquement calibrée. Le statut de calibration historique (`CALIBRATED`, `PARTIALLY_CALIBRATED`, `UNCALIBRATED_ROBUST`) est distinct et affiché séparément ci-dessous.</p>
      </div>}
      {weighting.status === "unavailable" ? (
        <>
          <p><span className="font-semibold text-amber-100">Prévision officielle horaire indisponible : aucun modèle admissible n’a fourni de valeur.</span> {availabilityMessage} {evidenceLabel} Modèles avec données : {modelsLabel}. Best Match est exclu.</p>
          {unavailable && <p className="mt-1">Détail : {unavailable}.</p>}
        </>
      ) : weighting.status === "single_model" ? (
        <>
          <p><span className="font-semibold text-sky-100">Prévision d’un modèle unique, pas une fusion multimodèle.</span> {modelsLabel}. Disponibilité et calibration sont distinctes; {evidenceLabel} {availabilityMessage} Best Match est exclu.</p>
          {calibrated && <p className="mt-1">Calibration qualifiée : {calibrated}.</p>}
          {robust && <p className="mt-1">Valeur conservée avec repli robuste non calibré : {robust}.</p>}
        </>
      ) : weighting.status === "robust_fallback" ? (
        <>
          <p><span className="font-semibold text-amber-100">Fusion des seuls modèles réellement disponibles, pondération robuste non calibrée.</span> Les valeurs restent visibles même sans historique suffisant; ce statut ne prétend pas être une confiance probabiliste. {evidenceLabel} {availabilityMessage} Modèles contributeurs potentiels : {modelsLabel}. Best Match est exclu.</p>
          {robust && <p className="mt-1">Repli robuste : {robust}.</p>}
        </>
      ) : weighting.status === "mixed" ? (
        <>
          <p><span className="font-semibold text-sky-100">Fusion disponible, calibration partielle selon le modèle, la variable et l’horizon.</span> Les autres valeurs exploitables restent incluses avec un repli robuste, et non transformées en absence de prévision. {evidenceLabel} {availabilityMessage} Modèles avec données : {modelsLabel}. Best Match est exclu.</p>
          {calibrated && <p className="mt-1">Calibrées : {calibrated}.</p>}
          {partiallyCalibrated && <p className="mt-1">Partiellement calibrées : {partiallyCalibrated}.</p>}
          {robust && <p className="mt-1">Robustes non calibrées : {robust}.</p>}
        </>
      ) : (
        <>
          <p><span className="font-semibold text-emerald-100">Pondération historique qualifiée.</span> {evidenceLabel} {availabilityMessage} Modèles avec données : {modelsLabel}. Best Match est exclu.</p>
          {calibrated && <p className="mt-1">Calibration qualifiée : {calibrated}.</p>}
        </>
      )}
      {unavailable && weighting.status !== "unavailable" && <p className="mt-1">Champs sans valeur disponible : {unavailable}.</p>}
    </div>
  );
}
