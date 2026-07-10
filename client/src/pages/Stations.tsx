import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  MapPin, Radio, Thermometer, Droplets, Wind, Gauge, Clock,
  CheckCircle, XCircle, ChevronDown, ChevronUp, Search, Target,
  Activity, BarChart3, Layers, Info
} from "lucide-react";

// ─── Source badge colours ─────────────────────────────────────────────────────
const SOURCE_COLORS: Record<string, string> = {
  meteofrance:  "bg-blue-500/20 text-blue-300 border-blue-500/30",
  synop:        "bg-purple-500/20 text-purple-300 border-purple-500/30",
  noaa:         "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  openmeteo:    "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  netatmo:      "bg-green-500/20 text-green-300 border-green-500/30",
  cwop:         "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  wunderground: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  davis:        "bg-pink-500/20 text-pink-300 border-pink-500/30",
};

const SOURCE_LABELS: Record<string, string> = {
  meteofrance:  "Météo-France",
  synop:        "SYNOP/WMO",
  noaa:         "NOAA",
  openmeteo:    "Open-Meteo",
  netatmo:      "Netatmo",
  cwop:         "CWOP/APRS",
  wunderground: "WUnderground",
  davis:        "Davis",
};

function SourceBadge({ source }: { source: string }) {
  const cls = SOURCE_COLORS[source] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
      {SOURCE_LABELS[source] ?? source}
    </span>
  );
}

function ReliabilityBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-7 text-right">{score}</span>
    </div>
  );
}

function StationCard({ station, rank }: { station: any; rank: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border transition-colors ${
      station.isActive
        ? "bg-card border-border"
        : "bg-muted/30 border-border/50 opacity-60"
    }`}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Rank */}
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          rank === 1 ? "bg-yellow-500/20 text-yellow-300" :
          rank === 2 ? "bg-slate-400/20 text-slate-300" :
          rank === 3 ? "bg-amber-700/20 text-amber-400" :
          "bg-muted text-muted-foreground"
        }`}>
          {rank}
        </div>

        {/* Status icon */}
        {station.isActive
          ? <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
          : <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
        }

        {/* Name + source */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium truncate">{station.name}</span>
            <SourceBadge source={station.source} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />{station.distanceKm} km
            </span>
            {station.altitude != null && (
              <span className="text-xs text-muted-foreground">{station.altitude} m</span>
            )}
          </div>
        </div>

        {/* Quick data */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {station.temperature != null && (
            <div className="text-center">
              <div className="text-base font-bold">{station.temperature}°</div>
              <div className="text-[10px] text-muted-foreground">Temp</div>
            </div>
          )}
          {station.windSpeed != null && (
            <div className="text-center hidden sm:block">
              <div className="text-sm font-semibold">{station.windSpeed}</div>
              <div className="text-[10px] text-muted-foreground">km/h</div>
            </div>
          )}
        </div>

        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-border/50 pt-3 space-y-3">
          {/* Exclusion reason */}
          {!station.isActive && station.exclusionReason && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <XCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-red-300">Station ignorée</div>
                <div className="text-xs text-muted-foreground">{station.exclusionReason}</div>
              </div>
            </div>
          )}

          {/* Measurements grid */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Thermometer, label: "Température", value: station.temperature != null ? `${station.temperature}°C` : "—" },
              { icon: Droplets, label: "Humidité", value: station.humidity != null ? `${station.humidity}%` : "—" },
              { icon: Gauge, label: "Pression", value: station.pressure != null ? `${station.pressure} hPa` : "—" },
              { icon: Wind, label: "Vent", value: station.windSpeed != null ? `${station.windSpeed} km/h` : "—" },
              { icon: Wind, label: "Rafales", value: station.windGust != null ? `${station.windGust} km/h` : "—" },
              { icon: Droplets, label: "Précip.", value: station.precipitation != null ? `${station.precipitation} mm` : "—" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-muted/40 rounded-lg p-2 text-center">
                <Icon className="h-3 w-3 text-primary mx-auto mb-1" />
                <div className="text-xs font-semibold">{value}</div>
                <div className="text-[10px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>

          {/* Quality metrics */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Qualité</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Fiabilité</span>
                <ReliabilityBar score={station.reliabilityScore} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Disponibilité</span>
                <span className="font-medium">{Math.round(station.dataAvailability * 100)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Fréquence MAJ</span>
                <span className="font-medium">~{station.updateFrequencyMin} min</span>
              </div>
            </div>
          </div>

          {/* Last update */}
          {station.updatedAt && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Mis à jour : {new Date(station.updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Stations() {
  const [lat, setLat] = useState(50.7567);
  const [lon, setLon] = useState(2.5204);
  const [radiusKm, setRadiusKm] = useState(20);
  const [cityInput, setCityInput] = useState("Hondeghem");
  const [geoLoading, setGeoLoading] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);

  const { data, isLoading, refetch } = trpc.weather.searchStations.useQuery(
    { lat, lon, radiusKm },
    { staleTime: 5 * 60 * 1000 }
  );

  const { data: criteria } = trpc.weather.getStationRankingCriteria.useQuery();

  // Geolocation
  const handleGPS = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLon(pos.coords.longitude);
        setCityInput(`${pos.coords.latitude.toFixed(4)}°N, ${pos.coords.longitude.toFixed(4)}°E`);
        setGeoLoading(false);
      },
      () => setGeoLoading(false)
    );
  }, []);

  // City search via Open-Meteo geocoding
  const handleCitySearch = useCallback(async () => {
    if (!cityInput.trim()) return;
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityInput)}&count=1&language=fr&format=json`
      );
      const data = await res.json();
      if (data.results?.[0]) {
        const r = data.results[0];
        setLat(r.latitude);
        setLon(r.longitude);
        setCityInput(r.name);
      }
    } catch {}
  }, [cityInput]);

  const activeStations = data?.stations.filter(s => s.isActive) ?? [];
  const ignoredStations = data?.stations.filter(s => !s.isActive) ?? [];
  const gt = data?.groundTruth;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-3 pt-4 pb-24 space-y-4">

        {/* Header */}
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold">Stations locales</h1>
            <p className="text-xs text-muted-foreground">Collecte multi-sources en temps réel</p>
          </div>
        </div>

        {/* Location selector */}
        <div className="bg-card rounded-xl border border-border p-3 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Position</div>

          {/* City input */}
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <input
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Ville ou commune..."
                value={cityInput}
                onChange={e => setCityInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCitySearch()}
              />
            </div>
            <button
              onClick={handleCitySearch}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              OK
            </button>
            <button
              onClick={handleGPS}
              disabled={geoLoading}
              className="px-3 py-2 rounded-lg bg-muted text-foreground text-sm"
              title="Utiliser ma position GPS"
            >
              {geoLoading ? "…" : <Target className="h-4 w-4" />}
            </button>
          </div>

          {/* Coordinates display */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {lat.toFixed(4)}°N, {lon.toFixed(4)}°E
          </div>

          {/* Radius selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Rayon de recherche</span>
              <span className="text-xs font-semibold text-primary">{radiusKm} km</span>
            </div>
            <div className="flex gap-2">
              {[5, 10, 20, 50].map(r => (
                <button
                  key={r}
                  onClick={() => setRadiusKm(r)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    radiusKm === r
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {r} km
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Ground truth summary */}
        {gt && gt.stationCount > 0 && (
          <div className="bg-gradient-to-br from-primary/10 to-purple-500/5 rounded-xl border border-primary/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Vérité terrain</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${
                  gt.confidenceScore >= 70 ? "bg-green-400" :
                  gt.confidenceScore >= 40 ? "bg-yellow-400" : "bg-red-400"
                }`} />
                <span className="text-xs text-muted-foreground">Confiance {gt.confidenceScore}/100</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-2">
              {[
                { label: "Température", value: gt.temperature != null ? `${gt.temperature}°C` : "—", icon: Thermometer },
                { label: "Humidité", value: gt.humidity != null ? `${gt.humidity}%` : "—", icon: Droplets },
                { label: "Pression", value: gt.pressure != null ? `${gt.pressure} hPa` : "—", icon: Gauge },
                { label: "Vent", value: gt.windSpeed != null ? `${gt.windSpeed} km/h` : "—", icon: Wind },
                { label: "Rafales", value: gt.windGust != null ? `${gt.windGust} km/h` : "—", icon: Wind },
                { label: "Précip.", value: gt.precipitation != null ? `${gt.precipitation} mm` : "—", icon: Droplets },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="bg-background/40 rounded-lg p-2 text-center">
                  <Icon className="h-3 w-3 text-primary mx-auto mb-0.5" />
                  <div className="text-sm font-bold">{value}</div>
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Layers className="h-3 w-3" />
              Calculé à partir de {gt.stationCount} station{gt.stationCount > 1 ? "s" : ""} active{gt.stationCount > 1 ? "s" : ""}
              &nbsp;·&nbsp;50% distance · 30% qualité · 20% fraîcheur
            </div>
          </div>
        )}

        {/* Stats bar */}
        {data && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Trouvées", value: data.totalFound, color: "text-foreground" },
              { label: "Actives", value: data.activeCount, color: "text-green-400" },
              { label: "Ignorées", value: data.ignoredCount, color: "text-red-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card rounded-xl border border-border p-2.5 text-center">
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Ranking criteria info */}
        {criteria && (
          <div className="bg-card rounded-xl border border-border p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Critères de classement</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {criteria.criteria.map(c => (
                <div key={c.name} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">{c.weight}%</span>
                  </div>
                  <div>
                    <div className="text-xs font-medium">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight">{c.description.slice(0, 40)}…</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active stations list */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse h-16 bg-muted rounded-xl" />
            ))}
          </div>
        ) : activeStations.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span className="text-sm font-semibold">Stations actives ({activeStations.length})</span>
            </div>
            {activeStations.map((s, i) => (
              <StationCard key={s.stationId} station={s} rank={i + 1} />
            ))}
          </div>
        ) : data ? (
          <div className="text-center py-8 text-muted-foreground">
            <Radio className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucune station active dans ce rayon</p>
            <p className="text-xs">Essayez d'augmenter le rayon de recherche</p>
          </div>
        ) : null}

        {/* Ignored stations */}
        {ignoredStations.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => setShowIgnored(!showIgnored)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showIgnored ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <XCircle className="h-4 w-4 text-red-400" />
              Stations ignorées ({ignoredStations.length})
            </button>
            {showIgnored && ignoredStations.map((s, i) => (
              <StationCard key={s.stationId} station={s} rank={activeStations.length + i + 1} />
            ))}
          </div>
        )}

        {/* Sources legend */}
        {criteria && (
          <div className="bg-card rounded-xl border border-border p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sources interrogées</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {criteria.sources.map(src => (
                <div key={src.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/40 border border-border/50">
                  <SourceBadge source={src.id} />
                  <span className="text-[10px] text-muted-foreground">{src.reliability}/100</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
