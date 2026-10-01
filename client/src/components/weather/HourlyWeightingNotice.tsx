import React from "react";

type HourlyWeightingNoticeProps = {
  weighting?: {
    status?: "historical_skill" | "mixed" | "unavailable";
    historyStatus?: "available" | "unavailable";
    minimumComparisons?: number;
    minimumComparableDays?: number;
    bestMatchIncluded?: false;
    modelsWithData?: readonly string[];
    horizons?: readonly {
      variable: string;
      horizonBucket: string | null;
      method: "historical_skill" | "unavailable";
      unavailableReason: string | null;
      modelNamesWithData: readonly string[];
      hourCount: number;
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
  horizon_not_scored: "échéance non classée",
  incomparable_horizons: "horizons des modèles incompatibles",
  no_model_data: "aucune donnée modèle pour cette variable",
};

function formatGroups(
  rows: NonNullable<HourlyWeightingNoticeProps["weighting"]>["horizons"],
  method: "historical_skill" | "unavailable",
): string {
  const groups = new Map<string, Set<string>>();
  for (const row of rows ?? []) {
    if (row.method !== method) continue;
    const label = VARIABLE_LABELS[row.variable] ?? row.variable;
    const horizons = groups.get(label) ?? new Set<string>();
    horizons.add(row.horizonBucket ?? "échéance non classée");
    groups.set(label, horizons);
  }
  return Array.from(groups, ([variable, horizons]) => `${variable} (${Array.from(horizons).join(", ")})`).join("; ");
}

function formatUnavailableDetails(rows: NonNullable<HourlyWeightingNoticeProps["weighting"]>["horizons"]): string {
  const groups = new Map<string, Set<string>>();
  for (const row of rows ?? []) {
    if (row.method !== "unavailable") continue;
    const reason = REASON_LABELS[row.unavailableReason ?? ""] ?? "calibration indisponible";
    const variable = VARIABLE_LABELS[row.variable] ?? row.variable;
    const item = `${variable} (${row.horizonBucket ?? "échéance non classée"})`;
    const variables = groups.get(reason) ?? new Set<string>();
    variables.add(item);
    groups.set(reason, variables);
  }
  return Array.from(groups, ([reason, variables]) => `${reason} : ${Array.from(variables).join(", ")}`).join("; ");
}

export function HourlyWeightingNotice({ weighting }: HourlyWeightingNoticeProps) {
  if (!weighting) return null;

  const minimumComparisons = weighting.minimumComparisons ?? 30;
  const minimumDays = weighting.minimumComparableDays ?? 7;
  const available = formatGroups(weighting.horizons, "historical_skill");
  const unavailable = formatUnavailableDetails(weighting.horizons);
  const modelsWithData = Array.from(new Set([
    ...(weighting.modelsWithData ?? []),
    ...(weighting.horizons ?? []).flatMap((row) => row.modelNamesWithData),
  ]));
  const modelsLabel = modelsWithData.length > 0 ? modelsWithData.join(", ") : "aucun modèle";
  const hasInsufficientHistory = (weighting.horizons ?? []).some((row) => row.unavailableReason === "insufficient_historical_evidence");
  const evidenceLabel = weighting.historyStatus === "unavailable"
    ? "L’historique de calibration n’est pas disponible."
    : hasInsufficientHistory
      ? `L’historique comparable est insuffisant sous le seuil de ${minimumComparisons} comparaisons sur ${minimumDays} jours.`
      : "Les valeurs sans données comparables restent indisponibles.";

  return (
    <div role="note" className="rounded-lg border border-sky-200/10 bg-sky-200/[0.035] px-2.5 py-2 text-[10px] leading-relaxed text-slate-400">
      {weighting.status === "unavailable" ? (
        <>
          <p><span className="font-semibold text-amber-100">Prévision officielle horaire indisponible.</span> {evidenceLabel} Aucune valeur non calibrée ni pondération égale n’est utilisée. Modèles avec données : {modelsLabel}. Best Match est exclu.</p>
          {unavailable && <p className="mt-1">Détail : {unavailable}.</p>}
        </>
      ) : weighting.status === "mixed" ? (
        <>
          <p><span className="font-semibold text-sky-100">Seules les valeurs appuyées par une calibration historique comparable sont présentées comme prévisions officielles.</span> {evidenceLabel} Les autres restent indisponibles; aucune moyenne de secours n’est calculée. Modèles avec données : {modelsLabel}. Best Match est exclu.</p>
          {available && <p className="mt-1">Calibrées : {available}.</p>}
          {unavailable && <p className="mt-1">Indisponibles : {unavailable}.</p>}
        </>
      ) : (
        <p>Pondération horaire fondée sur les performances historiques comparables, par variable et échéance (seuil : {minimumComparisons} comparaisons sur {minimumDays} jours). Modèles avec données : {modelsLabel}. Les champs sans historique qualifié restent indisponibles; Best Match est exclu.</p>
      )}
    </div>
  );
}
