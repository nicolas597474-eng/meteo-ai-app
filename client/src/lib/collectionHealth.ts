export type CollectionHealthStatus = "up_to_date" | "partial" | "late" | "technical_error";

export type CollectionHealth = {
  status: CollectionHealthStatus;
  label: "À jour" | "Partiel" | "En retard" | "Erreur technique";
  detail: string;
  tone: string;
  dot: string;
};

export type CollectionHealthInput = {
  lastRunStatus?: "completed" | "failed" | "partial" | null;
  lastSuccessAt?: string | Date | null;
  partial?: boolean;
  now?: Date;
  staleAfterMs?: number;
};

const HEALTHY_TONE = "border-emerald-300/35 bg-emerald-400/15 text-emerald-50";
const PARTIAL_TONE = "border-amber-300/35 bg-amber-400/15 text-amber-50";
const LATE_TONE = "border-orange-300/35 bg-orange-400/15 text-orange-50";
const ERROR_TONE = "border-red-300/35 bg-red-400/15 text-red-50";

export function getCollectionHealth({
  lastRunStatus,
  lastSuccessAt,
  partial = false,
  now = new Date(),
  staleAfterMs = 26 * 60 * 60 * 1000,
}: CollectionHealthInput): CollectionHealth {
  if (lastRunStatus === "failed") {
    return { status: "technical_error", label: "Erreur technique", detail: "Le dernier passage interne a échoué", tone: ERROR_TONE, dot: "bg-red-300" };
  }

  if (partial || lastRunStatus === "partial") {
    return { status: "partial", label: "Partiel", detail: "Le passage est terminé avec des modèles indisponibles", tone: PARTIAL_TONE, dot: "bg-amber-300" };
  }

  if (!lastSuccessAt) {
    return { status: "late", label: "En retard", detail: "Aucun succès récent n’est disponible", tone: LATE_TONE, dot: "bg-orange-300" };
  }

  const successTimestamp = new Date(lastSuccessAt).getTime();
  if (!Number.isFinite(successTimestamp) || now.getTime() - successTimestamp > staleAfterMs) {
    return { status: "late", label: "En retard", detail: "Le dernier succès dépasse le délai attendu", tone: LATE_TONE, dot: "bg-orange-300" };
  }

  return { status: "up_to_date", label: "À jour", detail: "Le dernier passage interne est récent", tone: HEALTHY_TONE, dot: "bg-emerald-300" };
}

export function formatCollectionDuration(durationMs: number | null | undefined): string {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return "Non mesurée";
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  const seconds = durationMs / 1_000;
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} s`;
}
