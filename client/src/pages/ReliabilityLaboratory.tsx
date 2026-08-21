import { useMemo, useState } from "react";
import { MeteoIcon } from "@/components/MeteoIcon";
import { MeteoSurface } from "@/components/weather/MeteoSurface";
import { WeatherStatusBadge } from "@/components/weather/WeatherStatusBadge";
import { BackToTopButton } from "@/components/BackToTopButton";
import { useLocation } from "@/contexts/LocationContext";
import { usePageWeatherSky } from "@/hooks/usePageWeatherSky";
import { trpc } from "@/lib/trpc";

type PeriodId = "24h" | "7d" | "30d" | "90d" | "365d";
type HorizonId = "0-6h" | "6-24h" | "24-48h" | "2-3d" | "4-7d" | "8-10d" | "11-15d";
type SortId = "score" | "temperature" | "precipitation" | "wind";

const PERIODS: Array<{ id: PeriodId; label: string }> = [
  { id: "24h", label: "24 h" },
  { id: "7d", label: "7 jours" },
  { id: "30d", label: "30 jours" },
  { id: "90d", label: "90 jours" },
  { id: "365d", label: "365 jours" },
];

const HORIZONS: Array<{ id: HorizonId; label: string }> = [
  { id: "0-6h", label: "0–6 h" },
  { id: "6-24h", label: "6–24 h" },
  { id: "24-48h", label: "24–48 h" },
  { id: "2-3d", label: "2–3 jours" },
  { id: "4-7d", label: "4–7 jours" },
  { id: "8-10d", label: "8–10 jours" },
  { id: "11-15d", label: "11–15 jours" },
];

const SECTIONS = ["Scores globaux", "Tendances provisoires", "Vue générale", "Modèles"] as const;
const SECTION_IDS: Record<(typeof SECTIONS)[number], string> = {
  "Scores globaux": "scores-globaux",
  "Vue générale": "vue-generale",
  "Tendances provisoires": "tendances-provisoires",
  "Modèles": "modeles",
};

function metric(value: number | null | undefined, unit = "", digits = 1) {
  return value === null || value === undefined ? "—" : `${Number(value).toFixed(digits)}${unit}`;
}

function confidenceClass(tone: string | undefined) {
  if (tone === "green") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  if (tone === "yellow") return "border-sky-500/30 bg-sky-500/10 text-sky-100";
  return "border-rose-500/25 bg-rose-500/10 text-rose-100";
}

function Insufficient({ title = "Données insuffisantes", detail }: { title?: string; detail?: string | null }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-[#090d14]/75 px-4 py-5 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-slate-500">{detail ?? "Cette analyse apparaîtra lorsque l’historique de prévisions et les observations physiques qualifiées permettront une comparaison reproductible."}</p>
    </div>
  );
}

function SectionHeading({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
        <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-slate-500">{description}</p>
      </div>
      <MeteoIcon name={icon} size={23} className="shrink-0" />
    </div>
  );
}

function KeyMetric({ label, value, hint, accent = "text-slate-100" }: { label: string; value: string; hint: string; accent?: string }) {
  return (
    <div className="min-w-0 border-r border-slate-800 px-2 last:border-0 first:pl-0 last:pr-0">
      <p className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-base font-bold ${accent}`}>{value}</p>
      <p className="mt-0.5 min-h-7 text-[10px] leading-tight text-slate-500">{hint}</p>
    </div>
  );
}

function MiniBar({ label, value, suffix, className }: { label: string; value: number | null | undefined; suffix: string; className: string }) {
  const normalized = value === null || value === undefined ? null : Math.max(0, Math.min(100, Number(value)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-slate-500"><span>{label}</span><span className="font-semibold text-slate-300">{normalized === null ? "—" : `${Math.round(normalized)}${suffix}`}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${className}`} style={{ width: `${normalized ?? 0}%` }} /></div>
    </div>
  );
}

function EmptyFigure({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#090d14] p-3">
      <p className="text-[11px] font-semibold text-slate-300">{title}</p>
      <div className="mt-3 flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-800 bg-[#070b12] px-5 text-center text-[11px] leading-relaxed text-slate-500">{reason}</div>
    </div>
  );
}

export default function ReliabilityLaboratory() {
  const { activeLocation } = useLocation();
  const { style: pageSkyStyle } = usePageWeatherSky();
  const [period, setPeriod] = useState<PeriodId>("7d");
  const [horizon, setHorizon] = useState<HorizonId>("6-24h");
  const [activeSection, setActiveSection] = useState<(typeof SECTIONS)[number]>("Scores globaux");
  const [sortBy, setSortBy] = useState<SortId>("score");
  const [isPrecipitationHelpOpen, setIsPrecipitationHelpOpen] = useState(false);
  const locationName = activeLocation?.name ?? "Hondeghem";
  const input = useMemo(() => ({
    lat: activeLocation?.lat ?? 50.7567,
    lon: activeLocation?.lon ?? 2.5204,
    period,
    horizon,
  }), [activeLocation?.lat, activeLocation?.lon, period, horizon]);
  const { data, isLoading, isError } = trpc.weather.getReliabilityLaboratory.useQuery(input, { staleTime: 2 * 60 * 1000 });
  const { data: forecastProvenance } = trpc.weather.getForecastProvenance.useQuery(
    { lat: input.lat, lon: input.lon }, { staleTime: 60 * 1000, refetchOnWindowFocus: false }
  );

  const models = useMemo(() => {
    const rows = [...(data?.models ?? [])] as any[];
    const valueFor = (model: any) => {
      if (sortBy === "temperature") return model.metrics?.temperature?.mae === null ? Number.POSITIVE_INFINITY : Number(model.metrics.temperature.mae);
      if (sortBy === "precipitation") return model.metrics?.precipitation?.score === null ? -1 : Number(model.metrics.precipitation.score);
      if (sortBy === "wind") return model.metrics?.wind?.mae === null ? Number.POSITIVE_INFINITY : Number(model.metrics.wind.mae);
      return model.normalizedScore === null ? -1 : Number(model.normalizedScore);
    };
    return rows.sort((left, right) => {
      const leftValue = valueFor(left);
      const rightValue = valueFor(right);
      return sortBy === "temperature" || sortBy === "wind" ? leftValue - rightValue : rightValue - leftValue;
    });
  }, [data?.models, sortBy]);

  const activeModels = models.filter((model) => model.status === "actif");
  const candidateModels = models.filter((model) => model.status === "validation");
  const scoreTimeline = (data?.scoreTimeline ?? []) as any[];
  const stations = (data?.stations ?? []) as any[];
  const bestModel = data?.bestModel as any;
  const evidence = data?.evidence as any;
  const qualifiedScoreCount = Number(evidence?.status?.qualifiedScoreCount ?? 0);
  const classifiableModels = activeModels.filter((model) => model.normalizedScore !== null && model.normalizedScore !== undefined);
  const hasClassifiableEvidence = qualifiedScoreCount > 0 && classifiableModels.length > 0;
  const provisionalTrends = useMemo(() => ({
    temperature: activeModels.filter((model) => model.metrics?.temperature?.mae !== null && model.metrics?.temperature?.mae !== undefined).sort((left, right) => Number(left.metrics.temperature.mae) - Number(right.metrics.temperature.mae)),
    precipitation: activeModels.filter((model) => model.metrics?.precipitation?.score !== null && model.metrics?.precipitation?.score !== undefined).sort((left, right) => Number(right.metrics.precipitation.score) - Number(left.metrics.precipitation.score)),
    wind: activeModels.filter((model) => model.metrics?.wind?.mae !== null && model.metrics?.wind?.mae !== undefined).sort((left, right) => Number(left.metrics.wind.mae) - Number(right.metrics.wind.mae)),
    humidity: activeModels.filter((model) => model.metrics?.humidity?.mae !== null && model.metrics?.humidity?.mae !== undefined).sort((left, right) => Number(left.metrics.humidity.mae) - Number(right.metrics.humidity.mae)),
  }), [activeModels]);
  const selectSection = (section: (typeof SECTIONS)[number]) => {
    setActiveSection(section);
    document.getElementById(SECTION_IDS[section])?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="weather-page-sky min-h-screen bg-[#080a0f] pb-28" style={pageSkyStyle}>
      <div className="mx-auto max-w-6xl px-3 pt-3 sm:px-5 sm:pt-5">
        <header className="mb-4 overflow-hidden rounded-2xl border border-sky-500/15 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,.18),transparent_40%),linear-gradient(135deg,#101827,#090d15)] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-sky-300"><MeteoIcon name="confidence" size={21} /><span className="text-xs font-semibold uppercase tracking-[0.17em]">Centre d’analyse MeteoAI</span></div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">Laboratoire de fiabilité</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">Analyse transparente des prévisions et des observations réelles, sans score estimé ni source de substitution.</p>
            </div>
            <div className="min-w-[176px] rounded-xl border border-slate-700/80 bg-[#080d16]/80 px-3 py-2.5">
              <div className="flex items-center gap-2 text-sky-300"><MeteoIcon name="location" size={17} /><span className="text-xs font-semibold">{locationName}</span></div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Même localisation, fuseau Europe/Paris et unités que le moteur central.</p>
            </div>
          </div>
          <nav aria-label="Sections du laboratoire" className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {SECTIONS.map((section) => <button key={section} type="button" onClick={() => selectSection(section)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium ${activeSection === section ? "border-sky-400/60 bg-sky-500/15 text-sky-100" : "border-slate-700 bg-[#0a0e16] text-slate-400"}`}>{section}</button>)}
          </nav>
        </header>

        <MeteoSurface tone="lab" className="mb-4 rounded-2xl p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="text-xs font-semibold text-slate-200">Période analysée</p><p className="mt-0.5 text-[11px] text-slate-500">Choisissez la période et l’échéance à comparer. Aucun résultat n’est estimé.</p></div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-700 bg-[#090d14] p-1 [scrollbar-width:none]">
                {PERIODS.map((choice) => <button type="button" key={choice.id} onClick={() => setPeriod(choice.id)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${period === choice.id ? "bg-sky-600 text-white" : "text-slate-400"}`}>{choice.label}</button>)}
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-[#090d14] px-3 py-2 text-[11px] text-slate-400">Horizon<select value={horizon} onChange={(event) => setHorizon(event.target.value as HorizonId)} className="bg-transparent font-semibold text-slate-100 outline-none"><option value="0-6h">0–6 h</option><option value="6-24h">6–24 h</option><option value="24-48h">24–48 h</option><option value="2-3d">2–3 jours</option><option value="4-7d">4–7 jours</option><option value="8-10d">8–10 jours</option><option value="11-15d">11–15 jours</option></select></label>
            </div>
          </div>
        </MeteoSurface>

        {isLoading ? <div className="space-y-4"><div className="h-32 animate-pulse rounded-2xl bg-slate-900" /><div className="h-64 animate-pulse rounded-2xl bg-slate-900" /><div className="h-64 animate-pulse rounded-2xl bg-slate-900" /></div> : isError || !data ? <MeteoSurface tone="lab" className="rounded-2xl p-5"><Insufficient title="Laboratoire indisponible" detail="La lecture des données de fiabilité a échoué. Aucun résultat n’est affiché tant que les données réelles ne sont pas accessibles." /></MeteoSurface> : <>
          <section className="mb-4 scroll-mt-20" id="scores-globaux">
            <GlobalScoreTimelineFigure points={scoreTimeline} />
          </section>
          <section className="mb-4 scroll-mt-20" id="tendances-provisoires">
            <MeteoSurface tone="lab" className="rounded-2xl p-4">
              <SectionHeading title="Tendances provisoires" description="Ces indicateurs montrent les mesures déjà disponibles par paramètre. Le volume de preuves figure sous chaque modèle, sans constituer une fiabilité prédictive validée ni une performance par condition météo." icon="trending" />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <ProvisionalTrendCard title="Température" detail="MAE la plus faible observée" models={provisionalTrends.temperature} value={(model) => metric(model.metrics.temperature.mae, " °C", 2)} accent="text-orange-200" />
                <ProvisionalTrendCard
                  title="Pluie"
                  detail="Score de précipitation le plus élevé observé"
                  models={provisionalTrends.precipitation}
                  value={(model) => metric(model.metrics.precipitation.score, "/100", 0)}
                  accent="text-sky-200"
                  helpId="score-precipitation-help"
                  isHelpOpen={isPrecipitationHelpOpen}
                  onHelpToggle={() => setIsPrecipitationHelpOpen((open) => !open)}
                  onHelpClose={() => setIsPrecipitationHelpOpen(false)}
                  help={{
                    title: "Comprendre le score de pluie",
                    description: "Ce score mesure la concordance observée entre les précipitations prévues et archivées.",
                    items: [
                      ["Plus le score est élevé", "meilleure est la concordance mesurée."],
                      ["85/100", "ne signifie ni 85 mm, ni 85 % de risque de pluie."],
                      ["Quantité de pluie", "elle reste affichée séparément dans les prévisions horaires et quotidiennes."],
                    ],
                  }}
                />
                <ProvisionalTrendCard title="Vent" detail="MAE la plus faible observée" models={provisionalTrends.wind} value={(model) => metric(model.metrics.wind.mae, " km/h", 2)} accent="text-cyan-200" />
                <ProvisionalTrendCard title="Humidité" detail="MAE la plus faible observée" models={provisionalTrends.humidity} value={(model) => metric(model.metrics.humidity.mae, " %", 2)} accent="text-violet-200" />
              </div>
              <p className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-sky-100">Couverture provisoire des preuves : les comparaisons et les jours archivés sous chaque modèle indiquent la maturité de l’échantillon, sans constituer une performance future. Le classement officiel reste masqué tant que le score normalisé complet et les régimes météorologiques ne sont pas archivés.</p>
            </MeteoSurface>
          </section>

          <MeteoSurface tone="lab" className="mb-4 scroll-mt-20 rounded-2xl p-4" id="vue-generale">
            <SectionHeading title="Fiabilité en bref" description="Voici uniquement ce qui est actuellement mesuré et utilisable pour ce lieu, cette période et cette échéance." icon="confidence" />
            <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
              <KeyMetric label="Classement" value={hasClassifiableEvidence ? "Disponible" : "En préparation"} hint={hasClassifiableEvidence ? "Comparaisons qualifiées suffisantes" : "Historique encore trop court"} accent={hasClassifiableEvidence ? "text-emerald-300" : "text-sky-200"} />
              <KeyMetric label="Meilleur modèle" value={hasClassifiableEvidence && bestModel ? bestModel.name : "—"} hint={hasClassifiableEvidence && bestModel ? `${metric(bestModel.normalizedScore, "/100", 0)} · ${bestModel.confidence.label}` : "Aucun modèle classable"} accent="text-sky-200" />
              <KeyMetric label="Comparaisons fiables" value={String(evidence?.totalComparisons ?? 0)} hint="Prévision comparée à une observation physique" accent="text-white" />
              <KeyMetric label="Stations archivées" value={String(stations.length)} hint="Sources physiques sur la période" accent="text-emerald-200" />
            </div>
            <div className={`mt-4 rounded-xl border px-3 py-3 ${hasClassifiableEvidence ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-sky-500/30 bg-sky-500/[0.06]"}`}><p className="text-sm font-semibold text-slate-100">{hasClassifiableEvidence ? "Le classement est utilisable" : "Classement en préparation"}</p><p className="mt-1 text-xs leading-relaxed text-slate-400">{hasClassifiableEvidence ? "Les scores affichés reposent sur des comparaisons complètes. Les détails secondaires restent volontairement masqués pour faciliter la lecture." : "Les relevés commencent à être archivés, mais les comparaisons ne sont pas encore assez nombreuses ou complètes pour classer les modèles sans risque d’interprétation."}</p></div>
          </MeteoSurface>

          <section className="mb-4" id="modeles">
            <MeteoSurface tone="lab" className="rounded-2xl p-4">
              <SectionHeading title="Modèles classables" description="Seuls les modèles qui disposent de suffisamment de comparaisons complètes sont listés ici." icon="confidence" />
              <div className="space-y-2">
                {hasClassifiableEvidence ? classifiableModels.slice(0, 3).map((model) => <ModelCard key={model.name} model={model} />) : <Insufficient title="Aucun modèle classable pour le moment" detail="La collecte archive déjà les prévisions et les observations. Le classement apparaîtra automatiquement lorsque le seuil de comparaisons complètes sera atteint." />}
              </div>
              {hasClassifiableEvidence && classifiableModels.length > 3 ? <p className="mt-3 text-center text-[11px] text-slate-500">{classifiableModels.length - 3} autre(s) modèle(s) classable(s) sont disponibles lorsque davantage de comparaison est nécessaire.</p> : null}
              {candidateModels.length > 0 ? <p className="mt-3 border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">{candidateModels.length} modèle(s) candidat(s) sont suivis séparément. Ils restent hors fusion et ne sont pas listés tant que leur gain de fiabilité n’est pas démontré.</p> : null}
            </MeteoSurface>
          </section>
        </>}
      </div>
      <BackToTopButton />
    </main>
  );
}

function ModelCard({ model }: { model: any }) {
  const confidence = model.confidence ?? {};
  return <article className="rounded-xl border border-slate-800 bg-[#090d14] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[10px] font-bold ${model.rank ? "bg-sky-500/15 text-sky-200" : "bg-slate-800 text-slate-400"}`}>{model.rank ? `#${model.rank}` : "—"}</span><p className="truncate text-sm font-semibold text-white">{model.name}</p></div><p className="mt-1 text-[10px] text-slate-500">{model.evidence?.comparisons ?? 0} comparaison(s) qualifiée(s) · {model.evidence?.evaluatedDays ?? 0} jour(s)</p></div><div className="text-right"><p className="text-xl font-bold text-white">{metric(model.normalizedScore, "/100", 0)}</p><p className="text-[10px] text-slate-500">score mesuré</p></div></div><p className={`mt-3 rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed ${confidenceClass(confidence.tone)}`}>{confidence.label ?? "Données insuffisantes"}</p></article>;
}

function ProvisionalTrendCard({ title, detail, models, value, accent, help, helpId, isHelpOpen = false, onHelpToggle, onHelpClose }: { title: string; detail: string; models: any[]; value: (model: any) => string; accent: string; help?: { title: string; description: string; items: [string, string][] }; helpId?: string; isHelpOpen?: boolean; onHelpToggle?: () => void; onHelpClose?: () => void }) {
  return <article className="rounded-xl border border-sky-500/25 bg-[#09111d]/85 p-3">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0"><p className="text-sm font-semibold text-slate-100">{title}</p><p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{detail}</p></div>
      {help ? <button type="button" onClick={onHelpToggle} aria-expanded={isHelpOpen} aria-controls={helpId} className="shrink-0 rounded-full border border-sky-400/35 bg-sky-400/10 px-2 py-1 text-[9px] font-semibold text-sky-100 transition-colors hover:bg-sky-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">{isHelpOpen ? "Réduire" : "Comprendre"}</button> : null}
    </div>
    {models.length ? <div className="mt-3 space-y-2">{models.slice(0, 3).map((model) => {
      return <div key={model.name} className="flex items-center justify-between gap-3 border-t border-slate-800 pt-2 first:border-0 first:pt-0">
        <div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-200">{model.name}</p><p className="mt-0.5 text-[10px] text-slate-500">{model.evidence?.comparisons ?? 0} comparaison(s) · {model.evidence?.evaluatedDays ?? 0} jour(s)</p></div>
        <div className="shrink-0 text-right"><p className={`text-sm font-bold ${accent}`}>{value(model)}</p></div>
      </div>;
    })}</div> : <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Aucune mesure qualifiée disponible pour ce paramètre sur la période sélectionnée.</p>}
    {help && isHelpOpen ? <div id={helpId} className="mt-3 rounded-xl border border-sky-400/30 bg-sky-400/[0.08] p-3" role="region" aria-label={help.title}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold text-sky-100">{help.title}</p><p className="mt-1 text-[10px] leading-relaxed text-slate-300">{help.description}</p></div><button type="button" onClick={onHelpClose} aria-label="Fermer l’explication du score de précipitation" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-sky-300/45 bg-slate-950/45 text-base leading-none text-sky-100 transition-colors hover:bg-sky-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">×</button></div>
      <div className="mt-3 space-y-2 border-t border-sky-300/15 pt-2">{help.items.map(([label, explanation]) => <div key={label} className="grid grid-cols-[max-content_1fr] gap-x-2 text-[10px] leading-relaxed"><span className="font-semibold text-sky-100">{label}</span><span className="text-slate-300">{explanation}</span></div>)}</div>
    </div> : null}
  </article>;
}

function HorizonCard({ bucket, selected }: { bucket: any; selected: boolean }) {
  const candidates = [...(bucket.models ?? [])].filter((model: any) => model.comparisons > 0).sort((a: any, b: any) => (a.temperatureMae ?? Number.POSITIVE_INFINITY) - (b.temperatureMae ?? Number.POSITIVE_INFINITY));
  const best = candidates[0];
  return <article className={`rounded-xl border p-3 ${selected ? "border-sky-500/40 bg-sky-500/5" : "border-slate-800 bg-[#090d14]"}`}><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-100">{bucket.label}</p><WeatherStatusBadge compact tone={bucket.available ? "success" : "neutral"} label="Archive" value={bucket.available ? "Disponible" : "Indisponible"} /></div>{best ? <div className="mt-3"><p className="text-[10px] text-slate-500">Meilleure MAE température</p><p className="mt-0.5 text-sm font-semibold text-white">{best.name} · {metric(best.temperatureMae, " °C", 2)}</p><p className="mt-2 text-[10px] text-slate-500">{best.comparisons} comparaison(s) · {best.confidence.label}</p></div> : <p className="mt-3 text-[10px] leading-relaxed text-slate-500">{bucket.reason ?? "Données insuffisantes."}</p>}</article>;
}

function StationCard({ station }: { station: any }) {
  const latest = station.latest;
  const quality = station.quality;
  return <article className="rounded-xl border border-slate-800 bg-[#090d14] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-white">{station.name}</p><WeatherStatusBadge compact tone="success" label="Station" value={String(station.source).toUpperCase()} /></div><p className="mt-1 text-[10px] text-slate-500">{metric(station.distanceKm, " km")} {station.altitude === null || station.altitude === undefined ? "" : `· ${metric(station.altitude, " m", 0)}`} · disponibilité {metric(station.availability, "%", 0)}</p></div><div className="text-right"><p className="text-base font-bold text-white">{metric(latest?.temperature, " °C")}</p><p className="text-[10px] text-slate-500">dernier relevé</p></div></div><div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-800 pt-3"><KeyValue label="Humidité" value={metric(latest?.humidity, " %", 0)} /><KeyValue label="Pression" value={metric(latest?.pressure, " hPa", 0)} /><KeyValue label="Vent" value={metric(latest?.windSpeed, " km/h")} /></div><p className={`mt-3 rounded-lg border px-2.5 py-2 text-[10px] ${confidenceClass(station.confidence?.tone)}`}>{quality ? `${quality.status.replace("_", " ")} · ${quality.observationCount} relevé(s) · continuité ${metric(quality.continuityScore, "/100", 0)}` : "Profil historique non encore calculé."}</p></article>;
}

function TimelineFigure({ points }: { points: any[] }) {
  const usable = points.filter((point) => point.normalizedScore !== null);
  if (usable.length === 0) return <EmptyFigure title="Historique de score" reason="Les scores normalisés complets ne sont pas encore archivés." />;
  const values = usable.map((point) => Number(point.normalizedScore));
  const min = Math.max(0, Math.floor(Math.min(...values) - 5));
  const max = Math.min(100, Math.ceil(Math.max(...values) + 5));
  const width = 620;
  const height = 175;
  const pad = 18;
  const pointsByModel = new Map<string, any[]>();
  usable.forEach((point) => pointsByModel.set(point.serviceName, [...(pointsByModel.get(point.serviceName) ?? []), point]));
  const colors = ["#60a5fa", "#34d399", "#c084fc", "#fbbf24", "#f472b6", "#38bdf8", "#a3e635", "#fb7185"];
  return <div><div className="h-44 rounded-xl border border-slate-800 bg-[#090d14] p-2"><svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" aria-label="Évolution des scores normalisés mesurés">{[.2, .4, .6, .8].map((ratio) => <line key={ratio} x1={pad} x2={width - pad} y1={pad + (height - pad * 2) * ratio} y2={pad + (height - pad * 2) * ratio} stroke="#1e293b" strokeWidth="1" />)}{Array.from(pointsByModel.entries()).map(([name, series], index) => { const ordered = [...series].sort((left, right) => String(left.date).localeCompare(String(right.date))); const path = ordered.map((point, pointIndex) => { const x = pad + pointIndex * ((width - pad * 2) / Math.max(ordered.length - 1, 1)); const y = pad + (1 - (Number(point.normalizedScore) - min) / Math.max(max - min, 1)) * (height - pad * 2); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(" "); return <polyline key={name} points={path} fill="none" stroke={colors[index % colors.length]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />; })}</svg></div><p className="mt-2 text-[10px] leading-relaxed text-slate-500">Chaque ligne représente un modèle dont au moins un score normalisé complet est archivé. L’échelle affichée est calculée uniquement à partir des points disponibles.</p></div>;
}

function MetricEvidenceFigure({ points }: { points: any[] }) {
  const usable = points.filter((point) => point.maeTemp !== null);
  if (usable.length === 0) return <EmptyFigure title="MAE température" reason="Aucune erreur de température qualifiée n’est archivée pour cette période." />;
  const highest = Math.max(...usable.map((point) => Number(point.maeTemp)), 0.1);
  return <div className="space-y-2">{usable.slice(0, 8).map((point, index) => <div key={`${point.date}-${point.serviceName}-${index}`} className="rounded-lg border border-slate-800 bg-[#090d14] p-2.5"><div className="flex items-center justify-between gap-3 text-[10px]"><span className="truncate text-slate-300">{point.serviceName} · {point.date}</span><span className="font-semibold text-white">MAE {metric(point.maeTemp, " °C", 2)}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.min(100, (Number(point.maeTemp) / highest) * 100)}%` }} /></div></div>)}</div>;
}

const GLOBAL_SCORE_MODEL_PALETTES = [
  { bar: "bg-cyan-400/80", border: "border-cyan-400/25", text: "text-cyan-100" },
  { bar: "bg-orange-400/80", border: "border-orange-400/25", text: "text-orange-100" },
  { bar: "bg-emerald-400/80", border: "border-emerald-400/25", text: "text-emerald-100" },
  { bar: "bg-violet-400/80", border: "border-violet-400/25", text: "text-violet-100" },
  { bar: "bg-rose-400/80", border: "border-rose-400/25", text: "text-rose-100" },
  { bar: "bg-amber-400/80", border: "border-amber-400/25", text: "text-amber-100" },
  { bar: "bg-sky-400/80", border: "border-sky-400/25", text: "text-sky-100" },
  { bar: "bg-teal-400/80", border: "border-teal-400/25", text: "text-teal-100" },
] as const;

const FRENCH_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"] as const;

function formatFrenchDayMonth(value: unknown) {
  const parts = String(value).split("-");
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) return String(value);
  return `${day} ${FRENCH_MONTHS[month - 1]}`;
}

function GlobalScoreTimelineFigure({ points }: { points: any[] }) {
  const usable = points.filter((point) => point.normalizedScore !== null && point.normalizedScore !== undefined);
  if (usable.length === 0) return <EmptyFigure title="Scores globaux indisponibles" reason="Aucun score global normalisé n’est encore archivé avec toutes les variables nécessaires." />;
  const grouped = new Map<string, any[]>();
  usable.forEach((point) => grouped.set(point.serviceName, [...(grouped.get(point.serviceName) ?? []), point]));
  const seriesByModel = Array.from(grouped.entries())
    .map(([name, series]) => ({
      name,
      series,
      averageScore: series.reduce((total, point) => total + Number(point.normalizedScore), 0) / series.length,
    }))
    .sort((left, right) => right.averageScore - left.averageScore || left.name.localeCompare(right.name));
  return <section className="rounded-xl border border-violet-500/25 bg-violet-500/[0.045] p-3" aria-label="Évolution des scores globaux par modèle">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-violet-100">Scores globaux par modèle</p><p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">Score normalisé réellement archivé sur 100 : plus la barre est haute, plus le score global est élevé. Il est affiché uniquement lorsque toutes les composantes requises sont disponibles.</p></div><span className="shrink-0 rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-1 text-[9px] font-semibold text-violet-100">{usable.length} point(s)</span></div>
    <div className="mt-3 space-y-2">{seriesByModel.map(({ name, series, averageScore }, modelIndex) => {
      const palette = GLOBAL_SCORE_MODEL_PALETTES[modelIndex % GLOBAL_SCORE_MODEL_PALETTES.length];
      return <article key={name} className={`rounded-lg border bg-slate-950/25 p-2.5 ${palette.border}`}>
        <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-1.5"><p className={`truncate text-xs font-semibold ${palette.text}`}>{name}</p>{modelIndex === 0 ? <span className="shrink-0 rounded-full border border-amber-300/45 bg-amber-300/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-100">Meilleur modèle</span> : null}</div><p className="shrink-0 text-[10px] text-slate-400">Moy. {Math.round(averageScore)} % · {series.length} mesure(s)</p></div>
        <div className="mt-2 flex items-end gap-1" aria-label={`Évolution du score global pour ${name}`}>{[...series].sort((left, right) => String(left.date).localeCompare(String(right.date))).map((point) => { const score = Math.max(0, Math.min(100, Number(point.normalizedScore))); const height = Math.max(10, Math.round((score / 100) * 56)); return <div key={`${point.date}-${point.serviceName}`} className="flex min-w-0 flex-1 flex-col items-center gap-1"><span className={`text-[13px] font-bold leading-none ${palette.text}`}>{Math.round(score)} %</span><div className={`w-full rounded-t ${palette.bar}`} style={{ height }} title={`${formatFrenchDayMonth(point.date)} · score global ${Math.round(score)}/100 · ${point.comparisons ?? 0} comparaison(s)`} /><span className="truncate text-[10px] leading-tight text-slate-400">{formatFrenchDayMonth(point.date)}</span></div>; })}</div>
      </article>;
    })}</div>
  </section>;
}

function KeyValue({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] text-slate-500">{label}</p><p className="mt-0.5 text-xs font-medium text-slate-200">{value}</p></div>; }
function MethodCard({ number, title, detail }: { number: string; title: string; detail: string }) { return <article className="rounded-xl border border-slate-800 bg-[#090d14] p-3"><span className="text-xs font-bold text-sky-300">{number}</span><h3 className="mt-2 text-sm font-semibold text-white">{title}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{detail}</p></article>; }
