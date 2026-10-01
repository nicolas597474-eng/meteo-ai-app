type HourlyWeightingNoticeProps = {
  weighting?: {
    status?: "historical_skill" | "equal_fallback" | "mixed" | "unavailable";
    historyStatus?: "available" | "unavailable";
    minimumComparisons?: number;
    minimumComparableDays?: number;
    bestMatchIncluded?: false;
  } | null;
};

export function HourlyWeightingNotice({ weighting }: HourlyWeightingNoticeProps) {
  if (!weighting || weighting.status === "unavailable") return null;

  const minimumComparisons = weighting.minimumComparisons ?? 30;
  const minimumDays = weighting.minimumComparableDays ?? 7;
  const message = weighting.status === "historical_skill"
    ? `Pondération horaire fondée sur les erreurs historiques par échéance; seules les séries reçues contribuent (seuil : ${minimumComparisons} comparaisons sur ${minimumDays} jours). Signal passé, sans garantie future. Best Match est exclu.`
    : weighting.status === "mixed"
      ? `Poids historiques appliqués uniquement aux échéances assez documentées; repli égal ailleurs. Seules les séries reçues contribuent. Seuil : ${minimumComparisons} comparaisons sur ${minimumDays} jours; Best Match est exclu.`
      : weighting.historyStatus === "unavailable"
        ? "Repli égalitaire provisoire entre les séries reçues parmi les sept modèles attendus : historique de performance indisponible. Aucun avantage historique n’est supposé; Best Match est exclu."
        : "Repli égalitaire provisoire entre les séries reçues parmi les sept modèles attendus : les comparaisons historiques par échéance sont insuffisantes pour les différencier. Aucun avantage de fiabilité n’est supposé; Best Match est exclu.";

  return (
    <p role="note" className="rounded-lg border border-sky-200/10 bg-sky-200/[0.035] px-2.5 py-2 text-[10px] leading-relaxed text-slate-400">
      {message}
    </p>
  );
}
