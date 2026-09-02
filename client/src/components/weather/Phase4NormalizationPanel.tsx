import React from "react";
import { Database, ShieldCheck, TriangleAlert } from "lucide-react";

type Phase4Normalization = {
  version: string;
  expectedVariableCount: number;
  ingestedVariableCount: number;
  normalizedValueCount: number;
  missingValueCount: number;
  issueValueCount: number;
  legacyValueCount: number;
  canonicalUnitMismatchCount: number;
  appliedToProduction: number;
  normalizationAppliedToProduction: number;
  nonShadowValueCount: number;
  productionReadsEnabled: boolean;
  valid: boolean;
  issues: Array<{ issue: string; count: number }>;
  variables: Array<{
    variable: string;
    canonicalUnit: string;
    levelKey: string;
    status: "NORMALIZED" | "PARTIAL" | "LEGACY_ONLY" | "NO_INGESTION";
    totalValueCount: number;
    normalizedValueCount: number;
    missingValueCount: number;
    issueValueCount: number;
    legacyValueCount: number;
    canonicalUnitMismatchCount: number;
    sourceUnits: string[];
    conversions: Array<{ conversion: string; count: number }>;
    issues: Array<{ issue: string; count: number }>;
    appliedToProduction: number;
  }>;
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
  air_pressure_msl: "Pression niveau mer",
  air_pressure_surface: "Pression de surface",
  cloud_cover_total: "Nébulosité totale",
  visibility: "Visibilité",
  snowfall_amount: "Neige",
  weather_code: "Code météo WMO",
};

const STATUS_LABEL = {
  NORMALIZED: "Normalisé",
  PARTIAL: "Partiel",
  LEGACY_ONLY: "Historique P1",
  NO_INGESTION: "Sans ingestion",
} as const;

const STATUS_STYLE = {
  NORMALIZED: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  PARTIAL: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  LEGACY_ONLY: "border-slate-500/40 bg-slate-700/20 text-slate-300",
  NO_INGESTION: "border-slate-700 bg-slate-950/40 text-slate-500",
} as const;

const CONVERSION_LABELS: Record<string, string> = {
  celsius_identity: "°C conservé",
  kilometres_per_hour_identity: "km/h conservé",
  millimetres_identity: "mm conservé",
  percentage_identity: "% conservé",
  degrees_identity: "degrés conservés",
  degrees_wrap_360_to_0: "360° ramené à 0°",
  hectopascals_identity: "hPa conservé",
  wmo_code_identity: "code WMO conservé",
  missing_value: "valeur manquante conservée",
};

export function Phase4NormalizationPanel({ normalization }: { normalization: Phase4Normalization }) {
  return <section className="rounded-2xl border border-violet-300/25 bg-violet-300/[0.045] p-4" aria-labelledby="phase4-normalization-title">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2"><Database className="mt-0.5 h-5 w-5 shrink-0 text-violet-200" /><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-200/75">Phase 4 · Rapport propriétaire</p><h2 id="phase4-normalization-title" className="text-sm font-semibold text-slate-100">Normalisation canonique shadow</h2><p className="mt-1 text-[10px] leading-relaxed text-slate-400">Unités, fuseaux, coordonnées et valeurs manquantes sont tracés sans modifier les données de production.</p></div></div>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold ${normalization.valid ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-red-300/25 bg-red-300/10 text-red-100"}`}>{normalization.ingestedVariableCount}/{normalization.expectedVariableCount} variables</span>
    </div>

    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2"><p className="text-base font-bold text-violet-100">{normalization.normalizedValueCount}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Normalisées</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2"><p className="text-base font-bold text-slate-200">{normalization.legacyValueCount}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Héritées</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2"><p className={`text-base font-bold ${normalization.issueValueCount === 0 ? "text-emerald-100" : "text-amber-100"}`}>{normalization.issueValueCount}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">Anomalies</p></div>
      <div className="rounded-xl border border-white/10 bg-slate-950/25 p-2"><p className={`text-base font-bold ${normalization.appliedToProduction === 0 ? "text-emerald-100" : "text-red-200"}`}>{normalization.appliedToProduction}</p><p className="text-[7px] uppercase tracking-wide text-slate-500">En production</p></div>
    </div>

    {normalization.issues.length > 0 && <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3"><p className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-100"><TriangleAlert className="h-3.5 w-3.5" />Anomalies structurelles explicites</p><div className="mt-2 flex flex-wrap gap-1">{normalization.issues.map(issue => <span key={issue.issue} className="rounded-full border border-amber-300/20 px-2 py-1 text-[9px] text-amber-100">{issue.issue} · {issue.count}</span>)}</div></div>}

    <div className="mt-3 grid gap-2 lg:grid-cols-2" aria-label="Variables du contrat de normalisation Phase 4">
      {normalization.variables.map(variable => <article key={variable.variable} className="rounded-xl border border-white/10 bg-slate-950/25 p-3">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="text-xs font-semibold text-slate-100">{VARIABLE_LABELS[variable.variable] ?? variable.variable}</h3><p className="mt-0.5 text-[9px] text-slate-500">Unité canonique : {variable.canonicalUnit} · niveau {variable.levelKey}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-semibold ${STATUS_STYLE[variable.status]}`}>{STATUS_LABEL[variable.status]}</span></div>
        {variable.totalValueCount > 0 ? <><div className="mt-2 grid grid-cols-4 gap-1 text-center"><p className="rounded-lg bg-violet-300/[0.06] px-1 py-1.5 text-[8px] text-violet-100"><strong className="block text-[10px]">{variable.normalizedValueCount}</strong>norm.</p><p className="rounded-lg bg-slate-700/20 px-1 py-1.5 text-[8px] text-slate-300"><strong className="block text-[10px]">{variable.legacyValueCount}</strong>hérit.</p><p className="rounded-lg bg-amber-300/[0.05] px-1 py-1.5 text-[8px] text-amber-100"><strong className="block text-[10px]">{variable.issueValueCount}</strong>écarts</p><p className="rounded-lg bg-slate-700/20 px-1 py-1.5 text-[8px] text-slate-300"><strong className="block text-[10px]">{variable.missingValueCount}</strong>vides</p></div>{variable.sourceUnits.length > 0 && <p className="mt-2 text-[9px] leading-relaxed text-slate-400">Unités source : <span className="text-slate-200">{variable.sourceUnits.join(", ")}</span></p>}{variable.conversions.length > 0 && <p className="mt-1 text-[9px] leading-relaxed text-slate-400">Conversion : <span className="text-violet-100">{variable.conversions.slice(0, 2).map(item => `${CONVERSION_LABELS[item.conversion] ?? item.conversion} (${item.count})`).join(", ")}</span></p>}</> : <p className="mt-2 text-[9px] leading-relaxed text-slate-500">Aucune valeur réellement ingérée pour cette variable. Aucun contenu n’est simulé.</p>}
      </article>)}
    </div>

    <p className="mt-3 text-[9px] leading-relaxed text-slate-500">Les lignes héritées restent inchangées. La préparation Phase 5 utilise une preuve QC séparée et ne remplace pas la normalisation.</p>
    <p className="mt-2 flex items-center gap-1.5 text-[9px] text-emerald-200/85"><ShieldCheck className="h-3.5 w-3.5" />Normalisation shadow uniquement · version {normalization.version}</p>
  </section>;
}
