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
      return "Historique non versionné · exclu";
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

function EvidenceDial({
  qualified,
  total,
  available,
  unavailableLabel,
}: {
  qualified: number;
  total: number;
  available: boolean;
  unavailableLabel: string;
}) {
  const radius = 57;
  const circumference = 2 * Math.PI * radius;
  const progress = available && total > 0 ? Math.min(1, qualified / total) : 0;
  return (
    <div className="flex flex-col items-center justify-center">
      <div
        className="relative h-44 w-44"
        role="img"
        aria-label={
          available
            ? `${qualified} cellule${qualified === 1 ? "" : "s"} qualifiée${qualified === 1 ? "" : "s"} sur ${total}`
            : unavailableLabel
        }
      >
        <svg
          viewBox="0 0 160 160"
          className="h-full w-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="#202b39"
            strokeWidth="10"
          />
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="url(#reliability-evidence-ring)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-700"
          />
          <defs>
            <linearGradient
              id="reliability-evidence-ring"
              x1="0"
              x2="1"
              y1="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-1 text-center">
          <span className="font-mono text-4xl font-semibold tracking-tight text-white">
            {available ? qualified : "—"}
          </span>
          <span className="mt-0.5 text-xs text-slate-400">
            {available ? `/ ${total} cellules` : unavailableLabel}
          </span>
        </div>
      </div>
      <p className="mt-1 text-sm font-semibold text-slate-100">
        Qualification des archives
      </p>
      <p className="mt-1 text-center text-[10px] leading-relaxed text-slate-500">
        Couverture de preuve · pas une note de performance
      </p>
    </div>
  );
}

export function EvidenceSummary({ data }: { data: any }) {
  const rows = data.metrics as ReliabilityMetricRow[];
  const total = rows.length;
  const available = data.evidence.status === "available";
  const horizonArchived = data.selectedHorizon?.storageBucket != null;
  const evidenceAvailable = available && horizonArchived;
  const qualified = rows.filter(row => row.status === "qualified");
  const raw = rows.filter(row => row.metrics != null);
  const dateRange = `${formatDate(data.period.startDate)} – ${formatDate(data.period.endDate)}`;
  const narrative = !available
    ? "L’archive horaire est indisponible. Aucune métrique n’est estimée ni remplacée par une valeur par défaut."
    : !horizonArchived
      ? `L’horizon ${data.selectedHorizon?.label ?? "choisi"} n’est pas archivé séparément. Aucune échéance voisine n’est utilisée comme substitut.`
      : qualified.length === 0
        ? "Aucune combinaison modèle × variable × horizon n’atteint actuellement le seuil de qualification. Les valeurs brutes disponibles restent consultables plus bas."
        : `${qualified.length} combinaison${qualified.length === 1 ? "" : "s"} modèle × variable × horizon atteint le seuil d’évidence pour la fenêtre choisie.`;

  return (
    <MeteoSurface
      tone="lab"
      as="section"
      className="overflow-hidden rounded-[1.7rem] p-4 sm:p-5"
      aria-labelledby="reliability-summary-title"
    >
      <div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_14rem] md:gap-8">
        <div className="order-2 min-w-0 md:order-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-sky-400/25 bg-sky-400/8 px-2.5 py-1 text-[10px] font-semibold text-sky-100">
              <Database className="mr-1 inline h-3 w-3" />
              {evidenceAvailable
                ? "Analyse archivée"
                : !available
                  ? "Archive non lisible"
                  : "Horizon non archivé"}
            </span>
            <span className="rounded-full border border-slate-700/80 bg-slate-950/30 px-2.5 py-1 text-[10px] text-slate-400">
              {dateRange}
            </span>
            <span className="rounded-full border border-slate-700/80 bg-slate-950/30 px-2.5 py-1 text-[10px] text-slate-400">
              Horizon · {data.selectedHorizon?.label ?? "non disponible"}
            </span>
          </div>
          <h2
            id="reliability-summary-title"
            className="mt-3 text-xl font-semibold tracking-tight text-white"
          >
            Une lecture claire, sans score inventé
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
            {narrative}
          </p>
          <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-slate-400">
            MAE, RMSE, biais, effectifs, dates et évolution par modèle ×
            variable × horizon exact. Le biais signé est descriptif et n’est
            jamais appliqué aux prévisions officielles futures.
          </p>
          <p className="mt-2 max-w-3xl text-[10px] leading-relaxed text-slate-500">
            Best Match et les agrégateurs sont exclus. L’accord inter-modèles
            décrit une dispersion de prévisions et n’est pas une mesure de
            fiabilité.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-700/65 bg-slate-950/30 px-3 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                Cellules avec métriques
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-100">
                {evidenceAvailable ? `${raw.length} / ${total}` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-700/65 bg-slate-950/30 px-3 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                Seuil d’évidence
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-100">
                {data.evidence.minimumComparisons}+ comparaisons ·{" "}
                {data.evidence.minimumComparableDays}+ jours
              </p>
            </div>
            <div className="col-span-2 rounded-xl border border-slate-700/65 bg-slate-950/30 px-3 py-2.5 sm:col-span-1">
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                Brutes non qualifiées
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-amber-100">
                {evidenceAvailable
                  ? Math.max(0, raw.length - qualified.length)
                  : "—"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <WeatherStatusBadge
              compact
              tone={available ? "success" : "danger"}
              label="Archive horaire"
              value={available ? "Lisible" : "Indisponible"}
              description={
                available
                  ? "Les scores horaires versionnés sont consultables pour cette fenêtre."
                  : "La lecture de l’archive a échoué. Ce statut ne signifie pas zéro comparaison."
              }
            />
            <span className="text-[10px] text-slate-500">
              {data.evidence.expectedModelCount} modèles officiels · unité
              propre à chaque variable
            </span>
          </div>
        </div>
        <div className="order-1 flex justify-center md:order-2">
          <EvidenceDial
            qualified={qualified.length}
            total={total}
            available={evidenceAvailable}
            unavailableLabel={
              !available
                ? "Archive historique indisponible"
                : "Horizon non archivé séparément"
            }
          />
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
  const raw = rows.filter(row => row.metrics != null);
  const maeValues = qualified.flatMap(row =>
    row.metrics ? [row.metrics.mae] : []
  );
  const minimum = maeValues.length ? Math.min(...maeValues) : null;
  const maximum = maeValues.length ? Math.max(...maeValues) : null;
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
            Plage des MAE qualifiées
          </p>
          <p
            className={`mt-1 truncate text-lg font-semibold tabular-nums ${minimum == null ? "text-slate-500" : config.accent}`}
          >
            {maeRange}
          </p>
        </div>
        <p className="shrink-0 pb-0.5 text-right text-[9px] leading-relaxed text-slate-500">
          {evidenceAvailable ? (
            <>
              {raw.length} avec
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
          Aucune note globale : chaque unité et chaque seuil restent distincts.
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
