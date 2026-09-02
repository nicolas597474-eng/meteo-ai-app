import React from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

type QualityCounts = { VALID: number; SUSPECT: number; INVALID: number; MISSING: number; STALE: number };

type Phase5QualityControl = {
  version: string;
  evaluatedAt: number;
  totalValueCount: number;
  dynamicallyEvaluatedValueCount: number;
  storedPhase5ValueCount: number;
  legacyValueCount: number;
  counts: QualityCounts;
  freshnessCounts: { FRESH: number; AGING: number; STALE: number; UNKNOWN: number };
  usableInShadowCount: number;
  excludedFromPhase5ShadowCount: number;
  partialRunCount: number;
  failedRunCount: number;
  duplicateGroupCount: number;
  unavailableSourceCount: number;
  appliedToProduction: number;
  metadataAppliedToProduction: number;
  nonShadowValueCount: number;
  productionReadsEnabled: boolean;
  valid: boolean;
  rules: Array<{ rule: string; count: number }>;
  byVariable: Array<{ variable: string; total: number; counts: QualityCounts }>;
  sources: Array<{ sourceKey: string; displayName: string; available: boolean; total: number; counts: QualityCounts; latestReceivedAt: number | null }>;
  p1Observation: { completedDays: number; requiredDays: number; verdict: string; stillOpen: boolean };
};

const STATUS_STYLE: Record<keyof QualityCounts, string> = {
  VALID: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  SUSPECT: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  INVALID: "border-red-300/25 bg-red-300/10 text-red-100",
  MISSING: "border-slate-500/35 bg-slate-700/20 text-slate-300",
  STALE: "border-orange-300/25 bg-orange-300/10 text-orange-100",
};

const VARIABLE_LABELS: Record<string, string> = {
  air_temperature_2m: "Température à 2 m",
  air_temperature_max: "Température maximale",
  air_temperature_min: "Température minimale",
  apparent_temperature: "Température ressentie",
  precipitation_amount: "Précipitations",
  wind_speed_10m: "Vent à 10 m",
  wind_gust_10m: "Rafales à 10 m",
  wind_direction_10m: "Direction du vent",
  relative_humidity_2m: "Humidité à 2 m",
  air_pressure_surface: "Pression de surface",
  cloud_cover_total: "Nébulosité totale",
  weather_code: "Code météo WMO",
};

const RULE_LABELS: Record<string, string> = {
  MISSING_VALUE: "Valeur manquante",
  MISSING_FLAG_MISMATCH: "Incohérence du drapeau manquant",
  NON_FINITE_VALUE: "Valeur non finie",
  PHYSICAL_RANGE_INVALID: "Borne physique invalide",
  NORMALIZATION_INVALID: "Normalisation invalide",
  NORMALIZATION_MISSING: "Preuve de normalisation absente",
  TIMESTAMP_INCOHERENT: "Timestamp incohérent",
  COORDINATES_INVALID: "Coordonnées invalides",
  DUPLICATE_VALUE: "Valeur dupliquée",
  RUN_FAILED: "Run en échec",
  RUN_INCOMPLETE: "Run incomplet",
  EXTREME_VALUE: "Valeur extrême",
  RAPID_VARIATION: "Variation rapide",
  STALE_DATA: "Donnée trop ancienne",
};

export function Phase5QualityControlPanel({ qualityControl }: { qualityControl: Phase5QualityControl }) {
  const statusEntries = Object.entries(qualityControl.counts) as Array<[keyof QualityCounts, number]>;
  return <section className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.045] p-4" aria-labelledby="phase5-quality-title">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" /><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-200/75">Phase 5 · Préparation parallèle</p><h2 id="phase5-quality-title" className="text-sm font-semibold text-slate-100">Contrôle qualité automatique shadow</h2><p className="mt-1 text-[10px] leading-relaxed text-slate-400">Bornes physiques, cohérence, fraîcheur, duplications et runs sont évalués sans modifier les statuts historiques utilisés par P1.6.</p></div></div>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold ${qualityControl.valid ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-red-300/25 bg-red-300/10 text-red-100"}`}>{qualityControl.valid ? "Shadow valide" : "À contrôler"}</span>
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Comptes des cinq statuts QC Phase 5">
      {statusEntries.map(([status, count]) => <div key={status} className={`rounded-xl border p-2 text-center ${STATUS_STYLE[status]}`}><p className="text-base font-bold">{count}</p><p className="text-[7px] font-semibold uppercase tracking-wide">{status}</p></div>)}
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className="text-base font-bold text-cyan-100">{qualityControl.usableInShadowCount}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Utilisables shadow</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className="text-base font-bold text-slate-200">{qualityControl.storedPhase5ValueCount}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Preuves persistées</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className={`text-base font-bold ${qualityControl.duplicateGroupCount === 0 ? "text-emerald-100" : "text-red-200"}`}>{qualityControl.duplicateGroupCount}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Doublons</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2 text-center"><p className={`text-base font-bold ${qualityControl.appliedToProduction === 0 ? "text-emerald-100" : "text-red-200"}`}>{qualityControl.appliedToProduction}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">En production</p></div>
    </div>

    <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-100"><AlertTriangle className="h-3.5 w-3.5" />P1.6 reste officiellement ouverte</p>
      <p className="mt-1 text-[9px] leading-relaxed text-slate-400">Fenêtre réelle : {qualityControl.p1Observation.completedDays}/{qualityControl.p1Observation.requiredDays} jour(s) · verdict {qualityControl.p1Observation.verdict}. La préparation Phase 5 ne remplace aucun bilan P1.6.</p>
    </div>

    {qualityControl.rules.length > 0 && <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/25 p-3"><p className="text-[10px] font-semibold text-slate-200">Motifs détectés</p><div className="mt-2 flex flex-wrap gap-1">{qualityControl.rules.map(item => <span key={item.rule} className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-slate-300">{RULE_LABELS[item.rule] ?? item.rule} · {item.count}</span>)}</div></div>}

    <div className="mt-3 grid gap-2 lg:grid-cols-2" aria-label="Statuts QC des huit flux P1">
      {qualityControl.sources.map(source => <article key={source.sourceKey} className="rounded-xl border border-white/10 bg-slate-950/25 p-3"><div className="flex items-start justify-between gap-2"><div><h3 className="text-xs font-semibold text-slate-100">{source.displayName}</h3><p className="mt-0.5 text-[9px] text-slate-500">{source.total} valeur(s) évaluée(s)</p></div><span className={`rounded-full border px-2 py-1 text-[8px] font-semibold ${source.available ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-red-300/25 bg-red-300/10 text-red-100"}`}>{source.available ? "Disponible" : "Indisponible"}</span></div><div className="mt-2 flex flex-wrap gap-1">{(Object.entries(source.counts) as Array<[keyof QualityCounts, number]>).filter(([, count]) => count > 0).map(([status, count]) => <span key={status} className={`rounded-full border px-2 py-1 text-[8px] ${STATUS_STYLE[status]}`}>{status} {count}</span>)}</div></article>)}
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Statuts QC par variable">
      {qualityControl.byVariable.map(variable => <div key={variable.variable} className="rounded-xl border border-white/10 bg-slate-950/25 p-2.5"><p className="text-[10px] font-semibold text-slate-100">{VARIABLE_LABELS[variable.variable] ?? variable.variable}</p><p className="mt-1 text-[8px] text-slate-500">{variable.total} valeur(s) · {variable.counts.VALID} valid · {variable.counts.SUSPECT} suspect · {variable.counts.MISSING} absent</p></div>)}
    </div>

    <p className="mt-3 text-[9px] leading-relaxed text-slate-500">`SUSPECT` reste utilisable avec avertissement. `INVALID`, `MISSING` et `STALE` sont exclus uniquement de l’analyse Phase 5 shadow ; aucun moteur de production ne lit cette décision.</p>
    <p className="mt-2 flex items-center gap-1.5 text-[9px] text-emerald-200/85"><CheckCircle2 className="h-3.5 w-3.5" />QC shadow uniquement · version {qualityControl.version}</p>
  </section>;
}
