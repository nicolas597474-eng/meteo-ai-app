import { useEffect, useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "@/contexts/LocationContext";
import { usePageWeatherSky } from "@/hooks/usePageWeatherSky";
import { Link } from "wouter";
import { AlertTriangle, BarChart3, BookOpen, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleDashed, CircleHelp, ClipboardCheck, Clock, Database, FlaskConical, Lightbulb, ListTree, MapPinned, MapPin, RefreshCw, SlidersHorizontal, X, Zap } from "lucide-react";
import { MeteoSurface } from "@/components/weather/MeteoSurface";
import { BackToTopButton } from "@/components/BackToTopButton";
import { getValidationModelSource } from "@/lib/validationModelSource";
import { WeatherStatusBadge } from "@/components/weather/WeatherStatusBadge";
import { ForecastAlignmentPanel } from "@/components/weather/ForecastAlignmentPanel";
import { shouldRetryWeatherQuery, WEATHER_QUERY_SLOW_MS, weatherRetryDelay } from "@/lib/weatherQueryRecovery";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getForecastModelGuide } from "@/lib/forecastModelGuides";
import { formatCollectionTimestamp } from "@/lib/collectionTimestamp";
import { ForecastFlowStatusBadge, ForecastFlowStatusLegend } from "@/components/weather/ForecastFlowStatusBadge";
import { ProviderRunEvidencePanel } from "@/components/weather/ProviderRunEvidencePanel";
import { P1ObservationPanel } from "@/components/weather/P1ObservationPanel";
import { Phase2SourceClassificationPanel } from "@/components/weather/Phase2SourceClassificationPanel";
import { Phase3HorizonHierarchyPanel } from "@/components/weather/Phase3HorizonHierarchyPanel";
import { Phase4NormalizationPanel } from "@/components/weather/Phase4NormalizationPanel";
import { Phase5QualityControlPanel } from "@/components/weather/Phase5QualityControlPanel";
import { Phase6SmartFusionPanel } from "@/components/weather/Phase6SmartFusionPanel";
import { DailyUnifiedShadowPanel } from "@/components/weather/DailyUnifiedShadowPanel";
import { Phase7LocalPerformancePanel } from "@/components/weather/Phase7LocalPerformancePanel";
import { Phase8MetricsPanel } from "@/components/weather/Phase8MetricsPanel";
import { Phase8ValidationProgressPanel } from "@/components/weather/Phase8ValidationProgressPanel";
import { LocalTemperatureNowcastingPanel } from "@/components/weather/LocalTemperatureNowcastingPanel";
import { LocalPrecipitationNowcastingPanel } from "@/components/weather/LocalPrecipitationNowcastingPanel";

function IndicatorHelp({ title, children }: { title: string; children: ReactNode }) {
  return <Popover><PopoverTrigger asChild><button type="button" aria-label={`Comprendre le calcul : ${title}`} className="grid h-6 w-6 place-items-center rounded-full border border-slate-700/70 bg-slate-950/30 text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><CircleHelp className="h-3.5 w-3.5" /></button></PopoverTrigger><PopoverContent side="bottom" align="center" sideOffset={8} collisionPadding={12} className="z-[80] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-slate-600 bg-[#101622] px-3 py-3 text-left text-[11px] leading-relaxed text-slate-100 shadow-xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200/75">Définition de la mesure</p><p className="mt-1 text-sm font-semibold text-white">{title}</p></div><PopoverClose type="button" aria-label="Fermer l’aide" className="-mt-0.5 -mr-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-700/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><X className="h-3.5 w-3.5" /></PopoverClose></div><div className="mt-2.5 space-y-2 text-slate-200">{children}</div></PopoverContent></Popover>;
}

function HelpDetail({ label, children }: { label: string; children: ReactNode }) {
  return <p><span className="font-semibold text-sky-100">{label} · </span>{children}</p>;
}

function manualRefreshTime(value: string | null) {
  if (!value) return "aucun horodatage récent";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Paris" })
    : "horodatage indisponible";
}

function manualRefreshGranularity(label: string, result: { status: "succeeded" | "partial" | "failed"; modelCount: number; expectedModelCount: number; updatedAt: string | null; error?: string }) {
  const state = result.status === "succeeded" ? "succès" : result.status === "partial" ? "partiel" : "échec";
  return `${label} : ${state}, ${result.modelCount}/${result.expectedModelCount} modèles officiels · ${manualRefreshTime(result.updatedAt)}${result.error ? ` · ${result.error}` : ""}`;
}

type SimulationStep = {
  id: string;
  title: string;
  summary: string;
  detail: ReactNode;
  status: "complete" | "partial" | "waiting";
};

function SimulationStatusIcon({ status }: { status: SimulationStep["status"] }) {
  if (status === "complete") return <CircleCheck className="h-4 w-4 text-emerald-300" />;
  if (status === "partial") return <CircleAlert className="h-4 w-4 text-amber-300" />;
  return <CircleDashed className="h-4 w-4 text-slate-500" />;
}

function FusionSimulation({ steps, snapshotLabel }: { steps: SimulationStep[]; snapshotLabel: string }) {
  const [activeStep, setActiveStep] = useState(0);
  const current = steps[Math.min(activeStep, Math.max(steps.length - 1, 0))];
  if (!current) return null;
  const goTo = (index: number) => setActiveStep(Math.max(0, Math.min(steps.length - 1, index)));
  return <section className="rounded-2xl border border-sky-400/25 bg-[linear-gradient(135deg,rgba(14,116,144,0.10),rgba(13,19,29,0.98)_42%)] p-4" aria-labelledby="fusion-simulation-title"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><ListTree className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" /><div><h2 id="fusion-simulation-title" className="text-sm font-semibold text-slate-100">Simulation de la fusion</h2><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Parcours de la trace réellement disponible : chaque étape décrit le snapshot, sans rejouer ni inventer de données.</p></div></div><span className="shrink-0 rounded-full border border-sky-300/20 bg-sky-400/10 px-2 py-1 text-[9px] font-semibold text-sky-100">{snapshotLabel}</span></div><div className="mt-4 grid grid-cols-[minmax(90px,0.72fr)_minmax(0,1.5fr)] gap-3 sm:grid-cols-[126px_minmax(0,1fr)]"><div className="relative space-y-1.5 before:absolute before:bottom-4 before:left-3 before:top-4 before:w-px before:bg-sky-300/20" aria-label="Étapes de la simulation">{steps.map((step, index) => <button key={step.id} type="button" onClick={() => goTo(index)} aria-current={index === activeStep ? "step" : undefined} className={`relative z-10 flex min-h-9 w-full items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${index === activeStep ? "border-sky-300/55 bg-sky-400/15" : "border-transparent bg-slate-950/20 hover:border-slate-700"}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[9px] font-bold ${index === activeStep ? "border-sky-200 bg-sky-300 text-slate-950" : "border-slate-600 bg-[#101722] text-slate-200"}`}>{index + 1}</span><span className="min-w-0"><span className="block truncate text-[9px] font-semibold leading-tight text-slate-200">{step.title}</span><span className="mt-0.5 flex items-center gap-1 text-[8px] text-slate-500"><SimulationStatusIcon status={step.status} /><span>{step.status === "complete" ? "Trace" : step.status === "partial" ? "Partiel" : "Attente"}</span></span></span></button>)}</div><div className="min-w-0"><article className="min-h-[246px] rounded-xl border border-slate-700/80 bg-[#080d14]/80 p-3" aria-live="polite"><div className="flex items-start gap-2"><SimulationStatusIcon status={current.status} /><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200/75">Étape {activeStep + 1} sur {steps.length}</p><h3 className="mt-1 text-sm font-semibold text-slate-100">{current.title}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-300">{current.summary}</p></div></div><div className="mt-3 border-t border-slate-700/70 pt-3 text-[11px] leading-relaxed text-slate-400">{current.detail}</div></article><div className="mt-3 flex items-center justify-between gap-2"><button type="button" onClick={() => goTo(activeStep - 1)} disabled={activeStep === 0} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-700 px-2 text-[10px] font-medium text-slate-300 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />Précédent</button><button type="button" onClick={() => goTo(activeStep + 1)} disabled={activeStep === steps.length - 1} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-sky-400/35 bg-sky-400/10 px-2 text-[10px] font-semibold text-sky-100 disabled:opacity-40">Suivant<ChevronRight className="h-3.5 w-3.5" /></button></div></div></div></section>;
}

function StationSimulation({ steps }: { steps: SimulationStep[] }) {
  const [activeStep, setActiveStep] = useState(0);
  const current = steps[Math.min(activeStep, Math.max(steps.length - 1, 0))];
  if (!current) return null;
  const goTo = (index: number) => setActiveStep(Math.max(0, Math.min(steps.length - 1, index)));
  return <section className="rounded-2xl border border-emerald-400/25 bg-[linear-gradient(135deg,rgba(5,150,105,0.10),rgba(13,19,29,0.98)_42%)] p-4" aria-labelledby="station-simulation-title"><div className="flex items-start gap-2"><MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><div><h2 id="station-simulation-title" className="text-sm font-semibold text-slate-100">Branche complémentaire · Stations locales</h2><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Parcours des observations physiques : recherche, filtrage, synthèse locale et niveau de preuve. Cette branche ne modifie pas la prévision fusionnée.</p></div></div><div className="mt-4 grid grid-cols-[minmax(90px,0.72fr)_minmax(0,1.5fr)] gap-3 sm:grid-cols-[126px_minmax(0,1fr)]"><div className="relative space-y-1.5 before:absolute before:bottom-4 before:left-3 before:top-4 before:w-px before:bg-emerald-300/20" aria-label="Étapes des stations locales">{steps.map((step, index) => <button key={step.id} type="button" onClick={() => goTo(index)} aria-current={index === activeStep ? "step" : undefined} className={`relative z-10 flex min-h-9 w-full items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${index === activeStep ? "border-emerald-300/55 bg-emerald-400/15" : "border-transparent bg-slate-950/20 hover:border-slate-700"}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[9px] font-bold ${index === activeStep ? "border-emerald-200 bg-emerald-300 text-slate-950" : "border-slate-600 bg-[#101722] text-slate-200"}`}>{index + 1}</span><span className="min-w-0"><span className="block truncate text-[9px] font-semibold leading-tight text-slate-200">{step.title}</span><span className="mt-0.5 flex items-center gap-1 text-[8px] text-slate-500"><SimulationStatusIcon status={step.status} /><span>{step.status === "complete" ? "Trace" : step.status === "partial" ? "Partiel" : "Attente"}</span></span></span></button>)}</div><div className="min-w-0"><article className="min-h-[222px] rounded-xl border border-slate-700/80 bg-[#080d14]/80 p-3" aria-live="polite"><div className="flex items-start gap-2"><SimulationStatusIcon status={current.status} /><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200/75">Étape {activeStep + 1} sur {steps.length}</p><h3 className="mt-1 text-sm font-semibold text-slate-100">{current.title}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-300">{current.summary}</p></div></div><div className="mt-3 border-t border-slate-700/70 pt-3 text-[11px] leading-relaxed text-slate-400">{current.detail}</div></article><div className="mt-3 flex items-center justify-between gap-2"><button type="button" onClick={() => goTo(activeStep - 1)} disabled={activeStep === 0} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-700 px-2 text-[10px] font-medium text-slate-300 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />Précédent</button><button type="button" onClick={() => goTo(activeStep + 1)} disabled={activeStep === steps.length - 1} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-emerald-400/35 bg-emerald-400/10 px-2 text-[10px] font-semibold text-emerald-100 disabled:opacity-40">Suivant<ChevronRight className="h-3.5 w-3.5" /></button></div></div></div></section>;
}

function stationFreshnessLabel(updatedAt: Date | string | null | undefined) {
  if (!updatedAt) return "Heure de mise à jour indisponible";
  const date = new Date(updatedAt);
  if (!Number.isFinite(date.getTime())) return "Heure de mise à jour indisponible";
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (elapsedMinutes < 2) return "Mise à jour il y a moins de 2 min";
  if (elapsedMinutes < 60) return `Mise à jour il y a ${elapsedMinutes} min`;
  return `Mise à jour à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}`;
}

type VariableCoverageEvidence = {
  key: string;
  label: string;
  status: string;
  requested?: boolean;
  documentationStatus?: "documented" | "unconfirmed";
  requestedCount: number;
  returnedCount?: number;
  receivedCount: number;
  missingCount?: number;
  outOfHorizonCount?: number;
  archivedCount: number | null;
  exposedCount: number;
  consumerProjected?: boolean;
  unit?: string | null;
};

type ModelCoverageEvidence = {
  modelName?: string;
  status: string;
  requestAttempts?: number;
  requestedDays?: number;
  returnedDays?: number;
  targetDateInResponse?: boolean;
  firstReturnedDate?: string | null;
  lastReturnedDate?: string | null;
  requestedForecastDays?: number;
  returnedHours?: number;
  firstValidAt?: string | null;
  lastValidAt?: string | null;
  maximumDocumentedDays?: number | null;
  horizonSourceUrl?: string | null;
  archiveRowsExpected?: number;
  archiveRowsWritten?: number | null;
  archiveWriteConfirmed?: boolean | null;
  expectedArchiveRows?: number;
  projectionRowsWritten?: number;
  variables?: VariableCoverageEvidence[];
};

type HourlyModelCollectionEvidence = {
  model: string;
  modelId: string | null;
  isOfficialModel: boolean;
  status: "attempting" | "succeeded" | "partial" | "failed" | "safe_error";
  requestAttempts: number;
  hoursReceived: number;
  valuesReceived: number;
  expectedValueCount: number;
  archiveRowsWritten: number;
  projectionRowsWritten: number;
  errorCode: string | null;
  attemptedAt: number;
  completedAt: number | null;
  variableCoverage: ModelCoverageEvidence | null;
};

function VariableCoverageEvidenceSection({ title, evidence, granularity }: {
  title: string;
  evidence: ModelCoverageEvidence | null;
  granularity: "daily" | "hourly";
}) {
  const statusLabels: Record<string, string> = {
    available: "disponible",
    partial: "partiel",
    missing: "aucune valeur reçue",
    out_of_horizon: "hors horizon effectivement retourné",
    not_requested: "non demandé",
    request_failed: "échec de requête",
    unconfirmed: "prise en charge non confirmée",
  };
  const first = granularity === "daily" ? evidence?.firstReturnedDate : evidence?.firstValidAt;
  const last = granularity === "daily" ? evidence?.lastReturnedDate : evidence?.lastValidAt;
  const returned = granularity === "daily" ? evidence?.returnedDays : evidence?.returnedHours;
  const requested = granularity === "daily" ? evidence?.requestedDays : evidence?.requestedForecastDays;
  const hasVariables = Array.isArray(evidence?.variables);

  return <section className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3">
      <h3 className="text-xs font-semibold text-cyan-100">{title}</h3>
      {!evidence || !hasVariables ? <p className="mt-1.5 text-[10px] leading-relaxed text-slate-300">Cette trace ne contient pas de preuve par champ. Les anciennes données ne sont pas reconstruites.</p> : <>
      <p className="mt-1.5 text-[10px] leading-relaxed text-slate-300">Fenêtre {granularity === "daily" ? "quotidienne" : "horaire"} demandée : {requested ?? "—"}{granularity === "daily" ? " jours" : " jour(s)"} · {returned ?? 0} pas retourné(s) · {first ?? "—"} → {last ?? "—"}. {evidence.maximumDocumentedDays == null ? "Limite documentée non spécifique à ce flux." : `Limite du produit documentée : jusqu’à ${evidence.maximumDocumentedDays} jours; ce n’est pas une garantie pour chaque réponse.`}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-cyan-100/80">La limite documentée donne du contexte, mais ne remplace jamais le contrôle de la réponse réelle : le moteur sélectionne les seules valeurs reçues pour la variable et la validTime exactes. Une absence hors portée n’est pas un échec de performance; les métriques utilisent uniquement des paires prévision–observation réellement évaluables.</p>
      {granularity === "daily" && <p className="mt-1 text-[10px] text-slate-400">Date cible : {evidence.targetDateInResponse ? "présente dans la réponse" : "absente de la réponse"} · {evidence.requestAttempts ?? 0} tentative(s). L’archive quotidienne {evidence.archiveWriteConfirmed === false ? "n’est pas confirmée" : "est suivie par champ ci-dessous"}.</p>}
      {granularity === "hourly" && <p className="mt-1 text-[10px] text-slate-400">Archive : {evidence.archiveRowsWritten ?? 0}/{evidence.expectedArchiveRows ?? 0} lignes · vue horaire : {evidence.projectionRowsWritten ?? 0}/{returned ?? 0} lignes · {evidence.requestAttempts ?? 0} requête(s).</p>}
      {evidence.horizonSourceUrl && <a href={evidence.horizonSourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[9px] font-medium text-cyan-200 underline underline-offset-2">Source de la limite documentée</a>}
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2" aria-label={`${title} par variable`}>
        {evidence.variables!.map((variable) => <div key={variable.key} className="rounded-lg border border-white/10 bg-slate-950/25 px-2.5 py-2">
          <div className="flex items-start justify-between gap-2"><span className="text-[10px] font-semibold text-slate-100">{variable.label}{variable.unit ? ` · ${variable.unit}` : ""}</span><span className="shrink-0 text-[9px] text-cyan-100">{statusLabels[variable.status] ?? variable.status}</span></div>
          <p className="mt-1 text-[9px] leading-relaxed text-slate-400">{variable.requested === false ? "Non demandé" : `${variable.receivedCount}/${variable.requestedCount} valeur(s) reçue(s)`} · archive {variable.archivedCount == null ? "non confirmée" : `${variable.archivedCount}`} · exposé {variable.exposedCount}{granularity === "hourly" && variable.consumerProjected === false ? " (pas dans la projection consommateur)" : ""}{variable.outOfHorizonCount ? ` · hors horizon ${variable.outOfHorizonCount}` : ""}</p>
          {variable.documentationStatus === "unconfirmed" && <p className="mt-1 text-[9px] text-amber-100">Support de cette moyenne quotidienne non confirmé dans la documentation; aucune dérivation horaire appliquée.</p>}
        </div>)}
      </div>
    </>}
  </section>;
}

function ForecastModelGuideDialog({
  modelName,
  collectionAttempt,
  dailyCoverage,
  collectionAvailable,
  onOpenChange,
}: {
  modelName: string | null;
  collectionAttempt: HourlyModelCollectionEvidence | null;
  dailyCoverage: ModelCoverageEvidence | null;
  collectionAvailable: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const guide = getForecastModelGuide(modelName ?? "Open-Meteo");
  const statusLabel = collectionAttempt ? ({
    attempting: "Tentative en cours ou interrompue",
    succeeded: "Réponse complète et écritures confirmées",
    partial: "Réponse ou persistance partielle",
    failed: "Réponse fournisseur inexploitable",
    safe_error: "Erreur réseau ou persistance sûre",
  } as const)[collectionAttempt.status] : null;
  const statusTone = collectionAttempt?.status === "succeeded" ? "text-emerald-200"
    : collectionAttempt?.status === "partial" ? "text-amber-200"
      : collectionAttempt?.status === "attempting" ? "text-sky-200" : "text-red-200";
  const errorLabels: Record<string, string> = {
    timeout: "Délai fournisseur dépassé",
    source_unavailable: "Source météo indisponible après les réessais",
    provider_http_4xx: "Le fournisseur a refusé la requête",
    provider_http_5xx: "Le fournisseur a répondu en erreur serveur",
    provider_http_error: "Réponse HTTP fournisseur invalide",
    invalid_response: "Réponse fournisseur mal formée",
    no_usable_data: "Aucune valeur horaire exploitable reçue",
    database_unavailable: "Base de données indisponible",
    archive_write_failed: "Écriture de l’archive immuable non confirmée",
    projection_write_failed: "Mise à jour de la vue horaire non confirmée",
    write_failed: "Écriture non confirmée",
    collection_failed: "Collecte interrompue avant le résultat par modèle",
  };
  const attemptedAt = collectionAttempt ? new Date(collectionAttempt.attemptedAt) : null;
  const attemptedAtLabel = attemptedAt && Number.isFinite(attemptedAt.getTime())
    ? attemptedAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Paris" })
    : "heure indisponible";
  return <Dialog open={Boolean(modelName)} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100dvh-1.5rem)] max-w-[calc(100%-1rem)] overflow-y-auto rounded-2xl border border-sky-400/30 bg-[#0d131d] p-4 text-slate-100 sm:max-w-xl"><DialogHeader><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200/75">Comprendre le modèle et vérifier la collecte</p><DialogTitle className="pr-8 text-lg text-slate-50">{guide.name}</DialogTitle><DialogDescription className="pr-8 text-xs leading-relaxed text-slate-300">{guide.overview}</DialogDescription></DialogHeader><dl className="grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-white/10 bg-slate-950/35 p-3"><dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Organisme</dt><dd className="mt-1 text-xs font-medium text-slate-100">{guide.provider}</dd></div><div className="rounded-xl border border-white/10 bg-slate-950/35 p-3"><dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Périmètre</dt><dd className="mt-1 text-xs font-medium text-slate-100">{guide.coverage}</dd></div></dl><section className="rounded-xl border border-sky-300/15 bg-sky-300/[0.05] p-3"><h3 className="text-xs font-semibold text-sky-100">Comment il fonctionne</h3><p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">{guide.operation}</p></section><section className="rounded-xl border border-violet-300/15 bg-violet-300/[0.05] p-3"><h3 className="text-xs font-semibold text-violet-100">Ce que MeteoAI en fait</h3><p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">{guide.contribution}</p></section><section className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3"><h3 className="text-xs font-semibold text-amber-100">Limite à connaître</h3><p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">{guide.limit}</p></section>
    <section className="rounded-xl border border-white/10 bg-slate-950/35 p-3" aria-label="Dernière tentative horaire planifiée">
      <h3 className="text-xs font-semibold text-sky-100">Dernière tentative horaire planifiée</h3>
      {!collectionAvailable ? <p className="mt-1.5 text-[11px] leading-relaxed text-amber-100">Le journal détaillé est indisponible (base ou migration non vérifiable). Les compteurs agrégés ne prouvent ni une requête ni une écriture pour ce modèle.</p>
        : !collectionAttempt ? <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">Aucune trace durable pour ce modèle et ce lieu. L’absence de trace ne permet pas de conclure si un ancien passage a tenté la requête.</p>
          : <><p className={`mt-1.5 text-[11px] font-semibold ${statusTone}`}>{statusLabel}</p><p className="mt-1 text-[10px] text-slate-400">Tentative : {attemptedAtLabel} · {collectionAttempt.requestAttempts} requête(s) fournisseur{collectionAttempt.requestAttempts > 1 ? "s" : ""}{collectionAttempt.modelId ? ` · modèle ${collectionAttempt.modelId}` : ""}</p><div className="mt-2 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg border border-white/10 p-2"><span className="text-slate-400">Réponse reçue</span><p className="mt-0.5 font-semibold text-slate-100">{collectionAttempt.hoursReceived} h · {collectionAttempt.valuesReceived}/{collectionAttempt.expectedValueCount} valeurs valides</p></div><div className="rounded-lg border border-white/10 p-2"><span className="text-slate-400">Archive immuable confirmée</span><p className="mt-0.5 font-semibold text-slate-100">{collectionAttempt.archiveRowsWritten} lignes</p></div><div className="rounded-lg border border-white/10 p-2"><span className="text-slate-400">Vue horaire confirmée</span><p className="mt-0.5 font-semibold text-slate-100">{collectionAttempt.projectionRowsWritten}/{collectionAttempt.hoursReceived} lignes</p></div><div className="rounded-lg border border-white/10 p-2"><span className="text-slate-400">État de la source</span><p className="mt-0.5 font-semibold text-slate-100">{collectionAttempt.isOfficialModel ? "Modèle officiel horaire" : "Référence agrégée, non officielle"}</p></div></div>{collectionAttempt.errorCode && <p className="mt-2 text-[10px] text-amber-100">Motif : {errorLabels[collectionAttempt.errorCode] ?? "Erreur technique classifiée"}.</p>}{collectionAttempt.isOfficialModel ? <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Cette trace prouve uniquement la collecte/écriture. Les preuves historiques qualifient le score, pas l’existence d’une prévision : une valeur disponible reste admissible dans une fusion robuste, et un modèle unique est signalé comme tel. Les absences hors de la portée d’un modèle ne sont pas des échecs de performance.</p> : <p className="mt-2 text-[10px] leading-relaxed text-violet-100">Best Match est conservé comme référence agrégée; il ne peut jamais remplacer l’un des sept modèles ni alimenter le moteur officiel horaire.</p>}</>}
    </section>
    <VariableCoverageEvidenceSection title="Couverture quotidienne par champ" evidence={dailyCoverage} granularity="daily" />
    <VariableCoverageEvidenceSection title="Couverture horaire par champ" evidence={collectionAttempt?.variableCoverage ?? null} granularity="hourly" />
    <a href={guide.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-sky-200 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">{guide.sourceLabel}<ChevronRight className="h-3.5 w-3.5" /></a></DialogContent></Dialog>;
}

function Stat({ label, value, tone = "text-slate-100", help }: { label: string; value: string; tone?: string; help?: ReactNode }) {
  return <MeteoSurface tone="lab" className="relative rounded-xl bg-black/20 px-2 py-2.5 text-center">{help ? <span className="absolute right-1.5 top-1.5">{help}</span> : null}<p className={`text-xl font-bold ${tone}`}>{value}</p><p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">{label}</p></MeteoSurface>;
}

function formatAgreementRange(measure: { range: number | null; standardDeviation: number | null; availableModelCount: number }, expectedModelCount: number, unit: string) {
  const range = measure.range == null ? "étendue indisponible" : `étendue ${measure.range.toFixed(1)} ${unit}`;
  const standardDeviation = measure.standardDeviation == null ? "σ population indisponible" : `σ population ${measure.standardDeviation.toFixed(1)} ${unit}`;
  return `${range} · ${standardDeviation} · ${measure.availableModelCount}/${expectedModelCount} modèles`;
}

const AI_LAB_GLOSSARY = [
  {
    title: "Fusion et indicateurs du haut",
    entries: [
      ["Fusion officielle", "Prévision calculée par échéance et variable à partir des seuls runs ayant fourni une valeur réelle, sélectionnés sur leur validTime et availableAt. Le nombre de contributeurs est dynamique; une absence hors de la portée normale d’un modèle n’est ni une erreur de performance ni un mauvais score. Les candidats en validation restent exclus; Best Match est une référence agrégée séparée."],
      ["Snapshot", "Une photo enregistrée à un moment précis : elle garde les modèles reçus, leurs poids et le résultat calculé à cet instant. Un snapshot « archivé » est cette photo conservée après une collecte ; un calcul « direct » est une photo créée pour la consultation actuelle. Ce n’est ni une nouvelle observation ni une promesse pour plus tard."],
      ["Accord inter-modèles", "Étendues en unités physiques, séparées pour chaque variable, entre modèles nommés. Le nombre disponible est indiqué par variable; au moins deux valeurs sont nécessaires pour calculer une étendue. Best Match et les agrégateurs sont exclus. L’accord ne mesure pas la fiabilité face aux observations."],
      ["Fiabilité historique", "MAE, RMSE, biais, effectifs, fenêtre et évolution restent des mesures brutes distinctes par modèle × variable × horizon. Une mesure est indisponible tant que ses seuils d’évidence propres ne sont pas satisfaits; aucun score global ne les remplace."],
      ["Flux appliqués", "Nombre de modèles déterministes présents dans la trace officielle actuelle. Best Match est une référence agrégée affichée à part, exclue de ce compteur et des preuves du moteur. Ce compteur ne mesure ni leur qualité ni le nombre de stations."],
    ],
  },
  {
    title: "Poids, paramètres et régime",
    entries: [
      ["Poids appliqué", "Part attribuée à un modèle pour un paramètre donné dans la fusion. Les poids sont des coefficients de calcul ; ils ne sont ni une probabilité ni une observation de station."],
      ["Sources appliquées par paramètre", "Liste distincte pour température, précipitations et vent. Un modèle peut contribuer différemment selon le paramètre si ses données ou ses preuves disponibles diffèrent."],
      ["Poids moyen d’un modèle", "C’est la moyenne des poids finaux réellement reçus par ce modèle pour les paramètres auxquels il a contribué : température, pluie, vent ou humidité. Ce n’est ni une note, ni une chance qu’il ait raison."],
      ["Pourquoi plusieurs flux ont le même poids moyen", "Lorsque plusieurs modèles officiels apportent les mêmes paramètres avec des conditions comparables, la fusion partage le poids disponible entre eux. Avec sept modèles équivalents, chacun pourrait recevoir environ 14 %. Best Match reste une référence séparée et n’entre ni dans ces poids ni dans les preuves du moteur."],
      ["Poids du régime, en clair", "Les pastilles T°, Pluie, Vent et Nuages indiquent ce qui compte le plus pour décrire le scénario météo du moment. Elles ne sont ni une probabilité ni un pourcentage de nuages."],
      ["Exemple : Ciel couvert", "Si le ciel est prévu très nuageux, la pastille Nuages peut compter davantage. Par exemple, Nuages 30 % ne veut pas dire 30 % de nuages : cela signifie seulement que l’état du ciel est important pour ce régime. Si la pluie ou le vent devient plus marqué, le résultat peut devenir Averses, Pluie ou Vent fort."],
    ],
  },
  {
    title: "Accord, tableaux et collecte",
    entries: [
      ["Accord des modèles", "Étendue min–max, en unités physiques et séparée par variable, parmi les modèles nommés disponibles. Il faut au moins deux valeurs pour calculer une étendue; Best Match et agrégateurs sont exclus. Un faible écart ne garantit pas une prévision exacte."],
      ["Prévisions quotidiennes des modèles officiels", "Les sept modèles forment le catalogue officiel; à chaque date et variable, seules les valeurs réellement reçues contribuent. Un modèle hors de sa portée normale n’est pas compté comme échec; un seul contributeur reste visible en statut SINGLE_MODEL et sa calibration est qualifiée séparément. Best Match reste une référence, pas une contribution."],
      ["Dernière collecte vérifiable", "Bilan du cycle le plus récent : stations physiques réellement trouvées, modèles journaliers et horaires réellement récupérés, et éventuelles indisponibilités."],
      ["Modèles en validation", "Candidats archivés séparément pour comparaison. Ils n’influencent ni la fusion, ni les poids, ni les compteurs actifs avant décision explicite fondée sur des preuves qualifiées."],
      ["Données insuffisantes / —", "Cette mention concerne le score historique ou l’accord, selon la mesure; elle ne supprime pas une prévision réellement disponible. Un contributeur reste affiché en statut SINGLE_MODEL; plusieurs sources sans preuves suffisantes produisent une valeur robuste avec le statut UNCALIBRATED_ROBUST. Les absences hors portée ne sont ni une mauvaise performance ni une pénalité de scoring."],
    ],
  },
  {
    title: "Observations réelles et analyse nocturne",
    entries: [
      ["Prévisions de référence · cycle 4 h", "À chaque cycle planifié, MeteoAI archive séparément les prévisions horaires reçues de chacun des sept modèles officiels pour chaque lieu favori. Best Match reste une référence agrégée distincte. Chaque émission conserve son horodatage et sert à comparer les observations réelles à la bonne échéance."],
      ["Relevés physiques de la journée", "Des snapshots horodatés conservent les relevés de stations physiques qualifiées. Les stations personnelles ne proviennent que de Netatmo après autorisation et contrôles de fraîcheur, distance et qualité."],
      ["Analyse de nuit · 00 h 30", "À 00 h 30, heure de Paris, MeteoAI examine la journée précédente une fois terminée. Ce décalage évite de noter une prévision sur une journée encore incomplète ; ce n’est donc pas un score immédiat affiché au soir."],
      ["Journée qualifiée", "Les snapshots doivent couvrir suffisamment d’heures physiques comparables. Si la couverture ou l’alignement manque, la journée est explicitement exclue du score opérationnel au lieu d’être complétée avec une valeur estimée."],
      ["Comparaison et métriques", "Pour chaque modèle, variable et horizon alignés, MeteoAI compare la prévision archivée au relevé physique. MAE, RMSE, biais, effectif et récence restent séparés; chaque métrique n’est disponible que si ses données et seuils propres sont qualifiés."],
    ],
  },
  {
    title: "Fiabilité, erreurs et horizons",
    entries: [
      ["Horizon de prévision", "Délai entre l’émission archivée et l’heure ou le jour prévus. Les performances historiques ne se mélangent pas entre horizons; si l’horodatage d’émission manque, l’horizon exact est indisponible."],
      ["MAE", "Erreur absolue moyenne : moyenne des écarts, sans signe, entre une prévision et une observation physique alignée. Plus elle est faible, plus la prévision a été proche des observations comparées."],
      ["RMSE", "Racine de l’erreur quadratique moyenne. Les grands écarts sont d’abord mis au carré, donc cette mesure pénalise davantage les erreurs importantes que le MAE."],
      ["Biais signé · diagnostic non appliqué", "Écart moyen signé entre les prévisions archivées et les observations qualifiées. Un biais positif indique une surestimation moyenne, un biais négatif une sous-estimation. Cette mesure reste descriptive : elle n’est jamais appliquée aux prévisions officielles futures."],
      ["Taille d’échantillon", "Nombre de paires prévision–observation physiques réellement comparables. Une valeur élevée améliore la maturité statistique, mais ne garantit pas à elle seule qu’un modèle est meilleur dans tous les contextes."],
      ["Seuils d’évidence", "Les seuils d’admissibilité restent ceux publiés par le registre pour la mesure et l’horizon concernés. En dessous, la métrique conserve le statut « données insuffisantes »; aucun classement ou score ne remplace le seuil manquant."],
    ],
  },
  {
    title: "Stations et limites locales",
    entries: [
      ["Station physique", "Relevé local issu d’un capteur, distinct d’un modèle. Une station n’est retenue que si sa mesure, sa fraîcheur et ses contrôles de qualité sont suffisants ; une donnée absente, trop ancienne, incohérente ou peu fiable est écartée."],
      ["Fraîcheur, distance et continuité", "La fraîcheur indique l’ancienneté d’un relevé, la distance son éloignement du lieu, et la continuité sa régularité dans le temps. Ces éléments aident à qualifier une station ; ils ne changent pas une prévision en observation réelle."],
      ["Dispersion", "Amplitude des différences entre les modèles contributeurs. Elle rend visible le désaccord, mais ne désigne pas le bon modèle et ne remplace pas une vérification par observation physique."],
      ["Source active ou en validation", "Un modèle actif peut contribuer à la fusion. Un modèle en validation est collecté et comparé séparément ; il reste hors fusion jusqu’à une décision explicite fondée sur des preuves qualifiées."],
      ["Maille et microclimat", "Un modèle représente une zone de calcul, pas chaque rue ou jardin. Relief, urbanisation, littoral ou capteurs rares peuvent créer des écarts locaux. L’AI Lab signale cette limite plutôt que d’inventer un ajustement microclimatique non corroboré."],
    ],
  },
  {
    title: "Sources, provenance et cartes",
    entries: [
      ["Prévisions des modèles", "La fusion s’appuie sur les flux des modèles actifs AROME, ARPEGE, ICON, ECMWF, GFS, GEM, UKMET et Open-Meteo lorsqu’ils répondent pour le lieu et le cycle. La trace indique les contributeurs effectivement appliqués ; un flux absent n’est pas remplacé par une valeur inventée."],
      ["Qualité de l’air", "L’indice européen AQI, les PM2.5, PM10, NO₂ et O₃ proviennent du service Air Quality d’Open-Meteo, qui s’appuie notamment sur CAMS. Cette information environnementale reste distincte de la fusion météo."],
      ["Stations locales", "Les stations personnelles proviennent uniquement de Netatmo Weather API après autorisation. Elles sont filtrées selon leur fraîcheur, leur distance et leurs contrôles de qualité avant de pouvoir servir de preuve physique."],
      ["Cartes interactives", "Les cartes et leurs contrôles utilisent Google Maps JavaScript API. La carte fournit le fond et l’interaction ; elle ne calcule pas les prévisions, les éclipses ni la fiabilité."],
      ["Soleil, Lune et phases", "Les heures de lever, coucher et durée du jour sont fournies par les éphémérides quotidiennes disponibles. La phase réelle, l’éclairage, l’azimut, la hauteur et les trajectoires apparentes du Soleil et de la Lune sont calculés pour le lieu actif avec Astronomy Engine."],
      ["Éclipses et essaims", "Les dates et informations de référence sont attribuées événement par événement à NASA, ESA ou Timeanddate. Les liens de la page astronomique permettent de consulter la référence associée."],
      ["Visibilité d’éclipse", "Les cellules bleues et violettes sont calculées localement avec Astronomy Engine. La bande centrale jaune de l’éclipse solaire 2027 est séparément attribuée à la NASA ; aucune grille calculée ne remplace une carte officielle de trajectoire."],
      ["Limites de source", "Les sites ou applications mentionnés à titre comparatif ne sont pas automatiquement des sources actives. Une référence affichée dans l’interface n’est prise en compte par la fusion que si elle apparaît dans sa trace."],
    ],
  },
  {
    title: "Astronomie locale et trajectoires",
    entries: [
      ["Coordonnées topocentriques", "Azimut et hauteur calculés depuis les coordonnées exactes du lieu actif, pour l’instant affiché. L’azimut décrit la direction sur l’horizon ; la hauteur est l’angle au-dessus ou au-dessous de cet horizon."],
      ["Trajectoire apparente", "Parcours du Soleil ou de la Lune dans le ciel au cours de la journée, échantillonné à partir de positions astronomiques réelles. Les segments sous l’horizon ne sont pas présentés comme visibles."],
      ["Phase lunaire géométrique", "Nom de phase déterminé par la géométrie Soleil–Terre–Lune, et non par le seul pourcentage d’éclairage. Ainsi, un croissant croissant n’est pas confondu avec un Premier quartier."],
      ["Éclairage lunaire", "Part apparente du disque lunaire éclairée par le Soleil. Cette valeur est calculée indépendamment du nom de phase ; deux instants peuvent avoir un éclairage proche sans appartenir exactement à la même phase."],
      ["Lever, culmination et coucher", "Le lever et le coucher correspondent au franchissement de l’horizon astronomique. La culmination est le passage le plus haut de l’astre pour le lieu et la journée concernés ; elle ne signifie pas nécessairement un azimut identique partout."],
      ["Horizon astronomique et relief local", "La ligne d’horizon de l’arche correspond à une hauteur de 0°. L’option Relief affiche en plus un profil terrain estimé par direction, obtenu à partir d’altitudes de terrain ; il indique une gêne possible mais ne remplace pas une étude d’observabilité sur site."],
      ["Simulation 24 h", "Le contrôle 24 h lit les échantillons de trajectoire déjà calculés pour permettre une visualisation accélérée, une pause et un déplacement manuel. Il ne constitue pas une nouvelle prévision et revient à la position actuelle une fois arrêté."],
    ],
  },
  {
    title: "Lecture du Dashboard et contexte local",
    entries: [
      ["Phénomène actuel", "Condition estimée pour l’instant présent, par exemple bruine ou averse. Elle est distincte de la tendance officielle de la journée, qui résume un scénario de prévision plus long."],
      ["Prévision officielle", "Prévision issue de la fusion tracée des modèles actifs. Elle reste distincte des observations physiques locales, qui servent à vérifier la cohérence et à alimenter les évaluations quand leur qualité le permet."],
      ["Modes Local et Ultra-local", "Lectures qui privilégient le contexte des stations et la proximité lorsque des relevés physiques validés sont disponibles. Elles n’inventent pas de mesure entre deux stations et ne remplacent pas la prévision officielle."],
      ["Moyenne locale pondérée", "Synthèse des observations locales disponibles, pondérée par des critères tels que distance, fraîcheur et qualité. Elle décrit le contexte observé, pas une température officielle garantie."],
      ["Prochain changement", "Premier créneau futur dont la condition prévue diffère de la condition actuelle. Cette information est une transition de prévision ; elle peut évoluer lors d’une nouvelle collecte."],
    ],
  },
  {
    title: "Historique, comparaisons et preuves",
    entries: [
      ["Prévision contre observation", "Comparaison entre une valeur prévue archivée et un relevé physique aligné dans le temps, le lieu, la variable et l’horizon. Sans paire comparable, aucune erreur n’est affichée comme si la validation avait eu lieu."],
      ["Métrique qualifiée", "MAE, RMSE et biais ne sont affichés qu’après validation de l’alignement et du seuil d’évidence correspondant. En deçà, effectif et motif d’indisponibilité restent visibles sans score de remplacement."],
      ["Fenêtre d’analyse", "Période sélectionnée pour la comparaison, par exemple 24 heures, 7 jours ou 30 jours. Elle modifie l’échantillon analysé et ne doit pas être interprétée comme une promesse pour les périodes suivantes."],
      ["Écart station–prévision", "Différence entre une synthèse de stations disponible et la prévision officielle sur un même créneau. Il renseigne sur le contexte local ; il ne prouve pas isolément qu’un modèle est mauvais."],
      ["Rayon de recherche", "Distance maximale utilisée pour rechercher des stations autour du lieu. Augmenter le rayon peut fournir plus de relevés mais peut aussi réduire leur représentativité locale."],
    ],
  },
] as const;

const AI_LAB_GLOSSARY_EXAMPLES: Record<string, string> = {
  "Fusion officielle": "Si trois modèles officiels prévoient une température proche, MeteoAI peut les combiner dans une même prévision; Best Match reste une référence séparée.",
  "Snapshot": "La prévision collectée à 05 h est conservée telle quelle ; demain, elle pourra être comparée aux relevés réellement archivés.",
  "Fiabilité historique": "Un MAE de 1,2 °C sur n prévisions alignées est rapporté avec son modèle, sa variable, son horizon, sa fenêtre et son effectif; ce n’est pas un score d’accord.",
  "Accord inter-modèles": "Si deux modèles indépendants prévoient 20 et 21 °C pour Tmax, l’étendue observée est de 1 °C; elle ne dit pas si l’un d’eux a raison.",
  "Flux appliqués": "Seuls les sept modèles officiels sont comptés s’ils contribuent réellement à la fusion. Best Match reste hors du moteur et de son compteur.",
  "Poids appliqué": "Pour la température, un modèle peut recevoir 20 % du calcul tandis qu’un autre reçoit 10 % ; ce sont des parts de calcul, pas leurs chances d’avoir raison.",
  "Sources appliquées par paramètre": "AROME peut aider pour la température, tandis qu’ECMWF aide aussi pour le vent : leurs contributions sont donc lues séparément.",
  "Poids moyen d’un modèle": "Un modèle qui a reçu 10 % pour la température et 20 % pour le vent affiche un poids moyen de 15 % sur ces deux contributions.",
  "Pourquoi plusieurs flux ont le même poids moyen": "Avec sept modèles officiels qui contribuent de façon comparable, la part disponible peut être répartie presque également, autour de 14 % chacun; Best Match est exclu.",
  "Poids du régime, en clair": "Pour un ciel couvert, les nuages peuvent compter plus que le vent dans la description du scénario ; cela ne dit pas quel modèle est meilleur.",
  "Exemple : Ciel couvert": "Si les nuages sont très présents mais qu’il n’y a ni pluie marquée ni vent fort, le scénario peut être Ciel couvert.",
  "Accord des modèles": "Si les modèles prévoient entre 19 et 20 °C, ils sont assez proches ; entre 15 et 24 °C, leur accord est faible.",
  "Prévisions quotidiennes des modèles officiels": "Le tableau officiel peut afficher AROME à 21 °C et ICON à 22 °C : ce sont leurs prévisions du jour, pas des températures mesurées; Best Match est présenté à part.",
  "Dernière collecte vérifiable": "Le bilan distingue une erreur de requête d’une valeur hors portée normale; aucune valeur de remplacement n’est attribuée et aucune absence hors portée ne devient une erreur de performance.",
  "Modèles en validation": "Un nouveau modèle peut être collecté et comparé pendant plusieurs jours sans modifier la prévision officielle.",
  "Données insuffisantes / —": "S’il manque les relevés physiques comparables, l’application affiche — pour le score de fiabilité, sans masquer une prévision reçue ni inventer une note.",
  "Prévisions de référence · cycle 4 h": "Chaque émission horaire est conservée avec son horodatage et son échéance; une nouvelle collecte crée une capture distincte et ne remplace pas l’archive antérieure.",
  "Relevés physiques de la journée": "Un relevé de station reçu à 14 h est gardé avec son horaire afin de pouvoir le comparer à la prévision de 14 h.",
  "Analyse de nuit · 00 h 30": "La journée de mardi est analysée après minuit, quand toutes ses heures sont terminées et comparables.",
  "Journée qualifiée": "Avec seulement une heure réellement observée sur dix-huit, la journée reste non qualifiée et aucun score complet n’est produit.",
  "Comparaison et scores": "Si un modèle prévoyait 20 °C et la station 18 °C au même créneau, cet écart sert à calculer ses erreurs.",
  "Horizon de prévision": "Une prévision pour cet après-midi est moins lointaine qu’une prévision à dix jours ; la seconde reçoit donc davantage d’incertitude.",
  "MAE": "Des écarts de 1, 2 et 3 °C donnent une MAE de 2 °C : on regarde la taille moyenne de l’erreur sans son sens.",
  "RMSE": "Une très grande erreur ponctuelle compte davantage dans le RMSE que dans la MAE, ce qui aide à repérer les ratés importants.",
  "Biais signé · diagnostic non appliqué": "Si un modèle prévoit souvent 1 °C de trop, son biais moyen est positif ; s’il prévoit trop froid, il est négatif. Ce constat est descriptif et ne corrige pas les prévisions futures.",
  "Taille d’échantillon": "Un bilan fondé sur 50 comparaisons est plus informatif qu’un bilan fondé sur seulement 2 comparaisons.",
  "Seuils de décision": "Avant le seuil requis, un modèle peut être observé, mais il ne reçoit pas encore de classement public comme s’il était suffisamment évalué.",
  "Station physique": "Une station qui mesure réellement température et vent près du lieu peut aider à vérifier une prévision, si ses données sont assez fraîches.",
  "Fraîcheur, distance et continuité": "Une station à 2 km mise à jour il y a 5 minutes est généralement plus utile qu’une station lointaine sans mise à jour récente.",
  "Dispersion": "Des prévisions de pluie de 0, 2 et 8 mm montrent une grande dispersion : les modèles ne décrivent pas la même situation.",
  "Source active ou en validation": "Un modèle actif influence la fusion ; un modèle en validation est observé à côté jusqu’à ce que les preuves soient suffisantes.",
  "Maille et microclimat": "Un modèle peut décrire la région autour de Hondeghem sans représenter exactement la température de chaque jardin ou rue.",
  "Prévisions des modèles": "Si ICON ne répond pas au cycle, il est absent de la trace ; MeteoAI ne fabrique pas sa prévision à partir d’un autre modèle.",
  "Qualité de l’air": "Un indice de qualité de l’air peut être affiché à côté de la météo, mais il ne sert pas à choisir la température ou la pluie fusionnée.",
  "Stations locales": "Une station personnelle trop ancienne ou trop éloignée reste visible comme information possible, mais elle n’est pas utilisée comme preuve qualifiée.",
  "Cartes interactives": "Déplacer la carte change seulement le point de vue ; cela ne modifie ni les modèles ni les calculs de prévision.",
  "Soleil, Lune et phases": "L’application peut afficher le coucher du Soleil et la phase de Lune du lieu choisi sans les confondre avec une prévision météo.",
  "Éclipses et essaims": "Pour une éclipse, la page renvoie vers la source officielle de l’événement au lieu d’affirmer une visibilité non vérifiée.",
  "Visibilité d’éclipse": "Une zone peut être géométriquement concernée par une éclipse, mais des nuages locaux peuvent encore empêcher de la voir.",
  "Limites de source": "Le nom d’un service dans une comparaison ne signifie pas qu’il contribue à la fusion du jour ; seule la trace le confirme.",
  "Coordonnées topocentriques": "Depuis Hondeghem, la Lune peut être au sud-est ; depuis une autre ville, son angle affiché n’est pas exactement le même.",
  "Trajectoire apparente": "La courbe du Soleil monte après le lever, atteint son point haut, puis descend jusqu’au coucher pour le lieu sélectionné.",
  "Phase lunaire géométrique": "Une Lune éclairée à moitié peut être un Premier quartier ou un Dernier quartier selon le sens de son évolution.",
  "Éclairage lunaire": "Deux nuits peuvent afficher 50 % d’éclairage, même si le nom précis de la phase n’est pas le même.",
  "Lever, culmination et coucher": "La culmination correspond au moment où l’astre est le plus haut dans le ciel local, entre son lever et son coucher.",
  "Horizon astronomique et relief local": "Une Lune proche de l’horizon peut être masquée par une colline ou un bâtiment, même si son calcul indique qu’elle est au-dessus de 0°.",
  "Simulation 24 h": "L’animation fait défiler des positions déjà calculées pour la journée ; elle ne prédit pas une nouvelle trajectoire.",
  "Phénomène actuel": "Une averse maintenant peut être affichée même si la tendance de la journée reste globalement nuageuse.",
  "Prévision officielle": "La prévision officielle résume la fusion des modèles ; elle ne devient pas un relevé réel même si une station est proche.",
  "Modes Local et Ultra-local": "Le mode Ultra-local privilégie les stations proches disponibles ; s’il n’y en a pas, il indique la limite plutôt que d’inventer une mesure.",
  "Moyenne locale pondérée": "Deux stations proches et fraîches peuvent compter davantage qu’une station lointaine, pour décrire le contexte local observé.",
  "Prochain changement": "Si le ciel est couvert à 10 h et des averses sont prévues à 14 h, ce créneau est affiché comme prochain changement.",
  "Prévision contre observation": "La prévision de 15 h est comparée uniquement à un relevé physique disponible autour de 15 h, pas à celui du matin.",
  "Score qualifié": "Sans assez de comparaisons fiables, l’application attend avant d’afficher un score plutôt que de donner un faux classement.",
  "Fenêtre d’analyse": "Sur 24 heures, on lit les écarts récents ; sur 30 jours, on observe une tendance plus longue avec davantage de comparaisons.",
  "Écart station–prévision": "Si la synthèse locale donne 18 °C et la prévision officielle 20 °C au même créneau, l’écart affiché est de 2 °C.",
  "Rayon de recherche": "Passer de 5 à 20 km peut trouver plus de stations, mais elles décrivent parfois moins précisément le quartier du lieu actif.",
};

function AILabGlossary() {
  const [isOpen, setIsOpen] = useState(false);
  return <details open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)} className="group rounded-2xl border border-sky-400/25 bg-sky-400/[0.055]">
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
      <span className="flex min-w-0 items-center gap-2"><BookOpen className="h-4 w-4 shrink-0 text-sky-200" /><span className="min-w-0"><span className="block text-sm font-semibold text-slate-100">Lexique, méthode et sources</span><span className="mt-0.5 block text-[10px] leading-relaxed text-slate-400">Comprendre les indicateurs, les poids, les collectes, les sources et les limites de l’AI Lab.</span></span></span>
      <ChevronDown className="h-4 w-4 shrink-0 text-sky-200 transition-transform duration-200 group-open:rotate-180" />
    </summary>
    <div className="space-y-4 border-t border-sky-300/15 px-4 py-4">
      <div className="sticky top-2 z-20 flex justify-end"><button type="button" onClick={() => setIsOpen(false)} aria-label="Fermer le Lexique" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-sky-300/30 bg-[#101722]/95 px-2.5 text-[10px] font-semibold text-sky-100 shadow-lg backdrop-blur hover:bg-sky-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><X className="h-3.5 w-3.5" />Fermer</button></div>
      <section className="rounded-xl border border-sky-300/20 bg-sky-300/[0.055] p-3" aria-label="La philosophie de MeteoAI">
        <p className="text-xs font-semibold text-sky-100">MeteoAI en quelques mots</p>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-200">MeteoAI n’essaie pas de présenter une prévision comme une certitude. Son objectif est de rapprocher les prévisions de plusieurs modèles, les observations physiques disponibles et le contexte local pour rendre la météo plus compréhensible, plus traçable et progressivement mieux adaptée à chaque lieu.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-white/8 bg-black/15 p-2.5"><p className="text-[10px] font-semibold text-sky-100">Comparer avant de privilégier</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">Les modèles sont confrontés aux observations archivées lorsqu’elles sont comparables ; un modèle n’est pas déclaré meilleur sans preuve qualifiée.</p></div>
          <div className="rounded-lg border border-white/8 bg-black/15 p-2.5"><p className="text-[10px] font-semibold text-sky-100">Apprendre sans réécrire le passé</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">Les nouvelles observations enrichissent les performances futures. Les historiques fiables restent conservés et ne sont pas réécrits pour embellir un résultat.</p></div>
          <div className="rounded-lg border border-white/8 bg-black/15 p-2.5"><p className="text-[10px] font-semibold text-sky-100">Expliquer les limites</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">L’accord inter-modèles et la fiabilité historique restent distincts. Lorsqu’une donnée ou une preuve manque, l’application l’indique au lieu d’inventer une valeur ou une note.</p></div>
        </div>
      </section>
      <p className="text-[11px] leading-relaxed text-slate-300">Les explications décrivent les calculs affichés pour le lieu et la trace en cours. Elles ne transforment jamais une prévision, une estimation ou une donnée manquante en observation réelle.</p>
      {AI_LAB_GLOSSARY.map((group) => <section key={group.title} className="rounded-xl border border-white/8 bg-black/15 p-3"><h2 className="text-xs font-semibold text-sky-100">{group.title}</h2><dl className="mt-2.5 space-y-2.5">{group.entries.map(([term, definition]) => <div key={term}><dt className="text-[11px] font-semibold text-slate-100">{term}</dt><dd className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{definition}</dd><dd className="mt-1 rounded-lg border border-sky-300/10 bg-sky-300/[0.04] px-2 py-1.5 text-[10px] leading-relaxed text-sky-100"><span className="font-semibold">Exemple · </span>{AI_LAB_GLOSSARY_EXAMPLES[term] ?? `Pour « ${term} », MeteoAI affiche une explication à partir des données disponibles, sans transformer une donnée manquante en résultat réel.`}</dd></div>)}</dl></section>)}
      <p className="rounded-xl border border-amber-300/15 bg-amber-300/[0.045] p-3 text-[10px] leading-relaxed text-amber-100"><b>À retenir :</b> un modèle peut être présent dans un tableau sans être « meilleur », un poids n’est pas une probabilité, et un accord entre modèles ne remplace pas une validation par observation physique.</p>
    </div>
  </details>;
}

type CollectionSuccess = {
  status: string;
  collectedAt?: Date | string | null;
  dailyModelCount?: number | null;
  hourlyModelCount?: number | null;
  date?: string | null;
  hour?: number | null;
  attempts?: number | null;
  stationCount?: number | null;
  reason?: string | null;
};

type NoStationSlot = { date: string; hour: number; attempts: number; reason?: string | null };

function collectionMomentLabel(collection: CollectionSuccess | null, kind: "forecast" | "physical") {
  if (!collection) return "Aucun succès vérifiable";
  if (kind === "forecast" && collection.collectedAt) {
    return `Mis à jour le ${formatCollectionTimestamp(collection.collectedAt)}`;
  }
  if (collection.date != null && collection.hour != null) return `${new Date(`${collection.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })} · ${String(collection.hour).padStart(2, "0")} h`;
  return "Horodatage indisponible";
}

function CollectionOperations({ forecast, physical, noStationSlots, scheduleCoverage }: { forecast: CollectionSuccess | null; physical: CollectionSuccess | null; noStationSlots: NoStationSlot[]; scheduleCoverage?: string }) {
  return <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.045] p-4" aria-labelledby="collection-operations-title">
    <div className="flex items-start gap-2"><ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" /><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-200/75">Suivi automatique</p><h2 id="collection-operations-title" className="text-sm font-semibold text-slate-100">Derniers succès de collecte</h2></div></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2"><article className="rounded-xl border border-white/10 bg-slate-950/25 p-3"><div className="flex items-center gap-2"><Clock className="h-4 w-4 text-sky-200" /><p className="text-[11px] font-semibold text-slate-100">Prévisions · 7 modèles horaires officiels + 1 agrégateur de référence</p></div><p className="mt-2 text-[11px] text-slate-200">{collectionMomentLabel(forecast, "forecast")}</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">{forecast ? `${forecast.dailyModelCount ?? 0} flux quotidien(s) · ${forecast.hourlyModelCount ?? 0} flux horaire(s).` : "Aucun cycle vérifiable pour ce lieu."}</p></article><article className="rounded-xl border border-white/10 bg-slate-950/25 p-3"><div className="flex items-center gap-2"><MapPinned className="h-4 w-4 text-cyan-200" /><p className="text-[11px] font-semibold text-slate-100">Stations physiques · horaire</p></div><p className="mt-2 text-[11px] text-slate-200">{collectionMomentLabel(physical, "physical")}</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">{physical ? physical.status === "stored" ? `${physical.stationCount ?? 0} station(s) qualifiée(s) utilisée(s).` : "Passage réussi, mais aucune station qualifiée." : "Aucun passage vérifiable pour ce lieu."}</p></article></div>
    <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/25 p-3"><p className="text-[11px] font-semibold text-slate-100">Créneaux sans station qualifiée</p>{noStationSlots.length ? <ul className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-amber-100">{noStationSlots.map((slot) => <li key={`${slot.date}-${slot.hour}`}><span className="font-semibold">{new Date(`${slot.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" })} · {String(slot.hour).padStart(2, "0")} h</span> — aucune station physique qualifiée après {slot.attempts} tentative{slot.attempts > 1 ? "s" : ""}{slot.reason ? ` (${slot.reason})` : ""}.</li>)}</ul> : <p className="mt-2 text-[10px] leading-relaxed text-emerald-100">Aucun créneau sans station qualifiée n’est enregistré sur les dernières 48 heures.</p>}</div>
    <p className="mt-3 text-[10px] leading-relaxed text-slate-400">{scheduleCoverage ?? "La collecte des favoris suit par défaut les six créneaux de quatre heures en Europe/Paris; la tâche Heartbeat externe doit aussi être configurée."}</p>
  </section>;
}

export default function WeatherAILab() {
  const { user } = useAuth();
  const { activeLocation } = useLocation();
  const { style: pageSkyStyle } = usePageWeatherSky();
  const input = activeLocation ? { lat: activeLocation.lat, lon: activeLocation.lon } : undefined;
  const shadowReportInput = useMemo(() => activeLocation
    ? { lat: activeLocation.lat, lon: activeLocation.lon, lookbackDays: 7 }
    : { lookbackDays: 7 }, [activeLocation?.lat, activeLocation?.lon]);
  const { data, isLoading, isFetching, error, refetch } = trpc.weather.getAILab.useQuery(input, {
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    retry: shouldRetryWeatherQuery,
    retryDelay: weatherRetryDelay,
  });
  const { data: forecastProvenance } = trpc.weather.getForecastProvenance.useQuery(input, { staleTime: 60_000, refetchOnWindowFocus: false });
  const { data: forecastCollectionReport } = trpc.weather.getForecastCollectionReport.useQuery(input, { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false });
  const { data: shadowDataHubReport } = trpc.weather.getShadowDataHubReport.useQuery(shadowReportInput, {
    enabled: user?.role === "admin",
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const stationInput = { lat: activeLocation?.lat, lon: activeLocation?.lon, radiusKm: 20 };
  const { data: stationData, isLoading: stationsLoading, error: stationsError } = trpc.weather.searchStations.useQuery(stationInput, { staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  const { data: stationEvidence } = trpc.weather.getEvidenceStatus.useQuery({ lat: activeLocation?.lat, lon: activeLocation?.lon }, { staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  const utils = trpc.useUtils();
  const refreshFusion = trpc.weather.refreshManualFusion.useMutation({
    onSuccess: async (result) => {
      if (!("daily" in result)) return;
      if (result.status === "failed") {
        await Promise.allSettled([refetch()]);
        return;
      }
      const coordinates = { lat: result.location.lat, lon: result.location.lon };
      const detailedForecastInput = { ...coordinates, includeExtendedPeriods: false };
      await Promise.allSettled([
        refetch(),
        utils.weather.getDashboard.invalidate(coordinates),
        utils.weather.getDetailedForecast.invalidate(detailedForecastInput),
      ]);
      await Promise.allSettled([
        utils.weather.getDashboard.fetch(coordinates),
        utils.weather.getDetailedForecast.fetch(detailedForecastInput),
      ]);
    },
  });
  const manualRefreshResult = refreshFusion.data && "daily" in refreshFusion.data ? refreshFusion.data : null;
  const [slowLoad, setSlowLoad] = useState(false);
  const [selectedCollectionModel, setSelectedCollectionModel] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isFetching) {
      setSlowLoad(false);
      return;
    }
    const timeout = window.setTimeout(() => setSlowLoad(true), WEATHER_QUERY_SLOW_MS);
    return () => window.clearTimeout(timeout);
  }, [isLoading, isFetching]);

  if (isLoading) return <div className="mx-auto max-w-2xl space-y-3 px-3 py-4">{slowLoad && <div role="status" className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs leading-relaxed text-amber-100">La traçabilité prend plus de temps que prévu. Les erreurs temporaires sont réessayées automatiquement.</div>}{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-800" />)}</div>;
  if (error || !data) return <div className="mx-auto max-w-2xl px-3 py-5"><div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-center"><AlertTriangle className="mx-auto h-6 w-6 text-red-300" /><p className="mt-2 text-sm text-red-100">Impossible de charger la traçabilité de cette prévision.</p><p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-300">{/(timeout|délai|aborted)/i.test(error?.message ?? "") ? "Le délai de la source a été dépassé après les réessais autorisés." : "Aucune trace n’est remplacée par une valeur estimée."}</p><button type="button" onClick={() => void refetch()} disabled={isFetching} className="mt-3 text-xs font-semibold text-red-200 underline disabled:opacity-50">{isFetching ? "Nouvel essai…" : "Réessayer"}</button></div></div>;

  const hasTrace = data.appliedModelWeights.length > 0;
  const hasSnapshot = Boolean(data.calculatedAt);
  const isArchivedSnapshot = data.snapshotStatus === "archived";
  const isLiveSnapshot = data.snapshotStatus === "live";
  const updatedAt = data.calculatedAt ? new Date(data.calculatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) : null;
  const snapshotDateLabel = data.snapshotDate ? new Date(`${data.snapshotDate}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }) : null;
  const collection = data.latestStationCollection;
  const forecastCollectionSnapshot = forecastCollectionReport?.snapshot ?? null;
  const expectedForecastModels = forecastCollectionReport?.expectedModels ?? [];
  const expectedHourlyModels = forecastCollectionReport?.expectedHourlyModels
    ?? expectedForecastModels;
  const bestMatchReference = forecastCollectionReport?.bestMatchReference ?? null;
  const dailyCoverageRecords = (forecastCollectionSnapshot?.dailyVariableCoverage ?? []) as ModelCoverageEvidence[];
  const bestMatchDailyCoverage = (bestMatchReference?.daily ?? null) as ModelCoverageEvidence | null;
  const selectedDailyModelCoverage = dailyCoverageRecords.find((coverage) => coverage.modelName === selectedCollectionModel)
    ?? (selectedCollectionModel === "Open-Meteo" ? bestMatchDailyCoverage : null);
  const hasBestMatchReference = Boolean(bestMatchReference?.daily || bestMatchReference?.hourly);
  const bestMatchDailyArchived = Number((bestMatchReference?.daily as any)?.archiveRowsWritten ?? 0) > 0;
  const bestMatchHourlyArchived = Number((bestMatchReference?.hourly as any)?.archiveRowsWritten ?? 0) > 0;
  const forecastNamedModelCount = expectedForecastModels.length;
  const forecastCompositionLabel = `${forecastNamedModelCount} modèles officiels`;
  const dailyCollectedModelSet = new Set(forecastCollectionSnapshot?.dailyCollectedModels ?? []);
  const hourlyCollectedModelSet = new Set(forecastCollectionSnapshot?.hourlyCollectedModels ?? []);
  const flowStatusByModel = new Map((forecastCollectionReport?.flowStatuses ?? []).map((status) => [status.model, status]));
  const selectedHourlyModelCollection = (forecastCollectionReport?.hourlyModelCollection?.find((result) => result.model === selectedCollectionModel) ?? null) as HourlyModelCollectionEvidence | null;
  const forecastCollectionTimeLabel = forecastCollectionSnapshot?.collectedAt
    ? formatCollectionTimestamp(forecastCollectionSnapshot.collectedAt)
    : null;
  const lastForecastSuccess = forecastCollectionReport?.lastForecastSuccess ?? null;
  const lastPhysicalCollection = forecastCollectionReport?.lastPhysicalCollection ?? null;
  const noQualifiedStationSlots = forecastCollectionReport?.noQualifiedStationSlots ?? [];
  const validationSource = getValidationModelSource(data.sources);
  const fusionParameters = [
    { key: "temperature", label: "Température", tone: "text-orange-200", background: "bg-orange-400/10" },
    { key: "precipitation", label: "Précipitations", tone: "text-blue-200", background: "bg-blue-400/10" },
    { key: "wind", label: "Vent", tone: "text-cyan-200", background: "bg-cyan-400/10" },
    { key: "humidity", label: "Humidité", tone: "text-sky-200", background: "bg-sky-300/10" },
  ].map(({ key, label, tone, background }) => ({
    key,
    label,
    tone,
    background,
    sources: (((data.trace as any)?.parameterSources?.[key] ?? []) as any[])
      .filter((source) => source.type === "model" && Number.isFinite(source.finalWeight) && source.finalWeight > 0),
  }));
  const contributors = data.modelIndicator?.contributors ?? [];
  const snapshotLabel = isArchivedSnapshot ? "Snapshot archivé" : isLiveSnapshot ? "Calcul direct" : hasSnapshot ? "Snapshot officiel" : "Snapshot indisponible";
  const verifiedModels = Array.from(new Set([...(collection?.dailyCollectedModels ?? []), ...(collection?.hourlyCollectedModels ?? [])]));
  const missingModels = Array.from(new Set([...(collection?.dailyMissingModels ?? []), ...(collection?.hourlyMissingModels ?? [])]));
  const physicalStations = (stationData?.stations ?? []).filter((station) => station.sourceKind === "physical");
  const activePhysicalStations = physicalStations.filter((station) => station.isActive);
  const stationContext = stationData?.groundTruth ?? null;
  const simulationSteps: SimulationStep[] = [
    {
      id: "snapshot",
      title: "Snapshot retenu",
      summary: hasSnapshot ? `${snapshotLabel} du ${snapshotDateLabel ?? "jour disponible"}${updatedAt ? ` à ${updatedAt}` : ""}. C’est la photo enregistrée des données et calculs de cet instant.` : "Aucune photo de calcul (snapshot) n’est disponible pour ce lieu.",
      detail: <p>{isArchivedSnapshot ? "Un snapshot est une photo conservée des modèles reçus, de leurs poids et du résultat calculé. Cette photo sert à expliquer le calcul passé ; elle ne remplace pas la prévision actuelle." : isLiveSnapshot ? "Un snapshot est une photo du calcul consultable maintenant pour cette position. Il n’est pas présenté comme une collecte planifiée archivée." : hasSnapshot ? "Un snapshot est une photo enregistrée du calcul : il permet de relire la même trace que la prévision officielle affichée sur cette page." : "Sans snapshot, aucune étape de pondération ou de résultat n’est reconstituée."}</p>,
      status: hasSnapshot ? "complete" : "waiting",
    },
    {
      id: "collection",
      title: "Collecte des flux",
      summary: collection ? `${collection.dailyModelCount} flux quotidien(s) et ${collection.hourlyModelCount} flux horaire(s) réellement reçus lors du dernier bilan (${forecastCompositionLabel}).` : "Aucun bilan de collecte vérifiable n’est disponible pour ce lieu.",
      detail: <div className="space-y-1"><p><span className="font-semibold text-sky-100">Reçus · </span>{verifiedModels.length ? verifiedModels.join(" · ") : "Aucun flux vérifié dans le bilan disponible."}</p>{missingModels.length ? <p className="text-amber-200"><span className="font-semibold">Indisponibles · </span>{missingModels.join(" · ")}</p> : collection ? <p className="text-emerald-200">Aucun flux manquant n’est signalé dans ce bilan.</p> : null}</div>,
      status: collection ? missingModels.length ? "partial" : "complete" : "waiting",
    },
    {
      id: "contributors",
      title: "Données exploitables",
      summary: hasTrace ? `${data.modelsUsed} modèle(s) possèdent un poids final positif dans la trace.` : "Aucun contributeur n’est affiché sans trace de poids final.",
      detail: contributors.length ? <div className="space-y-2">{contributors.map((model) => <p key={model.name}><span className="font-semibold text-violet-200">{model.name}</span> · poids moyen {Math.round(model.averageWeight * 100)} %.</p>)}<p className="border-t border-slate-700/70 pt-2 text-slate-400">Le poids moyen résume les poids finaux de chaque paramètre auquel le modèle a réellement contribué. Des modèles avec les mêmes données et la même place dans la fusion peuvent donc afficher le même pourcentage ; ce n’est pas un classement ni une probabilité.</p></div> : <p>Les modèles reçus ne sont pas automatiquement considérés comme appliqués : une trace de contribution est requise.</p>,
      status: hasTrace ? "complete" : "waiting",
    },
    {
      id: "regime",
      title: "Régime détecté",
      summary: `${data.regimeLabel} ${data.regimeEmoji} : ${data.regimeDescription}`,
      detail: <p>Ce régime rend visibles les priorités du scénario : température {Math.round(data.weights.temp * 100)} %, précipitations {Math.round(data.weights.precip * 100)} %, vent {Math.round(data.weights.wind * 100)} % et conditions {Math.round(data.weights.condition * 100)} %.</p>,
      status: hasSnapshot ? "complete" : "partial",
    },
    {
      id: "weights",
      title: "Pondération finale",
      summary: fusionParameters.some((parameter) => parameter.sources.length > 0) ? "Les poids sont lus séparément pour chaque paramètre disponible." : "Aucune pondération détaillée n’est disponible pour ce snapshot.",
      detail: fusionParameters.some((parameter) => parameter.sources.length > 0) ? <div className="space-y-1">{fusionParameters.filter((parameter) => parameter.sources.length > 0).map((parameter) => <p key={parameter.key}><span className={`font-semibold ${parameter.tone}`}>{parameter.label}</span> · {parameter.sources.map((source) => `${source.name} ${Math.round(source.finalWeight * 100)} %`).join(" · ")}</p>)}</div> : <p>La page ne déduit pas de poids décoratif lorsqu’une trace détaillée est absente.</p>,
      status: fusionParameters.some((parameter) => parameter.sources.length > 0) ? "complete" : "waiting",
    },
    {
      id: "agreement",
      title: "Accord des modèles",
      summary: data.modelAgreement.tempMax.range != null ? `Dispersion Tmax : ${data.modelAgreement.tempMax.range.toFixed(1)} °C (${data.modelAgreement.tempMax.availableModelCount}/${data.modelAgreement.expectedModelCount} modèles).` : `Dispersion Tmax indisponible (${data.modelAgreement.tempMax.availableModelCount}/${data.modelAgreement.expectedModelCount} modèles; deux valeurs sont nécessaires).`,
      detail: <p>Horizon exact indisponible : l’heure d’émission journalière n’est pas archivée. Étendues par variable : Tmax {data.modelAgreement.tempMax.range == null ? "indisponible" : `${data.modelAgreement.tempMax.range.toFixed(1)} °C`} · Tmin {data.modelAgreement.tempMin.range == null ? "indisponible" : `${data.modelAgreement.tempMin.range.toFixed(1)} °C`} · pluie {data.modelAgreement.precipitation.range == null ? "indisponible" : `${data.modelAgreement.precipitation.range.toFixed(1)} mm`} · vent max. quotidien {data.modelAgreement.windSpeed.range == null ? "indisponible" : `${data.modelAgreement.windSpeed.range.toFixed(1)} km/h`} · rafales max. quotidiennes {data.modelAgreement.windGust.range == null ? "indisponible" : `${data.modelAgreement.windGust.range.toFixed(1)} km/h`}. Pluie au seuil ≥{data.precipitationConsensus.thresholdMm.toFixed(1)} mm : {data.precipitationConsensus.rainModelCount}/{data.precipitationConsensus.availableModelCount} modèles disponibles ({data.precipitationConsensus.availableModelCount}/{data.precipitationConsensus.expectedModelCount} valeurs); fréquence brute, non calibrée comme probabilité. Chaque effectif est indépendant; Best Match est exclu. Ce n’est pas une fiabilité historique.</p>,
      status: [data.modelAgreement.tempMax, data.modelAgreement.tempMin, data.modelAgreement.precipitation, data.modelAgreement.windSpeed, data.modelAgreement.windGust].some((measure) => measure.availableModelCount >= 2) ? "complete" : "partial",
    },
    {
      id: "historical-reliability",
      title: "Fiabilité historique",
      summary: "Pas de note globale : qualification et mesures historiques séparées par modèle × variable × horizon, à partir de preuves physiques qualifiées.",
      detail: <p>MAE, RMSE, biais, effectifs, dates et évolution ne sont interprétables que sur leur maille propre et après les seuils d’évidence. L’absence de preuves laisse le score historique indisponible, mais n’empêche pas une prévision reçue d’entrer dans le moteur robuste. Accord inter-modèles et fiabilité observée restent deux informations distinctes.</p>,
      status: stationEvidence?.qualifiedScoreCount ? "complete" : "waiting",
    },
    {
      id: "official-result",
      title: "Résultat officiel",
      summary: hasSnapshot ? `Prévision fusionnée : ${data.officialForecast.tempMax ?? "—"}° max · ${data.officialForecast.tempMin ?? "—"}° min · ${data.officialForecast.precipitation ?? "—"} mm.` : "Aucun résultat officiel n’est disponible pour ce snapshot.",
      detail: <p>Ce résultat est une prévision fusionnée. Les stations locales présentées ensuite restent des observations de contexte distinctes.</p>,
      status: hasSnapshot ? "complete" : "waiting",
    },
  ];
  const stationSteps: SimulationStep[] = [
    {
      id: "station-search",
      title: "Recherche locale",
      summary: stationData ? `${stationData.totalFound} station(s) trouvée(s) dans un rayon de ${stationData.radiusKm} km.` : stationsError ? "Les stations locales ne sont pas disponibles pour cette consultation." : "Recherche des stations locales en cours.",
      detail: <p>La recherche lit les stations réellement retournées autour du lieu actif. Une station trouvée n’est pas automatiquement retenue comme observation physique ni comme preuve de fiabilité.</p>,
      status: stationData ? "complete" : stationsError ? "partial" : "waiting",
    },
    {
      id: "station-filter",
      title: "Filtre physique",
      summary: stationData ? `${physicalStations.length} station(s) physique(s) identifiée(s), dont ${activePhysicalStations.length} active(s).` : "Aucun filtre n’est appliqué sans résultat de recherche.",
      detail: <div className="space-y-1"><p>Le filtre conserve uniquement les observations de type physique, puis applique leur statut d’activité et les contrôles de qualité disponibles.</p>{stationData?.physicalStationDiagnostics.exclusionReasons.length ? <p className="text-amber-200"><span className="font-semibold">Motifs relevés · </span>{stationData.physicalStationDiagnostics.exclusionReasons.join(" · ")}</p> : stationData ? <p className="text-emerald-200">Aucun motif d’exclusion n’est remonté dans le diagnostic courant.</p> : null}</div>,
      status: activePhysicalStations.length > 0 ? "complete" : physicalStations.length > 0 ? "partial" : "waiting",
    },
    {
      id: "station-synthesis",
      title: "Synthèse locale",
      summary: stationContext?.stationCount ? `${stationContext.stationCount} station(s) participe(nt) au contexte local courant.` : "Aucune synthèse locale pondérée n’est disponible.",
      detail: stationContext?.stationCount ? <div className="space-y-1"><p>Température locale : {stationContext.temperature == null ? "indisponible" : `${Number(stationContext.temperature).toFixed(1)}°`} · {stationContext.stationCount} station(s) retenue(s).</p><p>Stations retenues : {stationContext.stationsUsed.length ? stationContext.stationsUsed.map((station) => `${station.name} (poids ${Math.round(station.weight * 100)} % de la synthèse locale)`).join(" · ") : "aucune"}.</p><p>Le poids est un coefficient de calcul local, pas une note ni une probabilité.</p></div> : <p>Sans station retenue, aucune moyenne locale n’est fabriquée et la prévision officielle reste distincte.</p>,
      status: stationContext?.stationCount ? "complete" : activePhysicalStations.length ? "partial" : "waiting",
    },
    {
      id: "station-evidence",
      title: "Preuve qualifiée",
      summary: stationEvidence?.date ? `${stationEvidence.coverageHours}/${stationEvidence.requiredCoverageHours} heures physiques pour le ${stationEvidence.date} ; ${stationEvidence.qualifiedScoreCount} score(s) qualifié(s).` : "Aucune journée physique archivée ne permet encore de qualifier une preuve.",
      detail: stationEvidence?.date ? <div className="space-y-1"><p>{stationEvidence.isEligible ? "La couverture de 18 heures physiques est atteinte pour cette journée." : "La couverture de 18 heures physiques n’est pas encore atteinte pour cette journée."}</p><p>Un score qualifié reste distinct de la prévision : il compare une prévision archivée à une observation physique alignée.</p></div> : <p>La branche ne qualifie pas une preuve à partir d’une station vue en direct ; une couverture archivée est nécessaire.</p>,
      status: stationEvidence?.isEligible && stationEvidence.qualifiedScoreCount > 0 ? "complete" : stationEvidence?.date ? "partial" : "waiting",
    },
  ];

  return <main className="weather-page-sky mx-auto flex min-h-screen max-w-2xl flex-col gap-3 px-3 py-3 pb-24 sm:px-6 sm:py-6" style={pageSkyStyle}>
    <header className="order-[-2] flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15"><FlaskConical className="h-5 w-5 text-blue-300" /></div><div className="min-w-0"><h1 className="text-base font-bold text-slate-100">AI Lab · traçabilité</h1><p className="truncate text-xs text-slate-500">{activeLocation?.name ?? "Lieu actif"}{updatedAt ? isArchivedSnapshot ? ` · dernière fusion du ${snapshotDateLabel} à ${updatedAt}` : ` · calcul à ${updatedAt}` : " · snapshot indisponible"}</p></div></div>
      <div className="flex shrink-0 gap-1">{activeLocation?.favoriteId ? <button onClick={() => refreshFusion.mutate({ favoriteId: activeLocation.favoriteId! })} disabled={refreshFusion.isPending || isFetching} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 text-xs font-semibold text-emerald-100 disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${refreshFusion.isPending ? "animate-spin" : ""}`} />{refreshFusion.isPending ? "Fusion…" : "Relancer"}</button> : null}</div>
    </header>

    {refreshFusion.isError && <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-100">La relance n’a pas abouti : {refreshFusion.error.message}</p>}
    {refreshFusion.data?.status === "cooldown" && <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">Une fusion récente existe déjà. Réessayez dans environ {refreshFusion.data.retryAfterSeconds} s.</p>}
    {refreshFusion.data?.status === "in_progress" && <p role="status" className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">Une relance pour ce lieu est déjà en cours ; aucun second lot n’a été lancé.</p>}
    {manualRefreshResult && <div role="status" aria-live="polite" className={`rounded-xl border px-3 py-2 text-xs ${manualRefreshResult.status === "failed" ? "border-red-400/30 bg-red-400/10 text-red-100" : manualRefreshResult.status === "partial" ? "border-amber-400/30 bg-amber-400/10 text-amber-100" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"}`}>
      <p className="font-semibold">{manualRefreshResult.status === "refreshed" ? "Prévisions quotidiennes et horaires actualisées." : manualRefreshResult.status === "partial" ? "Résultat partiel : une granularité ou certaines sources n’ont pas abouti." : "Échec de la relance des prévisions."}</p>
      <p className="mt-1">{manualRefreshGranularity("Quotidien", manualRefreshResult.daily)}</p>
      <p className="mt-1">{manualRefreshGranularity("Horaire", manualRefreshResult.hourly)}</p>
      <p className="mt-1 text-[10px] opacity-80">La relance n’écrit ni le point météo courant ni les observations, qui restent alimentés séparément. Les compteurs des lots planifiés ne sont pas modifiés.</p>
    </div>}

    <ForecastAlignmentPanel comparison={data.forecastComparison} requestedLocation={activeLocation ? { lat: activeLocation.lat, lon: activeLocation.lon } : undefined} />

    <section className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.055] p-4" aria-labelledby="forecast-collection-title">
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-sky-300/20 bg-sky-300/10"><Clock className="h-4 w-4 text-sky-200" /></span><div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-200/75">Prévisions · 7 modèles horaires officiels + 1 agrégateur de référence</p><h2 id="forecast-collection-title" className="text-sm font-semibold text-slate-100">Cadence prévue : {forecastCollectionReport?.scheduledAt ?? "toutes les 4 h"}</h2></div></div>{forecastCollectionSnapshot && <span className="shrink-0 rounded-full bg-sky-300/10 px-2 py-1 text-[9px] font-semibold text-sky-100">Dernier bilan</span>}</div>
      {forecastCollectionSnapshot ? <><p className="mt-2 text-[11px] leading-relaxed text-slate-300"><span className="font-semibold text-sky-100">Prévisions des flux · </span>dernier bilan archivé le {forecastCollectionTimeLabel ?? "—"}. Il liste les données quotidiennes et horaires effectivement archivées ; le compteur horaire ne porte que sur les sept modèles officiels. Ce n’est pas une confirmation d’un passage programmé le jour en cours.</p><div className="mt-2 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg border border-white/10 bg-slate-950/25 px-2 py-1.5"><span className="text-slate-400">Quotidien archivé</span><p className="mt-0.5 font-semibold text-slate-100">{forecastCollectionSnapshot.dailyModelCount}/{expectedForecastModels.length || 7} modèles officiels</p><p className="mt-0.5 text-[9px] text-slate-400">{forecastCompositionLabel}</p></div><div className="rounded-lg border border-white/10 bg-slate-950/25 px-2 py-1.5"><span className="text-slate-400">Horaire archivé</span><p className="mt-0.5 font-semibold text-slate-100">{forecastCollectionSnapshot.hourlyModelCount}/{expectedHourlyModels.length || 7} modèles officiels</p><p className="mt-0.5 text-[9px] text-slate-400">7 modèles officiels ; Best Match est une référence distincte</p></div></div><div className="mt-2 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.04] px-2.5 py-2 text-[10px] leading-relaxed text-slate-300"><span className="font-semibold text-emerald-100">Stations météorologiques · </span>leurs relevés physiques sont collectés par un flux horaire distinct. Ils ne sont ni des modèles ni inclus dans ces compteurs de flux de prévision.</div><p className="mt-2 text-[10px] text-slate-400">Pour chaque flux : Q = prévision quotidienne archivée ; H = archive horaire reçue. Le total horaire ne compte que les sept modèles officiels. Best Match reste une référence agrégée distincte, hors moteur officiel. Touchez un nom pour connaître son rôle.</p><ForecastFlowStatusLegend /><div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2" aria-label="Statut opérationnel de tous les flux de prévision">{expectedForecastModels.map((model) => { const dailyCollected = dailyCollectedModelSet.has(model); const hourlyCollected = hourlyCollectedModelSet.has(model); const operationalStatus = flowStatusByModel.get(model); return <button key={model} type="button" onClick={() => setSelectedCollectionModel(model)} aria-haspopup="dialog" aria-label={`Ouvrir la fiche du flux ${model}. Statut ${operationalStatus?.status ?? "FAILED"}. ${operationalStatus?.reason ?? "Aucun bilan vérifiable."} Modèle déterministe officiel. Quotidien ${dailyCollected ? "archivé" : "indisponible"}, horaire ${hourlyCollected ? "archivé" : "indisponible"}.`} className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/25 px-2.5 py-1.5 text-left text-[10px] transition-colors hover:border-sky-300/30 hover:bg-sky-300/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><span className="min-w-0"><span className="block truncate font-semibold text-sky-100">{model}</span><ForecastFlowStatusBadge status={operationalStatus?.status ?? "FAILED"} reason={operationalStatus?.reason} /></span><span className="flex shrink-0 gap-1"><span className={dailyCollected ? "rounded bg-emerald-300/10 px-1.5 py-0.5 text-emerald-100" : "rounded bg-amber-300/10 px-1.5 py-0.5 text-amber-100"}>Q {dailyCollected ? "✓" : "—"}</span><span className={hourlyCollected ? "rounded bg-emerald-300/10 px-1.5 py-0.5 text-emerald-100" : "rounded bg-amber-300/10 px-1.5 py-0.5 text-amber-100"}>H {hourlyCollected ? "✓" : "—"}</span></span></button>; })}</div></> : <><p className="mt-2 text-[11px] leading-relaxed text-slate-400">Cycle prévu : {forecastCollectionReport?.scheduledAt ?? "toutes les 4 h"}. Aucun bilan de flux n’est archivé pour ce lieu ; l’application ne présente donc aucun flux comme collecté.</p><p className="mt-2 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.04] px-2.5 py-2 text-[10px] leading-relaxed text-slate-300"><span className="font-semibold text-emerald-100">Stations météorologiques · </span>les relevés physiques sont gérés séparément, à l’heure, et ne remplacent jamais une prévision manquante.</p></>}
    </section>

    {hasBestMatchReference && <button type="button" onClick={() => setSelectedCollectionModel("Open-Meteo")} aria-haspopup="dialog" aria-label={`Ouvrir la fiche de la référence agrégée Best Match, hors des sept modèles officiels. Quotidien ${bestMatchDailyArchived ? "archivé" : "indisponible"}, horaire ${bestMatchHourlyArchived ? "archivé" : "indisponible"}.`} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-violet-300/20 bg-violet-300/[0.05] px-3 py-2 text-left text-[10px] hover:border-violet-200/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"><span><span className="block font-semibold text-violet-100">Open-Meteo · Best Match</span><span className="text-[9px] text-slate-400">Référence agrégée, séparée des sept modèles officiels et non comptée dans leur couverture.</span></span><span className="shrink-0 text-violet-100">Q {bestMatchDailyArchived ? "✓" : "—"} · H {bestMatchHourlyArchived ? "✓" : "—"}</span></button>}
    <CollectionOperations forecast={lastForecastSuccess} physical={lastPhysicalCollection} noStationSlots={noQualifiedStationSlots} scheduleCoverage={forecastCollectionReport?.scheduleCoverage} />

    {user?.role === "admin" && <section className="rounded-2xl border border-violet-300/25 bg-violet-300/[0.05] p-4" aria-labelledby="shadow-data-hub-title">
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><Database className="mt-0.5 h-5 w-5 shrink-0 text-violet-200" /><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-200/75">P1 · Rapport propriétaire</p><h2 id="shadow-data-hub-title" className="text-sm font-semibold text-slate-100">Data Hub canonique shadow</h2><p className="mt-1 text-[10px] leading-relaxed text-slate-400">Copie d’observation isolée : aucune valeur de ce Data Hub n’alimente les prévisions, scores ou poids.</p></div></div><span className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[9px] font-semibold text-emerald-100">Production protégée</span></div>
      {shadowDataHubReport ? <>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl border border-white/10 bg-slate-950/25 p-2.5"><p className="text-lg font-bold text-violet-100">{shadowDataHubReport.sourceCount}</p><p className="text-[9px] uppercase tracking-wide text-slate-500">Flux enregistrés</p></div><div className="rounded-xl border border-white/10 bg-slate-950/25 p-2.5"><p className="text-lg font-bold text-sky-100">{shadowDataHubReport.runs.total}</p><p className="text-[9px] uppercase tracking-wide text-slate-500">Runs sur 7 jours</p></div><div className="rounded-xl border border-white/10 bg-slate-950/25 p-2.5"><p className="text-lg font-bold text-emerald-100">{shadowDataHubReport.values.valid}/{shadowDataHubReport.values.total}</p><p className="text-[9px] uppercase tracking-wide text-slate-500">Valeurs valides</p></div><div className="rounded-xl border border-white/10 bg-slate-950/25 p-2.5"><p className={`text-lg font-bold ${shadowDataHubReport.runs.appliedToProduction === 0 ? "text-emerald-100" : "text-red-200"}`}>{shadowDataHubReport.runs.appliedToProduction}</p><p className="text-[9px] uppercase tracking-wide text-slate-500">Appliqué à production</p></div></div>
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/25 p-3 text-[10px] leading-relaxed text-slate-300"><p><span className="font-semibold text-violet-100">Observation P1.6 · </span>{shadowDataHubReport.runs.total > 0 ? `jour ${shadowDataHubReport.observation.elapsedDays}/${shadowDataHubReport.observation.requiredDays} ; ${shadowDataHubReport.observation.remainingDays} jour(s) restant(s).` : "prête ; elle commencera au prochain cycle v8 publié."}</p><p className="mt-1"><span className="font-semibold text-slate-200">Provenance des runs · </span>{shadowDataHubReport.runs.knownProviderRuns} run(s) exactement liés au payload ; {shadowDataHubReport.runs.metadataEvidenceRuns} run(s) disposent d’une métadonnée Open-Meteo, sans preuve de liaison exacte au payload ; {shadowDataHubReport.runs.unknownEvidenceRuns} restent inconnus.</p><p className="mt-1"><span className="font-semibold text-slate-200">Dernière réception · </span>{shadowDataHubReport.runs.lastReceivedAt ? formatCollectionTimestamp(new Date(shadowDataHubReport.runs.lastReceivedAt)) : "Aucune écriture shadow pour ce lieu."}</p></div>
        {shadowDataHubReport.latestRuns.length > 0 && <div className="mt-3 grid gap-1.5 sm:grid-cols-2" aria-label="Derniers runs du Data Hub shadow">{Array.from(new Map(shadowDataHubReport.latestRuns.map(run => [run.sourceKey, run])).values()).slice(0, shadowDataHubReport.sourceCount).map((run) => <div key={run.sourceKey} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/20 px-2.5 py-2 text-[10px]"><span className="min-w-0"><span className="block truncate font-semibold text-slate-100">{run.displayName}</span><span className="text-[9px] text-slate-500">{run.sourceType === "aggregator" ? "Agrégateur non indépendant" : "Modèle nommé"} · {run.runEvidenceStatus === "PROVIDER_REPORTED" ? "run exact lié au payload" : run.runEvidenceStatus === "OPEN_METEO_METADATA" ? "métadonnée Open-Meteo, liaison non prouvée" : run.runEvidenceStatus === "UNKNOWN" ? "run non attribuable" : "cadence théorique"}</span></span><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${run.status === "SUCCESS" ? "bg-emerald-300/10 text-emerald-100" : run.status === "PARTIAL" ? "bg-amber-300/10 text-amber-100" : "bg-red-300/10 text-red-100"}`}>{run.status}</span></div>)}</div>}
      </> : <p className="mt-3 rounded-xl border border-white/10 bg-slate-950/25 p-3 text-[10px] leading-relaxed text-slate-400">Le rapport shadow sera disponible après le premier cycle v8 publié. Cette attente ne modifie pas la prévision actuelle.</p>}
    </section>}

    {user?.role === "admin" && shadowDataHubReport && <ProviderRunEvidencePanel report={shadowDataHubReport} />}

    {user?.role === "admin" && shadowDataHubReport?.observationWindow && <P1ObservationPanel window={shadowDataHubReport.observationWindow} closure={shadowDataHubReport.observationClosure} location={activeLocation ? { lat: activeLocation.lat, lon: activeLocation.lon } : null} />}

    {user?.role === "admin" && shadowDataHubReport?.phase2Classification && <Phase2SourceClassificationPanel classification={shadowDataHubReport.phase2Classification} />}

    {user?.role === "admin" && shadowDataHubReport?.phase3HorizonHierarchy && <Phase3HorizonHierarchyPanel hierarchy={shadowDataHubReport.phase3HorizonHierarchy} />}

    {user?.role === "admin" && shadowDataHubReport?.phase4Normalization && <Phase4NormalizationPanel normalization={shadowDataHubReport.phase4Normalization} />}

    {user?.role === "admin" && shadowDataHubReport?.phase5QualityControl && <Phase5QualityControlPanel qualityControl={shadowDataHubReport.phase5QualityControl} />}

    {user?.role === "admin" && shadowDataHubReport?.phase6Fusion && <Phase6SmartFusionPanel fusion={shadowDataHubReport.phase6Fusion} />}

    {user?.role === "admin" && shadowDataHubReport?.dailyUnifiedShadow && <DailyUnifiedShadowPanel candidate={shadowDataHubReport.dailyUnifiedShadow} />}

    {user?.role === "admin" && shadowDataHubReport?.localTemperatureNowcasting && <LocalTemperatureNowcastingPanel report={shadowDataHubReport.localTemperatureNowcasting} />}

    {user?.role === "admin" && shadowDataHubReport?.localPrecipitationNowcasting && <LocalPrecipitationNowcastingPanel report={shadowDataHubReport.localPrecipitationNowcasting} />}

    {user?.role === "admin" && shadowDataHubReport?.phase7LocalPerformance && <Phase7LocalPerformancePanel performance={shadowDataHubReport.phase7LocalPerformance} />}
    {user?.role === "admin" && shadowDataHubReport?.phase8Metrics && <Phase8MetricsPanel metrics={shadowDataHubReport.phase8Metrics} />}
    {user?.role === "admin" && shadowDataHubReport?.phase8ValidationProgress && <Phase8ValidationProgressPanel progress={shadowDataHubReport.phase8ValidationProgress} />}

    <ForecastModelGuideDialog modelName={selectedCollectionModel} collectionAttempt={selectedHourlyModelCollection} dailyCoverage={selectedDailyModelCoverage} collectionAvailable={forecastCollectionReport?.hourlyModelCollectionAvailable ?? false} onOpenChange={(open) => { if (!open) setSelectedCollectionModel(null); }} />

    <AILabGlossary />

    <FusionSimulation steps={simulationSteps} snapshotLabel={snapshotLabel} />

    <StationSimulation steps={stationSteps} />

    <section className="order-[-1] grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Étendue Tmax" value={formatAgreementRange(data.modelAgreement.tempMax, data.modelAgreement.expectedModelCount, "°C")} tone="text-orange-200" help={<IndicatorHelp title="Dispersion de température"><p>Étendue brute entre modèles nommés indépendants pour Tmax. Aucun seuil de qualité ni conversion en note n’est appliqué.</p><p>Modèles avec valeur : {data.modelAgreement.tempMax.modelsWithData.join(", ") || "aucun"}. Best Match est exclu.</p><p className="text-slate-400">Cette mesure décrit l’accord, pas la fiabilité historique face aux observations.</p></IndicatorHelp>} />
      <Stat label="Étendue pluie · toutes valeurs" value={formatAgreementRange(data.modelAgreement.precipitation, data.modelAgreement.expectedModelCount, "mm")} tone="text-blue-200" help={<IndicatorHelp title="Dispersion des précipitations"><p>Étendue et σ population brutes en mm; l’effectif affiché est propre à la pluie. La dispersion est indisponible avec moins de deux valeurs.</p><p>Seuil ≥{data.modelAgreement.precipitationOccurrence.thresholdMm.toFixed(1)} mm : {data.modelAgreement.precipitationOccurrence.rainModelCount}/{data.modelAgreement.precipitationOccurrence.availableModelCount} modèles disponibles; cette fréquence n’est pas une probabilité calibrée.</p><p>Étendue des quantités parmi les seuls modèles pluvieux : {formatAgreementRange(data.modelAgreement.precipitationWetAmounts, data.modelAgreement.expectedModelCount, "mm")}.</p><p>Modèles avec valeur : {data.modelAgreement.precipitation.modelsWithData.join(", ") || "aucun"}. Best Match est exclu.</p></IndicatorHelp>} />
      <Stat label="Étendue vent max. quotidien" value={formatAgreementRange(data.modelAgreement.windSpeed, data.modelAgreement.expectedModelCount, "km/h")} tone="text-cyan-200" help={<IndicatorHelp title="Dispersion du vent"><p>Étendue brute de vent maximal journalier en km/h, avec son effectif exact.</p><p>Modèles avec valeur : {data.modelAgreement.windSpeed.modelsWithData.join(", ") || "aucun"}. Best Match est exclu.</p></IndicatorHelp>} />
      <Stat label="Flux appliqués" value={hasTrace ? String(data.modelsUsed) : "—"} tone={hasTrace ? "text-violet-300" : "text-slate-500"} help={<IndicatorHelp title="Flux appliqués"><p>Nombre de flux ayant un poids final strictement positif dans la trace de fusion; cela ne mesure ni leur qualité ni la fiabilité du résultat.</p><p>Best Match reste un agrégateur et n’entre pas dans les mesures d’accord inter-modèles.</p></IndicatorHelp>} />
    </section>

    <section className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.045] p-4" aria-labelledby="applied-parameter-weights-title"><div className="flex items-start gap-2"><SlidersHorizontal className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /><div><h2 id="applied-parameter-weights-title" className="text-sm font-semibold text-slate-100">Poids réellement appliqués par paramètre</h2><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Lecture directe de la trace de fusion. Une colonne vide signifie qu’aucune contribution traçable n’est disponible pour ce paramètre.</p></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{fusionParameters.map((parameter) => <article key={parameter.key} className={`rounded-xl border border-white/10 p-3 ${parameter.background}`}><p className={`text-[11px] font-semibold ${parameter.tone}`}>{parameter.label}</p>{parameter.sources.length ? <div className="mt-2 space-y-2">{parameter.sources.map((source) => <div key={`${parameter.key}-${source.id}`}><div className="flex items-center justify-between gap-2 text-[10px]"><span className="min-w-0 truncate text-slate-200">{source.name}</span><span className="shrink-0 font-semibold text-slate-100">{(source.finalWeight * 100).toFixed(1)}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-950/60"><div className="h-full rounded-full bg-white/70" style={{ width: `${Math.min(100, Math.max(0, source.finalWeight * 100))}%` }} /></div></div>)}</div> : <p className="mt-2 text-[10px] text-slate-500">Aucune trace disponible.</p>}</article>)}</div></section>


    {validationSource && <section className="rounded-2xl border border-dashed border-violet-400/35 bg-violet-400/[0.045] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex items-start gap-2"><FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /><div><h2 className="text-sm font-semibold text-slate-100">Modèles en validation</h2><p className="mt-1 text-xs leading-relaxed text-slate-400">Collectés séparément lors des cycles planifiés lorsqu’ils sont disponibles. Ils n’influencent ni la prévision officielle, ni les poids, ni les compteurs des modèles actifs.</p></div></div></div><WeatherStatusBadge compact className="w-[104px]" tone="lab" label="Validation" value="Hors fusion" description="Ces modèles sont archivés pour une validation historique. Ils restent hors fusion et n’influencent ni la prévision officielle ni ses poids." /></div><div className="mt-3 flex flex-wrap gap-1.5">{validationSource.models.map((model) => <WeatherStatusBadge key={model} compact tone="lab" label={model} description="Ce modèle candidat est archivé pour la validation historique. Il reste hors fusion officielle tant qu’un gain de fiabilité n’est pas mesuré." />)}</div></section>}


    <section className="rounded-2xl border border-slate-800 bg-[#0d131d] p-4"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-300" /><h2 className="text-sm font-semibold text-slate-100">Accord inter-modèles · étendues et σ population</h2></div><p className="mt-1 text-[10px] leading-relaxed text-slate-400">Chaque variable a son propre effectif. Best Match/agrégateurs exclus. Étendue et σ population nécessitent deux valeurs; « indisponible » n’équivaut pas à zéro et ne signifie pas désaccord.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{([['Température maximale', data.modelAgreement.tempMax, '°C'], ['Température minimale', data.modelAgreement.tempMin, '°C'], ['Précipitations · toutes valeurs', data.modelAgreement.precipitation, 'mm'], ['Vent maximal journalier', data.modelAgreement.windSpeed, 'km/h'], ['Rafales maximales journalières', data.modelAgreement.windGust, 'km/h']] as const).map(([label, measure, unit]) => <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-100">{formatAgreementRange(measure, data.modelAgreement.expectedModelCount, unit)}</p><p className="mt-0.5 text-[10px] text-slate-500">Modèles avec valeur : {measure.modelsWithData.join(', ') || 'aucune valeur disponible'}</p>{label.startsWith("Précipitations") && <><p className="mt-1 text-[9px] text-slate-500">Au seuil ≥{data.modelAgreement.precipitationOccurrence.thresholdMm.toFixed(1)} mm : {data.modelAgreement.precipitationOccurrence.rainModelCount}/{data.modelAgreement.precipitationOccurrence.availableModelCount} modèles annoncent de la pluie; fréquence non calibrée.</p><p className="mt-1 text-[9px] text-slate-500">Quantités parmi modèles pluvieux : {formatAgreementRange(data.modelAgreement.precipitationWetAmounts, data.modelAgreement.expectedModelCount, 'mm')}.</p></>}</div>)}</div><p className="mt-3 text-[11px] text-slate-500">L’accord ne mesure pas la fiabilité historique contre les observations; MAE/RMSE/biais doivent être lus séparément par modèle × variable × horizon.</p></section>

    <section className="rounded-2xl border border-slate-800 bg-[#0d131d] p-4"><div className="flex items-center gap-2"><Database className="h-4 w-4 text-violet-300" /><h2 className="text-sm font-semibold text-slate-100">Prévisions quotidiennes des modèles officiels</h2></div>{data.modelDetails.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[380px] text-xs"><thead className="border-b border-slate-800 text-slate-500"><tr><th className="px-1 py-2 text-left font-medium">Modèle</th><th className="px-1 py-2 text-right font-medium">Poids</th><th className="px-1 py-2 text-right font-medium">Max</th><th className="px-1 py-2 text-right font-medium">Min</th><th className="px-1 py-2 text-right font-medium">Vent</th></tr></thead><tbody>{data.modelDetails.map((model) => <tr key={model.name} className="border-b border-slate-800/70 last:border-0"><td className="px-1 py-2 font-semibold text-slate-200">{model.label}</td><td className="px-1 py-2 text-right text-blue-300">{model.averageWeight == null ? "—" : `${Math.round(model.averageWeight * 100)}%`}</td><td className="px-1 py-2 text-right text-orange-200">{model.tempMax == null ? "—" : `${Number(model.tempMax).toFixed(1)}°`}</td><td className="px-1 py-2 text-right text-sky-200">{model.tempMin == null ? "—" : `${Number(model.tempMin).toFixed(1)}°`}</td><td className="px-1 py-2 text-right text-slate-300">{model.windSpeed == null ? "—" : `${Number(model.windSpeed).toFixed(1)}`}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-xs text-slate-500">Aucune prévision quotidienne persistée pour ce lieu.</p>}</section>

    <BackToTopButton />
  </main>;
}
