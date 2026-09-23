import React from "react";
import { BarChart3, ShieldAlert } from "lucide-react";

type Phase8Report = {
  version: string;
  metricCount: number;
  statuses: Record<string, number>;
  physicalEvidenceComparisons: number;
  legacyEvidenceComparisons: number;
  productionReadsEnabled: number;
  appliedToProduction: number;
  shadowModeViolations: number;
  valid: boolean;
  probabilisticMetrics: { status: "UNAVAILABLE" | "PARTIAL"; brierRecordCount: number; crpsRecordCount: number; calibrationRecordCount: number; evidenceRecordCount: number; reasons: string[] };
  records: Array<{ sourceKey: string; variable: string; status: string; comparisonCount: number; evaluatedDays: number; mae: number | null; rmse: number | null }>;
};

export function Phase8MetricsPanel({ metrics }: { metrics: Phase8Report }) {
  const cards = [
    ["Fiches", metrics.metricCount],
    ["Insuffisant", metrics.statuses.INSUFFICIENT ?? 0],
    ["En observation", metrics.statuses.OBSERVING ?? 0],
    ["Validable", metrics.statuses.VALIDABLE ?? 0],
    ["Comparaisons physiques", metrics.physicalEvidenceComparisons],
  ] as const;
  return <section className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-300/[0.045] p-4" aria-labelledby="phase8-metrics-title">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2"><BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-fuchsia-200" /><div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-fuchsia-200/75">Phase 8 · Métriques shadow</p>
        <h2 id="phase8-metrics-title" className="text-sm font-semibold text-slate-100">Mesure par modèle, variable et horizon</h2>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Une métrique n’est validable qu’avec une observation physique shadow explicitement qualifiée. Les probabilités ne sont pas inventées.</p>
      </div></div>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold ${metrics.valid ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-red-300/25 bg-red-300/10 text-red-100"}`}>{metrics.valid ? "Shadow valide" : "À contrôler"}</span>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{cards.map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className="text-base font-bold text-fuchsia-100">{value}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">{label}</p></div>)}</div>
    {metrics.records.length ? <div className="mt-3 grid gap-1.5 sm:grid-cols-2" aria-label="Métriques Phase 8">{metrics.records.slice(0, 12).map(row => <div key={`${row.sourceKey}-${row.variable}`} className="rounded-lg border border-white/10 bg-slate-950/20 px-2.5 py-2 text-[10px]"><div className="flex justify-between gap-2"><span className="truncate font-semibold text-slate-100">{row.sourceKey} · {row.variable}</span><span className="shrink-0 text-fuchsia-100">{row.status}</span></div><p className="mt-1 text-slate-400">{row.comparisonCount} comparaison(s) · {row.evaluatedDays} jour(s) · MAE {row.mae ?? "—"} · RMSE {row.rmse ?? "—"}</p></div>)}</div> : <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-[10px] leading-relaxed text-amber-100">Aucune comparaison Phase 8 n’est encore archivée. C’est attendu tant qu’une observation physique shadow admissible n’est pas fournie ; aucune métrique n’est déduite des scores de production.</p>}
    <div className="mt-3 rounded-xl border border-violet-300/20 bg-violet-300/[0.05] p-3" aria-label="Disponibilité des métriques probabilistes"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold text-violet-100">Métriques probabilistes</p><span className="rounded-full border border-violet-300/25 px-2 py-1 text-[9px] font-semibold text-violet-100">{metrics.probabilisticMetrics.status === "UNAVAILABLE" ? "Non disponibles" : "Partielles"}</span></div><p className="mt-1 text-[9px] leading-relaxed text-slate-400">Brier : {metrics.probabilisticMetrics.brierRecordCount} · CRPS : {metrics.probabilisticMetrics.crpsRecordCount} · Calibration : {metrics.probabilisticMetrics.calibrationRecordCount} · preuves probabilistes : {metrics.probabilisticMetrics.evidenceRecordCount}</p><p className="mt-1 text-[9px] leading-relaxed text-violet-100/80">{metrics.probabilisticMetrics.reasons.join(" ")}</p></div>
    <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3"><p className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-100"><ShieldAlert className="h-3.5 w-3.5" />Production protégée</p><p className="mt-1 text-[9px] leading-relaxed text-slate-400">Lectures production : {metrics.productionReadsEnabled} · appliquées à production : {metrics.appliedToProduction} · violations shadow : {metrics.shadowModeViolations}. Brier, CRPS et calibration restent indisponibles sans probabilités réellement ingérées.</p></div>
  </section>;
}

export default Phase8MetricsPanel;
