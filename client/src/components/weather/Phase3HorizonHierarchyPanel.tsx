import React from "react";
import { AlertTriangle, Clock3, ShieldCheck } from "lucide-react";

type Phase3HorizonHierarchy = {
  version: string;
  horizonBasis: string;
  horizonBasisDetail: string;
  windowCount: number;
  knownHorizonValueCount: number;
  unknownHorizonValueCount: number;
  appliedToProduction: number;
  productionReadsEnabled: boolean;
  valid: boolean;
  windows: Array<{
    key: string;
    label: string;
    status: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
    uncertaintyRequired: boolean;
    requiredCapabilities: string[];
    availableCapabilities: string[];
    missingCapabilities: string[];
    availablePrioritySources: Array<{ sourceKey: string; displayName: string }>;
    availableContextSources: Array<{ sourceKey: string; displayName: string }>;
    derivedReferences: Array<{ sourceKey: string; displayName: string; independent: false }>;
    validValueCount: number;
    appliedToProduction: number;
  }>;
};

const CAPABILITY_LABELS: Record<string, string> = {
  DETERMINISTIC: "modèles déterministes",
  ENSEMBLE: "ensembles",
  AI_MODEL: "modèle IA",
  AI_ENSEMBLE: "ensemble IA",
  OBSERVATION: "observations",
  RADAR: "radar",
  SATELLITE: "satellite",
  NOWCAST_AROME_PI: "AROME PI / PIAF",
  VERY_SHORT_RANGE: "très court terme",
  CONSENSUS: "consensus multi-source",
};

const STATUS_STYLE = {
  COMPLETE: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  PARTIAL: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  UNAVAILABLE: "border-slate-600 bg-slate-900/50 text-slate-300",
} as const;

const STATUS_LABEL = {
  COMPLETE: "Complet",
  PARTIAL: "Partiel",
  UNAVAILABLE: "Priorités absentes",
} as const;

export function Phase3HorizonHierarchyPanel({ hierarchy }: { hierarchy: Phase3HorizonHierarchy }) {
  return <section className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.045] p-4" aria-labelledby="phase3-horizon-title">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2"><Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" /><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-200/75">Phase 3 · Rapport propriétaire</p><h2 id="phase3-horizon-title" className="text-sm font-semibold text-slate-100">Hiérarchie shadow selon l’horizon</h2><p className="mt-1 text-[10px] leading-relaxed text-slate-400">Six stratégies distinctes, évaluées sur les données réellement présentes. Aucun poids actif n’est modifié.</p></div></div>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold ${hierarchy.valid ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-red-300/25 bg-red-300/10 text-red-100"}`}>{hierarchy.windowCount}/6 fenêtres</span>
    </div>

    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2"><p className="text-lg font-bold text-cyan-100">{hierarchy.knownHorizonValueCount}</p><p className="text-[8px] uppercase tracking-wide text-slate-500">Valeurs datées</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2"><p className="text-lg font-bold text-slate-200">{hierarchy.unknownHorizonValueCount}</p><p className="text-[8px] uppercase tracking-wide text-slate-500">Sans horizon</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2"><p className={`text-lg font-bold ${hierarchy.appliedToProduction === 0 ? "text-emerald-100" : "text-red-200"}`}>{hierarchy.appliedToProduction}</p><p className="text-[8px] uppercase tracking-wide text-slate-500">En production</p></div>
    </div>

    <div className="mt-3 grid gap-2 lg:grid-cols-2" aria-label="Six fenêtres de la hiérarchie Phase 3">
      {hierarchy.windows.map(window => {
        const availableSources = [...window.availablePrioritySources, ...window.availableContextSources];
        return <article key={window.key} className="rounded-xl border border-white/10 bg-slate-950/25 p-3">
          <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold text-slate-100">{window.label}</h3><span className={`rounded-full border px-2 py-1 text-[8px] font-semibold ${STATUS_STYLE[window.status]}`}>{STATUS_LABEL[window.status]}</span></div>
          <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.11em] text-slate-500">Sources réellement couvertes</p>
          {availableSources.length > 0 ? <div className="mt-1.5 flex flex-wrap gap-1">{availableSources.map(source => <span key={source.sourceKey} className="rounded-full bg-cyan-300/10 px-2 py-1 text-[9px] text-cyan-100">{source.displayName}{window.availableContextSources.some(item => item.sourceKey === source.sourceKey) ? " · contexte" : ""}</span>)}</div> : <p className="mt-1 text-[9px] leading-relaxed text-slate-400">Aucune source prioritaire réellement ingérée pour cette fenêtre.</p>}
          {window.derivedReferences.length > 0 && <p className="mt-2 text-[9px] leading-relaxed text-violet-200">Repère dérivé : {window.derivedReferences.map(reference => reference.displayName).join(", ")} · non indépendant.</p>}
          <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.11em] text-slate-500">Priorités encore absentes</p>
          <div className="mt-1.5 flex flex-wrap gap-1">{window.missingCapabilities.map(capability => <span key={capability} className="rounded-full border border-slate-700 bg-slate-950/35 px-2 py-1 text-[9px] text-slate-400">{CAPABILITY_LABELS[capability] ?? capability}</span>)}</div>
          {window.uncertaintyRequired && <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-2 text-[9px] leading-relaxed text-amber-100"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />À 7–15 jours, les déterministes restent du contexte : aucune certitude ne peut être affichée sans ensembles et incertitude explicite.</p>}
        </article>;
      })}
    </div>

    <p className="mt-3 text-[9px] leading-relaxed text-slate-500">{hierarchy.horizonBasisDetail}</p>
    <p className="mt-2 flex items-center gap-1.5 text-[9px] text-emerald-200/85"><ShieldCheck className="h-3.5 w-3.5" />Hiérarchie shadow uniquement · version {hierarchy.version}</p>
  </section>;
}
