import React from "react";
import { CheckCircle2, ClipboardCheck, Gauge, LockKeyhole, ShieldAlert } from "lucide-react";

type Phase8ValidationProgress = {
  version: string;
  thresholds: { intermediateComparisons: number; intermediateDays: number; fullComparisons: number; fullDays: number };
  scopeDefinition: string;
  physicalComparisonCount: number;
  scopeCount: number;
  scopesAt18: number;
  scopesAt30: number;
  intermediateReportReady: boolean;
  fullValidationReportReady: boolean;
  decisionStatus: "COLLECTING" | "HUMAN_REVIEW_REQUIRED";
  target18Progress: number;
  target30Progress: number;
  highestScope: { sourceKey: string; variable: string; horizonKey: string; comparisonCount: number; evaluatedDays: number; status: string } | null;
  sources: readonly string[];
  variables: readonly string[];
  horizons: readonly string[];
  blockers: readonly string[];
  integrity: { productionReadsEnabled: number; appliedToProduction: number; shadowModeViolations: number; valid: boolean };
  automaticProductionPromotion: false;
};

function ProgressBar({ value, tone }: { value: number; tone: "cyan" | "emerald" }) {
  return <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-950/60" aria-label={`${value}% atteint`}><div className={`h-full rounded-full ${tone === "emerald" ? "bg-emerald-300" : "bg-cyan-300"}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

/** Indique une préparation de preuve, jamais une autorisation automatique de publication. */
export function Phase8ValidationProgressPanel({ progress }: { progress: Phase8ValidationProgress }) {
  const at18Label = progress.intermediateReportReady ? "Rapport intermédiaire prêt" : "Collecte en cours";
  const at30Label = progress.fullValidationReportReady ? "Revue humaine requise" : "Validation complète en attente";
  return <section className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.045] p-4" aria-labelledby="phase8-validation-progress-title">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2"><Gauge className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" /><div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-200/75">Phase 8 · Suivi de validation</p>
        <h2 id="phase8-validation-progress-title" className="text-sm font-semibold text-slate-100">Quand les comparaisons seront-elles suffisantes ?</h2>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Les seuils se lisent par <strong>{progress.scopeDefinition}</strong>, pas en additionnant des modèles, variables ou échéances différents.</p>
      </div></div>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold ${progress.decisionStatus === "HUMAN_REVIEW_REQUIRED" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"}`}>{progress.decisionStatus === "HUMAN_REVIEW_REQUIRED" ? "Revue requise" : "En collecte"}</span>
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Résumé des preuves physiques Phase 8">
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className="text-base font-bold text-emerald-100">{progress.physicalComparisonCount}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Comparaisons physiques</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className="text-base font-bold text-slate-100">{progress.scopeCount}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Périmètres suivis</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className="text-base font-bold text-cyan-100">{progress.scopesAt18}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Seuil 18 atteint</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className="text-base font-bold text-emerald-100">{progress.scopesAt30}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Seuil 30 atteint</p></div>
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <article className={`rounded-xl border p-3 ${progress.intermediateReportReady ? "border-cyan-300/25 bg-cyan-300/[0.08]" : "border-white/10 bg-slate-950/25"}`}><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold text-slate-100">1. Rapport intermédiaire</p><span className="text-[9px] font-semibold text-cyan-100">18 comparaisons · {progress.thresholds.intermediateDays} jours</span></div><ProgressBar value={progress.target18Progress} tone="cyan" /><p className="mt-2 text-[9px] leading-relaxed text-slate-400">{at18Label}. {progress.scopesAt18} périmètre(s) ont atteint le seuil.</p></article>
      <article className={`rounded-xl border p-3 ${progress.fullValidationReportReady ? "border-emerald-300/25 bg-emerald-300/[0.08]" : "border-white/10 bg-slate-950/25"}`}><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold text-slate-100">2. Rapport de validation</p><span className="text-[9px] font-semibold text-emerald-100">30 comparaisons · {progress.thresholds.fullDays} jours</span></div><ProgressBar value={progress.target30Progress} tone="emerald" /><p className="mt-2 text-[9px] leading-relaxed text-slate-400">{at30Label}. {progress.scopesAt30} périmètre(s) ont atteint ce seuil.</p></article>
    </div>

    {progress.highestScope ? <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/25 p-3 text-[10px] leading-relaxed text-slate-300"><p className="flex items-center gap-1.5 font-semibold text-slate-100"><ClipboardCheck className="h-3.5 w-3.5 text-emerald-200" />Meilleur périmètre actuellement documenté</p><p className="mt-1"><span className="font-semibold text-emerald-100">{progress.highestScope.sourceKey}</span> · {progress.highestScope.variable} · horizon {progress.highestScope.horizonKey} : <strong>{progress.highestScope.comparisonCount}</strong> comparaison(s) sur <strong>{progress.highestScope.evaluatedDays}</strong> jour(s), statut {progress.highestScope.status}.</p></div> : <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-[10px] leading-relaxed text-amber-100">Aucune comparaison physique qualifiée n’est encore visible dans la fenêtre de suivi.</div>}

    <div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-white/10 bg-slate-950/25 p-3"><p className="text-[10px] font-semibold text-slate-200">Couverture observée</p><p className="mt-1 text-[9px] leading-relaxed text-slate-400">{progress.sources.length} modèle(s) · {progress.variables.length} variable(s) · {progress.horizons.length} horizon(s).</p></div><div className="rounded-xl border border-white/10 bg-slate-950/25 p-3"><p className="text-[10px] font-semibold text-slate-200">Intégrité shadow</p><p className={`mt-1 text-[9px] leading-relaxed ${progress.integrity.valid ? "text-emerald-100" : "text-red-100"}`}>Lectures production : {progress.integrity.productionReadsEnabled} · appliquées : {progress.integrity.appliedToProduction} · violations : {progress.integrity.shadowModeViolations}.</p></div></div>

    {progress.blockers.length > 0 && <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3"><p className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-100"><ShieldAlert className="h-3.5 w-3.5" />Ce qui manque encore</p><ul className="mt-1.5 list-disc space-y-1 pl-4 text-[9px] leading-relaxed text-slate-400">{progress.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></div>}
    <div className="mt-3 rounded-xl border border-violet-300/20 bg-violet-300/[0.05] p-3"><p className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-100"><LockKeyhole className="h-3.5 w-3.5" />Publication publique verrouillée</p><p className="mt-1 text-[9px] leading-relaxed text-slate-400">Atteindre 18 ou 30 comparaisons prépare un rapport, jamais une bascule automatique. Même lorsque le statut demande une revue humaine, ta validation explicite reste nécessaire avant toute modification de production.</p></div>
    <p className="mt-3 flex items-center gap-1.5 text-[9px] text-emerald-200/85"><CheckCircle2 className="h-3.5 w-3.5" />Shadow uniquement · version {progress.version}</p>
  </section>;
}
