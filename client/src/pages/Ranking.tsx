import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useState } from "react";
import { MeteoIcon } from "@/components/MeteoIcon";
import { StationMap } from "@/components/StationMap";
import { trpc } from "@/lib/trpc";
import { useLocation } from "@/contexts/LocationContext";
import { usePageWeatherSky } from "@/hooks/usePageWeatherSky";
import { filterAndSortStationSources, type SourceDistanceOrder, type SourceKindFilter, type SourceStatusFilter } from "@/lib/stationSourceFilters";
import { getStationDisplayStatus } from "@/lib/stationCandidateStatus";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SourceDetailsDialog } from "@/pages/SourceDetailsDialog";
import { BackToTopButton } from "@/components/BackToTopButton";
import { MeteoSurface } from "@/components/weather/MeteoSurface";
import { WeatherStatusBadge, type WeatherStatusBadgeTone } from "@/components/weather/WeatherStatusBadge";
import { Clock3 } from "lucide-react";

type ComparisonPoint = {
  hour?: number;
  label?: string;
  stationTemperature: number | null;
  stationSampleCount: number;
  officialTemperature: number | null;
};

type SourceSelection = { kind: "station" | "model"; source: any };

type GroundTruthContribution = {
  stationId: string;
  name: string;
  source: string;
  distanceKm: number;
  weight: number;
  distanceWeight: number;
  qualityWeight: number;
  freshnessWeight: number;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  windSpeed: number | null;
  precipitation: number | null;
};

type GroundTruthExclusion = {
  stationId: string;
  name: string;
  source: string;
  distanceKm: number;
  reason: string;
};

function formatAge(minutes: number | null) {
  if (minutes === null) return "Aucun relevé";
  if (minutes < 2) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `Il y a ${hours} h ${rest}` : `Il y a ${hours} h`;
}

function value(value: number | null | undefined, unit = "") {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)}${unit}`;
}

function asStoredArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function TemperatureComparison({ points, periodDays }: { points: ComparisonPoint[]; periodDays: 1 | 7 }) {
  const usable = points.filter((point) => point.stationTemperature !== null || point.officialTemperature !== null);
  if (usable.length === 0) {
    return (
      <MeteoSurface className="rounded-xl border-dashed border-slate-800 bg-transparent px-4 py-8 text-center text-sm text-slate-500">
        La comparaison apparaîtra après les premiers relevés physiques collectés à 05h00.
      </MeteoSurface>
    );
  }

  const values = usable.flatMap((point) => [point.stationTemperature, point.officialTemperature]).filter((item): item is number => item !== null);
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  const width = 560;
  const height = 168;
  const padding = 14;
  const toPoint = (series: "stationTemperature" | "officialTemperature") => usable
    .map((point, index) => {
      const valueAtPoint = point[series];
      if (valueAtPoint === null) return null;
      const x = padding + (index * (width - padding * 2)) / Math.max(usable.length - 1, 1);
      const y = padding + (1 - (valueAtPoint - min) / Math.max(max - min, 1)) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter((item): item is string => item !== null)
    .join(" ");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Stations physiques</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-blue-400" /> Prévision officielle</span>
      </div>
      <div className="h-[168px] rounded-xl border border-slate-800 bg-[#090b10] px-2 py-1">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Comparaison température station et prévision officielle sur 24 heures">
          {[0.25, 0.5, 0.75].map((ratio) => <line key={ratio} x1="0" x2={width} y1={height * ratio} y2={height * ratio} stroke="#1e293b" strokeWidth="1" />)}
          <polyline points={toPoint("officialTemperature")} fill="none" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={toPoint("stationTemperature")} fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          {usable.map((point, index) => {
            const x = padding + (index * (width - padding * 2)) / Math.max(usable.length - 1, 1);
            const label = point.label ?? `${String(point.hour ?? 0).padStart(2, "0")}h`;
            return <text key={`${label}-${index}`} x={x} y={height - 3} fill="#64748b" fontSize="10" textAnchor="middle">{label}</text>;
          })}
        </svg>
      </div>
      <p className="text-[11px] text-slate-500">{periodDays === 1 ? "Les points sont comparés heure par heure lorsqu’un relevé station physique est disponible." : "Les mesures sont regroupées par jour à partir des relevés physiques disponibles."}</p>
    </div>
  );
}

export default function Ranking() {
  const { activeLocation, setActiveLocation } = useLocation();
  const { style: pageSkyStyle } = usePageWeatherSky();
  const [periodDays, setPeriodDays] = useState<1 | 7>(1);
  const [radiusKm, setRadiusKm] = useState(activeLocation?.radiusKm ?? 20);
  const [selectedSource, setSelectedSource] = useState<SourceSelection | null>(null);
  const [isGroundTruthDialogOpen, setIsGroundTruthDialogOpen] = useState(false);
  const coords = activeLocation ? { lat: activeLocation.lat, lon: activeLocation.lon } : undefined;
  const utils = trpc.useUtils();
  const overviewInput = useMemo(() => ({ ...(coords ?? {}), periodDays, radiusKm }), [coords?.lat, coords?.lon, periodDays, radiusKm]);
  const { data, isLoading } = trpc.weather.getStationReliabilityOverview.useQuery(overviewInput);
  const { data: liveStationData, isLoading: liveStationsLoading } = trpc.weather.searchStations.useQuery(
    { ...(coords ?? { lat: 50.7567, lon: 2.5204 }), radiusKm },
    { staleTime: 5 * 60 * 1000 },
  );
  const { data: rankingCriteria } = trpc.weather.getStationRankingCriteria.useQuery();
  const { data: evidenceStatus } = trpc.weather.getEvidenceStatus.useQuery(
    coords ?? { lat: 50.7567, lon: 2.5204 },
    { staleTime: 2 * 60 * 1000 },
  );
  const updateFavorite = trpc.favorites.update.useMutation({
    onSuccess: () => {
      utils.weather.getStationReliabilityOverview.invalidate();
      utils.favorites.list.invalidate();
    },
  });

  useEffect(() => {
    setRadiusKm(activeLocation?.radiusKm ?? 20);
  }, [activeLocation?.favoriteId, activeLocation?.lat, activeLocation?.lon, activeLocation?.radiusKm]);

  const changeRadius = (nextRadius: number) => {
    setRadiusKm(nextRadius);
    if (activeLocation?.favoriteId) {
      updateFavorite.mutate({ id: activeLocation.favoriteId, radiusKm: nextRadius });
      setActiveLocation({ ...activeLocation, radiusKm: nextRadius });
    }
  };

  if (isLoading) {
    return <div className="weather-page-sky mx-auto min-h-screen max-w-2xl space-y-4 bg-[#080a0f] px-3 pb-24 pt-3 sm:px-5 sm:pt-5" style={pageSkyStyle}><Skeleton className="h-7 w-48 bg-slate-800" /><Skeleton className="h-32 w-full bg-slate-800" /><Skeleton className="h-56 w-full bg-slate-800" /></div>;
  }

  const stations = data?.stations ?? [];
  const comparison = periodDays === 1 ? (data?.comparison24h ?? []) : (data?.comparison7d ?? []);
  const latest = data?.latestGroundTruth;
  const latestCollection = data?.latestCollection;
  const availabilityHistory = (data?.availabilityHistory ?? []) as any[];
  const locationName = activeLocation?.name ?? "Hondeghem";
  const instantDeltaC = data?.instantDeltaC ?? null;
  const currentSources = liveStationData?.stations ?? [];
  const modelReferences = liveStationData?.modelReferences ?? [];
  const realLocalStations = currentSources.filter((station) => station.isActive && station.sourceKind === "physical");
  const candidateSources = currentSources.filter((station) => station.qualificationStatus === "candidate");
  const ignoredSources = currentSources.filter((station) => !station.isActive && station.qualificationStatus !== "candidate");

  return (
    <main className="weather-page-sky min-h-screen bg-[#080a0f] pb-28" style={pageSkyStyle}>
      <div className="mx-auto max-w-2xl px-3 pt-2 sm:px-5 sm:pt-4">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-blue-400"><MeteoIcon name="location" size={19} /><span className="text-sm font-semibold">{locationName}</span></div>
            <h1 className="mt-2 text-xl font-bold text-white">Stations & fiabilité locale</h1>
            <p className="mt-1 text-xs text-slate-500">Relevés physiques et comparaison avec la prévision officielle.</p>
          </div>
          <WeatherStatusBadge className="w-[142px]" label="Collecte" value="05h00 Paris" tone="info" icon={<Clock3 className="h-4 w-4" />} pulse ariaLabel="Collecte automatique planifiée à 05h00, heure de Paris" description="Les prévisions et les stations disponibles sont archivées chaque jour à 05h00, heure de Paris. Cette heure ne garantit pas qu’une source externe réponde instantanément." />
        </header>

        <section className="mb-4 rounded-2xl border border-slate-800 bg-[#10131a] p-3">
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Stations actives" value={String(stations.length)} icon="stations" color="text-emerald-400" />
            <Metric label="Confiance synthèse locale" value={latest?.confidenceScore !== null && latest?.confidenceScore !== undefined ? `${Math.round(latest.confidenceScore)}%` : "—"} icon="confidence" color="text-blue-400" />
            <Metric label="Dernière synthèse" value={latest?.computedAt ? new Date(latest.computedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"} icon="refresh" color="text-slate-300" />
          </div>
          <button type="button" disabled={!latest} onClick={() => setIsGroundTruthDialogOpen(true)} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 text-left text-xs font-semibold text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-[#090b10] disabled:text-slate-500">
            <span>Détails de calcul de la synthèse</span>
            <span className="text-[11px] font-medium text-sky-300">{latest ? `${latest.stationCount ?? 0} station${latest.stationCount === 1 ? "" : "s"} · ouvrir` : "Aucune synthèse"}</span>
          </button>
        </section>

        <section className="mb-4 rounded-2xl border border-slate-800 bg-[#10131a] p-4">
          <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Rayon de recherche</h2><p className="text-xs text-slate-500">Utilisé à la prochaine collecte de stations physiques.</p></div><MeteoIcon name="location" size={20} className="text-blue-400" /></div>
          <div className="flex flex-wrap gap-2">{[5, 10, 20, 30, 50].map((radius) => <button key={radius} type="button" disabled={updateFavorite.isPending} onClick={() => changeRadius(radius)} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${radiusKm === radius ? "border-blue-500 bg-blue-600 text-white" : "border-slate-700 bg-[#090b10] text-slate-300"}`}>{radius} km</button>)}</div>
          <p className="mt-3 text-[11px] text-slate-600">{activeLocation?.favoriteId ? "Le rayon est enregistré pour ce lieu favori." : "Le rayon est utilisé pour cette consultation ; enregistrez ce lieu pour le conserver."}</p>
        </section>

        <CollectionReport latest={latestCollection as any} history={availabilityHistory} />

        <LiveSourceSummary
          groundTruth={liveStationData?.groundTruth}
          evidenceStatus={evidenceStatus}
          realLocalStations={realLocalStations}
          modelReferences={modelReferences}
          candidateSources={candidateSources}
          ignoredCount={ignoredSources.length}
          criteria={rankingCriteria}
          isLoading={liveStationsLoading}
          onOpenDetails={(source, kind) => setSelectedSource({ source, kind })}
        />

        <FilteredStationDirectory sources={currentSources as any[]} isLoading={liveStationsLoading} onOpenDetails={(source) => setSelectedSource({ source, kind: "station" })} />

        <section className="mb-4 rounded-2xl border border-slate-800 bg-[#10131a] p-4">
          <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold text-white">Carte des stations</h2><p className="text-xs text-slate-500">Bleu : lieu de référence · vert : relevé récent · ambre : relevé ancien.</p></div><MeteoIcon name="location" size={21} className="text-blue-400" /></div>
          <StationMap center={data?.center ?? { lat: coords?.lat ?? 50.75, lon: coords?.lon ?? 2.73 }} stations={stations} />
        </section>

        <section className="mb-4 rounded-2xl border border-slate-800 bg-[#10131a] p-4">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-white">Relevés des stations</h2><p className="text-xs text-slate-500">Stations physiques validées autour du lieu.</p></div><MeteoIcon name="stations" size={22} /></div>
          {stations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">Aucune station physique n’est encore archivée pour ce lieu. La première collecte est prévue à 05h00.</div>
          ) : (
            <div className="space-y-2">
              {stations.map((station: any) => (
                <article key={station.stationId} className="rounded-xl border border-slate-800 bg-[#090b10] p-3">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-medium text-sm text-white">{station.name}</p><p className="mt-0.5 text-[11px] text-slate-500">{station.source} · {station.distanceKm.toFixed(1)} km · fiabilité {Math.round(station.reliabilityScore)}%</p></div><span className={`rounded-full px-2 py-1 text-[10px] ${station.ageMinutes !== null && station.ageMinutes <= 90 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-300"}`}>{formatAge(station.ageMinutes)}</span></div>
                  <div className="mt-3 grid grid-cols-4 gap-2 border-t border-slate-800 pt-3 text-center"><Reading label="Temp." value={value(station.latest?.temperature, "°")} /><Reading label="Vent" value={value(station.latest?.windSpeed, " km/h")} /><Reading label="Rafales" value={value(station.latest?.windGust, " km/h")} /><Reading label="Pluie" value={value(station.latest?.precipitation, " mm")} /></div>
                  <p className="mt-3 text-[11px] text-slate-600">{station.readings.length} relevé(s) conservé(s) sur les dernières 24 h.</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#10131a] p-4">
          <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Stations vs prévision officielle</h2><p className="text-xs text-slate-500">Température — heures de Paris.</p></div><div className="flex rounded-lg border border-slate-700 bg-[#090b10] p-0.5"><button type="button" onClick={() => setPeriodDays(1)} className={`rounded-md px-2.5 py-1 text-xs ${periodDays === 1 ? "bg-blue-600 text-white" : "text-slate-400"}`}>24 h</button><button type="button" onClick={() => setPeriodDays(7)} className={`rounded-md px-2.5 py-1 text-xs ${periodDays === 7 ? "bg-blue-600 text-white" : "text-slate-400"}`}>7 jours</button></div></div>
          <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-800 bg-[#090b10] px-3 py-2"><span className="text-xs text-slate-400">Écart instantané station / prévision</span><span className={`text-sm font-bold ${instantDeltaC === null ? "text-slate-400" : instantDeltaC > 0 ? "text-amber-300" : instantDeltaC < 0 ? "text-sky-300" : "text-emerald-400"}`}>{instantDeltaC === null ? "—" : `${instantDeltaC > 0 ? "+" : ""}${instantDeltaC.toFixed(1)} °C`}</span></div>
          <TemperatureComparison points={comparison} periodDays={periodDays} />
        </section>
      </div>
      <GroundTruthDetailDialog groundTruth={latest} open={isGroundTruthDialogOpen} onOpenChange={setIsGroundTruthDialogOpen} />
      <SourceDetailsDialog selection={selectedSource} groundTruth={liveStationData?.groundTruth} onOpenChange={(open) => { if (!open) setSelectedSource(null); }} />
      <BackToTopButton />
    </main>
  );
}

function GroundTruthDetailDialog({ groundTruth, open, onOpenChange }: { groundTruth: any; open: boolean; onOpenChange: (open: boolean) => void }) {
  const stationsUsed = asStoredArray<GroundTruthContribution>(groundTruth?.stationsUsed);
  const stationsIgnored = asStoredArray<GroundTruthExclusion>(groundTruth?.stationsIgnored);
  const computedAt = groundTruth?.computedAt ? new Date(groundTruth.computedAt) : null;
  const measurements = [
    ["Température", value(groundTruth?.temperature, " °C")],
    ["Humidité", value(groundTruth?.humidity, " %")],
    ["Pression", value(groundTruth?.pressure, " hPa")],
    ["Vent", value(groundTruth?.windSpeed, " km/h")],
    ["Rafales", value(groundTruth?.windGust, " km/h")],
    ["Précipitations", value(groundTruth?.precipitation, " mm")],
  ];

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100vh-2rem)] max-w-3xl overflow-y-auto border-slate-700 bg-[#10131a] p-4 text-slate-100 sm:p-6">
      <DialogHeader className="pr-7">
        <DialogTitle className="text-white">Détails du calcul de la synthèse</DialogTitle>
        <DialogDescription className="leading-relaxed text-slate-400">
          {computedAt ? `Calculée le ${computedAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })} à ${computedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.` : "Aucune heure de calcul archivée."}
        </DialogDescription>
      </DialogHeader>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Résumé de la synthèse locale">
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 px-3 py-2.5"><p className="text-lg font-bold text-sky-200">{groundTruth?.confidenceScore === null || groundTruth?.confidenceScore === undefined ? "—" : `${Math.round(groundTruth.confidenceScore)}%`}</p><p className="mt-0.5 text-[10px] text-slate-400">Confiance de synthèse</p></div>
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5"><p className="text-lg font-bold text-emerald-200">{groundTruth?.stationCount ?? stationsUsed.length}</p><p className="mt-0.5 text-[10px] text-slate-400">Stations contributrices</p></div>
        <div className="col-span-2 rounded-xl border border-slate-700 bg-[#090b10] px-3 py-2.5 sm:col-span-1"><p className="text-sm font-semibold text-slate-100">{stationsIgnored.length}</p><p className="mt-0.5 text-[10px] text-slate-400">Stations écartées</p></div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-white">Mesures agrégées</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {measurements.map(([label, measurement]) => <div key={label} className="rounded-xl border border-slate-800 bg-[#090b10] px-3 py-2.5"><p className="text-sm font-semibold text-white">{measurement}</p><p className="mt-0.5 text-[10px] text-slate-500">{label}</p></div>)}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-sm font-semibold text-white">Stations retenues</h3><p className="mt-1 text-[11px] text-slate-500">Chaque poids final est la part réelle de la station dans la synthèse enregistrée.</p></div><span className="text-[10px] text-slate-500">Facteurs normalisés : 0 à 1</span></div>
        {stationsUsed.length > 0 ? <div className="mt-2 overflow-x-auto rounded-xl border border-slate-800"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-[#090b10] text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2 font-semibold">Station</th><th className="px-3 py-2 font-semibold">Distance</th><th className="px-3 py-2 font-semibold">Poids final</th><th className="px-3 py-2 font-semibold">Distance</th><th className="px-3 py-2 font-semibold">Qualité</th><th className="px-3 py-2 font-semibold">Fraîcheur</th><th className="px-3 py-2 font-semibold">Temp.</th></tr></thead><tbody>{stationsUsed.map((station) => <tr key={station.stationId} className="border-t border-slate-800 text-slate-300"><td className="px-3 py-2.5"><p className="font-medium text-white">{station.name}</p><p className="mt-0.5 text-[10px] text-slate-500">{SOURCE_LABELS[station.source] ?? station.source}</p></td><td className="px-3 py-2.5">{Number(station.distanceKm).toFixed(1)} km</td><td className="px-3 py-2.5 font-semibold text-sky-200">{(Number(station.weight) * 100).toFixed(1)} %</td><td className="px-3 py-2.5">{Number(station.distanceWeight).toFixed(3)}</td><td className="px-3 py-2.5">{Number(station.qualityWeight).toFixed(3)}</td><td className="px-3 py-2.5">{Number(station.freshnessWeight).toFixed(3)}</td><td className="px-3 py-2.5">{value(station.temperature, " °C")}</td></tr>)}</tbody></table></div> : <div className="mt-2 rounded-xl border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-500">Aucune contribution détaillée n’a été archivée pour cette synthèse.</div>}
      </section>

      <section className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-3">
        <h3 className="text-sm font-semibold text-sky-100">Méthode de pondération</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-300">Le score brut de chaque station combine <strong className="text-sky-100">50 % de proximité</strong> (inverse de la distance), <strong className="text-sky-100">30 % de qualité historique</strong> et <strong className="text-sky-100">20 % de fraîcheur</strong> (décroissance selon l’âge du relevé). Les scores sont ensuite normalisés pour totaliser 100 %.</p>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">La confiance tient compte de l’accord des températures et du nombre de stations actives : l’écart-type thermique réduit la note, comme une couverture inférieure à cinq stations.</p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-white">Stations écartées</h3>
        {stationsIgnored.length > 0 ? <div className="mt-2 space-y-2">{stationsIgnored.map((station) => <div key={station.stationId} className="rounded-xl border border-slate-800 bg-[#090b10] px-3 py-2.5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-slate-200">{station.name}</p><p className="mt-0.5 text-[10px] text-slate-500">{SOURCE_LABELS[station.source] ?? station.source} · {Number(station.distanceKm).toFixed(1)} km</p></div><p className="max-w-[55%] text-right text-[11px] leading-relaxed text-slate-400">{station.reason}</p></div></div>)}</div> : <p className="mt-2 text-xs text-slate-500">Aucune station écartée n’a été archivée pour ce calcul.</p>}
      </section>
    </DialogContent>
  </Dialog>;
}

const SOURCE_LABELS: Record<string, string> = {
  meteofrance: "Météo-France",
  metar: "METAR officiel",
  synop: "SYNOP/WMO",
  noaa: "NOAA",
  openmeteo: "Open-Meteo",
  opensensemap: "openSenseMap · capteur citoyen",
  netatmo: "STATION NETATMO",
  wunderground: "Grille régionale · GFS",
  cwop: "Grille régionale · ECMWF",
  davis: "Référence de grille",
  infoclimat: "Grille locale · AROME",
};

function StationSourceCard({ station, rank, physical, onOpenDetails }: { station: any; rank: number; physical: boolean; onOpenDetails: (source: any) => void }) {
  const temperature = station.temperature === null || station.temperature === undefined ? "—" : `${Number(station.temperature).toFixed(1)}°`;
  const displayStatus = getStationDisplayStatus(station);
  const isAuthenticatedNetatmo = displayStatus === "physical" && station.source === "netatmo" && String(station.stationId ?? "").startsWith("netatmo-");
  const sourceTone: WeatherStatusBadgeTone = displayStatus === "physical" ? "success" : displayStatus === "candidate" ? "warning" : "info";
  const statusTone: WeatherStatusBadgeTone = displayStatus === "physical" ? "success" : displayStatus === "candidate" ? "warning" : displayStatus === "reference" ? "info" : "danger";
  const statusLabel = isAuthenticatedNetatmo ? "NIVEAU 1 · AUTHENTIFIÉE" : displayStatus === "physical" ? "STATION RÉELLE" : displayStatus === "candidate" ? "CAPTEUR EN VALIDATION" : displayStatus === "reference" ? "RÉFÉRENCE / GRILLE" : "SOURCE ÉCARTÉE";
  const markerClass = displayStatus === "physical" ? "bg-emerald-400" : displayStatus === "candidate" ? "bg-amber-300" : displayStatus === "reference" ? "bg-sky-400" : "bg-rose-400";
  const inactiveClass = displayStatus === "excluded" ? "border-rose-500/25 bg-rose-500/5 opacity-80" : "border-slate-800 bg-[#090b10]";
  const description = displayStatus === "candidate" ? "Capteur citoyen observé : il est archivé, mais n’influence pas encore la température locale." : isAuthenticatedNetatmo ? "Observation issue de l’API Netatmo autorisée ; identifiant de station vérifiable et provenance physique." : station.exclusionReason ? `Écartée : ${station.exclusionReason}` : null;
  const quality = station.qualityProfile;
  const qualityLabel = quality?.status === "fiable" ? "PROFIL FIABLE" : quality?.status === "qualifiee" ? "PROFIL QUALIFIÉ" : quality?.status === "degradee" ? "PROFIL DÉGRADÉ" : quality?.status === "en_observation" ? "PROFIL EN OBSERVATION" : null;
  const qualityTone: WeatherStatusBadgeTone = quality?.status === "fiable" ? "success" : quality?.status === "qualifiee" ? "info" : quality?.status === "degradee" ? "warning" : "neutral";
  return <article className={`rounded-xl border ${inactiveClass}`}>
    <button type="button" onClick={() => onOpenDetails(station)} aria-label={`Ouvrir les données brutes et la contribution de ${station.name}`} className="flex w-full items-center gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rank <= 3 ? "bg-blue-500/15 text-blue-300" : "bg-slate-800 text-slate-400"}`}>{rank}</span>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${markerClass}`} />
      <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-1.5"><span className="truncate text-sm font-medium text-white">{station.name}</span><WeatherStatusBadge compact tone={sourceTone} label={SOURCE_LABELS[station.source] ?? station.source} /><WeatherStatusBadge compact tone={statusTone} label={statusLabel} pulse={isAuthenticatedNetatmo} />{qualityLabel ? <WeatherStatusBadge compact tone={qualityTone} label={qualityLabel} /> : null}</span><span className="mt-0.5 block text-[11px] text-slate-500">{Number(station.distanceKm).toFixed(1)} km{station.altitude !== null && station.altitude !== undefined ? ` · ${station.altitude} m` : ""}</span></span>
      <span className="text-right"><span className="block text-lg font-semibold text-white">{temperature}</span><span className="text-[10px] text-slate-500">Temp.</span></span>
      <span className="text-[10px] font-semibold text-blue-300">Détails</span>
    </button>
    <p className={`border-t border-slate-800 px-3 py-2 text-[10px] ${description ? "text-amber-200" : "text-slate-500"}`}>{description ?? `Disponibilité ${Math.round((station.dataAvailability ?? 0) * 100)}% · mise à jour estimée toutes les ${station.updateFrequencyMin ?? "—"} min.`}{quality ? ` · historique ${quality.observationCount} relevé(s), continuité ${quality.continuityScore == null ? "—" : `${Math.round(quality.continuityScore * 100)}%`}.` : ""}</p>
  </article>;
}

function ModelReferenceCard({ reference, rank, onOpenDetails }: { reference: any; rank: number; onOpenDetails: (source: any) => void }) {
  const temperature = reference.temperature === null || reference.temperature === undefined ? "—" : `${Number(reference.temperature).toFixed(1)}°`;
  const coherencePercent = reference.coherenceWeight === null || reference.coherenceWeight === undefined ? null : Math.round(Number(reference.coherenceWeight) * 100);
  const coherenceTone: WeatherStatusBadgeTone = coherencePercent === null ? "neutral" : coherencePercent >= 80 ? "success" : coherencePercent >= 55 ? "warning" : "danger";
  const deltaLabel = reference.localDeltaC === null || reference.localDeltaC === undefined ? "Aucune station locale validée" : `Écart local ${Number(reference.localDeltaC) > 0 ? "+" : ""}${Number(reference.localDeltaC).toFixed(1)} °C`;
  return <article className="rounded-xl border border-violet-500/20 bg-[#090b10]"><button type="button" onClick={() => onOpenDetails(reference)} aria-label={`Ouvrir les données brutes et la contribution de ${reference.name}`} className="w-full p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><div className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-200">{rank}</span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-1.5"><span className="truncate text-sm font-medium text-white">{reference.name}</span><WeatherStatusBadge compact tone="lab" label="Modèle" value="Non station" /></span><span className="mt-0.5 block text-[11px] text-slate-500">{deltaLabel} · consensus de {reference.localStationCount ?? 0} station{reference.localStationCount === 1 ? "" : "s"} locale{reference.localStationCount === 1 ? "" : "s"}</span></span><span className="text-right"><span className="block text-lg font-semibold text-white">{temperature}</span><span className="text-[10px] text-slate-500">Temp.</span></span></div><div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2"><span className="text-[10px] text-slate-500">Mise à jour {reference.updatedAt ? new Date(reference.updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"}</span><WeatherStatusBadge compact tone={coherenceTone} label="Cohérence" value={coherencePercent === null ? "Non mesurable" : `${coherencePercent}%`} /></div></button></article>;
}

function FilteredStationDirectory({ sources, isLoading, onOpenDetails }: { sources: any[]; isLoading: boolean; onOpenDetails: (source: any) => void }) {
  const [kind, setKind] = useState<SourceKindFilter>("all");
  const [status, setStatus] = useState<SourceStatusFilter>("active");
  const [distanceOrder, setDistanceOrder] = useState<SourceDistanceOrder>("nearest");
  const filteredSources = filterAndSortStationSources(sources, kind, status, distanceOrder);
  const Choice = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${active ? "border-blue-500 bg-blue-600 text-white" : "border-slate-700 bg-[#090b10] text-slate-300"}`}>{children}</button>;
  return <section className="mb-4 rounded-2xl border border-slate-700 bg-[#10131a] p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Explorer les sources</h2><p className="text-xs text-slate-500">Filtrez chaque source selon son type, son statut et sa distance.</p></div><WeatherStatusBadge compact tone="neutral" label="Sources" value={String(filteredSources.length)} /></div><div className="space-y-3 border-b border-slate-800 pb-3"><div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Type</p><div className="flex flex-wrap gap-1.5"><Choice active={kind === "all"} onClick={() => setKind("all")}>Toutes</Choice><Choice active={kind === "physical"} onClick={() => setKind("physical")}>Locales réelles</Choice><Choice active={kind === "reference"} onClick={() => setKind("reference")}>Références</Choice></div></div><div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Statut</p><div className="flex flex-wrap gap-1.5"><Choice active={status === "active"} onClick={() => setStatus("active")}>Actives</Choice><Choice active={status === "ignored"} onClick={() => setStatus("ignored")}>Écartées</Choice><Choice active={status === "all"} onClick={() => setStatus("all")}>Toutes</Choice></div></div><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Distance</p><div className="flex gap-1.5"><Choice active={distanceOrder === "nearest"} onClick={() => setDistanceOrder("nearest")}>Plus proches</Choice><Choice active={distanceOrder === "furthest"} onClick={() => setDistanceOrder("furthest")}>Plus éloignées</Choice></div></div></div>{isLoading ? <div className="mt-3 h-24 animate-pulse rounded-xl bg-slate-800" /> : filteredSources.length > 0 ? <div className="mt-3 space-y-2">{filteredSources.map((station, index) => <StationSourceCard key={station.stationId} station={station} rank={index + 1} physical={station.sourceKind === "physical"} onOpenDetails={onOpenDetails} />)}</div> : <div className="mt-3 rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-500">Aucune source ne correspond à ces filtres.</div>}</section>;
}

function LiveSourceSummary({ groundTruth, evidenceStatus, realLocalStations, modelReferences, candidateSources, ignoredCount, criteria, isLoading, onOpenDetails }: { groundTruth: any; evidenceStatus: any; realLocalStations: any[]; modelReferences: any[]; candidateSources: any[]; ignoredCount: number; criteria: any; isLoading: boolean; onOpenDetails: (source: any, kind: "station" | "model") => void }) {
  const netatmoCount = realLocalStations.filter((station) => station.source === "netatmo" && String(station.stationId ?? "").startsWith("netatmo-")).length;
  const [showAdditionalLocalStations, setShowAdditionalLocalStations] = useState(false);
  const [showAdditionalModelReferences, setShowAdditionalModelReferences] = useState(false);
  const values = [
    ["Température", groundTruth?.temperature === null || groundTruth?.temperature === undefined ? "—" : `${Number(groundTruth.temperature).toFixed(1)}°C`],
    ["Humidité", groundTruth?.humidity === null || groundTruth?.humidity === undefined ? "—" : `${Number(groundTruth.humidity).toFixed(0)}%`],
    ["Pression", groundTruth?.pressure === null || groundTruth?.pressure === undefined ? "—" : `${Number(groundTruth.pressure).toFixed(0)} hPa`],
    ["Vent", groundTruth?.windSpeed === null || groundTruth?.windSpeed === undefined ? "—" : `${Number(groundTruth.windSpeed).toFixed(1)} km/h`],
    ["Rafales", groundTruth?.windGust === null || groundTruth?.windGust === undefined ? "—" : `${Number(groundTruth.windGust).toFixed(1)} km/h`],
    ["Précip.", groundTruth?.precipitation === null || groundTruth?.precipitation === undefined ? "—" : `${Number(groundTruth.precipitation).toFixed(1)} mm`],
  ];
  return <section className="mb-4 space-y-4">
    <div className={`rounded-2xl border p-4 ${evidenceStatus?.isEligible ? "border-emerald-500/25 bg-emerald-500/5" : "border-amber-500/25 bg-amber-500/5"}`}><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Preuves physiques pour le scoring</h2><p className="mt-1 text-xs leading-relaxed text-slate-400">{evidenceStatus?.isEligible ? "Couverture suffisante : les comparaisons avec les modèles peuvent produire des scores qualifiés." : "Collecte en cours : aucun score ne peut influencer les poids avant une couverture physique complète."}</p></div><WeatherStatusBadge compact tone={evidenceStatus?.isEligible ? "success" : "warning"} label="Scoring" value={evidenceStatus?.isEligible ? "Qualifié" : "En collecte"} pulse={!evidenceStatus?.isEligible} description="Un score n’est qualifié que lorsque les observations physiques couvrent suffisamment le cycle. Avant ce seuil, aucun poids de modèle n’est modifié." /></div><div className="mt-3 grid grid-cols-3 gap-2"><div className="rounded-lg bg-[#090b10] px-2 py-2 text-center"><p className="text-sm font-bold text-white">{evidenceStatus?.coverageHours ?? 0}/18</p><p className="mt-0.5 text-[10px] text-slate-500">Heures physiques</p></div><div className="rounded-lg bg-[#090b10] px-2 py-2 text-center"><p className="text-sm font-bold text-white">{evidenceStatus?.qualifiedScoreCount ?? 0}</p><p className="mt-0.5 text-[10px] text-slate-500">Scores qualifiés</p></div><div className="rounded-lg bg-[#090b10] px-2 py-2 text-center"><p className="text-sm font-bold text-white">{evidenceStatus?.date ?? "—"}</p><p className="mt-0.5 text-[10px] text-slate-500">Journée Europe/Paris</p></div></div><p className="mt-3 text-[10px] leading-relaxed text-slate-500">Snapshots : {evidenceStatus?.snapshotCadence ?? "Chaque heure à :05 UTC"} · scoring : {evidenceStatus?.dailyScoringSchedule ?? "22:30 UTC, sur la journée Europe/Paris précédente"}.</p></div>
    <div className="rounded-2xl border border-sky-500/25 bg-[#10131a] p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Synthèse multi-source</h2><p className="text-xs text-slate-500">Références de modèle et observations disponibles, distinguées ci-dessous.</p></div><WeatherStatusBadge className="w-[142px]" tone="info" label="Confiance synthèse" value={`${groundTruth?.confidenceScore ?? "—"}/100`} description="Indice de 0 à 100 fondé sur l’accord des sources et le nombre d’observations actives. Il décrit la synthèse locale, pas la confiance de la prévision officielle." /></div><div className="grid grid-cols-3 gap-2">{values.map(([label, value]) => <div key={label} className="rounded-lg bg-[#090b10] px-2 py-2 text-center"><p className="text-sm font-bold text-white">{value}</p><p className="mt-0.5 text-[10px] text-slate-500">{label}</p></div>)}</div><p className="mt-3 text-[11px] text-slate-500">Cette confiance mesure l’accord et le nombre des stations actives ; elle ne remplace pas la confiance de prévision officielle.</p></div>
    <div className="grid grid-cols-4 gap-2 rounded-2xl border border-slate-800 bg-[#10131a] p-3"><Metric label="Locales réelles" value={String(realLocalStations.length)} icon="stations" color="text-emerald-400" /><Metric label="Modèles" value={String(modelReferences.length)} icon="confidence" color="text-violet-300" /><Metric label="Candidates" value={String(candidateSources.length)} icon="location" color="text-amber-300" /><Metric label="Écartées" value={String(ignoredCount)} icon="refresh" color="text-slate-300" /></div>
    <div className="rounded-2xl border border-emerald-500/20 bg-[#10131a] p-4">
      <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Stations locales réelles</h2><p className="text-xs text-slate-500">Observations physiques identifiées et compatibles avec la collecte officielle.</p></div><WeatherStatusBadge compact tone="success" label="Stations Netatmo" value={netatmoCount > 0 ? String(netatmoCount) : "Authentifiées"} pulse={netatmoCount > 0} /></div>
      {isLoading ? <div className="h-20 animate-pulse rounded-xl bg-slate-800" /> : realLocalStations.length > 0 ? <div className="space-y-2">
        <StationSourceCard station={realLocalStations[0]} rank={1} physical onOpenDetails={(source) => onOpenDetails(source, "station")} />
        {realLocalStations.length > 1 ? <>
          <button type="button" aria-expanded={showAdditionalLocalStations} onClick={() => setShowAdditionalLocalStations((open) => !open)} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 text-left text-xs font-medium text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
            <span>{showAdditionalLocalStations ? "Masquer les autres stations" : `Afficher les ${realLocalStations.length - 1} autres stations`}</span>
            <span aria-hidden="true" className={`text-lg leading-none transition-transform duration-200 ${showAdditionalLocalStations ? "rotate-180" : "rotate-0"}`}>⌄</span>
          </button>
          {showAdditionalLocalStations ? <div className="space-y-2 border-t border-emerald-500/15 pt-2">{realLocalStations.slice(1).map((station, index) => <StationSourceCard key={station.stationId} station={station} rank={index + 2} physical onOpenDetails={(source) => onOpenDetails(source, "station")} />)}</div> : null}
        </> : null}
      </div> : <div className="rounded-xl border border-dashed border-emerald-500/20 px-4 py-5 text-center text-sm text-slate-500">Aucune station physique locale n’est disponible dans le rayon actuel.</div>}
    </div>
    <div className="rounded-2xl border border-violet-500/20 bg-[#10131a] p-4">
      <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Références de modèles — non stations</h2><p className="text-xs text-slate-500">Prévisions au point du lieu, comparées aux observations physiques quand elles existent.</p></div><WeatherStatusBadge compact tone="lab" label="Références" value={String(modelReferences.length)} /></div>
      <p className="mb-3 rounded-xl border border-violet-500/15 bg-violet-500/5 px-3 py-2 text-[11px] leading-relaxed text-slate-400">Le coefficient de cohérence compare le modèle à la station locale validée et au consensus des modèles. Il sert à lire l’accord instantané ; il ne modifie pas la température locale avant une validation historique mesurée.</p>
      {isLoading ? <div className="h-20 animate-pulse rounded-xl bg-slate-800" /> : modelReferences.length > 0 ? <div className="space-y-2">
        <ModelReferenceCard reference={modelReferences[0]} rank={1} onOpenDetails={(source) => onOpenDetails(source, "model")} />
        {modelReferences.length > 1 ? <>
          <button type="button" aria-expanded={showAdditionalModelReferences} onClick={() => setShowAdditionalModelReferences((open) => !open)} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-violet-500/25 bg-violet-500/5 px-3 text-left text-xs font-medium text-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
            <span>{showAdditionalModelReferences ? "Masquer les autres références" : `Afficher les ${modelReferences.length - 1} autres références`}</span>
            <span aria-hidden="true" className={`text-lg leading-none transition-transform duration-200 ${showAdditionalModelReferences ? "rotate-180" : "rotate-0"}`}>⌄</span>
          </button>
          {showAdditionalModelReferences ? <div className="space-y-2 border-t border-violet-500/15 pt-2">{modelReferences.slice(1).map((reference, index) => <ModelReferenceCard key={reference.id} reference={reference} rank={index + 2} onOpenDetails={(source) => onOpenDetails(source, "model")} />)}</div> : null}
        </> : null}
      </div> : <div className="rounded-xl border border-dashed border-violet-500/20 px-4 py-5 text-center text-sm text-slate-500">Aucune référence de modèle n’est disponible pour ce cycle.</div>}
    </div>
    <div className="rounded-2xl border border-amber-500/20 bg-[#10131a] p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Capteurs citoyens en validation</h2><p className="text-xs text-slate-500">Observations réelles archivées pour contrôle qualité ; elles n’influencent pas encore la température locale.</p></div><div className="flex shrink-0 items-center gap-2"><Tooltip><TooltipTrigger asChild><button type="button" aria-label="Comprendre le statut capteur en validation" className="min-h-8 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 text-[10px] font-semibold text-amber-100 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">Comprendre</button></TooltipTrigger><TooltipContent side="left" sideOffset={8} className="max-w-64 border border-amber-500/30 bg-[#17130b] px-3 py-2 text-left text-[11px] leading-relaxed text-amber-50">Ce relevé provient d’un capteur citoyen extérieur. Il est conservé pour vérifier sa fraîcheur, sa cohérence et sa précision historique, mais il n’influence pas la température locale tant qu’un gain de précision n’est pas démontré.</TooltipContent></Tooltip><WeatherStatusBadge compact tone="warning" label="Capteurs" value={String(candidateSources.length)} /></div></div>{isLoading ? <div className="h-20 animate-pulse rounded-xl bg-slate-800" /> : candidateSources.length > 0 ? <div className="space-y-2">{candidateSources.map((station, index) => <StationSourceCard key={station.stationId} station={station} rank={index + 1} physical={false} onOpenDetails={(source) => onOpenDetails(source, "station")} />)}</div> : <div className="rounded-xl border border-dashed border-amber-500/20 px-4 py-5 text-center text-sm text-slate-500">Aucun capteur citoyen extérieur récent trouvé dans le rayon actuel.</div>}</div>
    {criteria && <div className="rounded-2xl border border-slate-800 bg-[#10131a] p-4"><h2 className="mb-3 font-semibold text-white">Critères de classement</h2><div className="grid grid-cols-2 gap-2">{criteria.criteria.map((criterion: any) => <div key={criterion.name} className="flex items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-bold text-blue-300">{criterion.weight}%</span><span><span className="block text-xs font-medium text-slate-200">{criterion.name}</span><span className="block text-[10px] leading-tight text-slate-500">{criterion.description}</span></span></div>)}</div></div>}
  </section>;
}

function CollectionReport({ latest, history }: { latest: any; history: any[] }) {
  return (
    <>
      <section className="mb-4 rounded-2xl border border-slate-800 bg-[#10131a] p-4">
        <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Dernier bilan de collecte</h2><p className="text-xs text-slate-500">Couverture réelle des modèles et des stations lors du dernier passage.</p></div><MeteoIcon name="refresh" size={20} className="text-blue-400" /></div>
        {latest ? <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-800 bg-[#090b10] p-3 text-center"><Reading label="Modèles jour" value={`${latest.dailyModelCount}/8`} /><Reading label="Modèles heure" value={`${latest.hourlyModelCount}/8`} /><Reading label="Stations" value={String(latest.physicalStationCount)} /><p className="col-span-3 border-t border-slate-800 pt-2 text-[11px] text-slate-500">{new Date(latest.collectedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })} (Europe/Paris) · rayon {latest.radiusKm} km</p></div> : <div className="rounded-xl border border-dashed border-slate-800 px-4 py-5 text-center text-sm text-slate-500">Le premier bilan apparaîtra après la prochaine collecte.</div>}
      </section>
      <section className="mb-4 rounded-2xl border border-slate-800 bg-[#10131a] p-4">
        <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Disponibilité des stations</h2><p className="text-xs text-slate-500">Historique des recherches de stations physiques par collecte.</p></div><MeteoIcon name="stations" size={20} className="text-emerald-400" /></div>
        {history.length === 0 ? <div className="rounded-xl border border-dashed border-slate-800 px-4 py-5 text-center text-sm text-slate-500">Aucun cycle archivé pour ce lieu.</div> : <div className="space-y-2">{history.slice(-7).reverse().map((snapshot, index) => <div key={`${snapshot.collectedAt}-${index}`} className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#090b10] px-3 py-2.5"><div><p className="text-xs font-medium text-slate-200">{new Date(snapshot.collectedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</p><p className="mt-0.5 text-[11px] text-slate-500">Rayon {snapshot.radiusKm} km · modèles {snapshot.dailyModelCount}/8 et {snapshot.hourlyModelCount}/8</p></div><span className={`rounded-full px-2 py-1 text-[10px] ${snapshot.physicalStationCount > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-300"}`}>{snapshot.physicalStationCount} station{snapshot.physicalStationCount > 1 ? "s" : ""}</span></div>)}</div>}
      </section>
    </>
  );
}

function Metric({ label, value, icon, color }: { label: string; value: string; icon: any; color: string }) {
  return <div className="min-w-0 border-r border-slate-800 last:border-0 px-2 first:pl-0 last:pr-0"><MeteoIcon name={icon} size={16} className={color} /><p className="mt-1 truncate text-[10px] text-slate-500">{label}</p><p className="mt-0.5 text-sm font-bold text-white">{value}</p></div>;
}

function Reading({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] text-slate-500">{label}</p><p className="mt-0.5 text-xs font-medium text-slate-200">{value}</p></div>;
}
