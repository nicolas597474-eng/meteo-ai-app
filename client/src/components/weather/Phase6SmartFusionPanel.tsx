import React from "react";
import { BrainCircuit, CheckCircle2, ShieldAlert } from "lucide-react";

type Phase6Fusion = {
  version: string;
  candidateCount: number;
  statuses: { SHADOW_READY: number; PARTIAL: number; UNAVAILABLE: number };
  byVariable: readonly { variable: string; count: number }[];
  byWindow: readonly { window: string; count: number }[];
  productionReadsEnabled: number;
  appliedToProduction: number;
  shadowModeViolations: number;
  valid: boolean;
};

const VARIABLE_LABELS: Record<string, string> = {
  air_temperature_2m: "Température à 2 m",
  precipitation_amount: "Précipitations",
  wind_speed_10m: "Vent à 10 m",
  wind_gust_10m: "Rafales à 10 m",
  relative_humidity_2m: "Humidité à 2 m",
  cloud_cover_total: "Nébulosité totale",
};

const WINDOW_LABELS: Record<string, string> = {
  "0_2h": "0–2 h",
  "2_6h": "2–6 h",
  "6_24h": "6–24 h",
  "1_3d": "1–3 j",
  "3_7d": "3–7 j",
  "7_15d": "7–15 j",
};

const STATUS_STYLE = {
  SHADOW_READY: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  PARTIAL: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  UNAVAILABLE: "border-slate-500/35 bg-slate-700/20 text-slate-300",
};

export function Phase6SmartFusionPanel({ fusion }: { fusion: Phase6Fusion }) {
  const statusEntries = Object.entries(fusion.statuses) as Array<[keyof typeof STATUS_STYLE, number]>;
  return <section className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-300/[0.045] p-4" aria-labelledby="phase6-smart-fusion-title">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2"><BrainCircuit className="mt-0.5 h-5 w-5 shrink-0 text-fuchsia-200" /><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-fuchsia-200/75">Phase 6 · Évaluation shadow</p><h2 id="phase6-smart-fusion-title" className="text-sm font-semibold text-slate-100">Fusion intelligente candidate</h2><p className="mt-1 text-[10px] leading-relaxed text-slate-400">Pondérations explicables par performance, horizon, variable, qualité, fraîcheur, résolution, régime et indépendance. Aucun candidat ne remplace la prévision officielle.</p></div></div>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold ${fusion.valid ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-red-300/25 bg-red-300/10 text-red-100"}`}>{fusion.valid ? "Shadow valide" : "À contrôler"}</span>
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Comptes des candidats Phase 6">
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className="text-base font-bold text-fuchsia-100">{fusion.candidateCount}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Candidats</p></div>
      {statusEntries.map(([status, count]) => <div key={status} className={`rounded-xl border p-2 text-center ${STATUS_STYLE[status]}`}><p className="text-base font-bold">{count}</p><p className="text-[7px] font-semibold uppercase tracking-wide">{status.replace("_", " ")}</p></div>)}
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className={`text-base font-bold ${fusion.productionReadsEnabled === 0 ? "text-emerald-100" : "text-red-200"}`}>{fusion.productionReadsEnabled}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Lectures production</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className={`text-base font-bold ${fusion.appliedToProduction === 0 ? "text-emerald-100" : "text-red-200"}`}>{fusion.appliedToProduction}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Appliqués production</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className={`text-base font-bold ${fusion.shadowModeViolations === 0 ? "text-emerald-100" : "text-red-200"}`}>{fusion.shadowModeViolations}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Violations shadow</p></div>
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Couverture des variables Phase 6">
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-3"><p className="text-[10px] font-semibold text-slate-200">Variables évaluées</p>{fusion.byVariable.length ? <div className="mt-2 flex flex-wrap gap-1">{fusion.byVariable.map(item => <span key={item.variable} className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-slate-300">{VARIABLE_LABELS[item.variable] ?? item.variable} · {item.count}</span>)}</div> : <p className="mt-2 text-[9px] text-slate-500">Aucun candidat shadow persisté pour le moment.</p>}</div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-3"><p className="text-[10px] font-semibold text-slate-200">Fenêtres Phase 3</p>{fusion.byWindow.length ? <div className="mt-2 flex flex-wrap gap-1">{fusion.byWindow.map(item => <span key={item.window} className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-slate-300">{WINDOW_LABELS[item.window] ?? item.window} · {item.count}</span>)}</div> : <p className="mt-2 text-[9px] text-slate-500">Les fenêtres seront alimentées après le prochain cycle shadow.</p>}</div>
    </div>

    <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3"><p className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-100"><ShieldAlert className="h-3.5 w-3.5" />P1.6 reste séparée de cette évaluation</p><p className="mt-1 text-[9px] leading-relaxed text-slate-400">La Phase 6 ne clôture pas P1.6 et ne lit pas sa décision technique. Best Match reste un repère dérivé non indépendant ; les poids candidats ne sont pas les poids de production.</p></div>
    <p className="mt-3 flex items-center gap-1.5 text-[9px] text-emerald-200/85"><CheckCircle2 className="h-3.5 w-3.5" />Shadow uniquement · version {fusion.version}</p>
  </section>;
}
