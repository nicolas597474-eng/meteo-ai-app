import { Clock3, ShieldCheck } from "lucide-react";
import { formatCollectionTimestamp } from "@/lib/collectionTimestamp";

type EvidenceStatus = "PROVIDER_REPORTED" | "OPEN_METEO_METADATA" | "SCHEDULE_DERIVED" | "UNKNOWN";

type ShadowRunEvidence = {
  sourceKey: string;
  displayName: string;
  providerRunTime?: number | null;
  runEvidenceStatus?: EvidenceStatus | string | null;
  runEvidenceScope?: string | null;
  runEvidenceObservedAt?: number | null;
  runEvidenceDetail?: string | null;
};

type ShadowDataHubReport = {
  sourceCount: number;
  runs: {
    knownProviderRuns: number;
    metadataEvidenceRuns?: number;
    scheduleDerivedRuns?: number;
    unknownEvidenceRuns?: number;
  };
  latestRuns: ShadowRunEvidence[];
};

const STATUS_PRESENTATION: Record<EvidenceStatus, { label: string; className: string }> = {
  PROVIDER_REPORTED: { label: "Run prouvé", className: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" },
  OPEN_METEO_METADATA: { label: "Métadonnée Open-Meteo", className: "border-sky-300/25 bg-sky-300/10 text-sky-100" },
  SCHEDULE_DERIVED: { label: "Horaire théorique", className: "border-amber-300/25 bg-amber-300/10 text-amber-100" },
  UNKNOWN: { label: "Run inconnu", className: "border-slate-500/30 bg-slate-500/10 text-slate-300" },
};

function asEvidenceStatus(value: string | null | undefined): EvidenceStatus {
  return value === "PROVIDER_REPORTED" || value === "OPEN_METEO_METADATA" || value === "SCHEDULE_DERIVED"
    ? value
    : "UNKNOWN";
}

function scopeLabel(scope: string | null | undefined) {
  if (scope === "payload_exact") return "preuve liée au payload";
  if (scope === "model_exact") return "modèle exact";
  if (scope === "model_family") return "famille du modèle";
  if (scope === "aggregator_unresolved") return "agrégateur non résolu";
  if (scope === "schedule_only") return "cadence documentaire";
  return "portée inconnue";
}

function EvidenceBadge({ status }: { status: EvidenceStatus }) {
  const presentation = STATUS_PRESENTATION[status];
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold ${presentation.className}`}>{presentation.label}</span>;
}

export function ProviderRunEvidencePanel({ report }: { report: ShadowDataHubReport }) {
  const uniqueRuns = Array.from(new Map(report.latestRuns.map(run => [run.sourceKey, run])).values()).slice(0, report.sourceCount);
  const counts = [
    { label: "Run prouvé", value: report.runs.knownProviderRuns, tone: "text-emerald-100" },
    { label: "Métadonnée", value: report.runs.metadataEvidenceRuns ?? 0, tone: "text-sky-100" },
    { label: "Théorique", value: report.runs.scheduleDerivedRuns ?? 0, tone: "text-amber-100" },
    { label: "Inconnu", value: report.runs.unknownEvidenceRuns ?? 0, tone: "text-slate-300" },
  ];

  return <section className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.045] p-4" aria-labelledby="provider-run-evidence-title">
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" /><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-200/75">P2 · Rapport propriétaire</p><h2 id="provider-run-evidence-title" className="text-sm font-semibold text-slate-100">Preuve de l’heure des runs</h2><p className="mt-1 text-[10px] leading-relaxed text-slate-400">La provenance distingue une preuve du payload, une métadonnée Open-Meteo, une cadence théorique et une heure inconnue.</p></div></div><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-200" aria-label="Production protégée" /></div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{counts.map(count => <div key={count.label} className="rounded-xl border border-white/10 bg-slate-950/25 p-2.5"><p className={`text-lg font-bold ${count.tone}`}>{count.value}</p><p className="text-[9px] uppercase tracking-wide text-slate-500">{count.label}</p></div>)}</div>
    <p className="mt-3 rounded-xl border border-sky-300/15 bg-sky-300/[0.04] p-3 text-[10px] leading-relaxed text-slate-300"><span className="font-semibold text-sky-100">Règle de vérité · </span>une heure provenant de l’API de métadonnées Open-Meteo décrit le dernier run du modèle, mais ne prouve pas à elle seule que le payload Forecast lu correspond exactement à ce run.</p>
    {uniqueRuns.length > 0 ? <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Preuves de run P2 par flux">{uniqueRuns.map(run => {
      const status = asEvidenceStatus(run.runEvidenceStatus);
      return <article key={run.sourceKey} className="rounded-xl border border-white/10 bg-slate-950/25 p-3 text-[10px]"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold text-slate-100">{run.displayName}</p><p className="mt-0.5 text-[9px] text-slate-500">{scopeLabel(run.runEvidenceScope)}</p></div><EvidenceBadge status={status} /></div><p className="mt-2 text-slate-200"><span className="font-semibold">Heure indiquée · </span>{run.providerRunTime ? formatCollectionTimestamp(new Date(run.providerRunTime)) : "non attribuée"}</p><p className="mt-1 leading-relaxed text-slate-400">{run.runEvidenceDetail ?? "Aucun détail de preuve disponible."}</p></article>;
    })}</div> : <p className="mt-3 rounded-xl border border-white/10 bg-slate-950/25 p-3 text-[10px] text-slate-400">Les preuves P2 apparaîtront après la prochaine écriture shadow. Cette attente n’affecte pas les prévisions.</p>}
  </section>;
}

