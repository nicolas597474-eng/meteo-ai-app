import { useMemo, useState } from "react";
import { Calendar, ChevronDown, ChevronUp, CloudRain, Clock, MapPin, Thermometer, Wind, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trpc } from "@/lib/trpc";
import { getMeteoAIComparisonLabel } from "@/lib/historyComparison";
import { useLocation } from "@/contexts/LocationContext";
import { usePageWeatherSky } from "@/hooks/usePageWeatherSky";
import { BackToTopButton } from "@/components/BackToTopButton";
import { MeteoSurface } from "@/components/weather/MeteoSurface";

const MODEL_COLORS: Record<string, string> = {
  AROME: "#fb923c", ARPEGE: "#a78bfa", ECMWF: "#60a5fa", GFS: "#34d399",
  ICON: "#fb7185", UKMET: "#22d3ee", GEM: "#fbbf24", MeteoAI: "#38bdf8",
};

type HistoryTab = "temperature" | "precip" | "wind";

function modelColor(name: string) {
  return MODEL_COLORS[name] ?? `hsl(${(name.charCodeAt(0) * 37) % 360} 74% 62%)`;
}

function shortDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(date);
}

function number(value: unknown, suffix = "", digits = 1) {
  return value == null || Number.isNaN(Number(value)) ? "—" : `${Number(value).toFixed(digits)}${suffix}`;
}

function errorTone(value: number | null) {
  if (value == null) return "text-slate-400";
  if (value <= 1) return "text-emerald-300";
  if (value <= 2) return "text-amber-300";
  return "text-rose-300";
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <MeteoSurface tone="inset" className="rounded-2xl p-6 text-center"><Clock className="mx-auto mb-3 h-7 w-7 text-slate-500" /><h2 className="text-base font-semibold text-white">{title}</h2><p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-400">{detail}</p></MeteoSurface>;
}

function SectionTitle({ icon: Icon, title, detail }: { icon: typeof Thermometer; title: string; detail: string }) {
  return <div className="mb-3 flex items-start gap-2.5"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-sky-400/20 bg-sky-400/10"><Icon className="h-4 w-4 text-sky-300" /></span><div><h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2><p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{detail}</p></div></div>;
}

function Legend({ entries }: { entries: Array<{ label: string; color: string; dashed?: boolean }> }) {
  return <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">{entries.map((entry) => <span key={entry.label} className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-950/30 px-2 py-1 text-[10px] text-slate-300"><span className={`h-0.5 w-3 rounded-full ${entry.dashed ? "border-t border-dashed border-current bg-transparent" : ""}`} style={{ backgroundColor: entry.dashed ? undefined : entry.color, color: entry.color }} />{entry.label}</span>)}</div>;
}

function HistoryChartTooltip({ active, payload, label, unit = "" }: any) {
  const [dismissedLabel, setDismissedLabel] = useState<string | null>(null);
  const tooltipLabel = String(label ?? "");
  const entries = (payload ?? []).filter((entry: any) => entry?.value != null && !Array.isArray(entry.value));
  if (!active || entries.length === 0 || dismissedLabel === tooltipLabel) return null;
  const observation = entries.find((entry: any) => String(entry.name).toLowerCase().includes("observation") || String(entry.name).toLowerCase().includes("observé"));
  const meteoAI = entries.find((entry: any) => String(entry.name).toLowerCase().includes("meteoai"));
  const gap = observation?.value != null && meteoAI?.value != null ? Number(meteoAI.value) - Number(observation.value) : null;
  const dismissTooltip = (event: React.SyntheticEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDismissedLabel(tooltipLabel);
  };
  return <div role="tooltip" style={{ pointerEvents: "auto" }} className="min-w-48 rounded-xl border border-slate-500/90 bg-[#070b12] p-3 text-left ring-1 ring-black/45">
    <div className="flex items-start justify-between gap-3 border-b border-slate-700/80 pb-2"><p className="text-xs font-semibold text-white">{shortDate(tooltipLabel)}</p><button type="button" onPointerDown={dismissTooltip} onClick={dismissTooltip} aria-label="Fermer le détail d’observation" title="Fermer" style={{ touchAction: "manipulation" }} className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-300 transition-colors hover:bg-slate-800 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><X size={16} strokeWidth={2.5} aria-hidden="true" /></button></div>
    <div className="space-y-1.5 pt-2">{entries.map((entry: any) => <div key={`${entry.dataKey}-${entry.name}`} className="flex items-center justify-between gap-5 text-[11px]"><span className="flex min-w-0 items-center gap-1.5 text-slate-300"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color ?? "#94a3b8" }} /> <span className="truncate">{entry.name}</span></span><strong className="shrink-0 font-mono text-slate-100">{number(entry.value, unit, 1)}</strong></div>)}</div>
    {gap != null ? <p className={`mt-2 rounded-lg border px-2 py-1.5 text-[10px] ${Math.abs(gap) <= 1 ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-200" : "border-amber-400/20 bg-amber-400/5 text-amber-100"}`}>Écart MeteoAI / observation : {gap > 0 ? "+" : ""}{gap.toFixed(1)}{unit}</p> : null}
  </div>;
}

function Metric({ label, value, detail, tone = "text-white" }: { label: string; value: string; detail?: string; tone?: string }) {
  return <div className="rounded-xl border border-slate-800 bg-[#080c13] px-3 py-2.5"><p className="text-[9px] font-medium uppercase tracking-[0.1em] text-slate-500">{label}</p><p className={`mt-1 text-base font-semibold ${tone}`}>{value}</p>{detail ? <p className="mt-0.5 text-[10px] text-slate-500">{detail}</p> : null}</div>;
}

function collectionStatusLabel(status: string | null | undefined) {
  if (status === "completed") return "Collecte complète";
  if (status === "partial") return "Collecte partielle";
  if (status === "failed") return "Collecte échouée";
  return "Statut ancien non archivé";
}

function hourlyTraceStatusLabel(status: string | null | undefined) {
  if (status === "stored") return "Snapshot stocké";
  if (status === "no_station") return "Aucune station qualifiée";
  if (status === "failed") return "Échec après relance";
  return "Statut inconnu";
}

function hourlyTraceTone(status: string | null | undefined) {
  if (status === "stored") return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
  if (status === "failed") return "border-rose-300/20 bg-rose-300/10 text-rose-100";
  return "border-amber-300/20 bg-amber-300/10 text-amber-100";
}

function HistogramLegend({ modelLabel }: { modelLabel: string }) {
  const items = [
    { label: "Observation", detail: "mesure réelle", color: "#34d399" },
    { label: "MeteoAI", detail: "synthèse", color: "#38bdf8" },
    { label: modelLabel, detail: "modèle comparé", color: modelColor(modelLabel) },
  ];
  return <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950/35 p-2.5"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Clé de lecture des barres</p><div className="grid grid-cols-3 gap-1.5">{items.map((item) => <div key={item.label} className="min-w-0 rounded-lg bg-slate-900/60 px-2 py-1.5"><span className="mb-1 block h-1.5 w-full rounded-full" style={{ backgroundColor: item.color }} /><p className="truncate text-[10px] font-semibold text-slate-100">{item.label}</p><p className="truncate text-[9px] text-slate-500">{item.detail}</p></div>)}</div></div>;
}

function CompactTemperatureHistogram({ data, observedKey, forecastKey, modelKey, observedLabel, forecastLabel, modelLabel, unit, height = 230 }: { data: any[]; observedKey: string; forecastKey: string; modelKey: string; observedLabel: string; forecastLabel: string; modelLabel: string; unit: string; height?: number }) {
  const modelBarColor = modelColor(modelLabel);
  return <><HistogramLegend modelLabel={modelLabel} /><div style={{ height }}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barGap={3} barCategoryGap="16%"><defs><linearGradient id="history-observation-bar" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6ee7b7" /><stop offset="100%" stopColor="#10b981" /></linearGradient><linearGradient id="history-meteoai-bar" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#7dd3fc" /><stop offset="100%" stopColor="#0284c7" /></linearGradient><linearGradient id="history-model-bar" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={modelBarColor} /><stop offset="100%" stopColor={modelBarColor} stopOpacity="0.62" /></linearGradient></defs><CartesianGrid vertical={false} stroke="#1e293b" strokeDasharray="3 4" /><XAxis dataKey="date" tickFormatter={shortDate} minTickGap={28} tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis width={38} domain={["dataMin - 2", "dataMax + 2"]} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(value) => `${value}${unit}`} axisLine={false} tickLine={false} /><Tooltip content={<HistoryChartTooltip unit={unit} />} cursor={{ fill: "rgba(125,211,252,0.08)" }} /><Bar dataKey={observedKey} name={observedLabel} fill="url(#history-observation-bar)" maxBarSize={20} radius={[5, 5, 1, 1]} activeBar={{ fill: "#6ee7b7" }} /><Bar dataKey={forecastKey} name={forecastLabel} fill="url(#history-meteoai-bar)" maxBarSize={20} radius={[5, 5, 1, 1]} activeBar={{ fill: "#7dd3fc" }} /><Bar dataKey={modelKey} name={modelLabel} fill="url(#history-model-bar)" maxBarSize={20} radius={[5, 5, 1, 1]} activeBar={{ fill: modelBarColor }} /></BarChart></ResponsiveContainer></div></>;
}

function DailyComparison({ rows, selectedModel }: { rows: any[]; selectedModel: string }) {
  const [showAllDays, setShowAllDays] = useState(false);
  const orderedRows = [...rows].reverse();
  const visibleRows = showAllDays ? orderedRows : orderedRows.slice(0, 5);
  const remainingDays = Math.max(0, orderedRows.length - visibleRows.length);
  return <div className="space-y-2">{visibleRows.map((row) => {
    const modelMax = row[`${selectedModel}_max`];
    const meteoAIErr = row.obsMax != null && row.meteoAIMax != null ? Number(row.meteoAIMax) - Number(row.obsMax) : null;
    const modelErr = row.obsMax != null && modelMax != null ? Number(modelMax) - Number(row.obsMax) : null;
    const observed = row.obsMax != null;
    const correction = meteoAIErr == null ? null : `${meteoAIErr > 0 ? "+" : ""}${meteoAIErr.toFixed(1)}°C ${meteoAIErr > 0 ? "plus chaud" : meteoAIErr < 0 ? "plus frais" : "identique"}`;
    return <article key={row.date} className="rounded-2xl border border-slate-800 bg-[#080c13] p-3.5"><div className="flex items-start justify-between gap-3"><div><p className="text-base font-semibold text-white">{shortDate(row.date)}</p><p className="mt-0.5 text-[10px] text-slate-500">Bilan de la température maximale</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${observed ? `${errorTone(meteoAIErr == null ? null : Math.abs(meteoAIErr))} border-current/20 bg-current/5` : "border-slate-700 bg-slate-900/70 text-slate-400"}`}>{getMeteoAIComparisonLabel(row.obsMax == null ? null : Number(row.obsMax), row.meteoAIMax == null ? null : Number(row.meteoAIMax))}</span></div><div className="mt-3 rounded-xl border border-slate-800/90 bg-slate-950/35 px-3 py-2"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Référence réelle</p><span className={observed ? "text-[10px] font-medium text-emerald-300" : "text-[10px] text-slate-500"}>{observed ? "Mesure archivée" : "Aucune mesure archivée"}</span></div><div className="mt-1 flex items-end justify-between"><p className={`text-2xl font-semibold ${observed ? "text-emerald-200" : "text-slate-500"}`}>{observed ? number(row.obsMax, "°C") : "—"}</p><p className="max-w-36 text-right text-[10px] leading-relaxed text-slate-500">{observed ? "Température maximale observée" : "L’écart ne peut pas être calculé"}</p></div></div><div className="mt-2 grid grid-cols-2 gap-2"><div className="rounded-xl border border-sky-400/15 bg-sky-400/5 px-3 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-sky-300/80">Prévision MeteoAI</p><p className="mt-1 text-xl font-semibold text-sky-100">{number(row.meteoAIMax, "°C")}</p><p className="mt-1 text-[10px] text-sky-200/65">{correction ?? "Comparaison en attente"}</p></div><div className="rounded-xl border border-violet-400/15 bg-violet-400/5 px-3 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-violet-300/80">Prévision {selectedModel}</p><p className="mt-1 text-xl font-semibold text-violet-100">{number(modelMax, "°C")}</p><p className="mt-1 text-[10px] text-violet-200/65">{modelErr == null ? "Comparaison en attente" : `${modelErr > 0 ? "+" : ""}${modelErr.toFixed(1)}°C vs observation`}</p></div></div><div className="mt-2 grid grid-cols-2 divide-x divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/20 text-[11px]"><div className="px-3 py-2"><p className="text-[9px] uppercase tracking-[0.09em] text-slate-500">Minimum observé</p><p className="mt-1 font-medium text-slate-200">{row.obsMin != null ? number(row.obsMin, "°C") : "Non disponible"}</p></div><div className="px-3 py-2"><p className="text-[9px] uppercase tracking-[0.09em] text-slate-500">Pluie observée</p><p className="mt-1 font-medium text-blue-200">{row.obsPrecip != null ? number(row.obsPrecip, " mm") : "Non disponible"}</p></div></div></article>;
  })}{orderedRows.length > 5 ? <button type="button" onClick={() => setShowAllDays((open) => !open)} aria-expanded={showAllDays} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-sky-400/25 bg-sky-400/8 px-3 text-xs font-semibold text-sky-100"><span>{showAllDays ? "Réduire les dates" : `Afficher les ${remainingDays} date${remainingDays > 1 ? "s" : ""} précédente${remainingDays > 1 ? "s" : ""}`}</span><span aria-hidden="true">{showAllDays ? "⌃" : "⌄"}</span></button> : null}</div>;
}

function EveningEvidence({ rows }: { rows: any[] }) {
  const [isEveningEvidenceOpen, setIsEveningEvidenceOpen] = useState(false);
  const [showAllEvenings, setShowAllEvenings] = useState(false);
  const [expandedStationDates, setExpandedStationDates] = useState<Set<string>>(() => new Set());
  if (rows.length === 0) return <MeteoSurface tone="inset" className="rounded-2xl p-4"><SectionTitle icon={Clock} title="Preuves collectées chaque soir" detail="Aucun snapshot physique n’est encore archivé sur la période sélectionnée." /><p className="text-[11px] leading-relaxed text-slate-400">La page n’affiche pas de couverture, de station ou de motif d’exclusion lorsqu’aucune trace n’existe.</p></MeteoSurface>;
  const visibleRows = showAllEvenings ? rows : rows.slice(0, 7);
  const hiddenCount = Math.max(0, rows.length - visibleRows.length);
  const toggleStations = (date: string) => setExpandedStationDates((current) => {
    const next = new Set(current);
    if (next.has(date)) next.delete(date); else next.add(date);
    return next;
  });

  return <MeteoSurface tone="inset" className="rounded-2xl p-4"><button type="button" onClick={() => setIsEveningEvidenceOpen((open) => !open)} aria-expanded={isEveningEvidenceOpen} aria-controls="evening-evidence-content" className="flex w-full items-start justify-between gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><SectionTitle icon={Clock} title="Preuves collectées chaque soir" detail="Couverture physique, stations contributrices et qualification réelle : aucune valeur n’est reconstituée." /><span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-sky-400/25 bg-sky-400/10 text-sky-200 transition-transform duration-200" aria-hidden="true">{isEveningEvidenceOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span></button>{isEveningEvidenceOpen && <div id="evening-evidence-content" className="animate-in fade-in-0 slide-in-from-top-1 duration-200"><div className="space-y-2">{visibleRows.map((row) => {
    const qualified = Boolean(row.isQualified);
	    const stations = Array.isArray(row.stations) ? row.stations : [];
	    const traces = Array.isArray(row.collectionTraces) ? row.collectionTraces : [];
	    const showAllStations = expandedStationDates.has(row.date);
	    const visibleStations = showAllStations ? stations : stations.slice(0, 6);
	    return <article key={row.date} className={`rounded-xl border p-3 ${qualified ? "border-emerald-400/20 bg-emerald-400/[0.045]" : "border-amber-400/20 bg-amber-400/[0.045]"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">{shortDate(row.date)}</p><p className="mt-0.5 text-[10px] text-slate-400">Bilan de qualification nocturne</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${qualified ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : "border-amber-300/25 bg-amber-300/10 text-amber-100"}`}>{qualified ? "Soirée qualifiée" : "Score non mis à jour"}</span></div><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Couverture réelle" value={`${row.coverageHours}/${row.requiredCoverageHours} h`} detail={`${row.snapshotHours} snapshot${row.snapshotHours > 1 ? "s" : ""} archivé${row.snapshotHours > 1 ? "s" : ""}`} tone={qualified ? "text-emerald-200" : "text-amber-100"} /><Metric label="Stations utilisées" value={String(stations.length)} detail={stations.length ? "Contributrices distinctes" : "Aucune station archivée"} tone={stations.length ? "text-sky-100" : "text-slate-400"} /></div><div className={`mt-2 rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed ${qualified ? "border-emerald-300/15 bg-black/10 text-emerald-100" : "border-amber-300/15 bg-black/10 text-amber-100"}`}><span className="font-semibold">{qualified ? "Qualification · " : "Motif d’exclusion · "}</span>{row.exclusionReason}</div><div className="mt-2 rounded-lg border border-slate-700/75 bg-black/15 p-2.5"><div className="flex items-center justify-between gap-2"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">Statut de collecte horaire</p><span className="text-[9px] text-slate-500">{collectionStatusLabel(row.collectionStatus)}</span></div>{traces.length > 0 ? <div className="mt-2 space-y-1.5">{traces.slice(0, 4).map((trace: any) => <div key={`${trace.locationKey}-${trace.date}-${trace.hour}`} className={`rounded-lg border px-2 py-1.5 text-[10px] ${hourlyTraceTone(trace.status)}`}><div className="flex items-center justify-between gap-2"><span className="font-semibold">{String(trace.hour).padStart(2, "0")} h · {hourlyTraceStatusLabel(trace.status)}</span><span>{trace.attempts} tentative{trace.attempts > 1 ? "s" : ""}</span></div><p className="mt-0.5 text-[9px] opacity-80">{trace.locationName ?? trace.locationKey} · {trace.stationCount} station{trace.stationCount > 1 ? "s" : ""}{trace.reason ? ` · ${trace.reason}` : ""}</p></div>)}</div> : <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Le détail par lieu, heure, tentative et motif sera disponible pour les collectes futures. Les journées plus anciennes n’archivaient pas encore ce niveau de détail.</p>}</div>{stations.length > 0 ? <div className="mt-2 rounded-lg border border-slate-700/75 bg-black/15 p-2.5"><div className="flex items-center justify-between gap-2"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">Stations contributrices</p><span className="text-[9px] text-slate-500">{stations.length} distincte{stations.length > 1 ? "s" : ""}</span></div><div className="mt-2 space-y-1.5">{visibleStations.map((station: any) => <div key={station.stationId} className="flex items-center justify-between gap-3 text-[10px]"><span className="min-w-0 truncate font-medium text-slate-200">{station.name}</span><span className="shrink-0 text-slate-400">{station.distanceKm == null ? "Distance indisponible" : `${Number(station.distanceKm).toFixed(1)} km`}</span></div>)}</div>{stations.length > 6 ? <button type="button" onClick={() => toggleStations(row.date)} aria-expanded={showAllStations} className="mt-2 min-h-8 text-[10px] font-semibold text-sky-200 underline underline-offset-2">{showAllStations ? "Réduire les stations" : `Afficher les ${stations.length - 6} autre${stations.length - 6 > 1 ? "s" : ""} station${stations.length - 6 > 1 ? "s" : ""}`}</button> : null}</div> : null}</article>;
	  })}</div>{rows.length > 7 ? <button type="button" onClick={() => setShowAllEvenings((open) => !open)} aria-expanded={showAllEvenings} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-sky-400/25 bg-sky-400/8 px-3 text-xs font-semibold text-sky-100">{showAllEvenings ? "Réduire les soirées" : `Afficher les ${hiddenCount} soirée${hiddenCount > 1 ? "s" : ""} précédente${hiddenCount > 1 ? "s" : ""}`}</button> : null}</div>}</MeteoSurface>;
}

export default function History() {
  const [days, setDays] = useState(14);
  const [activeTab, setActiveTab] = useState<HistoryTab>("temperature");
  const { activeLocation } = useLocation();
  const { style: pageSkyStyle } = usePageWeatherSky();
  const { data, isLoading } = trpc.weather.getHistory.useQuery(activeLocation ? { days, lat: activeLocation.lat, lon: activeLocation.lon } : { days });

  const chartData = useMemo(() => {
    if (!data) return [];
    const dateMap = new Map<string, any>();
    const ensure = (date: string) => { if (!dateMap.has(date)) dateMap.set(date, { date }); return dateMap.get(date)!; };
    data.observations.forEach((obs: any) => Object.assign(ensure(obs.date), { obsMax: obs.tempMax, obsMin: obs.tempMin, obsPrecip: obs.precipitation, obsWind: obs.windSpeed, obsGust: obs.windGust }));
    data.meteoAIForecasts.forEach((forecast: any) => Object.assign(ensure(forecast.date), { meteoAIMax: forecast.tempMax, meteoAIMin: forecast.tempMin, meteoAIPrecip: forecast.precipitation }));
    data.forecasts.forEach((forecast: any) => Object.assign(ensure(forecast.date), { [`${forecast.serviceName}_max`]: forecast.tempMax, [`${forecast.serviceName}_min`]: forecast.tempMin, [`${forecast.serviceName}_precip`]: forecast.precipitation, [`${forecast.serviceName}_wind`]: forecast.windSpeed }));
    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const modelNames = useMemo(() => data ? Array.from(new Set(data.forecasts.map((forecast: any) => forecast.serviceName))).sort() : [], [data]);
  const [selectedModel, setSelectedModel] = useState<string>("MeteoAI");
  const comparisonModel = modelNames.includes(selectedModel) ? selectedModel : modelNames[0] ?? "MeteoAI";
  const comparisonModelKey = comparisonModel === "MeteoAI" ? "meteoAIMax" : `${comparisonModel}_max`;



  if (isLoading) return <div className="weather-page-sky min-h-screen bg-background px-3 pb-24 pt-3" style={pageSkyStyle}><div className="mx-auto max-w-2xl animate-pulse space-y-4"><div className="h-9 w-48 rounded-xl bg-muted" /><div className="h-40 rounded-2xl bg-muted" /><div className="h-56 rounded-2xl bg-muted" /></div></div>;

  const tabItems: Array<{ id: HistoryTab; label: string; icon: typeof Thermometer }> = [
    { id: "temperature", label: "Température", icon: Thermometer }, { id: "precip", label: "Pluie", icon: CloudRain }, { id: "wind", label: "Vent", icon: Wind },
  ];
  const selectedModelMinKey = comparisonModel === "MeteoAI" ? "meteoAIMin" : `${comparisonModel}_min`;
  const selectedModelPrecipKey = comparisonModel === "MeteoAI" ? "meteoAIPrecip" : `${comparisonModel}_precip`;
  const selectedModelWindKey = `${comparisonModel}_wind`;
  const latest = chartData[chartData.length - 1];
  const latestError = latest?.obsMax != null && latest?.meteoAIMax != null ? Math.abs(latest.obsMax - latest.meteoAIMax) : null;

  return <div className="weather-page weather-page-sky min-h-screen" style={pageSkyStyle}><main className="mx-auto max-w-2xl space-y-4 px-3 pb-28 pt-3 sm:space-y-5 sm:px-5 sm:py-8">
    <header className="weather-surface-hero rounded-2xl p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sky-400/25 bg-sky-400/10"><Calendar className="h-4 w-4 text-sky-300" /></span><div><h1 className="text-xl font-bold tracking-tight text-white">Historique météo</h1><p className="text-[11px] text-slate-400">Prévisions confrontées aux observations archivées</p></div></div>{activeLocation ? <p className="mt-3 flex items-center gap-1.5 text-[11px] text-sky-300"><MapPin className="h-3.5 w-3.5" />{activeLocation.name}</p> : null}</div><div className="shrink-0 text-right"><p className="text-[10px] uppercase tracking-wider text-slate-500">Période</p><p className="text-lg font-semibold text-white">{days} j</p></div></div><div className="mt-4 flex gap-2">{[7, 14, 30].map((period) => <button key={period} onClick={() => setDays(period)} className={`min-h-9 flex-1 rounded-xl border text-xs font-semibold ${days === period ? "border-sky-400/45 bg-sky-400/15 text-sky-100" : "border-slate-700/70 bg-slate-950/25 text-slate-400"}`}>{period} jours</button>)}</div>{chartData.length > 0 ? <div className="mt-3 grid grid-cols-3 gap-2"><Metric label="Jours archivés" value={String(chartData.length)} /><Metric label="Obs. disponibles" value={String(data?.observations.length ?? 0)} tone="text-emerald-200" /><Metric label="Dernier écart" value={latestError == null ? "—" : `${latestError.toFixed(1)}°C`} tone={errorTone(latestError)} /></div> : null}</header>

    <EveningEvidence rows={data?.eveningEvidence ?? []} />

    <nav className="weather-surface-inset -mx-1 flex gap-1 overflow-x-auto rounded-2xl p-1.5 scrollbar-hide" aria-label="Type de comparaison historique">{tabItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setActiveTab(id)} className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold ${activeTab === id ? "bg-sky-400/15 text-sky-100 ring-1 ring-sky-400/25" : "text-slate-400"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</nav>

    {modelNames.length > 0 && ["temperature", "precip", "wind"].includes(activeTab) ? <section className="weather-surface-inset rounded-2xl p-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Modèle comparé</p><div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"><button onClick={() => setSelectedModel("MeteoAI")} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${comparisonModel === "MeteoAI" ? "border-sky-400/40 bg-sky-400/15 text-sky-100" : "border-slate-700 text-slate-400"}`}>MeteoAI</button>{modelNames.map((name) => <button key={name} onClick={() => setSelectedModel(name)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${comparisonModel === name ? "border-violet-400/40 bg-violet-400/15 text-violet-100" : "border-slate-700 text-slate-400"}`}>{name}</button>)}</div></section> : null}

    {chartData.length === 0 ? <EmptyState title="Historique en cours de constitution" detail="Les comparaisons apparaîtront dès que des observations et des prévisions archivées couvriront cette période." /> : <>
      {activeTab === "temperature" ? <section className="space-y-4"><MeteoSurface tone="lab" className="rounded-2xl p-4"><SectionTitle icon={Thermometer} title="Températures maximales" detail={`Histogramme comparatif : observation, MeteoAI et ${comparisonModel}.`} /><CompactTemperatureHistogram data={chartData} observedKey="obsMax" forecastKey="meteoAIMax" modelKey={comparisonModelKey} observedLabel="Observation" forecastLabel="MeteoAI" modelLabel={comparisonModel} unit="°C" /></MeteoSurface><MeteoSurface tone="lab" className="rounded-2xl p-4"><SectionTitle icon={Thermometer} title="Températures minimales" detail="Histogramme comparatif sans superposer toute la flotte de modèles." /><CompactTemperatureHistogram data={chartData} observedKey="obsMin" forecastKey="meteoAIMin" modelKey={selectedModelMinKey} observedLabel="Observation" forecastLabel="MeteoAI" modelLabel={comparisonModel} unit="°C" height={205} /></MeteoSurface><MeteoSurface tone="inset" className="rounded-2xl p-4"><SectionTitle icon={Calendar} title="Lecture jour par jour" detail="Chaque date expose les valeurs brutes, sans dépendre d’un survol de graphique." /><DailyComparison rows={chartData} selectedModel={comparisonModel} /></MeteoSurface></section> : null}

      {activeTab === "precip" ? <MeteoSurface tone="lab" className="rounded-2xl p-4"><SectionTitle icon={CloudRain} title="Précipitations quotidiennes" detail={`Barres limitées à l’observation, MeteoAI et ${comparisonModel} pour conserver une comparaison lisible.`} /><Legend entries={[{ label: "Observation", color: "#34d399" }, { label: "MeteoAI", color: "#38bdf8" }, { label: comparisonModel, color: modelColor(comparisonModel) }]} /><div className="h-60"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 4, right: 2, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="#1e293b" strokeDasharray="3 4" /><XAxis dataKey="date" tickFormatter={shortDate} minTickGap={28} tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(value) => `${value} mm`} width={42} axisLine={false} tickLine={false} /><Tooltip content={<HistoryChartTooltip unit=" mm" />} cursor={{ fill: "rgba(125,211,252,0.08)" }} /><Bar dataKey="obsPrecip" name="Observation" fill="#34d399" radius={[4, 4, 0, 0]} activeBar={{ fill: "#6ee7b7" }} /><Bar dataKey="meteoAIPrecip" name="MeteoAI" fill="#38bdf8" radius={[4, 4, 0, 0]} activeBar={{ fill: "#7dd3fc" }} /><Bar dataKey={selectedModelPrecipKey} name={comparisonModel} fill={modelColor(comparisonModel)} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="mt-4 space-y-2">{[...chartData].reverse().map((row) => <div key={row.date} className="grid grid-cols-[1.1fr_1fr_1fr_1fr] items-center gap-2 rounded-xl border border-slate-800 bg-[#080c13] px-3 py-2 text-[11px]"><span className="font-medium text-slate-200">{shortDate(row.date)}</span><span className="text-emerald-200">Obs. {number(row.obsPrecip, " mm")}</span><span className="text-sky-200">IA {number(row.meteoAIPrecip, " mm")}</span><span className="text-violet-200">{number(row[selectedModelPrecipKey], " mm")}</span></div>)}</div></MeteoSurface> : null}

      {activeTab === "wind" ? <MeteoSurface tone="lab" className="rounded-2xl p-4"><SectionTitle icon={Wind} title="Vent et rafales" detail={`La courbe compare l’observation au modèle ${comparisonModel}, avec les rafales observées distinctes.`} /><Legend entries={[{ label: "Vent observé", color: "#34d399", dashed: true }, { label: "Rafales obs.", color: "#fb923c", dashed: true }, { label: comparisonModel, color: modelColor(comparisonModel) }]} /><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}><CartesianGrid vertical={false} stroke="#1e293b" strokeDasharray="3 4" /><XAxis dataKey="date" tickFormatter={shortDate} minTickGap={28} tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis width={42} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(value) => `${value}`} axisLine={false} tickLine={false} /><Tooltip content={<HistoryChartTooltip unit=" km/h" />} cursor={{ stroke: "#7dd3fc", strokeWidth: 1, strokeDasharray: "3 3" }} /><Line type="monotone" dataKey="obsWind" name="Vent observé" stroke="#34d399" strokeWidth={2.5} strokeDasharray="5 4" dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls /><Line type="monotone" dataKey="obsGust" name="Rafales obs." stroke="#fb923c" strokeWidth={2} strokeDasharray="3 3" dot={false} activeDot={{ r: 4 }} connectNulls /><Line type="monotone" dataKey={selectedModelWindKey} name={comparisonModel} stroke={modelColor(comparisonModel)} strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} connectNulls /></LineChart></ResponsiveContainer></div></MeteoSurface> : null}


    </>}
  </main><BackToTopButton /></div>;
}
