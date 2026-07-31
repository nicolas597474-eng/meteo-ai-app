import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Droplets, Wind, Activity, MapPin, Clock, Eye, Thermometer, Sun, Radio } from "lucide-react";
import { FavoritesBar } from "@/components/FavoritesBar";
import FifteenDayChart from "@/components/FifteenDayChart";
import HourlyChart from "@/components/HourlyChart";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "@/contexts/LocationContext";
import { getWeatherLandscapeImage, getWeatherImageFromData } from "@/lib/weatherImages";
import { AlertBadge, isDangerousRegime } from "@/components/AlertBadge";
import { MeteoIcon, getIconNameFromCondition } from "@/components/MeteoIcon";

// ─── Day Summary helper ──────────────────────────────────────────────────────
function getDaySummary(hours: any[]): { text: string; trendIcon: string } {
  const morningHours = hours.filter((h: any) => { const hr = parseInt(h.hour); return hr >= 6 && hr < 12; });
  const afternoonHours = hours.filter((h: any) => { const hr = parseInt(h.hour); return hr >= 12 && hr < 19; });
  const eveningHours = hours.filter((h: any) => { const hr = parseInt(h.hour); return hr >= 19 || hr < 6; });

  const getMainCondition = (hrs: any[]) => {
    if (hrs.length === 0) return "variable";
    const conditions = hrs.map((h: any) => h.condition ?? "").filter(Boolean);
    if (conditions.length === 0) {
      const avgCloud = hrs.reduce((a: number, h: any) => a + (h.cloudCover ?? 50), 0) / hrs.length;
      const totalPrecip = hrs.reduce((a: number, h: any) => a + (h.precipitation ?? 0), 0);
      if (totalPrecip > 2) return "pluie";
      if (avgCloud > 80) return "couvert";
      if (avgCloud > 50) return "nuageux";
      return "ensoleillé";
    }
    const freq: Record<string, number> = {};
    conditions.forEach((c: string) => { freq[c] = (freq[c] ?? 0) + 1; });
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  };

  const mCond = getMainCondition(morningHours);
  const aCond = getMainCondition(afternoonHours);
  const eCond = getMainCondition(eveningHours);

  const condLabel = (c: string) => {
    const cl = c.toLowerCase();
    if (cl.includes("orage")) return "orages";
    if (cl.includes("pluie forte")) return "pluie forte";
    if (cl.includes("pluie") || cl.includes("averse")) return "averses";
    if (cl.includes("couvert")) return "ciel couvert";
    if (cl.includes("nuageux") || cl.includes("partiellement")) return "éclaircies";
    if (cl.includes("ensoleillé") || cl.includes("dégagé")) return "soleil";
    if (cl.includes("brouillard")) return "brouillard";
    if (cl.includes("neige")) return "neige";
    return cl || "variable";
  };

  const text = `Matin : ${condLabel(mCond)}. Après-midi : ${condLabel(aCond)}. Soir : ${condLabel(eCond)}.`;
  const trendIcon = getIconNameFromCondition(aCond);
  return { text, trendIcon };
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

  // Coordinates for weather queries — use active location or Hondeghem default
  const coordsInput = useMemo(() => ({
    lat: activeLocation?.lat ?? 50.76,
    lon: activeLocation?.lon ?? 2.52,
  }), [activeLocation?.lat, activeLocation?.lon]);

  // Dashboard (MeteoAI synthesis) — always location-aware
  const { data: dash, isLoading: dashLoading, isError: dashError } = trpc.weather.getDashboard.useQuery(
    coordsInput, { staleTime: 5 * 60 * 1000 }
  );
  // 15-day forecast — always location-aware
  const { data: f15, isLoading: f15Loading, isError: f15Error } = trpc.weather.get15DayForecast.useQuery(
    coordsInput, { staleTime: 5 * 60 * 1000 }
  );
  // Hourly forecast — always location-aware
  const { data: hourly, isLoading: hourlyLoading } = trpc.weather.getHourlyForecast.useQuery(
    coordsInput, { staleTime: 5 * 60 * 1000 }
  );

  // Loading: wait for MeteoAI (dash or locationWeather) + 15-day + hourly
  const isLoading = (activeLocation ? locLoading : dashLoading) && f15Loading && hourlyLoading;
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

  // Merge data: location-aware query (getLocationWeather) takes priority for MeteoAI/regime/ultraLocal
  // but 15-day forecast and hourly always come from their dedicated location-aware endpoints
  const lw = locationWeather;
  const meteoAI = lw ? (lw as any).meteoAI ?? null : dash?.meteoAI;
  // 15-day and hourly always use their dedicated location-aware endpoints
  const days: any[] = f15?.days ?? (lw ? lw.forecast15d : []);
  const today = days[0] ?? null;
  const hours: any[] = hourly?.hours ?? (lw ? lw.hourly : []);
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

  // Multi-regime data for alert badges
  const multiRegime = lw
    ? (lw as any).multiRegime ?? null
    : (dash as any)?.multiRegime ?? null;
  const primaryRegimeId: string = multiRegime?.activeRegimes?.[0]?.id ?? (regime as any)?.regime ?? (regime as any)?.id ?? "variable";
  const regimeConfidence: number = multiRegime?.confidenceScore ?? 70;

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
          {/* Dynamic landscape image based on weather regime */}
          <img
            src={regime ? getWeatherLandscapeImage(regime.label) : getWeatherImageFromData({ temperature: currentTemp ?? undefined, cloudCover: (today as any)?.cloudCover ?? undefined, precipitation: (today as any)?.precipitation ?? undefined, windSpeed: windSpeed ?? undefined })}
            alt="Paysage météo"
            className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-950/80 pointer-events-none" />
          <div className="relative">
            {/* Source label + Regime badge */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">Prévision MeteoAI</span>
                {activeLocation && <span className="text-xs text-primary/60">· {activeLocation.name}</span>}
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

            {/* ── Alert badge for dangerous regimes ── */}
            {isDangerousRegime(primaryRegimeId) && (
              <div className="mb-3">
                <AlertBadge regimeId={primaryRegimeId} confidence={regimeConfidence} confidenceThreshold={60} />
              </div>
            )}

            {/* Main temperature row */}
            <div className="flex items-center gap-4 sm:gap-6">
              {/* Icon — current hour condition (not day) */}
              <div className="flex-shrink-0">
                <MeteoIcon name={getIconNameFromCondition(currentHour?.condition ?? today?.condition ?? meteoAI?.condition ?? null)} size={64} />
              </div>

              {/* Big current temp */}
              <div className="flex items-start gap-3 sm:gap-5">
                <div>
                  <p className="text-7xl sm:text-8xl font-bold leading-none tracking-tight">
                    {currentTemp != null ? currentTemp.toFixed(1) : "—"}°
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
                      {today?.tempMax != null ? Number(today.tempMax).toFixed(1) : meteoAI?.tempMax != null ? Number(meteoAI.tempMax).toFixed(1) : "—"}°
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-blue-400 uppercase tracking-wide">min</span>
                    <span className="text-2xl sm:text-3xl font-bold text-blue-300">
                      {today?.tempMin != null ? Number(today.tempMin).toFixed(1) : meteoAI?.tempMin != null ? Number(meteoAI.tempMin).toFixed(1) : "—"}°
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
                  {apparentTemp != null ? `${apparentTemp.toFixed(1)}°` : currentTemp != null ? `${currentTemp.toFixed(1)}°` : "—"}
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

        {/* ── Résumé de la journée avec icône tendance ── */}
        {hours.length > 0 && (() => {
          const summary = getDaySummary(hours);
          return (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
              <MeteoIcon name={summary.trendIcon} size={36} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-primary mb-0.5">Résumé de la journée</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{summary.text}</p>
              </div>
            </div>
          );
        })()}

        {/* ── Link to details page ── */}
        <a href="/details" className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-primary/10 border border-primary/30 hover:bg-primary/20 transition-colors">
          <MeteoIcon name="chevron_right" size={16} />
          <span className="text-xs font-semibold text-primary">Voir les prévisions détaillées</span>
          <span className="text-primary text-xs">→</span>
        </a>

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
                  {Number(locationWeather.ultraLocal.temperature).toFixed(1)}°C
                </span>
                <div className="text-xs text-muted-foreground">
                  <p>Confiance : <span className="font-semibold text-foreground">{locationWeather.ultraLocal.confidenceScore}%</span></p>
                  {locationWeather.ultraLocal.microclimateAdjustment !== 0 && (
                    <p>Microclimat : {locationWeather.ultraLocal.microclimateAdjustment > 0 ? "+" : ""}{Number(locationWeather.ultraLocal.microclimateAdjustment).toFixed(1)}°C</p>
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


                {/* Hourly Chart */}
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
          {hourlyLoading ? (
            <div className="h-56 bg-muted rounded-xl animate-pulse" />
          ) : hours.length > 0 ? (
            <HourlyChart hours={hours} locationName={activeLocation?.name} />
          ) : (
            <p className="text-sm text-muted-foreground">Données horaires indisponibles.</p>
          )}
        </div>

        {/* ── 15-day chart enriched ── */}
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
          {f15Loading ? (
            <div className="h-72 bg-muted rounded-xl animate-pulse" />
          ) : days.length > 0 ? (
            <FifteenDayChart days={days} locationName={activeLocation?.name} />
          ) : null}
        </div>

      </div>
    </div>
  );
}
