export type ForecastModelCandidate<T> = {
  modelName: string;
  modelId: string | null;
  sourceName: string | null;
  runId: string | null;
  runIdKind?: "capture" | "provider" | "unknown";
  requestStartedAt?: number | null;
  availableAt: number | null;
  validTime: number | null;
  value: unknown;
  qualityStatus?: "qualified" | "rejected" | "unknown";
  qualityReason?: string;
  metadata: T;
};

export type SelectedForecastModel<T> = ForecastModelCandidate<T> & {
  value: number;
  horizonMinutes: number;
  horizonBucket: string | null;
};

export type ForecastModelEligibilityDiagnostic = {
  modelName: string;
  variable: string;
  eligible: boolean;
  reason: string | null;
  sourceName: string | null;
  modelId: string | null;
  runId: string | null;
  availableAt: number | null;
  validTime: number | null;
  horizonMinutes: number | null;
  horizonBucket: string | null;
};

export type SelectEligibleModelsForHorizonOptions = {
  expectedModelNames: readonly string[];
  variable: string;
  validTime: number;
  referenceAt: number;
  horizonBucketForMinutes: (horizonMinutes: number) => string | null;
  /** A positive lead time may still be forecastable even when no historical bucket exists. */
  allowUnscoredHorizons?: boolean;
  missingReasonByModel?: Readonly<Record<string, string>>;
};

/**
 * Availability-first selection shared by the official daily and hourly engines.
 * Missing observations are not interpreted as dry/zero values and a request start
 * is never substituted for a model's actual availableAt timestamp.
 */
export function selectEligibleModelsForHorizon<T>(
  candidates: readonly ForecastModelCandidate<T>[],
  options: SelectEligibleModelsForHorizonOptions,
): {
  eligible: SelectedForecastModel<T>[];
  diagnostics: ForecastModelEligibilityDiagnostic[];
} {
  const byModel = new Map<string, ForecastModelCandidate<T>[]>();
  for (const candidate of candidates) {
    const group = byModel.get(candidate.modelName) ?? [];
    group.push(candidate);
    byModel.set(candidate.modelName, group);
  }

  const eligible: SelectedForecastModel<T>[] = [];
  const diagnostics: ForecastModelEligibilityDiagnostic[] = [];

  for (const modelName of options.expectedModelNames) {
    const exactCandidates = (byModel.get(modelName) ?? [])
      .filter((candidate) => candidate.validTime === options.validTime)
      .sort((left, right) => (right.availableAt ?? Number.NEGATIVE_INFINITY) - (left.availableAt ?? Number.NEGATIVE_INFINITY)
        || (right.requestStartedAt ?? Number.NEGATIVE_INFINITY) - (left.requestStartedAt ?? Number.NEGATIVE_INFINITY)
        || String(right.runId ?? "").localeCompare(String(left.runId ?? "")));

    if (exactCandidates.length === 0) {
      const reason = byModel.has(modelName)
        ? "Aucun run ne correspond exactement à validTime pour cette échéance."
        : options.missingReasonByModel?.[modelName] ?? "Aucun run de ce modèle n’a été reçu pour cette échéance.";
      diagnostics.push({ modelName, variable: options.variable, eligible: false, reason, sourceName: null, modelId: null, runId: null, availableAt: null, validTime: null, horizonMinutes: null, horizonBucket: null });
      continue;
    }

    let selected: SelectedForecastModel<T> | null = null;
    let lastDiagnostic: ForecastModelEligibilityDiagnostic | null = null;
    for (const candidate of exactCandidates) {
      const base = {
        modelName,
        variable: options.variable,
        sourceName: candidate.sourceName,
        modelId: candidate.modelId,
        runId: candidate.runId,
        availableAt: candidate.availableAt,
        validTime: candidate.validTime,
      };
      let reason: string | null = null;
      if (candidate.qualityStatus === "rejected") reason = candidate.qualityReason ?? "La valeur a été rejetée par le contrôle qualité de sa source.";
      else if (typeof candidate.value !== "number" || !Number.isFinite(candidate.value)) reason = "Aucune valeur finie disponible pour cette variable dans ce run.";
      else if (candidate.availableAt == null || !Number.isFinite(candidate.availableAt)) reason = "availableAt absent ou invalide; aucun horodatage de requête ne lui est substitué.";
      else if (!Number.isFinite(options.referenceAt) || candidate.availableAt > options.referenceAt) reason = "Le run n’était pas encore disponible à l’instant de référence de la fusion.";
      else {
        const horizonMinutes = (options.validTime - candidate.availableAt) / 60_000;
        if (!Number.isFinite(horizonMinutes) || horizonMinutes <= 0) reason = "validTime n’est pas postérieur à availableAt : la valeur ne constitue pas une prévision pour cette échéance.";
        else {
          const horizonBucket = options.horizonBucketForMinutes(horizonMinutes);
          if (horizonBucket == null && !options.allowUnscoredHorizons) reason = "Horizon non classé; aucune preuve d’une autre échéance n’est réutilisée.";
          else {
            selected = { ...candidate, value: candidate.value, horizonMinutes, horizonBucket };
            break;
          }
        }
      }
      const horizonMinutes = candidate.availableAt != null && Number.isFinite(candidate.availableAt)
        ? (options.validTime - candidate.availableAt) / 60_000
        : null;
      lastDiagnostic = {
        ...base,
        eligible: false,
        reason,
        horizonMinutes,
        horizonBucket: horizonMinutes != null && horizonMinutes > 0 ? options.horizonBucketForMinutes(horizonMinutes) : null,
      };
    }

    if (selected) {
      eligible.push(selected);
      diagnostics.push({
        modelName,
        variable: options.variable,
        eligible: true,
        reason: null,
        sourceName: selected.sourceName,
        modelId: selected.modelId,
        runId: selected.runId,
        availableAt: selected.availableAt,
        validTime: selected.validTime,
        horizonMinutes: selected.horizonMinutes,
        horizonBucket: selected.horizonBucket,
      });
    } else {
      diagnostics.push(lastDiagnostic ?? {
        modelName,
        variable: options.variable,
        eligible: false,
        reason: "Aucun run admissible n’a été trouvé pour ce modèle, cette variable et cette échéance.",
        sourceName: null,
        modelId: null,
        runId: null,
        availableAt: null,
        validTime: options.validTime,
        horizonMinutes: null,
        horizonBucket: null,
      });
    }
  }

  return { eligible, diagnostics };
}
