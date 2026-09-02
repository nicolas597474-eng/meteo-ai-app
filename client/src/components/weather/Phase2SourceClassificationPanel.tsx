import React from "react";
import { Layers3, ShieldCheck } from "lucide-react";

type Phase2Classification = {
  version: string;
  sourceCount: number;
  unclassifiedSourceCount: number;
  appliedToProduction: number;
  valid: boolean;
  categories: Array<{ category: string; count: number; empty: boolean }>;
  sources: Array<{
    sourceKey: string;
    displayName: string;
    sourceFamily: string;
    independenceClass: string;
    category: string | null;
    role: string | null;
    version: string | null;
    appliedToProduction: number;
  }>;
};

const CATEGORY_LABELS: Record<string, string> = {
  DETERMINISTIC: "Modèles déterministes",
  ENSEMBLE: "Ensembles",
  OBSERVATION: "Observations",
  RADAR: "Radar",
  SATELLITE: "Satellite",
  DERIVED_AGGREGATOR: "Agrégateur dérivé",
};

export function Phase2SourceClassificationPanel({ classification }: { classification: Phase2Classification }) {
  const deterministicCount = classification.categories.find(item => item.category === "DETERMINISTIC")?.count ?? 0;
  const aggregatorCount = classification.categories.find(item => item.category === "DERIVED_AGGREGATOR")?.count ?? 0;
  const emptyCategories = classification.categories.filter(item => item.empty && item.category !== "DERIVED_AGGREGATOR");

  return <section className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-300/[0.045] p-4" aria-labelledby="phase2-classification-title">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2"><Layers3 className="mt-0.5 h-5 w-5 shrink-0 text-fuchsia-200" /><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-fuchsia-200/75">Phase 2 · Rapport propriétaire</p><h2 id="phase2-classification-title" className="text-sm font-semibold text-slate-100">Classification shadow des sources</h2><p className="mt-1 text-[10px] leading-relaxed text-slate-400">La nature de chaque flux est décrite sans modifier la fusion, les scores ou les poids.</p></div></div>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold ${classification.valid ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-amber-300/25 bg-amber-300/10 text-amber-100"}`}>{classification.sourceCount - classification.unclassifiedSourceCount}/{classification.sourceCount} classés</span>
    </div>

    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2"><p className="text-lg font-bold text-fuchsia-100">{deterministicCount}</p><p className="text-[8px] uppercase tracking-wide text-slate-500">Déterministes</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2"><p className="text-lg font-bold text-violet-100">{aggregatorCount}</p><p className="text-[8px] uppercase tracking-wide text-slate-500">Agrégateur</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2"><p className={`text-lg font-bold ${classification.appliedToProduction === 0 ? "text-emerald-100" : "text-red-200"}`}>{classification.appliedToProduction}</p><p className="text-[8px] uppercase tracking-wide text-slate-500">En production</p></div>
    </div>

    <div className="mt-3 grid gap-1.5 sm:grid-cols-2" aria-label="Classification Phase 2 des huit sources">
      {classification.sources.map(source => <div key={source.sourceKey} className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/20 px-2.5 py-2 text-[10px]"><span className="min-w-0"><span className="block truncate font-semibold text-slate-100">{source.displayName}</span><span className="text-[9px] text-slate-500">{CATEGORY_LABELS[source.category ?? ""] ?? "Non classé"} · {source.category === "DERIVED_AGGREGATOR" ? "non indépendant" : "famille indépendante"}</span></span><span className="shrink-0 rounded-full bg-fuchsia-300/10 px-2 py-1 text-[8px] font-semibold text-fuchsia-100">{source.role ?? "—"}</span></div>)}
    </div>

    <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/20 p-3"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">Catégories sans ingestion réelle</p><div className="mt-2 flex flex-wrap gap-1.5">{emptyCategories.map(item => <span key={item.category} className="rounded-full border border-slate-700 bg-slate-950/35 px-2 py-1 text-[9px] text-slate-400">{CATEGORY_LABELS[item.category] ?? item.category} · aucun flux</span>)}</div><p className="mt-2 text-[9px] leading-relaxed text-slate-500">Les stations physiques restent dans leur pipeline d’observation séparé. Aucun ensemble, radar ou satellite n’est présenté comme ingéré sans preuve réelle.</p></div>
    <p className="mt-3 flex items-center gap-1.5 text-[9px] text-emerald-200/85"><ShieldCheck className="h-3.5 w-3.5" />Classification shadow uniquement · version {classification.version}</p>
  </section>;
}
