type TraceSource = {
  name: string;
  type?: string;
  finalWeight: number;
};

type ForecastTrace = {
  parameterSources?: {
    temperature?: TraceSource[];
    precipitation?: TraceSource[];
    wind?: TraceSource[];
  };
};

export type AppliedModelWeight = {
  name: string;
  temperature: number | null;
  precipitation: number | null;
  wind: number | null;
  averageWeight: number;
};

/** Extrait seulement les modèles effectivement contributeurs de la trace finale. */
export function buildAppliedModelWeights(trace: ForecastTrace | null): AppliedModelWeight[] {
  if (!trace?.parameterSources) return [];
  const byName = new Map<string, Omit<AppliedModelWeight, "name" | "averageWeight">>();
  const register = (parameter: "temperature" | "precipitation" | "wind", sources: TraceSource[] | undefined) => {
    for (const source of sources ?? []) {
      if (source.type !== "model" || !Number.isFinite(source.finalWeight) || source.finalWeight <= 0) continue;
      const model = byName.get(source.name) ?? { temperature: null, precipitation: null, wind: null };
      model[parameter] = source.finalWeight;
      byName.set(source.name, model);
    }
  };

  register("temperature", trace.parameterSources.temperature);
  register("precipitation", trace.parameterSources.precipitation);
  register("wind", trace.parameterSources.wind);

  return Array.from(byName.entries())
    .map(([name, weights]) => {
      const available = [weights.temperature, weights.precipitation, weights.wind].filter((value): value is number => value !== null);
      return { name, ...weights, averageWeight: available.reduce((total, value) => total + value, 0) / available.length };
    })
    .sort((left, right) => right.averageWeight - left.averageWeight || left.name.localeCompare(right.name));
}
