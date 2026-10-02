import React from "react";
import { CalendarDays, CheckCircle2, GitCompareArrows, ShieldAlert } from "lucide-react";

type DailyUnifiedShadow = {
  version: string;
  candidateCount: number;
  statuses: { SHADOW_READY: number; PARTIAL: number; UNAVAILABLE: number };
  averageDeterministicSourceCount: number;
  expectedDeterministicSourceCount: number;
  productionReadsEnabled: number;
  appliedToProduction: number;
  shadowModeViolations: number;
  valid: boolean;
  latest: {
    forecastDate: string;
    candidateStatus: string;
    deterministicSourceCount: number;
    expectedDeterministicSourceCount: number;
    missingEvidence: unknown;
  } | null;
};

const STATUS_STYLE = {
  SHADOW_READY: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  PARTIAL: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  UNAVAILABLE: "border-slate-500/35 bg-slate-700/20 text-slate-300",
};

function readableEvidence(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return "Aucune lacune déclarée";
  return value.slice(0, 4).map(item => String(item).replaceAll("_", " ")).join(" · ");
}

/** Panneau propriétaire : aucune de ces sorties n’est lue par la prévision publique. */
export function DailyUnifiedShadowPanel({ candidate }: { candidate: DailyUnifiedShadow }) {
  const statusEntries = Object.entries(candidate.statuses) as Array<[keyof typeof STATUS_STYLE, number]>;
  const latest = candidate.latest;
  return <section className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.045] p-4" aria-labelledby="daily-unified-shadow-title">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" />
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-200/75">Cohérence quotidienne · shadow</p>
          <h2 id="daily-unified-shadow-title" className="text-sm font-semibold text-slate-100">Série quotidienne unifiée à sept modèles</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">AROME, ARPEGE, ICON, ECMWF, GFS, GEM et UKMET sont les seuls contributeurs possibles. Best Match reste une référence dérivée de comparaison.</p>
        </div>
      </div>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold ${candidate.valid ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-red-300/25 bg-red-300/10 text-red-100"}`}>{candidate.valid ? "Shadow isolé" : "À contrôler"}</span>
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Résumé de la fusion quotidienne unifiée shadow">
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className="text-base font-bold text-cyan-100">{candidate.candidateCount}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Jours candidats</p></div>
      {statusEntries.map(([status, count]) => <div key={status} className={`rounded-xl border p-2 text-center ${STATUS_STYLE[status]}`}><p className="text-base font-bold">{count}</p><p className="text-[7px] font-semibold uppercase tracking-wide">{status.replace("_", " ")}</p></div>)}
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className="text-base font-bold text-cyan-100">{candidate.averageDeterministicSourceCount}/{candidate.expectedDeterministicSourceCount}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Couverture moyenne</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className={`text-base font-bold ${candidate.productionReadsEnabled === 0 ? "text-emerald-100" : "text-red-200"}`}>{candidate.productionReadsEnabled}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Lectures production</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className={`text-base font-bold ${candidate.appliedToProduction === 0 ? "text-emerald-100" : "text-red-200"}`}>{candidate.appliedToProduction}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Appliqués production</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className={`text-base font-bold ${candidate.shadowModeViolations === 0 ? "text-emerald-100" : "text-red-200"}`}>{candidate.shadowModeViolations}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Violations shadow</p></div>
    </div>

    {latest ? <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/25 p-3 text-[10px] leading-relaxed text-slate-300">
      <div className="flex items-center gap-1.5 font-semibold text-slate-100"><GitCompareArrows className="h-3.5 w-3.5 text-cyan-200" />Dernier jour candidat · {latest.forecastDate}</div>
      <p className="mt-1">Statut <span className="font-semibold text-cyan-100">{latest.candidateStatus}</span> · {latest.deterministicSourceCount}/{latest.expectedDeterministicSourceCount} modèles déterministes disponibles.</p>
      <p className="mt-1 text-slate-400">Lacunes : {readableEvidence(latest.missingEvidence)}. Une couverture partielle reste visible comme telle : aucune donnée de modèle n’est inventée.</p>
    </div> : <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/25 p-3 text-[10px] leading-relaxed text-slate-400">Les sorties apparaîtront après le replay des cycles quotidiens shadow déjà archivés.</div>}

    <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3"><p className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-100"><ShieldAlert className="h-3.5 w-3.5" />Aucune bascule publique</p><p className="mt-1 text-[9px] leading-relaxed text-slate-400">La comparaison structurelle avec l’ancienne moyenne à quatre flux est conservée en trace. Elle ne modifie ni la vue 15 jours, ni le Dashboard, ni les poids ou les archives de production.</p></div>
    <p className="mt-3 flex items-center gap-1.5 text-[9px] text-emerald-200/85"><CheckCircle2 className="h-3.5 w-3.5" />Shadow uniquement · version {candidate.version}</p>
  </section>;
}
