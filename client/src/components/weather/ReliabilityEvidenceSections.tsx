import {
  Activity,
  Check,
  CloudRain,
  Database,
  Droplets,
  Gauge,
  Thermometer,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { MeteoSurface } from "@/components/weather/MeteoSurface";
import {
  WeatherStatusBadge,
  type WeatherStatusBadgeTone,
} from "@/components/weather/WeatherStatusBadge";

export type ReliabilityMetricValues = {
  mae: number;
  rmse: number;
  bias: number;
  comparisonCount: number;
  evaluatedDays: number;
};
export type ReliabilityMetricRow = {
  modelName: string;
  modelId: string;
  variable: string;
  variableLabel: string;
  unit: string;
  horizonId: string;
  status: string;
  reason: string | null;
  metrics: ReliabilityMetricValues | null;
  rawMetrics: ReliabilityMetricValues | null;
  minimumComparisons: number;
  minimumComparableDays: number;
  firstScoreDate: string | null;
  latestScoreDate: string | null;
  latestComputedAt: string | null;
  incompleteMetricRows: number;
  legacyUnversionedRowCount: number;
  trend: any;
};
export type VerificationPair = {
  serviceName: string;
  modelId: string;
  variable: string;
  horizonBucket: string;
  forecastValue: number;
  observedValue: number;
  signedError: number;
  validDate: string;
  forecastIssuedAt: number;
  stationEvidence: Array<{ stationId: string; stationName: string }>;
};

type VariableConfig = {
  id: string;
  label: string;
  unit: string;
  icon: LucideIcon;
  accent: string;
  track: string;
};

export const VARIABLES: VariableConfig[] = [
  {
    id: "temperature",
    label: "Température",
    unit: "°C",
    icon: Thermometer,
    accent: "text-orange-200",
    track: "bg-orange-300",
  },
  {
    id: "precipitation",
    label: "Précipitations",
    unit: "mm",
    icon: CloudRain,
    accent: "text-sky-200",
    track: "bg-sky-300",
  },
  {
    id: "wind_speed",
    label: "Vent moyen",
    unit: "km/h",
    icon: Wind,
    accent: "text-cyan-200",
    track: "bg-cyan-300",
  },
  {
    id: "wind_gust",
    label: "Rafales",
    unit: "km/h",
    icon: Activity,
    accent: "text-violet-200",
    track: "bg-violet-300",
  },
  {
    id: "humidity",
    label: "Humidité",
    unit: "%",
    icon: Droplets,
    accent: "text-blue-200",
    track: "bg-blue-300",
  },
  {
    id: "pressure",
    label: "Pression",
    unit: "hPa",
    icon: Gauge,
    accent: "text-amber-200",
    track: "bg-amber-300",
  },
];

export function metric(
  value: number | null | undefined,
  unit = "",
  digits = 2
) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

export function signedMetric(
  value: number | null | undefined,
  unit = "",
  digits = 2
) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

export function statusLabel(status: string) {
  switch (status) {
    case "qualified":
      return "Seuil d’évidence atteint";
    case "insufficient_evidence":
      return "Données insuffisantes";
    case "incomplete_metrics":
      return "Métriques incomplètes";
    case "legacy_unversioned_only":
      return "Brut non validé · hors preuves";
    case "history_unavailable":
      return "Historique indisponible";
    case "horizon_not_stored":
      return "Horizon non archivé séparément";
    default:
      return "Aucune preuve archivée";
  }
}

export function statusTone(status: string): WeatherStatusBadgeTone {
  if (status === "qualified") return "success";
  if (
    [
      "insufficient_evidence",
      "incomplete_metrics",
      "legacy_unversioned_only",
    ].includes(status)
  )
    return "warning";
  if (status === "history_unavailable") return "danger";
  return "neutral";
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("fr-FR", {
        timeZone: "Europe/Paris",
        day: "numeric",
        month: "short",
      })
    : "—";
}

export function formatTimestamp(value: string | null | undefined) {
  if (!value) return "horodatage indisponible";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "horodatage indisponible";
}

export type NoteComparisonPoint = {
  stationTemperature: number | null;
  officialTemperature: number | null;
};

export function meanAbsoluteDeltaC(points: readonly NoteComparisonPoint[]): number | null {
  const deltas = points.flatMap((point) => {
    const stationTemperature = point.stationTemperature;
    const officialTemperature = point.officialTemperature;
    if (typeof stationTemperature !== "number" || !Number.isFinite(stationTemperature)
      || typeof officialTemperature !== "number" || !Number.isFinite(officialTemperature)) return [];
    return [Math.abs(stationTemperature - officialTemperature)];
  });
  if (deltas.length === 0) return null;
  return deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length;
}

function noteFromMeanAbsoluteError(mae: number | null): number | null {
  if (mae == null || !Number.isFinite(mae)) return null;
  return Math.max(0, Math.min(10, Math.round((10 - 2 * mae) * 10) / 10));
}

function noteLabel(note: number | null): string {
  if (note == null) return "Non disponible";
  if (note >= 7.5) return "Fiable";
  if (note >= 5) return "Correct";
  if (note >= 3) return "Moyen";
  return "Peu fiable";
}

function noteToneClass(note: number | null): string {
  if (note == null) return "text-slate-400";
  if (note >= 7.5) return "text-emerald-300";
  if (note >= 5) return "text-sky-300";
  if (note >= 3) return "text-amber-300";
  return "text-rose-300";
}

function formatNote(note: number | null): string {
  if (note == null) return "—";
  return note.toFixed(1).replace(".", ",");
}

export function ReliabilityNotesSummary({
  data,
  hourlyPoints,
  dailyPoints,
}: {
  data: any;
  hourlyPoints: NoteComparisonPoint[];
  dailyPoints: NoteComparisonPoint[];
}) {
  const available = data.evidence?.status === "available";
  const evidenceAvailable = available && data.selectedHorizon?.storageBucket != null;
  const dateRange =
    formatDate(data.period?.startDate) + " – " + formatDate(data.period?.endDate);
  const horizonLabel = data.selectedHorizon?.label ?? "non disponible";

  const isComplete = (point: NoteComparisonPoint) =>
    typeof point.stationTemperature === "number" && typeof point.officialTemperature === "number";
  const comparedHours = hourlyPoints.filter(isComplete).length;
  const comparedDays = dailyPoints.filter(isComplete).length;
  const hourlyMae = meanAbsoluteDeltaC(hourlyPoints);
  const dailyMae = meanAbsoluteDeltaC(dailyPoints);
  const hourlyNote = noteFromMeanAbsoluteError(hourlyMae);
  const dailyNote = noteFromMeanAbsoluteError(dailyMae);
  const knownNotes = [hourlyNote, dailyNote].filter((note): note is number => note != null);
  const globalNote =
    knownNotes.length > 0
      ? Math.round((knownNotes.reduce((sum, note) => sum + note, 0) / knownNotes.length) * 10) / 10
      : null;

  const headline =
    globalNote == null
      ? null
      : globalNote >= 7.5
        ? "Les prévisions restent fiables (" + formatNote(globalNote) + "/10) sur la fenêtre choisie."
        : globalNote >= 5
          ? "Les prévisions restent utilisables (" + formatNote(globalNote) + "/10), avec des ratés assez fréquents."
          : globalNote >= 3
            ? "Les prévisions sont moyennes (" + formatNote(globalNote) + "/10) : à considérer avec prudence."
            : "Les prévisions sont peu fiables (" + formatNote(globalNote) + "/10) actuellement.";
  const hourlySentence =
    hourlyMae == null
      ? null
      : "La température horaire s’écarte en moyenne de " + formatNote(hourlyMae) + " °C.";
  const comparisonSentence =
    hourlyNote == null || dailyNote == null
      ? null
      : dailyNote > hourlyNote
        ? "Le bulletin quotidien (min/max, cumul) est plus fiable que le détail heure par heure."
        : dailyNote < hourlyNote
          ? "Le détail heure par heure est plus fiable que le bulletin quotidien."
          : "Le bulletin quotidien et le détail heure par heure affichent la même fiabilité.";
  const narrative =
    globalNote == null
      ? "Aucune comparaison complète n’est encore disponible pour cette fenêtre. Aucune note n’est inventée : les notes apparaîtront avec les premières comparaisons station / prévision officielle archivées."
      : [headline, hourlySentence, comparisonSentence].filter(Boolean).join(" ");

  return (
    <MeteoSurface
      tone="lab"
      as="section"
      className="overflow-hidden rounded-[1.7rem] p-4 sm:p-5"
      aria-labelledby="reliability-notes-title"
    >
      <div className="grid items-center gap-5 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-8">
        <div className="order-1 flex justify-center">
          <div className="flex flex-col items-center rounded-2xl border border-sky-400/20 bg-slate-950/30 px-6 py-5 text-center">
            <p className="font-mono text-5xl font-semibold tracking-tight text-white">
              {formatNote(globalNote)}
              <span className="text-xl text-slate-400"> / 10</span>
            </p>
            <p className={"mt-2 text-sm font-semibold " + noteToneClass(globalNote)}>{noteLabel(globalNote)}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              Note globale · {horizonLabel} · Synthèse
            </p>
          </div>
        </div>
        <div className="order-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-sky-400/25 bg-sky-400/8 px-2.5 py-1 text-[10px] font-semibold text-sky-100">
              <Database className="mr-1 inline h-3 w-3" />
              {evidenceAvailable ? "Analyse archivée" : !available ? "Archive non lisible" : "Horizon non archivé"}
            </span>
            <span className="rounded-full border border-slate-700/80 bg-slate-950/30 px-2.5 py-1 text-[10px] text-slate-400">
              {dateRange} · Synthèse
            </span>
            <span className="rounded-full border border-slate-700/80 bg-slate-950/30 px-2.5 py-1 text-[10px] text-slate-400">
              {comparedHours} heure{comparedHours === 1 ? "" : "s"} · {comparedDays} jour{comparedDays === 1 ? "" : "s"}
            </span>
          </div>
          <h2 id="reliability-notes-title" className="mt-3 text-xl font-semibold tracking-tight text-white">
            Notes de fiabilité
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{narrative}</p>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <article className="rounded-xl border border-slate-700/65 bg-slate-950/30 px-3.5 py-3" aria-label="Note horaire">
              <p className="font-mono text-2xl font-semibold tabular-nums text-slate-100">
                {formatNote(hourlyNote)}
                <span className="text-xs text-slate-500"> / 10</span>
              </p>
              <p className={"mt-0.5 text-[11px] font-semibold " + noteToneClass(hourlyNote)}>{noteLabel(hourlyNote)}</p>
              <p className="mt-1 text-[10px] text-slate-500">Horaire · heure par heure</p>
            </article>
            <article className="rounded-xl border border-slate-700/65 bg-slate-950/30 px-3.5 py-3" aria-label="Note quotidienne">
              <p className="font-mono text-2xl font-semibold tabular-nums text-slate-100">
                {formatNote(dailyNote)}
                <span className="text-xs text-slate-500"> / 10</span>
              </p>
              <p className={"mt-0.5 text-[11px] font-semibold " + noteToneClass(dailyNote)}>{noteLabel(dailyNote)}</p>
              <p className="mt-1 text-[10px] text-slate-500">Quotidien · min/max, cumul</p>
            </article>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <WeatherStatusBadge
              compact
              tone={available ? "success" : "danger"}
              label="Archive horaire"
              value={available ? "Lisible" : "Indisponible"}
            />
            <span className="text-[10px] text-slate-500">
              {data.evidence?.expectedModelCount} modèles officiels · unité propre à chaque variable
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-[10px] leading-relaxed text-slate-500">
            Notes indicatives sur 10, déduites de l’écart moyen (°C) entre les stations physiques validées et la prévision officielle disponibles dans la fenêtre choisie. MAE, RMSE, biais, effectifs, dates et évolution par modèle × variable × horizon exact. Le biais signé est descriptif et n’est jamais appliqué aux prévisions officielles futures.
          </p>
          <p className="mt-2 max-w-3xl text-[10px] leading-relaxed text-slate-500">
            Best Match et les agrégateurs sont exclus. L’accord inter-modèles décrit une dispersion de prévisions et n’est pas une mesure de fiabilité.
          </p>
        </div>
      </div>
    </MeteoSurface>
  );
}
function VariableEvidenceCard({
  config,
  rows,
  expectedModelCount,
  horizonArchived,
  evidenceAvailable,
}: {
  config: VariableConfig;
  rows: ReliabilityMetricRow[];
  expectedModelCount: number;
  horizonArchived: boolean;
  evidenceAvailable: boolean;
}) {
  const qualified = rows.filter(
    row => row.status === "qualified" && row.metrics != null
  );
  const rawValues = rows
    .map(row => row.metrics ?? row.rawMetrics)
    .filter((value): value is ReliabilityMetricValues => value != null);
  const unvalidatedValues = rows
    .map(row => (row.metrics == null && row.rawMetrics != null ? row.rawMetrics : null))
    .filter((value): value is ReliabilityMetricValues => value != null);
  const hasRawUnvalidated = unvalidatedValues.length > 0;
  const maeValues = qualified.flatMap(row =>
    row.metrics ? [row.metrics.mae] : []
  );
  const rawMaeValues = rawValues.map(value => value.mae);
  const minimum = maeValues.length ? Math.min(...maeValues) : null;
  const maximum = maeValues.length ? Math.max(...maeValues) : null;
  const rawMinimum = rawMaeValues.length ? Math.min(...rawMaeValues) : null;
  const rawMaximum = rawMaeValues.length ? Math.max(...rawMaeValues) : null;
  const rawMaeRange =
    rawMinimum == null || rawMaximum == null
      ? "—"
      : Math.abs(rawMaximum - rawMinimum) < 0.05
        ? metric(rawMinimum, config.unit, 1)
        : `${metric(rawMinimum, config.unit, 1)} – ${metric(rawMaximum, config.unit, 1)}`;
  const progress =
    expectedModelCount > 0
      ? Math.min(100, (qualified.length / expectedModelCount) * 100)
      : 0;
  const maeRange =
    minimum == null || maximum == null
      ? "—"
      : Math.abs(maximum - minimum) < 0.05
        ? metric(minimum, config.unit, 1)
        : `${metric(minimum, config.unit, 1)} – ${metric(maximum, config.unit, 1)}`;
  const Icon = config.icon;
  return (
    <article className="min-w-0 rounded-2xl border border-slate-700/65 bg-slate-950/25 p-3.5 transition-colors hover:border-slate-600/80 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/8 bg-slate-900/70 ${config.accent}`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-100">
              {config.label}
            </h3>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {config.unit} · horizon exact
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-[9px] font-semibold tabular-nums text-slate-300">
          {evidenceAvailable
            ? `${qualified.length}/${expectedModelCount}`
            : "—"}
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            {qualified.length
              ? "Plage des MAE qualifiées"
              : hasRawUnvalidated
                ? "Plage des MAE brutes · non validées"
                : "Plage des MAE qualifiées"}
          </p>
          <p
            className={`mt-1 truncate text-lg font-semibold tabular-nums ${minimum == null && !hasRawUnvalidated ? "text-slate-500" : config.accent}`}
          >
            {hasRawUnvalidated && minimum == null ? rawMaeRange : maeRange}
          </p>
        </div>
        <p className="shrink-0 pb-0.5 text-right text-[9px] leading-relaxed text-slate-500">
          {evidenceAvailable ? (
            <>
              {rawValues.length} avec
              <br />
              donnée brute
            </>
          ) : (
            <>
              horizon non
              <br />
              archivé
            </>
          )}
        </p>
      </div>
      {evidenceAvailable ? (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"
          role="progressbar"
          aria-label={`${config.label} : ${qualified.length} modèle(s) qualifié(s) sur ${expectedModelCount}`}
          aria-valuemin={0}
          aria-valuemax={expectedModelCount}
          aria-valuenow={qualified.length}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${config.track}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
      <p className="mt-2 text-[9px] leading-relaxed text-slate-500">
        {!horizonArchived
          ? "Horizon non archivé séparément; aucune échéance voisine n’est utilisée comme substitut."
          : !evidenceAvailable
            ? "Archive historique indisponible; aucune métrique n’est estimée."
            : qualified.length
              ? "Étendue brute entre modèles qualifiés; ce n’est pas une moyenne."
              : hasRawUnvalidated
                ? "Aucune mesure ne franchit le seuil; les MAE brutes non validées restent affichées hors preuves et hors poids officiels."
                : "Aucune mesure ne franchit le seuil pour cette variable et cet horizon."}
      </p>
    </article>
  );
}

export function VariableEvidenceSection({
  rows,
  expectedModelCount,
  horizonArchived,
  evidenceAvailable,
}: {
  rows: ReliabilityMetricRow[];
  expectedModelCount: number;
  horizonArchived: boolean;
  evidenceAvailable: boolean;
}) {
  return (
    <section aria-labelledby="variable-evidence-title">
      <div className="mb-3 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">
          Mesures physiques
        </p>
        <h2
          id="variable-evidence-title"
          className="mt-1 text-lg font-semibold tracking-tight text-white"
        >
          Détail par variable
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          Chaque unité et chaque seuil restent distincts : les notes de synthèse ne les remplacent pas.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
        {VARIABLES.map(config => (
          <VariableEvidenceCard
            key={config.id}
            config={config}
            rows={rows.filter(row => row.variable === config.id)}
            expectedModelCount={expectedModelCount}
            horizonArchived={horizonArchived}
            evidenceAvailable={evidenceAvailable}
          />
        ))}
      </div>
      <p className="mt-2 px-1 text-[10px] leading-relaxed text-slate-500">
        {!horizonArchived
          ? "Horizon non archivé séparément : les taux de couverture sont indisponibles et aucune échéance voisine ne sert de substitut."
          : !evidenceAvailable
            ? "Archive horaire indisponible : la couverture de cette échéance ne peut pas être évaluée."
            : "Les barres représentent uniquement la couverture des combinaisons ayant atteint le seuil d’évidence. Elles ne mesurent pas l’exactitude des prévisions."}
      </p>
    </section>
  );
}

export function HorizonEvidenceSection({
  data,
  selectedHorizon,
  onSelectHorizon,
}: {
  data: any;
  selectedHorizon: string;
  onSelectHorizon: (horizon: any) => void;
}) {
  return (
    <MeteoSurface
      tone="lab"
      as="section"
      className="rounded-[1.6rem] p-4 sm:p-5"
      aria-labelledby="horizon-evidence-title"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sky-400/20 bg-sky-400/10">
          <Activity className="h-4 w-4 text-sky-300" />
        </span>
        <div>
          <h2
            id="horizon-evidence-title"
            className="text-lg font-semibold tracking-tight text-white"
          >
            Fiabilité selon l’échéance
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            Part des cellules modèle × variable qui atteint le seuil d’évidence.
            Une barre mesure la couverture de l’archive, pas la qualité météo.
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {data.horizonEvidence.map((item: any) => {
          const selected = item.id === selectedHorizon;
          const available = item.status === "available";
          const progress =
            available && item.expectedCellCount > 0
              ? Math.min(
                  100,
                  (item.qualifiedCellCount / item.expectedCellCount) * 100
                )
              : 0;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => onSelectHorizon(item.id)}
              aria-pressed={selected}
              className={`w-full rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${selected ? "border-sky-400/35 bg-sky-400/[0.07]" : "border-slate-700/55 bg-slate-950/20 hover:border-slate-600/80"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-xs font-semibold text-slate-100">
                  {item.label}
                </span>
                {selected ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-400/10 px-2 py-1 text-[9px] font-semibold text-sky-100">
                    <Check className="h-3 w-3" /> Sélectionné
                  </span>
                ) : item.status === "horizon_not_stored" ? (
                  <span className="shrink-0 text-[9px] text-slate-500">
                    Non archivé séparément
                  </span>
                ) : null}
              </div>
              {available ? (
                <>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                    <span className="text-slate-400">
                      {item.qualifiedCellCount} cellule
                      {item.qualifiedCellCount === 1 ? "" : "s"} qualifiée
                      {item.qualifiedCellCount === 1 ? "" : "s"} /{" "}
                      {item.expectedCellCount}
                    </span>
                    <span className="shrink-0 text-slate-500">
                      {item.rawEvidenceCellCount} avec métriques brutes
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800"
                    aria-hidden="true"
                  >
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${selected ? "bg-sky-300" : "bg-slate-400"}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                  {item.status === "history_unavailable"
                    ? "Impossible d’évaluer les preuves de cet horizon."
                    : "Cet horizon n’est pas stocké séparément; aucune échéance voisine ne sert de repli."}
                </p>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        La période sélectionnée reste identique pour chaque échéance. Best
        Match/agrégateurs, modèles candidats et autres horizons ne sont jamais
        utilisés comme substituts.
      </p>
    </MeteoSurface>
  );
}
