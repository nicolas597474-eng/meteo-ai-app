import { useMemo, useState } from "react";
import { MeteoIcon } from "@/components/MeteoIcon";
import { MeteoSurface } from "@/components/weather/MeteoSurface";
import { WeatherStatusBadge } from "@/components/weather/WeatherStatusBadge";
import { BackToTopButton } from "@/components/BackToTopButton";
import { useLocation } from "@/contexts/LocationContext";
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

const SECTIONS = ["Vue générale", "Modèles", "Stations", "Comparaison", "Situations météo", "Historique", "Méthodologie"] as const;
const SECTION_IDS: Record<(typeof SECTIONS)[number], string> = {
  "Vue générale": "vue-generale",
  "Modèles": "modeles",
  "Stations": "stations",
  "Comparaison": "comparaison",
  "Situations météo": "situations",
  "Historique": "historique",
  "Méthodologie": "methodologie",
};

function metric(value: number | null | undefined, unit = "", digits = 1) {
  return value === null || value === undefined ? "—" : `${Number(value).toFixed(digits)}${unit}`;
}

function confidenceClass(tone: string | undefined) {
  if (tone === "green") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  if (tone === "yellow") return "border-amber-500/25 bg-amber-500/10 text-amber-100";
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
  const [period, setPeriod] = useState<PeriodId>("30d");
  const [horizon, setHorizon] = useState<HorizonId>("6-24h");
  const [activeSection, setActiveSection] = useState<(typeof SECTIONS)[number]>("Vue générale");
  const [sortBy, setSortBy] = useState<SortId>("score");
  const locationName = activeLocation?.name ?? "Hondeghem";
  const input = useMemo(() => ({
    lat: activeLocation?.lat ?? 50.7567,
    lon: activeLocation?.lon ?? 2.5204,
    period,
    horizon,
  }), [activeLocation?.lat, activeLocation?.lon, period, horizon]);
  const { data, isLoading, isError } = trpc.weather.getReliabilityLaboratory.useQuery(input, { staleTime: 2 * 60 * 1000 });

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
  const selectSection = (section: (typeof SECTIONS)[number]) => {
    setActiveSection(section);
    document.getElementById(SECTION_IDS[section])?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="min-h-screen bg-[#080a0f] pb-28">
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
            <div><p className="text-xs font-semibold text-slate-200">Paramètres d’analyse</p><p className="mt-0.5 text-[11px] text-slate-500">Le filtre ne recalcule pas les données : il limite la lecture de l’historique archivé.</p></div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-700 bg-[#090d14] p-1 [scrollbar-width:none]">
                {PERIODS.map((choice) => <button type="button" key={choice.id} onClick={() => setPeriod(choice.id)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${period === choice.id ? "bg-sky-600 text-white" : "text-slate-400"}`}>{choice.label}</button>)}
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-[#090d14] px-3 py-2 text-[11px] text-slate-400">Horizon<select value={horizon} onChange={(event) => setHorizon(event.target.value as HorizonId)} className="bg-transparent font-semibold text-slate-100 outline-none"><option value="0-6h">0–6 h</option><option value="6-24h">6–24 h</option><option value="24-48h">24–48 h</option><option value="2-3d">2–3 jours</option><option value="4-7d">4–7 jours</option><option value="8-10d">8–10 jours</option><option value="11-15d">11–15 jours</option></select></label>
            </div>
          </div>
        </MeteoSurface>

        {isLoading ? <div className="space-y-4"><div className="h-32 animate-pulse rounded-2xl bg-slate-900" /><div className="h-64 animate-pulse rounded-2xl bg-slate-900" /><div className="h-64 animate-pulse rounded-2xl bg-slate-900" /></div> : isError || !data ? <MeteoSurface tone="lab" className="rounded-2xl p-5"><Insufficient title="Laboratoire indisponible" detail="La lecture des données de fiabilité a échoué. Aucun résultat n’est affiché tant que les données réelles ne sont pas accessibles." /></MeteoSurface> : <>
          <MeteoSurface tone="lab" className="mb-4 scroll-mt-20 rounded-2xl p-4" id="vue-generale">
            <SectionHeading title="Vue générale" description="Les classements excluent explicitement les archives historiques non qualifiées et les références de modèle." icon="confidence" />
            <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
              <KeyMetric label="Meilleur modèle" value={bestModel ? bestModel.name : "—"} hint={bestModel ? `${metric(bestModel.normalizedScore, "/100", 0)} · ${bestModel.confidence.label}` : "Aucun modèle classable"} accent="text-sky-200" />
              <KeyMetric label="Comparaisons" value={String(evidence?.totalComparisons ?? 0)} hint="Paires modèle / observation physique" accent="text-white" />
              <KeyMetric label="Modèles classables" value={String(evidence?.evaluatedModelCount ?? 0)} hint="Seuil d’échantillon respecté" accent="text-emerald-300" />
              <KeyMetric label="Stations locales" value={String(stations.length)} hint="Stations physiques archivées sur la période" accent="text-amber-200" />
            </div>
          </MeteoSurface>

          <MeteoSurface tone="lab" className={`mb-4 rounded-2xl border p-4 ${evidence?.status?.qualifiedScoreCount > 0 ? "border-emerald-500/25" : "border-amber-500/25"}`}>
            <div className="flex items-start gap-3"><MeteoIcon name="stations" size={26} /><div><p className="text-sm font-semibold text-white">Preuves admises dans le classement</p><p className="mt-1 text-xs leading-relaxed text-slate-400">{evidence?.policy}</p><div className="mt-3 flex flex-wrap gap-2"><WeatherStatusBadge compact tone={evidence?.status?.coverageHours >= 18 ? "success" : "warning"} label="Heures physiques" value={`${evidence?.status?.coverageHours ?? 0}/18`} description="Nombre d’heures disposant de suffisamment d’observations physiques sur le dernier cycle. Le seuil de qualification est de 18 heures." /><WeatherStatusBadge compact tone={evidence?.status?.qualifiedScoreCount > 0 ? "success" : "neutral"} label="Scores qualifiés" value={String(evidence?.status?.qualifiedScoreCount ?? 0)} description="Nombre de comparaisons assez complètes pour être utilisées dans le laboratoire de fiabilité." /><WeatherStatusBadge compact tone="neutral" label="Dernière journée" value={evidence?.status?.date ?? "—"} description="Journée Europe/Paris sur laquelle les dernières preuves de comparaison ont été archivées." /></div></div></div>
          </MeteoSurface>

          <section className="mb-4" id="modeles">
            <MeteoSurface tone="lab" className="rounded-2xl p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><SectionHeading title="Classement des modèles" description="Les huit modèles actifs sont distincts des modèles en validation. Un score manque tant que toutes les métriques nécessaires ne sont pas alignées." icon="confidence" /><div className="flex flex-wrap gap-1.5">{(["score", "temperature", "precipitation", "wind"] as SortId[]).map((item) => <button type="button" key={item} onClick={() => setSortBy(item)} className={`rounded-lg border px-2 py-1 text-[10px] ${sortBy === item ? "border-sky-500 bg-sky-500/15 text-sky-100" : "border-slate-700 text-slate-400"}`}>{item === "score" ? "Score" : item === "temperature" ? "Température" : item === "precipitation" ? "Pluie" : "Vent"}</button>)}</div></div>
              <div className="space-y-2">
                {activeModels.map((model) => <ModelCard key={model.name} model={model} />)}
              </div>
              {candidateModels.length > 0 ? <div className="mt-4 border-t border-slate-800 pt-4"><p className="text-xs font-semibold text-amber-100">Modèles en validation · hors fusion</p><p className="mt-1 text-[11px] text-slate-500">Ces sorties sont archivées mais ne sont ni classées comme actives, ni intégrées à la prévision officielle.</p><div className="mt-2 space-y-2">{candidateModels.map((model) => <ModelCard key={model.name} model={model} candidate />)}</div></div> : null}
            </MeteoSurface>
          </section>

          <section className="mb-4 grid gap-4 scroll-mt-20 lg:grid-cols-2" id="comparaison">
            <MeteoSurface tone="lab" className="rounded-2xl p-4"><SectionHeading title="Évolution des scores" description="Chaque point provient d’un score déjà calculé ; aucune courbe n’est interpolée." icon="refresh" />{scoreTimeline.length === 0 ? <EmptyFigure title="Historique de score" reason="Les comparaisons physiques qualifiées ne sont pas encore disponibles sur la période sélectionnée." /> : <TimelineFigure points={scoreTimeline} />}</MeteoSurface>
            <MeteoSurface tone="lab" className="rounded-2xl p-4"><SectionHeading title="Prévision contre réalité" description="La comparaison détaillée apparaîtra une fois les séries horaires qualifiées conservées sur plusieurs cycles." icon="variable" />{scoreTimeline.length === 0 ? <EmptyFigure title="Écarts mesurés" reason={data.availability?.modelObservationReplay ?? "Données insuffisantes."} /> : <MetricEvidenceFigure points={scoreTimeline} />}</MeteoSurface>
          </section>

          <section className="mb-4 scroll-mt-20" id="historique">
            <MeteoSurface tone="lab" className="rounded-2xl p-4"><SectionHeading title="Précision selon l’horizon" description="Les horizons sont affichés séparément. Une période non archivée n’est jamais déduite d’un autre horizon." icon="refresh" /><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{(data.horizons as any[]).map((bucket) => <HorizonCard key={bucket.id} bucket={bucket} selected={bucket.id === horizon} />)}</div></MeteoSurface>
          </section>

          <section className="mb-4 grid gap-4 scroll-mt-20 lg:grid-cols-[1.35fr_.65fr]" id="stations">
            <MeteoSurface tone="lab" className="rounded-2xl p-4"><SectionHeading title="Fiabilité des stations" description="La qualité décrit la continuité et la complétude archivées ; elle ne modifie pas la fusion officielle à elle seule." icon="stations" />{stations.length === 0 ? <Insufficient detail="Aucune station physique n’est encore archivée pour cette localisation et cette période." /> : <div className="space-y-2">{stations.slice(0, 6).map((station) => <StationCard key={station.stationId} station={station} />)}{stations.length > 6 ? <p className="pt-1 text-center text-[11px] text-slate-500">{stations.length - 6} station(s) supplémentaire(s) disponible(s) dans l’historique.</p> : null}</div>}</MeteoSurface>
            <MeteoSurface tone="lab" className="rounded-2xl p-4"><SectionHeading title="Qualité locale" description="Statut des observations locales utilisées pour contrôler les modèles." icon="location" />{data.stationEvidence ? <div className="space-y-3 rounded-xl border border-slate-800 bg-[#090d14] p-3"><KeyValue label="Stations de la synthèse" value={String((data.stationEvidence as any).stationCount ?? "—")} /><KeyValue label="Confiance de la synthèse" value={metric((data.stationEvidence as any).confidenceScore, "/100", 0)} /><KeyValue label="Température" value={metric((data.stationEvidence as any).temperature, " °C")} /><KeyValue label="Pression" value={metric((data.stationEvidence as any).pressure, " hPa", 0)} /><KeyValue label="Calculée le" value={(data.stationEvidence as any).computedAt ? new Date((data.stationEvidence as any).computedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }) : "—"} /></div> : <Insufficient title="Synthèse locale indisponible" detail="Une synthèse apparaît après la collecte de stations physiques qualifiées." />}</MeteoSurface>
          </section>

          <section className="mb-4 grid gap-4 scroll-mt-20 lg:grid-cols-2" id="situations">
            <MeteoSurface tone="lab" className="rounded-2xl p-4"><SectionHeading title="Fiabilité selon les situations météo" description="Stable, pluie, vent, orage, brouillard et autres situations sont séparés seulement lorsque leur échantillon est disponible." icon="variable" /><EmptyFigure title="Analyse des situations" reason={data.availability?.situations ?? "Données insuffisantes."} /></MeteoSurface>
            <MeteoSurface tone="lab" className="rounded-2xl p-4"><SectionHeading title="Analyse saisonnière" description="Les comparaisons par saison, mois et période ne sont publiées qu’avec un historique mesuré suffisant." icon="partly_cloudy" /><EmptyFigure title="Saisons et périodes" reason={data.availability?.seasons ?? "Données insuffisantes."} /></MeteoSurface>
          </section>

          <section className="mb-4 scroll-mt-20" id="methodologie">
            <MeteoSurface tone="lab" className="rounded-2xl p-4"><SectionHeading title="Méthodologie et traçabilité" description="Une seule chaîne de données relie l’archive de prévisions, les observations physiques et les scores du laboratoire." icon="confidence" /><div className="grid gap-3 md:grid-cols-3"><MethodCard number="01" title="Prévisions archivées" detail="Les modèles actifs sont archivés avec leur date de validité et leur émission. Les modèles candidats restent hors fusion." /><MethodCard number="02" title="Réalité mesurée" detail="Seules les observations physiques qualifiées servent aux comparaisons. Les références de modèle et archives non qualifiées sont exclues." /><MethodCard number="03" title="Score explicable" detail={`Température ${data.scoreDefinition.weights.temperature * 100} %, pluie ${data.scoreDefinition.weights.precipitation * 100} %, vent ${data.scoreDefinition.weights.wind * 100} %, rafales ${data.scoreDefinition.weights.gusts * 100} %, humidité ${data.scoreDefinition.weights.humidity * 100} %, pression ${data.scoreDefinition.weights.pressure * 100} %.`} /></div><p className="mt-3 rounded-xl border border-slate-800 bg-[#090d14] px-3 py-2 text-[11px] leading-relaxed text-slate-500">Règle de publication : {data.scoreDefinition.missingMetricRule}</p></MeteoSurface>
          </section>
        </>}
      </div>
      <BackToTopButton />
    </main>
  );
}

function ModelCard({ model, candidate = false }: { model: any; candidate?: boolean }) {
  const confidence = model.confidence ?? {};
  const hasMetrics = [model.metrics?.temperature?.mae, model.metrics?.temperature?.rmse, model.metrics?.wind?.mae, model.metrics?.precipitation?.score, model.metrics?.humidityScore, model.metrics?.pressureScore].some((value) => value !== null && value !== undefined);
  return <article className={`rounded-xl border bg-[#090d14] p-3 ${candidate ? "border-amber-500/20" : "border-slate-800"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[10px] font-bold ${model.rank ? "bg-sky-500/15 text-sky-200" : "bg-slate-800 text-slate-400"}`}>{model.rank ? `#${model.rank}` : "—"}</span><p className="truncate text-sm font-semibold text-white">{model.name}</p><WeatherStatusBadge compact className="w-[104px]" tone={candidate ? "warning" : "info"} label={candidate ? "Validation" : "Modèle"} value={candidate ? "Hors fusion" : "Actif"} description={candidate ? "Ce modèle est en validation : il est archivé, mais ne contribue pas encore à la prévision officielle." : "Ce modèle est actif dans le laboratoire de fiabilité. Son score est calculé uniquement à partir de comparaisons archivées."} /></div><p className="mt-1 text-[10px] text-slate-500">{model.provider} · {model.archive?.runs ?? 0} émission(s) archivée(s) · dernières données : {model.archive?.latestValidDate ?? "—"}</p></div><div className="text-right"><p className="text-xl font-bold text-white">{metric(model.normalizedScore, "/100", 0)}</p><p className="text-[10px] text-slate-500">score normalisé</p></div></div>{hasMetrics ? <><div className="mt-3 grid gap-2 border-t border-slate-800 pt-3 sm:grid-cols-4"><KeyValue label="MAE température" value={metric(model.metrics?.temperature?.mae, " °C", 2)} /><KeyValue label="RMSE" value={metric(model.metrics?.temperature?.rmse, " °C", 2)} /><KeyValue label="Biais" value={metric(model.metrics?.temperature?.bias, " °C", 2)} /><KeyValue label="MAE vent" value={metric(model.metrics?.wind?.mae, " km/h", 2)} /></div><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.2fr]"><p className={`rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed ${confidenceClass(confidence.tone)}`}>{confidence.label ?? "Données insuffisantes"} · {model.evidence?.comparisons ?? 0} comparaison(s) sur {model.evidence?.evaluatedDays ?? 0} jour(s).</p><div className="space-y-1.5"><MiniBar label="Précipitations" value={model.metrics?.precipitation?.score} suffix="/100" className="bg-blue-400" /><MiniBar label="Humidité" value={model.metrics?.humidityScore} suffix="/100" className="bg-cyan-400" /><MiniBar label="Pression" value={model.metrics?.pressureScore} suffix="/100" className="bg-violet-400" /></div></div></> : null}{model.insufficiencyReason ? <p className={`mt-3 rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed ${confidenceClass(confidence.tone)}`}>{model.insufficiencyReason}</p> : null}</article>;
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
  return <div className="space-y-2">{usable.slice(0, 8).map((point, index) => <div key={`${point.date}-${point.serviceName}-${index}`} className="rounded-lg border border-slate-800 bg-[#090d14] p-2.5"><div className="flex items-center justify-between gap-3 text-[10px]"><span className="truncate text-slate-300">{point.serviceName} · {point.date}</span><span className="font-semibold text-white">MAE {metric(point.maeTemp, " °C", 2)}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, (Number(point.maeTemp) / highest) * 100)}%` }} /></div></div>)}</div>;
}

function KeyValue({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] text-slate-500">{label}</p><p className="mt-0.5 text-xs font-medium text-slate-200">{value}</p></div>; }
function MethodCard({ number, title, detail }: { number: string; title: string; detail: string }) { return <article className="rounded-xl border border-slate-800 bg-[#090d14] p-3"><span className="text-xs font-bold text-sky-300">{number}</span><h3 className="mt-2 text-sm font-semibold text-white">{title}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{detail}</p></article>; }
