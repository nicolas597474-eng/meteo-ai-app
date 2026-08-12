import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useState } from "react";
import { MeteoIcon } from "@/components/MeteoIcon";
import { StationMap } from "@/components/StationMap";
import { trpc } from "@/lib/trpc";
import { useLocation } from "@/contexts/LocationContext";

type ComparisonPoint = {
  hour?: number;
  label?: string;
  stationTemperature: number | null;
  stationSampleCount: number;
  officialTemperature: number | null;
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

function TemperatureComparison({ points, periodDays }: { points: ComparisonPoint[]; periodDays: 1 | 7 }) {
  const usable = points.filter((point) => point.stationTemperature !== null || point.officialTemperature !== null);
  if (usable.length === 0) {
    return (
      <div className="border border-dashed border-slate-800 rounded-xl px-4 py-8 text-center text-sm text-slate-500">
        La comparaison apparaîtra après les premiers relevés physiques collectés à 05h00.
      </div>
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
  const [periodDays, setPeriodDays] = useState<1 | 7>(1);
  const [radiusKm, setRadiusKm] = useState(activeLocation?.radiusKm ?? 20);
  const coords = activeLocation ? { lat: activeLocation.lat, lon: activeLocation.lon } : undefined;
  const utils = trpc.useUtils();
  const overviewInput = useMemo(() => ({ ...(coords ?? {}), periodDays, radiusKm }), [coords?.lat, coords?.lon, periodDays, radiusKm]);
  const { data, isLoading } = trpc.weather.getStationReliabilityOverview.useQuery(overviewInput);
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
    return <div className="min-h-screen bg-[#080a0f] max-w-2xl mx-auto px-4 pt-5 space-y-4"><Skeleton className="h-7 w-48 bg-slate-800" /><Skeleton className="h-32 w-full bg-slate-800" /><Skeleton className="h-56 w-full bg-slate-800" /></div>;
  }

  const stations = data?.stations ?? [];
  const comparison = periodDays === 1 ? (data?.comparison24h ?? []) : (data?.comparison7d ?? []);
  const latest = data?.latestGroundTruth;
  const latestCollection = data?.latestCollection;
  const availabilityHistory = (data?.availabilityHistory ?? []) as any[];
  const locationName = activeLocation?.name ?? "Hondeghem";
  const instantDeltaC = data?.instantDeltaC ?? null;

  return (
    <main className="min-h-screen bg-[#080a0f] pb-28">
      <div className="mx-auto max-w-2xl px-3 pt-4 sm:px-5">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-blue-400"><MeteoIcon name="location" size={19} /><span className="text-sm font-semibold">{locationName}</span></div>
            <h1 className="mt-2 text-xl font-bold text-white">Stations & fiabilité locale</h1>
            <p className="mt-1 text-xs text-slate-500">Relevés physiques et comparaison avec la prévision officielle.</p>
          </div>
          <div className="rounded-full border border-slate-800 bg-[#10131a] px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Collecte</p>
            <p className="text-xs font-medium text-blue-300">05h00 Paris</p>
          </div>
        </header>

        <section className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border border-slate-800 bg-[#10131a] p-3">
          <Metric label="Stations actives" value={String(stations.length)} icon="stations" color="text-emerald-400" />
          <Metric label="Confiance locale" value={latest?.confidenceScore !== null && latest?.confidenceScore !== undefined ? `${Math.round(latest.confidenceScore)}%` : "—"} icon="confidence" color="text-blue-400" />
          <Metric label="Dernière synthèse" value={latest?.computedAt ? new Date(latest.computedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"} icon="refresh" color="text-slate-300" />
        </section>

        <section className="mb-4 rounded-2xl border border-slate-800 bg-[#10131a] p-4">
          <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Rayon de recherche</h2><p className="text-xs text-slate-500">Utilisé à la prochaine collecte de stations physiques.</p></div><MeteoIcon name="location" size={20} className="text-blue-400" /></div>
          <div className="flex flex-wrap gap-2">{[5, 10, 20, 30, 50].map((radius) => <button key={radius} type="button" disabled={updateFavorite.isPending} onClick={() => changeRadius(radius)} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${radiusKm === radius ? "border-blue-500 bg-blue-600 text-white" : "border-slate-700 bg-[#090b10] text-slate-300"}`}>{radius} km</button>)}</div>
          <p className="mt-3 text-[11px] text-slate-600">{activeLocation?.favoriteId ? "Le rayon est enregistré pour ce lieu favori." : "Le rayon est utilisé pour cette consultation ; enregistrez ce lieu pour le conserver."}</p>
        </section>

        <CollectionReport latest={latestCollection as any} history={availabilityHistory} />

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
    </main>
  );
}

function CollectionReport({ latest, history }: { latest: any; history: any[] }) {
  return (
    <>
      <section className="mb-4 rounded-2xl border border-slate-800 bg-[#10131a] p-4">
        <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">Dernier bilan de collecte</h2><p className="text-xs text-slate-500">Couverture réelle des modèles et des stations lors du dernier passage.</p></div><MeteoIcon name="refresh" size={20} className="text-blue-400" /></div>
        {latest ? <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-800 bg-[#090b10] p-3 text-center"><Reading label="Modèles jour" value={`${latest.dailyModelCount}/8`} /><Reading label="Modèles heure" value={`${latest.hourlyModelCount}/8`} /><Reading label="Stations" value={String(latest.physicalStationCount)} /><p className="col-span-3 border-t border-slate-800 pt-2 text-[11px] text-slate-500">{new Date(latest.collectedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · rayon {latest.radiusKm} km</p></div> : <div className="rounded-xl border border-dashed border-slate-800 px-4 py-5 text-center text-sm text-slate-500">Le premier bilan apparaîtra après la prochaine collecte.</div>}
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
