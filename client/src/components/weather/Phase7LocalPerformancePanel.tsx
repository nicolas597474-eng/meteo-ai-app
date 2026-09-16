import React from "react";
import { CheckCircle2, MapPinned, ShieldAlert } from "lucide-react";

type Phase7LocalPerformance = {
  version: string;
  recordCount: number;
  statuses: { INSUFFICIENT: number; OBSERVING: number; VALIDABLE: number; INVALID: number };
  locations: readonly string[];
  bySource: readonly { sourceKey: string; count: number }[];
  physicalEvidenceComparisons: number;
  legacyEvidenceComparisons: number;
  productionReadsEnabled: number;
  appliedToProduction: number;
  shadowModeViolations: number;
  readyForPromotion: boolean;
  valid: boolean;
};

const STATUS_STYLE = {
  INSUFFICIENT: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  OBSERVING: "border-sky-300/25 bg-sky-300/10 text-sky-100",
  VALIDABLE: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  INVALID: "border-red-300/25 bg-red-300/10 text-red-100",
};

export function Phase7LocalPerformancePanel({ performance }: { performance: Phase7LocalPerformance }) {
  const statusEntries = Object.entries(performance.statuses) as Array<[keyof typeof STATUS_STYLE, number]>;
  return <section className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.045] p-4" aria-labelledby="phase7-local-performance-title">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2"><MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" /><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-200/75">Phase 7 · Performance locale shadow</p><h2 id="phase7-local-performance-title" className="text-sm font-semibold text-slate-100">Preuves par lieu et par modèle</h2><p className="mt-1 text-[10px] leading-relaxed text-slate-400">Les performances locales ne sont qualifiantes qu’avec une observation physique shadow. Les archives historiques non qualifiées restent séparées et ne pilotent aucun poids.</p></div></div>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold ${performance.valid ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-red-300/25 bg-red-300/10 text-red-100"}`}>{performance.valid ? "Shadow valide" : "À contrôler"}</span>
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Comptes de performance locale Phase 7">
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className="text-base font-bold text-cyan-100">{performance.recordCount}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Fiches</p></div>
      {statusEntries.map(([status, count]) => <div key={status} className={`rounded-xl border p-2 text-center ${STATUS_STYLE[status]}`}><p className="text-base font-bold">{count}</p><p className="text-[7px] font-semibold uppercase tracking-wide">{status}</p></div>)}
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className={`text-base font-bold ${performance.physicalEvidenceComparisons > 0 ? "text-emerald-100" : "text-amber-100"}`}>{performance.physicalEvidenceComparisons}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Comparaisons physiques</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className="text-base font-bold text-slate-200">{performance.legacyEvidenceComparisons}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Archives non qualifiées</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className={`text-base font-bold ${performance.productionReadsEnabled === 0 ? "text-emerald-100" : "text-red-200"}`}>{performance.productionReadsEnabled}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Lectures production</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className={`text-base font-bold ${performance.appliedToProduction === 0 ? "text-emerald-100" : "text-red-200"}`}>{performance.appliedToProduction}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Appliquées production</p></div>
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Couverture locale Phase 7">
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-3"><p className="text-[10px] font-semibold text-slate-200">Lieux couverts</p>{performance.locations.length ? <div className="mt-2 flex flex-wrap gap-1">{performance.locations.map(location => <span key={location} className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-slate-300">{location}</span>)}</div> : <p className="mt-2 text-[9px] text-slate-500">Aucune fiche locale shadow n’est encore qualifiée.</p>}</div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-3"><p className="text-[10px] font-semibold text-slate-200">Sources évaluées</p>{performance.bySource.length ? <div className="mt-2 flex flex-wrap gap-1">{performance.bySource.map(item => <span key={item.sourceKey} className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-slate-300">{item.sourceKey} · {item.count}</span>)}</div> : <p className="mt-2 text-[9px] text-slate-500">La collecte d’observations physiques shadow est nécessaire avant toute qualification.</p>}</div>
    </div>

    <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3"><p className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-100"><ShieldAlert className="h-3.5 w-3.5" />Promotion bloquée par conception</p><p className="mt-1 text-[9px] leading-relaxed text-slate-400">{performance.readyForPromotion ? "Une preuve locale shadow est disponible, mais aucune pondération de production n’est modifiée automatiquement." : "Aucune observation physique shadow qualifiante n’est disponible. Les métriques ne doivent pas être inventées ni dérivées des archives non qualifiées."}</p></div>
    <p className="mt-3 flex items-center gap-1.5 text-[9px] text-emerald-200/85"><CheckCircle2 className="h-3.5 w-3.5" />Shadow uniquement · version {performance.version} · violations shadow : {performance.shadowModeViolations}</p>
  </section>;
}
