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
import { Phase7LocalPerformancePanel } from "@/components/weather/Phase7LocalPerformancePanel";
import { Phase8MetricsPanel } from "@/components/weather/Phase8MetricsPanel";

function IndicatorHelp({ title, children }: { title: string; children: ReactNode }) {
  return <Popover><PopoverTrigger asChild><button type="button" aria-label={`Comprendre le calcul : ${title}`} className="grid h-6 w-6 place-items-center rounded-full border border-slate-700/70 bg-slate-950/30 text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><CircleHelp className="h-3.5 w-3.5" /></button></PopoverTrigger><PopoverContent side="bottom" align="center" sideOffset={8} collisionPadding={12} className="z-[80] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-slate-600 bg-[#101622] px-3 py-3 text-left text-[11px] leading-relaxed text-slate-100 shadow-xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200/75">Calcul de l’indicateur</p><p className="mt-1 text-sm font-semibold text-white">{title}</p></div><PopoverClose type="button" aria-label="Fermer l’aide" className="-mt-0.5 -mr-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-700/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><X className="h-3.5 w-3.5" /></PopoverClose></div><div className="mt-2.5 space-y-2 text-slate-200">{children}</div></PopoverContent></Popover>;
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
  return `${label} : ${state}, ${result.modelCount}/${result.expectedModelCount} flux · ${manualRefreshTime(result.updatedAt)}${result.error ? ` · ${result.error}` : ""}`;
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

function ForecastModelGuideDialog({ modelName, onOpenChange }: { modelName: string | null; onOpenChange: (open: boolean) => void }) {
  const guide = getForecastModelGuide(modelName ?? "Open-Meteo");
  return <Dialog open={Boolean(modelName)} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100dvh-1.5rem)] max-w-[calc(100%-1rem)] overflow-y-auto rounded-2xl border border-sky-400/30 bg-[#0d131d] p-4 text-slate-100 sm:max-w-xl"><DialogHeader><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200/75">Comprendre le modèle</p><DialogTitle className="pr-8 text-lg text-slate-50">{guide.name}</DialogTitle><DialogDescription className="pr-8 text-xs leading-relaxed text-slate-300">{guide.overview}</DialogDescription></DialogHeader><dl className="grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-white/10 bg-slate-950/35 p-3"><dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Organisme</dt><dd className="mt-1 text-xs font-medium text-slate-100">{guide.provider}</dd></div><div className="rounded-xl border border-white/10 bg-slate-950/35 p-3"><dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Périmètre</dt><dd className="mt-1 text-xs font-medium text-slate-100">{guide.coverage}</dd></div></dl><section className="rounded-xl border border-sky-300/15 bg-sky-300/[0.05] p-3"><h3 className="text-xs font-semibold text-sky-100">Comment il fonctionne</h3><p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">{guide.operation}</p></section><section className="rounded-xl border border-violet-300/15 bg-violet-300/[0.05] p-3"><h3 className="text-xs font-semibold text-violet-100">Ce que MeteoAI en fait</h3><p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">{guide.contribution}</p></section><section className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3"><h3 className="text-xs font-semibold text-amber-100">Limite à connaître</h3><p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">{guide.limit}</p></section><a href={guide.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-sky-200 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">{guide.sourceLabel}<ChevronRight className="h-3.5 w-3.5" /></a></DialogContent></Dialog>;
}

function Stat({ label, value, tone = "text-slate-100", help }: { label: string; value: string; tone?: string; help?: ReactNode }) {
  return <MeteoSurface tone="lab" className="relative rounded-xl bg-black/20 px-2 py-2.5 text-center">{help ? <span className="absolute right-1.5 top-1.5">{help}</span> : null}<p className={`text-xl font-bold ${tone}`}>{value}</p><p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">{label}</p></MeteoSurface>;
}

function Divergence({ label, value, max, unit, color }: { label: string; value: number; max: number; unit: string; color: string }) {
  const ratio = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  const level = ratio < 30 ? "Faible" : ratio < 60 ? "Modéré" : "Élevé";
  const tone = ratio < 30 ? "text-emerald-400" : ratio < 60 ? "text-amber-300" : "text-red-300";
  return <div className="space-y-1"><div className="flex justify-between gap-2 text-xs"><span className="text-slate-400">{label}</span><span className="font-semibold text-slate-200">{value} {unit} <span className={tone}>· {level}</span></span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${color}`} style={{ width: `${ratio}%` }} /></div></div>;
}

const AI_LAB_GLOSSARY = [
  {
    title: "Fusion et indicateurs du haut",
    entries: [
      ["Fusion officielle", "Prévision combinée à partir des modèles actifs qui ont fourni une donnée exploitable. Les modèles candidats en validation restent exclus de cette fusion."],
      ["Snapshot", "Une photo enregistrée à un moment précis : elle garde les modèles reçus, leurs poids et le résultat calculé à cet instant. Un snapshot « archivé » est cette photo conservée après une collecte ; un calcul « direct » est une photo créée pour la consultation actuelle. Ce n’est ni une nouvelle observation ni une promesse pour plus tard."],
      ["Confiance", "Indice sur 100 combinant l’accord des modèles (40 %), la performance historique qualifiée si elle existe (30 %), la cohérence de stations physiques si elle existe (20 %) et l’échéance (10 %). Les éléments absents ne sont pas inventés et limitent l’indice."],
      ["Stabilité des modèles", "Mesure la dispersion entre contributeurs : 60 % provient de la variabilité des températures maximales et 40 % de celle des précipitations. Une valeur élevée signifie que les modèles sont proches, non que la météo sera forcément calme."],
      ["Flux appliqués", "Nombre de flux présents dans la trace de fusion actuelle. Sept flux correspondent à des modèles nommés ; Open-Meteo Best Match est un agrégateur, pas un modèle indépendant. Ce compteur ne mesure ni leur qualité ni le nombre de stations."],
    ],
  },
  {
    title: "Poids, paramètres et régime",
    entries: [
      ["Poids appliqué", "Part attribuée à un modèle pour un paramètre donné dans la fusion. Les poids sont des coefficients de calcul ; ils ne sont ni une probabilité ni une observation de station."],
      ["Sources appliquées par paramètre", "Liste distincte pour température, précipitations et vent. Un modèle peut contribuer différemment selon le paramètre si ses données ou ses preuves disponibles diffèrent."],
      ["Poids moyen d’un modèle", "C’est la moyenne des poids finaux réellement reçus par ce modèle pour les paramètres auxquels il a contribué : température, pluie, vent ou humidité. Ce n’est ni une note, ni une chance qu’il ait raison."],
      ["Pourquoi plusieurs flux ont le même poids moyen", "Lorsque plusieurs flux apportent les mêmes paramètres avec des conditions comparables, la fusion partage le poids disponible entre eux. Avec 8 flux équivalents, chacun peut donc afficher environ 13 %. Ces huit flux comprennent sept modèles nommés et l’agrégateur Open-Meteo Best Match. Si un flux contribue davantage à un paramètre ou possède une meilleure preuve disponible, son poids moyen peut devenir différent."],
      ["Poids du régime, en clair", "Les pastilles T°, Pluie, Vent et Nuages indiquent ce qui compte le plus pour décrire le scénario météo du moment. Elles ne sont ni une probabilité ni un pourcentage de nuages."],
      ["Exemple : Ciel couvert", "Si le ciel est prévu très nuageux, la pastille Nuages peut compter davantage. Par exemple, Nuages 30 % ne veut pas dire 30 % de nuages : cela signifie seulement que l’état du ciel est important pour ce régime. Si la pluie ou le vent devient plus marqué, le résultat peut devenir Averses, Pluie ou Vent fort."],
    ],
  },
  {
    title: "Accord, tableaux et collecte",
    entries: [
      ["Accord des modèles", "Écart entre la valeur minimale et la valeur maximale des seuls contributeurs tracés. Faible écart signifie accord relatif ; il ne garantit pas une prévision exacte."],
      ["Prévisions quotidiennes des contributeurs", "Valeurs journalières fournies par chaque modèle participant, avec leurs poids moyens affichés. Ce tableau présente des prévisions, pas des relevés observés."],
      ["Dernière collecte vérifiable", "Bilan du cycle le plus récent : stations physiques réellement trouvées, modèles journaliers et horaires réellement récupérés, et éventuelles indisponibilités."],
      ["Modèles en validation", "Candidats archivés séparément pour comparaison. Ils n’influencent ni la fusion, ni les poids, ni les compteurs actifs avant décision explicite fondée sur des preuves qualifiées."],
      ["Données insuffisantes / —", "Aucune valeur n’est affichée lorsqu’il manque une trace, plusieurs contributeurs ou des preuves physiques qualifiées. Ce n’est pas une note nulle."],
    ],
  },
  {
    title: "Observations réelles et analyse nocturne",
    entries: [
      ["Prévisions de référence · 05 h 00", "Chaque matin, MeteoAI archive les prévisions horaires réellement reçues des modèles pour chaque lieu favori. Elles deviennent la référence horodatée à laquelle les observations réelles seront comparées."],
      ["Relevés physiques de la journée", "Des snapshots horodatés conservent les relevés de stations physiques qualifiées. Les stations personnelles ne proviennent que de Netatmo après autorisation et contrôles de fraîcheur, distance et qualité."],
      ["Analyse de nuit · 00 h 30", "À 00 h 30, heure de Paris, MeteoAI examine la journée précédente une fois terminée. Ce décalage évite de noter une prévision sur une journée encore incomplète ; ce n’est donc pas un score immédiat affiché au soir."],
      ["Journée qualifiée", "Les snapshots doivent couvrir suffisamment d’heures physiques comparables. Si la couverture ou l’alignement manque, la journée est explicitement exclue du score opérationnel au lieu d’être complétée avec une valeur estimée."],
      ["Comparaison et scores", "Pour chaque modèle et chaque créneau aligné, MeteoAI compare la prévision archivée au relevé physique du même lieu. Il calcule les erreurs MAE, RMSE et biais ; les scores de température, pluie, vent, humidité et pression ne sont mis à jour que lorsque les données nécessaires sont qualifiées."],
    ],
  },
  {
    title: "Fiabilité, erreurs et horizons",
    entries: [
      ["Horizon de prévision", "Délai entre le calcul et l’heure ou le jour prévus. L’indice de confiance applique un facteur de 95 pour 0–6 h, 85 pour 6–24 h, 75 pour 1–3 jours, 60 pour 4–7 jours et 45 pour 8–15 jours : plus l’échéance est lointaine, plus l’incertitude compte."],
      ["MAE", "Erreur absolue moyenne : moyenne des écarts, sans signe, entre une prévision et une observation physique alignée. Plus elle est faible, plus la prévision a été proche des observations comparées."],
      ["RMSE", "Racine de l’erreur quadratique moyenne. Les grands écarts sont d’abord mis au carré, donc cette mesure pénalise davantage les erreurs importantes que le MAE."],
      ["Biais", "Tendance moyenne d’un modèle à surestimer ou sous-estimer. Un biais positif signifie que la prévision est trop élevée ; un biais négatif qu’elle est trop basse."],
      ["Taille d’échantillon", "Nombre de paires prévision–observation physiques réellement comparables. Une valeur élevée améliore la maturité statistique, mais ne garantit pas à elle seule qu’un modèle est meilleur dans tous les contextes."],
      ["Seuils de décision", "Le calcul de fiabilité exige au moins 18 comparaisons physiques alignées sur 2 jours. Un classement public demande 30 comparaisons sur 7 jours ; la confiance statistique devient moyenne à 72 comparaisons sur 7 jours et élevée à 180 sur 30 jours."],
    ],
  },
  {
    title: "Stations, corrections et limites locales",
    entries: [
      ["Station physique", "Relevé local issu d’un capteur, distinct d’un modèle. Une station n’est retenue que si sa mesure, sa fraîcheur et ses contrôles de qualité sont suffisants ; une donnée absente, trop ancienne, incohérente ou peu fiable est écartée."],
      ["Fraîcheur, distance et continuité", "La fraîcheur indique l’ancienneté d’un relevé, la distance son éloignement du lieu, et la continuité sa régularité dans le temps. Ces éléments aident à qualifier une station ; ils ne changent pas une prévision en observation réelle."],
      ["Correction de biais", "Ajustement prudent d’une prévision à partir d’un écart historique mesuré. La correction est atténuée à 70 % et ne s’applique que si le biais dépasse 0,1 °C pour la température, 0,2 mm pour la pluie ou 1 km/h pour le vent."],
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
      ["Prévision contre observation", "Comparaison entre une valeur prévue archivée et un relevé physique aligné dans le temps et le lieu. Sans paire comparable, aucune erreur ni score n’est affiché comme si la validation avait eu lieu."],
      ["Score qualifié", "Résultat de fiabilité produit seulement lorsque les seuils de couverture et de comparaisons physiques sont atteints. Un score absent signifie que les preuves disponibles ne suffisent pas encore."],
      ["Fenêtre d’analyse", "Période sélectionnée pour la comparaison, par exemple 24 heures, 7 jours ou 30 jours. Elle modifie l’échantillon analysé et ne doit pas être interprétée comme une promesse pour les périodes suivantes."],
      ["Écart station–prévision", "Différence entre une synthèse de stations disponible et la prévision officielle sur un même créneau. Il renseigne sur le contexte local ; il ne prouve pas isolément qu’un modèle est mauvais."],
      ["Rayon de recherche", "Distance maximale utilisée pour rechercher des stations autour du lieu. Augmenter le rayon peut fournir plus de relevés mais peut aussi réduire leur représentativité locale."],
    ],
  },
] as const;

const AI_LAB_GLOSSARY_EXAMPLES: Record<string, string> = {
  "Fusion officielle": "Si trois modèles prévoient une température proche, MeteoAI les combine dans une même prévision plutôt que d’afficher trois résultats séparés.",
  "Snapshot": "La prévision collectée à 05 h est conservée telle quelle ; demain, elle pourra être comparée aux relevés réellement archivés.",
  "Confiance": "Une confiance de 80/100 signifie que les preuves disponibles concordent assez bien ; elle ne garantit pas que la prévision sera exacte.",
  "Stabilité des modèles": "Si les modèles prévoient 20, 21 et 21 °C, leur stabilité est meilleure que s’ils prévoient 16, 21 et 27 °C.",
  "Flux appliqués": "Les sept modèles nommés et l’agrégateur Best Match ne sont comptés ici que s’ils ont réellement contribué à au moins un paramètre de la fusion.",
  "Poids appliqué": "Pour la température, un modèle peut recevoir 20 % du calcul tandis qu’un autre reçoit 10 % ; ce sont des parts de calcul, pas leurs chances d’avoir raison.",
  "Sources appliquées par paramètre": "AROME peut aider pour la température, tandis qu’ECMWF aide aussi pour le vent : leurs contributions sont donc lues séparément.",
  "Poids moyen d’un modèle": "Un modèle qui a reçu 10 % pour la température et 20 % pour le vent affiche un poids moyen de 15 % sur ces deux contributions.",
  "Pourquoi plusieurs flux ont le même poids moyen": "Avec huit flux qui contribuent de façon comparable, la part disponible peut être répartie presque également, autour de 13 % chacun.",
  "Poids du régime, en clair": "Pour un ciel couvert, les nuages peuvent compter plus que le vent dans la description du scénario ; cela ne dit pas quel modèle est meilleur.",
  "Exemple : Ciel couvert": "Si les nuages sont très présents mais qu’il n’y a ni pluie marquée ni vent fort, le scénario peut être Ciel couvert.",
  "Accord des modèles": "Si les modèles prévoient entre 19 et 20 °C, ils sont assez proches ; entre 15 et 24 °C, leur accord est faible.",
  "Prévisions quotidiennes des contributeurs": "Le tableau peut afficher AROME à 21 °C et ICON à 22 °C : ce sont leurs prévisions du jour, pas des températures mesurées.",
  "Dernière collecte vérifiable": "Si un modèle ne répond pas lors du cycle, le bilan le signale comme indisponible au lieu de lui attribuer une valeur de remplacement.",
  "Modèles en validation": "Un nouveau modèle peut être collecté et comparé pendant plusieurs jours sans modifier la prévision officielle.",
  "Données insuffisantes / —": "S’il manque les relevés physiques comparables, l’application affiche — plutôt que d’inventer une note de fiabilité.",
  "Prévisions de référence · 05 h 00": "La prévision reçue le matin pour 14 h reste la référence archivée, même si une nouvelle consultation affiche ensuite une mise à jour.",
  "Relevés physiques de la journée": "Un relevé de station reçu à 14 h est gardé avec son horaire afin de pouvoir le comparer à la prévision de 14 h.",
  "Analyse de nuit · 00 h 30": "La journée de mardi est analysée après minuit, quand toutes ses heures sont terminées et comparables.",
  "Journée qualifiée": "Avec seulement une heure réellement observée sur dix-huit, la journée reste non qualifiée et aucun score complet n’est produit.",
  "Comparaison et scores": "Si un modèle prévoyait 20 °C et la station 18 °C au même créneau, cet écart sert à calculer ses erreurs.",
  "Horizon de prévision": "Une prévision pour cet après-midi est moins lointaine qu’une prévision à dix jours ; la seconde reçoit donc davantage d’incertitude.",
  "MAE": "Des écarts de 1, 2 et 3 °C donnent une MAE de 2 °C : on regarde la taille moyenne de l’erreur sans son sens.",
  "RMSE": "Une très grande erreur ponctuelle compte davantage dans le RMSE que dans la MAE, ce qui aide à repérer les ratés importants.",
  "Biais": "Si un modèle prévoit souvent 1 °C de trop, son biais moyen est positif ; s’il prévoit trop froid, il est négatif.",
  "Taille d’échantillon": "Un bilan fondé sur 50 comparaisons est plus informatif qu’un bilan fondé sur seulement 2 comparaisons.",
  "Seuils de décision": "Avant le seuil requis, un modèle peut être observé, mais il ne reçoit pas encore de classement public comme s’il était suffisamment évalué.",
  "Station physique": "Une station qui mesure réellement température et vent près du lieu peut aider à vérifier une prévision, si ses données sont assez fraîches.",
  "Fraîcheur, distance et continuité": "Une station à 2 km mise à jour il y a 5 minutes est généralement plus utile qu’une station lointaine sans mise à jour récente.",
  "Correction de biais": "Si un biais chaud est répété et mesuré, la correction peut réduire légèrement la température fusionnée, sans effacer l’historique d’origine.",
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
          <div className="rounded-lg border border-white/8 bg-black/15 p-2.5"><p className="text-[10px] font-semibold text-sky-100">Expliquer les limites</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">Accord, stabilité, confiance et score global sont distingués. Lorsqu’une donnée ou une preuve manque, l’application l’indique au lieu d’inventer une valeur.</p></div>
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
    <div className="mt-3 grid gap-2 sm:grid-cols-2"><article className="rounded-xl border border-white/10 bg-slate-950/25 p-3"><div className="flex items-center gap-2"><Clock className="h-4 w-4 text-sky-200" /><p className="text-[11px] font-semibold text-slate-100">Prévisions · 7 modèles + 1 agrégateur</p></div><p className="mt-2 text-[11px] text-slate-200">{collectionMomentLabel(forecast, "forecast")}</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">{forecast ? `${forecast.dailyModelCount ?? 0} flux quotidien(s) · ${forecast.hourlyModelCount ?? 0} flux horaire(s).` : "Aucun cycle vérifiable pour ce lieu."}</p></article><article className="rounded-xl border border-white/10 bg-slate-950/25 p-3"><div className="flex items-center gap-2"><MapPinned className="h-4 w-4 text-cyan-200" /><p className="text-[11px] font-semibold text-slate-100">Stations physiques · horaire</p></div><p className="mt-2 text-[11px] text-slate-200">{collectionMomentLabel(physical, "physical")}</p><p className="mt-1 text-[10px] leading-relaxed text-slate-400">{physical ? physical.status === "stored" ? `${physical.stationCount ?? 0} station(s) qualifiée(s) utilisée(s).` : "Passage réussi, mais aucune station qualifiée." : "Aucun passage vérifiable pour ce lieu."}</p></article></div>
    <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/25 p-3"><p className="text-[11px] font-semibold text-slate-100">Créneaux sans station qualifiée</p>{noStationSlots.length ? <ul className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-amber-100">{noStationSlots.map((slot) => <li key={`${slot.date}-${slot.hour}`}><span className="font-semibold">{new Date(`${slot.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" })} · {String(slot.hour).padStart(2, "0")} h</span> — aucune station physique qualifiée après {slot.attempts} tentative{slot.attempts > 1 ? "s" : ""}{slot.reason ? ` (${slot.reason})` : ""}.</li>)}</ul> : <p className="mt-2 text-[10px] leading-relaxed text-emerald-100">Aucun créneau sans station qualifiée n’est enregistré sur les dernières 48 heures.</p>}</div>
    <p className="mt-3 text-[10px] leading-relaxed text-slate-400">{scheduleCoverage ?? "La collecte de prévisions est alignée sur 05:00, heure de Paris."}</p>
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
  const confidenceTone = data.confidenceScore >= 80 ? "text-emerald-300" : data.confidenceScore >= 60 ? "text-amber-300" : "text-red-300";
  const updatedAt = data.calculatedAt ? new Date(data.calculatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) : null;
  const snapshotDateLabel = data.snapshotDate ? new Date(`${data.snapshotDate}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }) : null;
  const collection = data.latestStationCollection;
  const forecastCollectionSnapshot = forecastCollectionReport?.snapshot ?? null;
  const expectedForecastModels = forecastCollectionReport?.expectedModels ?? [];
  const forecastAggregatorCount = expectedForecastModels.includes("Open-Meteo") ? 1 : 0;
  const forecastNamedModelCount = Math.max(0, expectedForecastModels.length - forecastAggregatorCount);
  const forecastCompositionLabel = forecastAggregatorCount > 0
    ? `${forecastNamedModelCount} modèles + 1 agrégateur`
    : `${forecastNamedModelCount} modèles`;
  const dailyCollectedModelSet = new Set(forecastCollectionSnapshot?.dailyCollectedModels ?? []);
  const hourlyCollectedModelSet = new Set(forecastCollectionSnapshot?.hourlyCollectedModels ?? []);
  const flowStatusByModel = new Map((forecastCollectionReport?.flowStatuses ?? []).map((status) => [status.model, status]));
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
  const agreementScore = Math.max(0, Math.round(Math.min(
    100 - data.divergence.tempRange * 8,
    100 - data.divergence.precipRange * 15,
    100 - data.divergence.windRange * 3,
  )));
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
      summary: hasTrace && data.modelsUsed > 1 ? `Accord lisible ${agreementScore}/100, limité par le paramètre le plus dispersé.` : "L’accord inter-modèles nécessite plusieurs contributeurs réellement tracés.",
      detail: <p>Écarts constatés entre contributeurs : {data.divergence.tempRange} °C en température, {data.divergence.precipRange} mm en précipitations et {data.divergence.windRange} km/h en vent.</p>,
      status: hasTrace && data.modelsUsed > 1 ? "complete" : "partial",
    },
    {
      id: "confidence",
      title: "Confiance et stabilité",
      summary: hasSnapshot ? `Confiance ${Math.round(data.confidenceScore)}/100 · stabilité ${Math.round(data.stabilityScore)}/100.` : "Aucun score n’est présenté sans snapshot de fusion.",
      detail: <p>La confiance combine l’accord, la performance historique qualifiée lorsqu’elle existe, la cohérence des stations physiques lorsqu’elle existe et l’échéance. La stabilité mesure la dispersion des températures et précipitations entre contributeurs.</p>,
      status: hasSnapshot ? "complete" : "waiting",
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
      detail: stationContext?.stationCount ? <div className="space-y-1"><p>Température locale : {stationContext.temperature == null ? "indisponible" : `${Number(stationContext.temperature).toFixed(1)}°`} · confiance locale : {stationContext.confidenceScore == null ? "indisponible" : `${Math.round(stationContext.confidenceScore)}/100`}.</p><p>Stations retenues : {stationContext.stationsUsed.length ? stationContext.stationsUsed.map((station) => `${station.name} ${Math.round(station.weight * 100)} %`).join(" · ") : "aucune"}.</p></div> : <p>Sans station retenue, aucune moyenne locale n’est fabriquée et la prévision officielle reste distincte.</p>,
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

    <section className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.055] p-4" aria-labelledby="forecast-collection-title">
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-sky-300/20 bg-sky-300/10"><Clock className="h-4 w-4 text-sky-200" /></span><div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-200/75">Prévisions · 7 modèles + 1 agrégateur</p><h2 id="forecast-collection-title" className="text-sm font-semibold text-slate-100">Cadence prévue : {forecastCollectionReport?.scheduledAt ?? "05:00"}</h2></div></div>{forecastCollectionSnapshot && <span className="shrink-0 rounded-full bg-sky-300/10 px-2 py-1 text-[9px] font-semibold text-sky-100">Dernier bilan</span>}</div>
      {forecastCollectionSnapshot ? <><p className="mt-2 text-[11px] leading-relaxed text-slate-300"><span className="font-semibold text-sky-100">Prévisions des flux · </span>dernier bilan archivé le {forecastCollectionTimeLabel ?? "—"}. Il liste les données quotidiennes et horaires effectivement archivées ; ce n’est pas une confirmation d’un passage programmé le jour en cours.</p><div className="mt-2 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg border border-white/10 bg-slate-950/25 px-2 py-1.5"><span className="text-slate-400">Quotidien archivé</span><p className="mt-0.5 font-semibold text-slate-100">{forecastCollectionSnapshot.dailyModelCount}/{expectedForecastModels.length || 8} flux</p><p className="mt-0.5 text-[9px] text-slate-400">{forecastCompositionLabel}</p></div><div className="rounded-lg border border-white/10 bg-slate-950/25 px-2 py-1.5"><span className="text-slate-400">Horaire archivé</span><p className="mt-0.5 font-semibold text-slate-100">{forecastCollectionSnapshot.hourlyModelCount}/{expectedForecastModels.length || 8} flux</p><p className="mt-0.5 text-[9px] text-slate-400">{forecastCompositionLabel}</p></div></div><div className="mt-2 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.04] px-2.5 py-2 text-[10px] leading-relaxed text-slate-300"><span className="font-semibold text-emerald-100">Stations météorologiques · </span>leurs relevés physiques sont collectés par un flux horaire distinct. Ils ne sont ni des modèles ni inclus dans ces compteurs de flux de prévision.</div><p className="mt-2 text-[10px] text-slate-400">Pour chaque flux : Q = prévision quotidienne archivée ; H = prévision horaire archivée. Open-Meteo Best Match est un agrégateur, pas un modèle indépendant. Touchez un nom pour connaître son rôle.</p><ForecastFlowStatusLegend /><div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2" aria-label="Statut opérationnel de tous les flux de prévision">{expectedForecastModels.map((model) => { const dailyCollected = dailyCollectedModelSet.has(model); const hourlyCollected = hourlyCollectedModelSet.has(model); const isAggregator = model === "Open-Meteo"; const operationalStatus = flowStatusByModel.get(model); return <button key={model} type="button" onClick={() => setSelectedCollectionModel(model)} aria-haspopup="dialog" aria-label={`Ouvrir la fiche du flux ${model}. Statut ${operationalStatus?.status ?? "FAILED"}. ${operationalStatus?.reason ?? "Aucun bilan vérifiable."} ${isAggregator ? "Agrégateur Best Match. " : "Modèle nommé. "}Quotidien ${dailyCollected ? "archivé" : "indisponible"}, horaire ${hourlyCollected ? "archivé" : "indisponible"}.`} className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/25 px-2.5 py-1.5 text-left text-[10px] transition-colors hover:border-sky-300/30 hover:bg-sky-300/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><span className="min-w-0"><span className="block truncate font-semibold text-sky-100">{model}</span>{isAggregator && <span className="mt-0.5 block text-[8px] uppercase tracking-wide text-violet-200">Agrégateur Best Match</span>}<ForecastFlowStatusBadge status={operationalStatus?.status ?? "FAILED"} reason={operationalStatus?.reason} /></span><span className="flex shrink-0 gap-1"><span className={dailyCollected ? "rounded bg-emerald-300/10 px-1.5 py-0.5 text-emerald-100" : "rounded bg-amber-300/10 px-1.5 py-0.5 text-amber-100"}>Q {dailyCollected ? "✓" : "—"}</span><span className={hourlyCollected ? "rounded bg-emerald-300/10 px-1.5 py-0.5 text-emerald-100" : "rounded bg-amber-300/10 px-1.5 py-0.5 text-amber-100"}>H {hourlyCollected ? "✓" : "—"}</span></span></button>; })}</div></> : <><p className="mt-2 text-[11px] leading-relaxed text-slate-400">Cycle prévu : {forecastCollectionReport?.scheduledAt ?? "05:00"}. Aucun bilan de flux n’est archivé pour ce lieu ; l’application ne présente donc aucun flux comme collecté.</p><p className="mt-2 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.04] px-2.5 py-2 text-[10px] leading-relaxed text-slate-300"><span className="font-semibold text-emerald-100">Stations météorologiques · </span>les relevés physiques sont gérés séparément, à l’heure, et ne remplacent jamais une prévision manquante.</p></>}
    </section>

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

    {user?.role === "admin" && shadowDataHubReport?.observationWindow && <P1ObservationPanel window={shadowDataHubReport.observationWindow} />}

    {user?.role === "admin" && shadowDataHubReport?.phase2Classification && <Phase2SourceClassificationPanel classification={shadowDataHubReport.phase2Classification} />}

    {user?.role === "admin" && shadowDataHubReport?.phase3HorizonHierarchy && <Phase3HorizonHierarchyPanel hierarchy={shadowDataHubReport.phase3HorizonHierarchy} />}

    {user?.role === "admin" && shadowDataHubReport?.phase4Normalization && <Phase4NormalizationPanel normalization={shadowDataHubReport.phase4Normalization} />}

    {user?.role === "admin" && shadowDataHubReport?.phase5QualityControl && <Phase5QualityControlPanel qualityControl={shadowDataHubReport.phase5QualityControl} />}

    {user?.role === "admin" && shadowDataHubReport?.phase6Fusion && <Phase6SmartFusionPanel fusion={shadowDataHubReport.phase6Fusion} />}

    {user?.role === "admin" && shadowDataHubReport?.phase7LocalPerformance && <Phase7LocalPerformancePanel performance={shadowDataHubReport.phase7LocalPerformance} />}
    {user?.role === "admin" && shadowDataHubReport?.phase8Metrics && <Phase8MetricsPanel metrics={shadowDataHubReport.phase8Metrics} />}

    <ForecastModelGuideDialog modelName={selectedCollectionModel} onOpenChange={(open) => { if (!open) setSelectedCollectionModel(null); }} />

    <AILabGlossary />

    <FusionSimulation steps={simulationSteps} snapshotLabel={snapshotLabel} />

    <StationSimulation steps={stationSteps} />

    <section className="order-[-1] grid grid-cols-3 gap-2"><Stat label="Confiance prévision" value={hasSnapshot ? `${Math.round(data.confidenceScore)}%` : "—"} tone={hasSnapshot ? confidenceTone : "text-slate-500"} help={<IndicatorHelp title="Confiance prévision"><p>Valeur affichée : <strong>{hasSnapshot ? `${Math.round(data.confidenceScore)}/100` : "indisponible"}</strong>.</p><HelpDetail label="Formule">40 % accord des modèles, 30 % performance historique qualifiée si disponible, 20 % cohérence de stations physiques si disponible et 10 % échéance.</HelpDetail><HelpDetail label="Accord observé">Écarts du snapshot : {data.divergence.tempRange} °C en température, {data.divergence.precipRange} mm en pluie et {data.divergence.windRange} km/h en vent ; le score d’accord le plus contraignant lisible ici est {agreementScore}/100.</HelpDetail><HelpDetail label="Échéance">Le calcul de ce snapshot utilise la tranche 6–24 h, notée 85/100.</HelpDetail><p className="border-t border-slate-700/80 pt-2 text-slate-400">Lorsque seules certaines preuves existent, les poids disponibles sont renormalisés. L’absence de preuve historique ou physique peut plafonner le score afin de ne pas simuler une précision non mesurée.</p></IndicatorHelp>} /><Stat label="Stabilité flux" value={hasSnapshot ? `${Math.round(data.stabilityScore)}%` : "—"} tone={hasSnapshot ? "text-sky-300" : "text-slate-500"} help={<IndicatorHelp title="Stabilité des flux"><p>Valeur affichée : <strong>{hasSnapshot ? `${Math.round(data.stabilityScore)}/100` : "indisponible"}</strong>.</p><HelpDetail label="Formule">60 % de stabilité des températures maximales et 40 % de stabilité des précipitations. Chaque partie diminue lorsque la dispersion entre flux augmente.</HelpDetail><HelpDetail label="Pourquoi ce résultat">Dans ce snapshot, l’écart entre contributeurs est de {data.divergence.tempRange} °C pour la température et de {data.divergence.precipRange} mm pour la pluie.</HelpDetail><p className="border-t border-slate-700/80 pt-2 text-slate-400">Cet indice mesure l’accord interne des flux, pas la certitude que la météo sera calme ou exacte.</p></IndicatorHelp>} /><Stat label="Flux appliqués" value={hasTrace ? String(data.modelsUsed) : "—"} tone={hasTrace ? "text-violet-300" : "text-slate-500"} help={<IndicatorHelp title="Flux appliqués"><p>Valeur affichée : <strong>{hasTrace ? `${data.modelsUsed} contributeur${data.modelsUsed > 1 ? "s" : ""}` : "trace indisponible"}</strong>.</p><HelpDetail label="Règle">Le compteur retient uniquement les flux ayant un poids final strictement positif pour la température, la pluie ou le vent dans la trace de fusion. Best Match reste identifié comme agrégateur.</HelpDetail>{contributors.length > 0 ? <div className="border-t border-slate-700/80 pt-2"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-200/80">Contributeurs de ce snapshot</p>{contributors.map((model) => <p key={model.name} className="flex justify-between gap-3"><span className="truncate">{model.name}</span><span className="shrink-0 text-violet-200">poids moyen {Math.round(model.averageWeight * 100)} %</span></p>)}</div> : <p className="border-t border-slate-700/80 pt-2 text-slate-400">Aucun flux n’est présenté sans trace de poids réellement appliquée.</p>}<p className="text-slate-400">Un candidat ou un flux seulement archivé ne compte pas tant qu’il ne contribue pas à la fusion.</p></IndicatorHelp>} /></section>

    <section className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.045] p-4" aria-labelledby="applied-parameter-weights-title"><div className="flex items-start gap-2"><SlidersHorizontal className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /><div><h2 id="applied-parameter-weights-title" className="text-sm font-semibold text-slate-100">Poids réellement appliqués par paramètre</h2><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Lecture directe de la trace de fusion. Une colonne vide signifie qu’aucune contribution traçable n’est disponible pour ce paramètre.</p></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{fusionParameters.map((parameter) => <article key={parameter.key} className={`rounded-xl border border-white/10 p-3 ${parameter.background}`}><p className={`text-[11px] font-semibold ${parameter.tone}`}>{parameter.label}</p>{parameter.sources.length ? <div className="mt-2 space-y-2">{parameter.sources.map((source) => <div key={`${parameter.key}-${source.id}`}><div className="flex items-center justify-between gap-2 text-[10px]"><span className="min-w-0 truncate text-slate-200">{source.name}</span><span className="shrink-0 font-semibold text-slate-100">{(source.finalWeight * 100).toFixed(1)}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-950/60"><div className="h-full rounded-full bg-white/70" style={{ width: `${Math.min(100, Math.max(0, source.finalWeight * 100))}%` }} /></div></div>)}</div> : <p className="mt-2 text-[10px] text-slate-500">Aucune trace disponible.</p>}</article>)}</div></section>


    {validationSource && <section className="rounded-2xl border border-dashed border-violet-400/35 bg-violet-400/[0.045] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex items-start gap-2"><FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /><div><h2 className="text-sm font-semibold text-slate-100">Modèles en validation</h2><p className="mt-1 text-xs leading-relaxed text-slate-400">Collectés séparément à 05h00 lorsqu’ils sont disponibles. Ils n’influencent ni la prévision officielle, ni les poids, ni les compteurs des modèles actifs.</p></div></div></div><WeatherStatusBadge compact className="w-[104px]" tone="lab" label="Validation" value="Hors fusion" description="Ces modèles sont archivés pour une validation historique. Ils restent hors fusion et n’influencent ni la prévision officielle ni ses poids." /></div><div className="mt-3 flex flex-wrap gap-1.5">{validationSource.models.map((model) => <WeatherStatusBadge key={model} compact tone="lab" label={model} description="Ce modèle candidat est archivé pour la validation historique. Il reste hors fusion officielle tant qu’un gain de fiabilité n’est pas mesuré." />)}</div></section>}


    <section className="rounded-2xl border border-slate-800 bg-[#0d131d] p-4"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-300" /><h2 className="text-sm font-semibold text-slate-100">Accord des modèles appliqués</h2></div>{hasTrace && data.modelDetails.length > 1 ? <><div className="mt-3 space-y-3"><Divergence label="Température" value={data.divergence.tempRange} max={10} unit="°C" color="bg-orange-400" /><Divergence label="Précipitations" value={data.divergence.precipRange} max={20} unit="mm" color="bg-blue-400" /><Divergence label="Vent" value={data.divergence.windRange} max={40} unit="km/h" color="bg-cyan-400" /></div><p className="mt-3 text-[11px] text-slate-500">Écart calculé entre les contributeurs de la trace actuelle.</p></> : <p className="mt-3 text-xs text-slate-500">Données insuffisantes : aucun écart inter-modèles n’est affiché sans plusieurs contributeurs tracés.</p>}</section>

    <section className="rounded-2xl border border-slate-800 bg-[#0d131d] p-4"><div className="flex items-center gap-2"><Database className="h-4 w-4 text-violet-300" /><h2 className="text-sm font-semibold text-slate-100">Prévisions quotidiennes des contributeurs</h2></div>{data.modelDetails.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[380px] text-xs"><thead className="border-b border-slate-800 text-slate-500"><tr><th className="px-1 py-2 text-left font-medium">Modèle</th><th className="px-1 py-2 text-right font-medium">Poids</th><th className="px-1 py-2 text-right font-medium">Max</th><th className="px-1 py-2 text-right font-medium">Min</th><th className="px-1 py-2 text-right font-medium">Vent</th></tr></thead><tbody>{data.modelDetails.map((model) => <tr key={model.name} className="border-b border-slate-800/70 last:border-0"><td className="px-1 py-2 font-semibold text-slate-200">{model.label}</td><td className="px-1 py-2 text-right text-blue-300">{model.averageWeight == null ? "—" : `${Math.round(model.averageWeight * 100)}%`}</td><td className="px-1 py-2 text-right text-orange-200">{model.tempMax == null ? "—" : `${Number(model.tempMax).toFixed(1)}°`}</td><td className="px-1 py-2 text-right text-sky-200">{model.tempMin == null ? "—" : `${Number(model.tempMin).toFixed(1)}°`}</td><td className="px-1 py-2 text-right text-slate-300">{model.windSpeed == null ? "—" : `${Number(model.windSpeed).toFixed(1)}`}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-xs text-slate-500">Aucune prévision quotidienne persistée pour ce lieu.</p>}</section>

    <BackToTopButton />
  </main>;
}
