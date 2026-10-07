import { trpc } from "@/lib/trpc";

type Location = { lat: number; lon: number } | undefined;
type DiagnosticCountKey =
  | "archivedForecasts"
  | "opportunitiesAtSameLocationAndValidTime"
  | "qualifiedPhysicalObservationsPresent"
  | "temporallyAdmissible"
  | "admissiblePairs"
  | "retainedComparisons";

const PATHS = [
  {
    key: "ordinary_hourly",
    label: "Prévisions horaires ordinaires",
    tone: "sky",
  },
  { key: "single_runs", label: "Cycles Single Runs", tone: "violet" },
] as const;

const FUNNEL_STAGES: Array<{ key: DiagnosticCountKey; label: string }> = [
  { key: "archivedForecasts", label: "Prévisions archivées" },
  {
    key: "opportunitiesAtSameLocationAndValidTime",
    label: "Même lieu et même heure valide",
  },
  {
    key: "qualifiedPhysicalObservationsPresent",
    label: "Observation physique qualifiée",
  },
  { key: "temporallyAdmissible", label: "Admissibles dans le temps" },
  { key: "admissiblePairs", label: "Paires comparables" },
  { key: "retainedComparisons", label: "Retenues par le scoreur" },
];

const VARIABLE_LABELS: Record<string, string> = {
  temperature: "Température",
  precipitation: "Précipitations",
  wind_speed: "Vitesse du vent",
  wind_gust: "Rafales",
  humidity: "Humidité",
  pressure: "Pression",
};

const REJECTION_LABELS: Record<string, string> = {
  FORECAST_METADATA_INVALID: "Métadonnées de prévision invalides",
  FORECAST_REPLAY_OR_CONFLICTING_DUPLICATE: "Rejeu ou doublon contradictoire",
  NO_MATCHING_LOCATION_VALID_TIME_OBSERVATION:
    "Aucune observation au même lieu et à la même heure",
  NO_QUALIFIED_PHYSICAL_OBSERVATION: "Aucune observation physique qualifiée",
  FORECAST_AVAILABLE_AT_OR_AFTER_VALID_TIME:
    "Prévision reçue après l’heure valide",
  FORECAST_AVAILABLE_AT_OR_AFTER_MEASUREMENT_TIME:
    "Prévision reçue après la mesure",
  FORECAST_VALUE_MISSING_OR_NONFINITE:
    "Valeur de prévision absente ou non finie",
  SUPERSEDED_BY_LATER_ADMISSIBLE_FORECAST:
    "Remplacée par une prévision admissible plus récente",
  AMBIGUOUS_ADMISSIBLE_FORECAST_TIE: "Égalité admissible ambiguë",
  FORECAST_OUTSIDE_SCORING_HORIZON: "Hors de l’horizon de score",
  NOT_RETAINED_BY_CURRENT_SCORER: "Non retenue par le scoreur actuel",
};

function buildCommitLabel() {
  const value =
    typeof __BUILD_COMMIT_SHA__ === "string" ? __BUILD_COMMIT_SHA__ : "unknown";
  return /^[a-f\d]{7,40}$/i.test(value) ? value.slice(0, 12) : "inconnu";
}

function formatVariable(variable: string) {
  return VARIABLE_LABELS[variable] ?? variable.replaceAll("_", " ");
}

export function HourlyComparisonDiagnosticsPanel({
  location,
}: {
  location: Location;
}) {
  const {
    data: snapshot,
    isLoading,
    error,
  } = trpc.weather.getHourlyComparisonDiagnostics.useQuery(location, {
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const commitSha = buildCommitLabel();
  const capturedAt = snapshot?.capturedAt
    ? new Date(String(snapshot.capturedAt))
    : null;
  const capturedAtLabel =
    capturedAt && Number.isFinite(capturedAt.getTime())
      ? capturedAt.toLocaleString("fr-FR", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Europe/Paris",
        })
      : "heure inconnue";

  return (
    <section
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.035] p-4"
      aria-labelledby="hourly-comparison-diagnostics-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-200/75">
            Validation horaire · diagnostic
          </p>
          <h2
            id="hourly-comparison-diagnostics-title"
            className="text-sm font-semibold text-slate-100"
          >
            Entonnoir des comparaisons par variable
          </h2>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
            Lecture du dernier instantané planifié. Cette vue ne lance aucune
            collecte ni aucun recalcul.
          </p>
        </div>
        <p className="rounded-lg border border-white/10 bg-slate-950/30 px-2 py-1 text-[9px] text-slate-400">
          SHA du build ·{" "}
          <code className="font-mono text-slate-200">{commitSha}</code>
        </p>
      </div>

      {isLoading ? (
        <p role="status" className="mt-3 text-[11px] text-slate-400">
          Lecture du dernier cycle…
        </p>
      ) : error ? (
        <p role="status" className="mt-3 text-[11px] text-amber-100">
          Le dernier instantané de diagnostics est momentanément indisponible.
        </p>
      ) : !snapshot ? (
        <p className="mt-3 rounded-xl border border-white/10 bg-slate-950/25 p-3 text-[11px] leading-relaxed text-slate-400">
          Aucun cycle de comparaison horaire archivé pour ce lieu. Le panneau
          attend le prochain traitement planifié et ne le déclenche pas.
        </p>
      ) : (
        <>
          <p className="mt-3 text-[10px] text-slate-400">
            Date évaluée ·{" "}
            <span className="font-medium text-slate-200">
              {snapshot.cycleDate}
            </span>
            <span className="px-1.5 text-slate-600">·</span>Instantané ·{" "}
            <span className="font-medium text-slate-200">
              {capturedAtLabel}
            </span>
          </p>
          <div className="mt-3 space-y-3">
            {PATHS.map(path => {
              const pathDiagnostics = snapshot.diagnostics.filter(
                diagnostic => diagnostic.path === path.key
              );
              if (pathDiagnostics.length === 0) return null;
              const barColor =
                path.tone === "sky" ? "bg-sky-300/75" : "bg-violet-300/75";
              return (
                <section
                  key={path.key}
                  className="rounded-xl border border-white/10 bg-slate-950/25 p-3"
                  aria-label={path.label}
                >
                  <h3
                    className={`text-[11px] font-semibold ${path.tone === "sky" ? "text-sky-100" : "text-violet-100"}`}
                  >
                    {path.label}
                  </h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {pathDiagnostics.map(diagnostic => {
                      const denominator = Math.max(
                        0,
                        diagnostic.archivedForecasts
                      );
                      const rejectionEntries = Object.entries(
                        diagnostic.firstRejectionCounts ?? {}
                      )
                        .filter(([, count]) => Number(count) > 0)
                        .sort(([left], [right]) => left.localeCompare(right));
                      return (
                        <article
                          key={`${path.key}-${diagnostic.variable}`}
                          className="rounded-lg border border-white/10 bg-black/15 p-2.5"
                        >
                          <h4 className="text-[10px] font-semibold text-slate-100">
                            {formatVariable(diagnostic.variable)}
                          </h4>
                          <ol
                            className="mt-2 space-y-1.5"
                            aria-label={`Étapes de l’entonnoir · ${formatVariable(diagnostic.variable)}`}
                          >
                            {FUNNEL_STAGES.map(stage => {
                              const count = diagnostic[stage.key];
                              const width =
                                denominator > 0
                                  ? Math.min(
                                      100,
                                      Math.max(0, (count / denominator) * 100)
                                    )
                                  : 0;
                              return (
                                <li key={stage.key}>
                                  <div className="flex items-start justify-between gap-2 text-[9px] leading-snug">
                                    <span className="text-slate-400">
                                      {stage.label}
                                    </span>
                                    <span className="shrink-0 font-semibold tabular-nums text-slate-100">
                                      {count}
                                    </span>
                                  </div>
                                  <div
                                    className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800"
                                    aria-hidden="true"
                                  >
                                    <div
                                      className={`h-full rounded-full ${barColor}`}
                                      style={{ width: `${width}%` }}
                                    />
                                  </div>
                                </li>
                              );
                            })}
                          </ol>
                          <div className="mt-2 border-t border-white/10 pt-2">
                            <p className="text-[9px] font-semibold text-slate-300">
                              Premiers motifs de rejet
                            </p>
                            {rejectionEntries.length > 0 ? (
                              <ul className="mt-1 space-y-0.5 text-[9px] leading-relaxed text-amber-100">
                                {rejectionEntries.map(([reason, count]) => (
                                  <li
                                    key={reason}
                                    className="flex justify-between gap-2"
                                  >
                                    <span>
                                      {REJECTION_LABELS[reason] ??
                                        reason.replaceAll("_", " ")}
                                    </span>
                                    <span className="shrink-0 font-semibold tabular-nums">
                                      {count}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-1 text-[9px] text-slate-500">
                                Aucun rejet comptabilisé.
                              </p>
                            )}
                          </div>
                          <p className="mt-2 text-[8px] leading-relaxed text-slate-500">
                            Règle temporelle · {diagnostic.temporalRule}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
