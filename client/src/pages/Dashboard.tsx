import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from "recharts";
import { Droplets, Wind, Activity, MapPin, Clock, TrendingUp, Eye, Thermometer, Sun, FlaskConical, Radio } from "lucide-react";
import { Link } from "wouter";
import { FavoritesBar } from "@/components/FavoritesBar";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "@/contexts/LocationContext";

// ─── Weather condition icons ──────────────────────────────────────────────────
function WeatherIcon({ condition, size = 32 }: { condition: string | null; size?: number }) {
  const c = (condition ?? "").toLowerCase();
  const s = size;
  if (c.includes("orage")) return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M12 28c0-10 8-18 18-18 8 0 15 5 17 12 5 1 9 5 9 10 0 6-5 10-11 10H14c-6 0-10-4-10-9 0-4 3-7 7-8z" fill="#6b7280" opacity="0.8"/>
      <path d="M36 34l-8 14h6l-4 10 14-18h-8l6-6z" fill="#fbbf24"/>
    </svg>
  );
  if (c.includes("pluie forte") || (c.includes("averses") && !c.includes("légère"))) return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M12 28c0-10 8-18 18-18 8 0 15 5 17 12 5 1 9 5 9 10 0 6-5 10-11 10H14c-6 0-10-4-10-9 0-4 3-7 7-8z" fill="#6b7280" opacity="0.8"/>
      <line x1="20" y1="48" x2="16" y2="58" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round"/>
      <line x1="30" y1="48" x2="26" y2="58" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round"/>
      <line x1="40" y1="48" x2="36" y2="58" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round"/>
      <line x1="50" y1="48" x2="46" y2="58" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
  if (c.includes("pluie légère") || c.includes("bruine") || c.includes("averses")) return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M12 28c0-10 8-18 18-18 8 0 15 5 17 12 5 1 9 5 9 10 0 6-5 10-11 10H14c-6 0-10-4-10-9 0-4 3-7 7-8z" fill="#9ca3af" opacity="0.7"/>
      <line x1="24" y1="48" x2="22" y2="56" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="34" y1="48" x2="32" y2="56" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="44" y1="48" x2="42" y2="56" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
  if (c.includes("couvert")) return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M8 34c0-10 8-18 18-18 8 0 15 5 17 12 5 1 9 5 9 10 0 6-5 10-11 10H10c-6 0-10-4-10-9 0-4 3-7 8-5z" fill="#6b7280" opacity="0.9"/>
    </svg>
  );
  if (c.includes("nuageux") && !c.includes("partiellement")) return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="22" cy="26" r="8" fill="#fbbf24" opacity="0.6"/>
      <path d="M16 34c0-8 6-14 14-14 6 0 11 4 13 9 4 1 7 4 7 8 0 5-4 8-9 8H18c-5 0-8-3-8-7 0-3 2-5 6-4z" fill="#9ca3af" opacity="0.85"/>
    </svg>
  );
  if (c.includes("partiellement")) return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="20" cy="24" r="10" fill="#fbbf24" opacity="0.9"/>
      <path d="M22 36c0-7 5-13 12-13 5 0 10 3 11 8 3 0 6 3 6 7 0 4-3 7-8 7H24c-4 0-7-3-7-6 0-2 2-4 5-3z" fill="#d1d5db" opacity="0.9"/>
    </svg>
  );
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="12" fill="#fbbf24"/>
      {[0,45,90,135,180,225,270,315].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        return <line key={i} x1={32 + 16*Math.cos(rad)} y1={32 + 16*Math.sin(rad)} x2={32 + 22*Math.cos(rad)} y2={32 + 22*Math.sin(rad)} stroke="#fbbf24" strokeWidth="3" strokeLinecap="round"/>;
      })}
    </svg>
  );
}

// ─── Wind Rose ───────────────────────────────────────────────────────────────
function WindRose({ direction, speed }: { direction: number | null; speed: number | null }) {
  const dir = direction ?? 0;
  const cardinalDir = (deg: number) => {
    const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    return dirs[Math.round(deg / 45) % 8];
  };
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-10 h-10">
        <svg viewBox="0 0 40 40" className="w-full h-full">
          {/* Compass circle */}
          <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          {/* Cardinal ticks */}
          {[0, 90, 180, 270].map(a => {
            const rad = (a - 90) * Math.PI / 180;
            return <line key={a} x1={20 + 14*Math.cos(rad)} y1={20 + 14*Math.sin(rad)} x2={20 + 18*Math.cos(rad)} y2={20 + 18*Math.sin(rad)} stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />;
          })}
          {/* Arrow pointing in wind direction */}
          <g transform={`rotate(${dir}, 20, 20)`}>
            <polygon points="20,4 23,20 20,17 17,20" fill="#60a5fa" opacity="0.9" />
            <polygon points="20,36 23,20 20,23 17,20" fill="rgba(255,255,255,0.2)" />
          </g>
          {/* Center dot */}
          <circle cx="20" cy="20" r="2" fill="#60a5fa" />
        </svg>
      </div>
      <p className="text-xs font-bold text-blue-300">{cardinalDir(dir)}</p>
      {speed != null && <p className="text-xs text-muted-foreground">{speed}km/h</p>}
    </div>
  );
}

// ─── UV Index indicator ────────────────────────────────────────────────────────
function UVBadge({ uv }: { uv: number | null }) {
  if (uv == null) return <span className="text-base font-semibold">—</span>;
  const level = uv <= 2 ? { label: "Faible", color: "text-green-400" }
    : uv <= 5 ? { label: "Modéré", color: "text-yellow-400" }
    : uv <= 7 ? { label: "Élevé", color: "text-orange-400" }
    : uv <= 10 ? { label: "Très élevé", color: "text-red-400" }
    : { label: "Extrême", color: "text-purple-400" };
  return (
    <div className="flex flex-col items-center">
      <span className={`text-base sm:text-lg font-bold ${level.color}`}>{Math.round(uv)}</span>
      <span className={`text-xs ${level.color} opacity-80`}>{level.label}</span>
    </div>
  );
}

function stabilityColor(i: number) {
  if (i >= 80) return "text-emerald-400";
  if (i >= 60) return "text-yellow-400";
  if (i >= 40) return "text-orange-400";
  return "text-red-400";
}
function stabilityBg(i: number) {
  if (i >= 80) return "bg-emerald-500/10 border-emerald-500/20";
  if (i >= 60) return "bg-yellow-500/10 border-yellow-500/20";
  if (i >= 40) return "bg-orange-500/10 border-orange-500/20";
  return "bg-red-500/10 border-red-500/20";
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date().toLocaleDateString("en-CA");
  const tom = new Date(); tom.setDate(tom.getDate() + 1);
  if (dateStr === today) return "Auj.";
  if (dateStr === tom.toLocaleDateString("en-CA")) return "Dem.";
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}
function dayFull(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date().toLocaleDateString("en-CA");
  const tom = new Date(); tom.setDate(tom.getDate() + 1);
  if (dateStr === today) return "Aujourd'hui";
  if (dateStr === tom.toLocaleDateString("en-CA")) return "Demain";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
}

function TempTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-2 text-xs shadow-lg">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name === "Max" ? "↑" : "↓"} {p.value}°C</p>
      ))}
    </div>
  );
}

function getStoredLocation(): { lat: number; lon: number; name: string; radiusKm?: number } | null {
  try {
    const stored = localStorage.getItem("meteoai_last_location");
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

function storeLocation(loc: { lat: number; lon: number; name: string; radiusKm?: number }) {
  try { localStorage.setItem("meteoai_last_location", JSON.stringify(loc)); } catch {}
}

function getStoredLocalMode(): "standard" | "local" | "ultra-local" {
  try {
    const stored = localStorage.getItem("meteoai_local_mode");
    if (stored === "standard" || stored === "local" || stored === "ultra-local") return stored;
    return "standard";
  } catch { return "standard"; }
}

function storeLocalMode(mode: "standard" | "local" | "ultra-local") {
  try { localStorage.setItem("meteoai_local_mode", mode); } catch {}
}

export default function Dashboard() {
  const { user } = useAuth();
  const { setActiveLocation: setContextLocation } = useLocation();
  const [activeLocation, setActiveLocation] = useState<{ lat: number; lon: number; name: string; radiusKm?: number } | null>(getStoredLocation);
  const [localMode, setLocalMode] = useState<"standard" | "local" | "ultra-local">(getStoredLocalMode);

  const handleLocationChange = (loc: { lat: number; lon: number; name: string; radiusKm: number; localMode?: "standard" | "local" | "ultra-local" }) => {
    setActiveLocation(loc);
    storeLocation(loc);
    // Sync to LocationContext so all pages (Ranking, History, AI Lab) use this location
    setContextLocation({ lat: loc.lat, lon: loc.lon, name: loc.name, localMode: loc.localMode });
    // If the favorite has a per-location mode, apply it
    if (loc.localMode) {
      setLocalMode(loc.localMode);
      storeLocalMode(loc.localMode);
    }
  };

  const handleModeChange = (mode: "standard" | "local" | "ultra-local") => {
    setLocalMode(mode);
    storeLocalMode(mode);
  };

  // Use location-aware query when a location is selected
  const queryInput = useMemo(() => ({
    lat: activeLocation?.lat ?? 50.76,
    lon: activeLocation?.lon ?? 2.52,
    radiusKm: activeLocation?.radiusKm ?? 20,
    localMode,
  }), [activeLocation?.lat, activeLocation?.lon, activeLocation?.radiusKm, localMode]);

  const { data: locationWeather, isLoading: locLoading } = trpc.favorites.getLocationWeather.useQuery(
    queryInput,
    { enabled: !!activeLocation }
  );

  // Pre-loaded forecasts for all favorites (from 05h00 cron)
  const { data: preloadedForecasts } = trpc.favorites.getPreloadedForecasts.useQuery(
    undefined,
    { enabled: !!user, staleTime: 5 * 60 * 1000 }
  );

  // Build prefetchedWeather map for FavoritesBar pills (key = "fav-{id}")
  const prefetchedWeather = useMemo(() => {
    if (!preloadedForecasts) return undefined;
    const map = new Map<string, { temp: number | null; condition: string | null; confidenceScore: number | null }>();
    for (const pf of preloadedForecasts) {
      if (pf.forecast) {
        map.set(`fav-${pf.favoriteId}`, {
          temp: pf.forecast.tempCurrent ?? pf.forecast.tempMax,
          condition: pf.forecast.condition,
          confidenceScore: pf.forecast.confidenceScore,
        });
      }
    }
    return map;
  }, [preloadedForecasts]);

  // Fallback to default queries for Hondeghem when no location selected
  const { data: dash, isLoading: dashLoading, isError: dashError } = trpc.weather.getDashboard.useQuery(
    undefined, { enabled: !activeLocation }
  );
  const { data: f15, isLoading: f15Loading, isError: f15Error } = trpc.weather.get15DayForecast.useQuery(
    undefined, { enabled: !activeLocation }
  );
  const { data: hourly, isLoading: hourlyLoading } = trpc.weather.getHourlyForecast.useQuery(
    undefined, { enabled: !activeLocation }
  );

  const isLoading = activeLocation ? locLoading : dashLoading;
  const isError = activeLocation ? false : dashError;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted rounded-xl" />
            <div className="h-48 bg-muted rounded-2xl" />
            <div className="h-32 bg-muted rounded-2xl" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 bg-muted rounded-xl" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center max-w-sm w-full">
          <Activity className="h-10 w-10 mx-auto text-red-400 mb-3" />
          <h2 className="text-lg font-semibold text-red-400 mb-1">Erreur de chargement</h2>
          <p className="text-sm text-muted-foreground">Impossible de charger les prévisions.</p>
        </div>
      </div>
    );
  }

  // Merge data from location-aware or fallback queries
  const lw = locationWeather;
  const meteoAI = lw ? (lw as any).meteoAI ?? null : dash?.meteoAI;
  const days: any[] = lw ? lw.forecast15d : (f15?.days ?? []);
  const today = days[0] ?? null;
  const futureDays = days.slice(1);
  const hours: any[] = lw ? lw.hourly : (hourly?.hours ?? []);
  const nowHour = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).slice(0, 2) + ":00";
  const regime = lw
    ? {
        regime: lw.scores.regime,
        label: lw.scores.regimeLabel,
        emoji: lw.scores.regimeEmoji,
        description: (lw.scores as any).regimeDescription ?? "",
        weights: (lw.scores as any).regimeWeights ?? { temp: 0.3, precip: 0.3, wind: 0.2, condition: 0.2 },
      }
    : dash?.regime;

  const chartData = days.map((d: any) => ({
    name: dayLabel(d.date),
    Max: d.tempMax,
    Min: d.tempMin,
    Précip: d.precipitation,
  }));

  // Current temperature from hourly (closest to now)
  const currentHour = hours.find((h: any) => h.hour === nowHour) ?? hours[hours.length - 1] ?? null;
  const currentTemp = currentHour?.temp ?? today?.tempMax ?? meteoAI?.tempMax ?? null;
  const apparentTemp = currentHour?.apparentTemp ?? null;
  const currentUV = hours.find((h: any) => h.uvIndex != null && h.hour >= nowHour)?.uvIndex ?? null;
  const windDir = currentHour?.windDirection ?? null;
  const windSpeed = currentHour?.windSpeed ?? today?.windSpeed ?? meteoAI?.windSpeed ?? null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-3 py-4 space-y-4 sm:px-6 sm:py-8 sm:space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
              MeteoAI
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground text-xs sm:text-sm">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span>{activeLocation?.name ?? "Hondeghem, Nord"}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-card border border-border rounded-lg px-2.5 py-1.5">
            <Clock className="h-3 w-3" />
            <span>{dash?.today}</span>
          </div>
        </div>

        {/* ── Favorites Bar ── */}
        <FavoritesBar
          activeLocation={activeLocation}
          onLocationChange={handleLocationChange}
          prefetchedWeather={prefetchedWeather}
        />

        {/* ── Hero : Température actuelle + max/min ── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-4 sm:p-6">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-blue-600/10 pointer-events-none" />
          <div className="relative">
            {/* Source label + Regime badge */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">Prévision MeteoAI</span>
              </div>
              <span className="text-xs text-muted-foreground hidden sm:block">
                {f15?.modelsUsed?.join(", ")}
              </span>
            </div>

            {/* ── Regime badge ── */}
            {regime && (
              <div className="mb-3 rounded-xl border border-slate-600/50 bg-slate-800/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{regime.emoji}</span>
                    <div>
                      <p className="text-xs font-semibold text-white">{regime.label}</p>
                      <p className="text-xs text-muted-foreground leading-tight hidden sm:block">{regime.description}</p>
                    </div>
                  </div>
                  {/* Weight pills */}
                  <div className="flex flex-wrap gap-1">
                    <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded-full px-2 py-0.5 font-medium">
                      🌡 {Math.round(regime.weights.temp * 100)}%
                    </span>
                    <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full px-2 py-0.5 font-medium">
                      🌧 {Math.round(regime.weights.precip * 100)}%
                    </span>
                    <span className="text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full px-2 py-0.5 font-medium">
                      💨 {Math.round(regime.weights.wind * 100)}%
                    </span>
                    <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full px-2 py-0.5 font-medium">
                      ☁ {Math.round(regime.weights.condition * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Main temperature row */}
            <div className="flex items-center gap-4 sm:gap-6">
              {/* Icon */}
              <div className="flex-shrink-0">
                <WeatherIcon condition={today?.condition ?? meteoAI?.condition ?? null} size={64} />
              </div>

              {/* Big current temp */}
              <div className="flex items-start gap-3 sm:gap-5">
                <div>
                  <p className="text-7xl sm:text-8xl font-bold leading-none tracking-tight">
                    {currentTemp != null ? Math.round(currentTemp) : "—"}°
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {today?.condition ?? meteoAI?.condition ?? ""}
                  </p>
                </div>

                {/* Max / Min */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-orange-400 uppercase tracking-wide">max</span>
                    <span className="text-2xl sm:text-3xl font-bold text-orange-300">
                      {today?.tempMax ?? meteoAI?.tempMax ?? "—"}°
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-blue-400 uppercase tracking-wide">min</span>
                    <span className="text-2xl sm:text-3xl font-bold text-blue-300">
                      {today?.tempMin ?? meteoAI?.tempMin ?? "—"}°
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Apparent temp + UV + Wind rose highlight row */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-700/60">
              {/* Ressenti */}
              <div className="text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mb-1">
                  <Thermometer className="h-3 w-3" />Ressenti
                </p>
                <p className="text-xl sm:text-2xl font-bold">
                  {apparentTemp != null ? `${Math.round(apparentTemp)}°` : currentTemp != null ? `${Math.round(currentTemp)}°` : "—"}
                </p>
              </div>
              {/* UV Index */}
              <div className="text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mb-1">
                  <Sun className="h-3 w-3" />Indice UV
                </p>
                <UVBadge uv={currentUV} />
              </div>
              {/* Wind Rose */}
              <div className="text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mb-1">
                  <Wind className="h-3 w-3" />Direction
                </p>
                <div className="flex justify-center">
                  <WindRose direction={windDir} speed={windSpeed} />
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-700">
              <div className="text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mb-0.5">
                  <Droplets className="h-3 w-3" />Précip.
                </p>
                <p className="text-base sm:text-lg font-semibold">{today?.precipitation ?? meteoAI?.precipitation ?? 0} mm</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mb-0.5">
                  <Wind className="h-3 w-3" />Rafales
                </p>
                <p className="text-base sm:text-lg font-semibold">{today?.windGust ?? "—"} km/h</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mb-0.5">
                  <Activity className="h-3 w-3" />Fiabilité
                </p>
                <p className={`text-base sm:text-lg font-semibold ${stabilityColor(today?.stabilityIndex ?? meteoAI?.stabilityIndex ?? 0)}`}>
                  {today?.stabilityIndex ?? meteoAI?.stabilityIndex ?? 0}%
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mb-0.5">
                  <Droplets className="h-3 w-3 opacity-60" />Humidité
                </p>
                <p className="text-base sm:text-lg font-semibold">{today?.humidity ?? "—"}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mb-0.5">
                  <Eye className="h-3 w-3" />Nuages
                </p>
                <p className="text-base sm:text-lg font-semibold">{today?.cloudCover ?? "—"}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mb-0.5">
                  <Wind className="h-3 w-3" />Vent max
                </p>
                <p className="text-base sm:text-lg font-semibold">{today?.windSpeed ?? meteoAI?.windSpeed ?? "—"} km/h</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Ultra-local Mode Selector ── */}
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-card border border-border">
          <Radio className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-xs font-semibold text-muted-foreground mr-auto">Mode</span>
          <div className="flex gap-1">
            {(["standard", "local", "ultra-local"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  localMode === mode
                    ? mode === "ultra-local"
                      ? "bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-500/10"
                      : mode === "local"
                        ? "bg-blue-500/20 border border-blue-500/40 text-blue-300"
                        : "bg-primary/20 border border-primary/40 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent"
                }`}
              >
                {mode === "ultra-local" ? "Ultra-local" : mode === "local" ? "Local" : "Standard"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Ultra-local transparency (when active) ── */}
        {localMode !== "standard" && locationWeather?.ultraLocal && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-300">
                  {localMode === "ultra-local" ? "Mode Ultra-local" : "Mode Local"}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {locationWeather.ultraLocal.stationCount} station{locationWeather.ultraLocal.stationCount !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Temperature from ultra-local */}
            {locationWeather.ultraLocal.temperature != null && (
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-emerald-300">
                  {locationWeather.ultraLocal.temperature}°C
                </span>
                <div className="text-xs text-muted-foreground">
                  <p>Confiance : <span className="font-semibold text-foreground">{locationWeather.ultraLocal.confidenceScore}%</span></p>
                  {locationWeather.ultraLocal.microclimateAdjustment !== 0 && (
                    <p>Microclimat : {locationWeather.ultraLocal.microclimateAdjustment > 0 ? "+" : ""}{locationWeather.ultraLocal.microclimateAdjustment}°C</p>
                  )}
                </div>
              </div>
            )}

            {/* Band breakdown */}
            {locationWeather.ultraLocal.bandBreakdown.filter((b: any) => b.stationCount > 0).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {locationWeather.ultraLocal.bandBreakdown.filter((b: any) => b.stationCount > 0).map((band: any) => (
                  <div key={band.band} className="text-center rounded-lg bg-background/50 border border-border/50 p-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{band.band}</p>
                    <p className="text-sm font-bold">{band.avgTemperature != null ? `${band.avgTemperature}°` : "—"}</p>
                    <p className="text-xs text-emerald-400">{Math.round(band.effectiveWeight * 100)}% · {band.stationCount}st.</p>
                  </div>
                ))}
              </div>
            )}

            {/* Top stations used */}
            {locationWeather.ultraLocal.stationsUsed.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Stations utilisées :</p>
                <div className="space-y-0.5">
                  {locationWeather.ultraLocal.stationsUsed.slice(0, 4).map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="truncate max-w-[50%]">{s.name}</span>
                      <span className="text-muted-foreground">{s.distanceKm.toFixed(1)} km · {s.temperature != null ? `${s.temperature.toFixed(1)}°C` : "—"} · <span className="text-emerald-400 font-medium">{Math.round(s.weight * 100)}%</span></span>
                    </div>
                  ))}
                  {locationWeather.ultraLocal.stationsUsed.length > 4 && (
                    <p className="text-xs text-muted-foreground">+ {locationWeather.ultraLocal.stationsUsed.length - 4} autres stations</p>
                  )}
                </div>
              </div>
            )}

            {/* Explanation */}
            <p className="text-xs text-muted-foreground italic leading-relaxed">
              {locationWeather.ultraLocal.explanation}
            </p>
          </div>
        )}

        {/* ── AI Lab CTA ── */}
        <Link href="/ai-lab">
          <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-primary/15 to-purple-500/10 border border-primary/30 cursor-pointer hover:border-primary/50 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <FlaskConical className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold">Weather AI Lab</div>
                <div className="text-xs text-muted-foreground">Transparence totale · Sources · Formule · Replay IA</div>
              </div>
            </div>
            <div className="text-xs text-primary font-medium">Voir →</div>
          </div>
        </Link>

        {/* ── Hourly ── */}
        <div className="space-y-2">
          <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Heure par heure
          </h2>
          {hourlyLoading ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse flex-shrink-0 w-16 h-24 bg-muted rounded-xl" />
              ))}
            </div>
          ) : hours.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0">
              {hours.map((h) => {
                const isCurrent = h.hour === nowHour;
                return (
                  <div key={h.hour} className={`flex-shrink-0 w-16 sm:w-20 rounded-xl p-2 sm:p-3 text-center border ${
                    isCurrent ? "bg-primary/20 border-primary/40 ring-1 ring-primary/30" : "bg-card border-border"
                  }`}>
                    <p className={`text-xs font-medium mb-1.5 ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>{h.hour}</p>
                    <div className="flex justify-center mb-1.5">
                      <WeatherIcon condition={h.condition} size={24} />
                    </div>
                    <p className="text-sm font-bold">{h.temp != null ? `${Math.round(h.temp)}°` : "—"}</p>
                    {(h.precipitation ?? 0) > 0 && (
                      <p className="text-xs text-blue-400 mt-0.5">{h.precipitation}mm</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">{h.windSpeed}km/h</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Données horaires indisponibles.</p>
          )}
        </div>

        {/* ── 15-day chart ── */}
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-3">
          <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Températures — 15 jours
          </h2>
          {f15Loading ? (
            <div className="h-40 bg-muted rounded-xl animate-pulse" />
          ) : chartData.length > 0 ? (
            <>
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="maxG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="minG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval={1} />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} unit="°" />
                    <Tooltip content={<TempTooltip />} />
                    <Area type="monotone" dataKey="Max" stroke="#f97316" strokeWidth={2} fill="url(#maxG)" dot={false} />
                    <Area type="monotone" dataKey="Min" stroke="#60a5fa" strokeWidth={2} fill="url(#minG)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {chartData.some(d => (d.Précip ?? 0) > 0) && (
                <div style={{ height: 48 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 0, right: 5, left: -25, bottom: 0 }}>
                      <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} unit="mm" />
                      <Tooltip formatter={(v: any) => [`${v} mm`, "Précip."]} />
                      <Bar dataKey="Précip" fill="#60a5fa" opacity={0.7} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* ── 15-day cards ── */}
        <div className="space-y-2">
          <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Prévisions 15 jours
            <span className="text-xs text-muted-foreground font-normal">{f15?.modelsUsed?.length ?? 0} modèles</span>
          </h2>
          {f15Loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="animate-pulse h-36 bg-muted rounded-xl" />
              ))}
            </div>
          ) : futureDays.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {futureDays.map((day) => (
                <div key={day.date} className={`rounded-xl p-2.5 sm:p-3 border ${stabilityBg(day.stabilityIndex)}`}>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5 truncate">{dayFull(day.date)}</p>
                  <div className="flex items-center gap-1.5 mb-2">
                    <WeatherIcon condition={day.condition} size={28} />
                    <div>
                      <p className="text-base sm:text-lg font-bold leading-none">{day.tempMax}°</p>
                      <p className="text-xs text-muted-foreground">{day.tempMin}°</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1.5 truncate">{day.condition}</p>
                  <div className="space-y-0.5 text-xs">
                    {(day.precipitation ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-blue-400">Précip</span>
                        <span className="text-blue-400 font-medium">{day.precipitation}mm</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vent</span>
                      <span>{day.windSpeed}km/h</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-border/40">
                      <span className="text-muted-foreground">Conf.</span>
                      <span className={`font-bold ${stabilityColor(day.stabilityIndex)}`}>{day.stabilityIndex}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Chargement des prévisions...</p>
          )}
        </div>

        {/* ── Top models ── */}
        {(dash?.topServices?.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Classement des modèles
            </h3>
            <div className="space-y-2">
              {dash!.topServices.map((s, i) => (
                <div key={s.serviceName} className="flex items-center gap-2.5">
                  <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                    i === 0 ? "bg-yellow-500/20 text-yellow-400" :
                    i === 1 ? "bg-gray-400/20 text-gray-300" :
                    i === 2 ? "bg-orange-600/20 text-orange-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{i + 1}</span>
                  <span className="text-sm flex-1 truncate">{s.serviceName}</span>
                  <span className="text-sm font-mono text-primary">{(s.avgScore ?? 0).toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
