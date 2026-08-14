import { trpc } from "@/lib/trpc";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Droplets, Wind, Activity, MapPin, Clock, Eye, Thermometer, Sun, Radio, RefreshCw, ChevronDown, ChevronUp, Info, Menu, Settings } from "lucide-react";
import { FavoritesBar } from "@/components/FavoritesBar";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "@/contexts/LocationContext";
import { Link } from "wouter";
import { getDashboardWeatherImage } from "@/lib/weatherImages";
import { formatDashboardDate } from "@/lib/dashboardDate";
import { AlertBadge, isDangerousRegime } from "@/components/AlertBadge";
import { MeteoIcon, getIconNameFromCondition } from "@/components/MeteoIcon";
import { findNextConditionChange, getNextWeatherAlert } from "@/lib/weatherCondition";
import { LocalOfficialDeltaChart } from "@/components/LocalOfficialDeltaChart";
import { dashboardTemperatureLayout } from "@/lib/dashboardTemperatureLayout";
import { DASHBOARD_LOAD_TIMEOUT_MS, DASHBOARD_PREVIEW_MESSAGE } from "@/lib/dashboardLoadState";

const HourlyChart = lazy(() => import("@/components/HourlyChart"));
const FifteenDayChart = lazy(() => import("@/components/FifteenDayChart"));

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
    return stored === "local" || stored === "ultra-local" ? stored : "standard";
  } catch { return "standard"; }
}

function storeLocalMode(mode: "standard" | "local" | "ultra-local") {
  try { localStorage.setItem("meteoai_local_mode", mode); } catch {}
}

function formatRegimeWeight(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "—";
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { activeLocation: contextLocation, setActiveLocation: setContextLocation } = useLocation();
  const [activeLocation, setActiveLocation] = useState<{ lat: number; lon: number; name: string; radiusKm?: number; favoriteId?: number; localMode?: "standard" | "local" | "ultra-local" } | null>(getStoredLocation);
  const [localMode, setLocalMode] = useState<"standard" | "local" | "ultra-local">(getStoredLocalMode);
  const [hasWaitTimedOut, setHasWaitTimedOut] = useState(false);
  const [showRegimeMenu, setShowRegimeMenu] = useState(false);
  const [expandedRegimeIds, setExpandedRegimeIds] = useState<string[]>([]);
  const [showFusionDetails, setShowFusionDetails] = useState(false);
  const [showMobileNavigation, setShowMobileNavigation] = useState(false);
  // Le contexte partagé est prioritaire : Dashboard et Classement interrogent
  // alors strictement les mêmes coordonnées pour la prévision officielle.
  const selectedLocation = contextLocation ?? activeLocation;

  const handleLocationChange = (loc: { lat: number; lon: number; name: string; radiusKm: number; favoriteId?: number; localMode?: "standard" | "local" | "ultra-local" }) => {
    setActiveLocation(loc);
    storeLocation(loc);
    // Sync to LocationContext so all pages (Ranking, History, AI Lab) use this location
    setContextLocation({ lat: loc.lat, lon: loc.lon, name: loc.name, favoriteId: loc.favoriteId, radiusKm: loc.radiusKm, localMode: loc.localMode ?? "standard" });
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
    lat: selectedLocation?.lat ?? 50.76,
    lon: selectedLocation?.lon ?? 2.52,
    radiusKm: activeLocation?.radiusKm ?? 20,
    localMode,
  }), [selectedLocation?.lat, selectedLocation?.lon, activeLocation?.radiusKm, localMode]);

  const { data: locationWeather, isLoading: locLoading } = trpc.favorites.getLocationWeather.useQuery(
    queryInput,
    { enabled: !!selectedLocation }
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
    lat: selectedLocation?.lat ?? 50.76,
    lon: selectedLocation?.lon ?? 2.52,
  }), [selectedLocation?.lat, selectedLocation?.lon]);

  // Dashboard (MeteoAI synthesis) — always location-aware
  const { data: dash, isLoading: dashLoading, isError: dashError, isFetching: dashFetching, refetch: refetchDashboard } = trpc.weather.getDashboard.useQuery(
    coordsInput,
    {
      staleTime: 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
    }
  );
  // Réponse officielle consolidée : la même source alimente désormais Dashboard
  // et Détails pour les heures, les jours et les indices de confiance.
  const { data: officialForecast, isLoading: officialLoading, isError: officialError, isFetching: officialFetching, refetch: refetchOfficialForecast, dataUpdatedAt: officialDataUpdatedAt } = trpc.weather.getDetailedForecast.useQuery(
    coordsInput,
    {
      staleTime: 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
    }
  );
  const { data: localOfficialHistory } = trpc.weather.getLocalOfficialDeltaHistory.useQuery(
    coordsInput, { staleTime: 5 * 60 * 1000 }
  );
  const { data: regimeCatalogue = [] } = trpc.weather.getRegimeCatalogue.useQuery(
    undefined, { staleTime: 60 * 60 * 1000 }
  );

  const isLoading = (selectedLocation ? locLoading : dashLoading) || officialLoading;
  const isError = (selectedLocation ? false : dashError) || officialError;
  const isRefreshing = dashFetching || officialFetching;
  const refreshCurrentWeather = async () => {
    setHasWaitTimedOut(false);
    await Promise.all([refetchDashboard(), refetchOfficialForecast()]);
  };

  useEffect(() => {
    if (!isLoading) {
      setHasWaitTimedOut(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setHasWaitTimedOut(true), DASHBOARD_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [isLoading]);

  if (hasWaitTimedOut) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="mx-auto flex min-h-[52vh] max-w-md flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-2xl border border-blue-400/20 bg-blue-400/5 p-6">
            <Clock className="mx-auto mb-3 h-9 w-9 text-blue-300" />
            <h2 className="text-lg font-semibold">Prévisions toujours en cours de chargement</h2>
            <p className="mt-2 text-sm text-muted-foreground">La source météo répond plus lentement que prévu. Aucune donnée estimée n’est affichée.</p>
            <button type="button" onClick={() => void refreshCurrentWeather()} className="mt-5 min-h-11 rounded-md border border-primary/50 px-4 text-sm font-medium text-primary">
              Réessayer maintenant
            </button>
          </div>
        </div>
      </div>
    );
  }

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

  // Le mode local reste explicitement distinct pour les stations; les prévisions
  // horaires et journalières proviennent d'un seul objet officiel consolidé.
  const lw = locationWeather;
  const meteoAI = dash?.meteoAI;
  const officialRegime = officialForecast?.regime ?? (dash as any)?.officialRegime ?? null;
  const officialPrimaryRegime = officialRegime?.primary as any;
  const days: any[] = officialForecast?.days ?? (lw ? lw.forecast15d : []);
  const today = days[0] ?? null;
  const hours: any[] = officialForecast?.hours ?? (lw ? lw.hourly : []);
  const nowHour = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).slice(0, 2) + ":00";
  const localObservedRegime = lw
    ? {
        id: lw.scores.regime,
        label: lw.scores.regimeLabel,
        emoji: lw.scores.regimeEmoji,
      }
    : null;
  const regime = officialPrimaryRegime
      ? {
          regime: officialPrimaryRegime.id,
          label: officialPrimaryRegime.label,
          emoji: officialPrimaryRegime.emoji,
          description: officialPrimaryRegime.description,
          weights: officialPrimaryRegime.weights ?? { temp: 0.3, precip: 0.3, wind: 0.2, condition: 0.2 },
        }
      : dash?.regime;
  const regimeSourceLabel = officialRegime?.sourceLabel ?? "Fusion officielle multi-modèles";
  const regimeSourceUpdatedAt = officialRegime?.sourceUpdatedAt
    ? new Date(officialRegime.sourceUpdatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
    : null;
  const regimeAgeMinutes = officialRegime?.sourceUpdatedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(officialRegime.sourceUpdatedAt).getTime()) / 60000))
    : officialDataUpdatedAt
      ? Math.max(0, Math.floor((Date.now() - officialDataUpdatedAt) / 60000))
      : null;
  const regimeFreshnessLabel = regimeAgeMinutes == null
    ? "Mise à jour en cours"
    : regimeAgeMinutes === 0
      ? "Mis à jour à l’instant"
      : `Mis à jour il y a ${regimeAgeMinutes} min`;
  const allRegimeIds = regimeCatalogue.map((candidate: any) => candidate.id);
  const allRegimesExpanded = allRegimeIds.length > 0 && allRegimeIds.every((id) => expandedRegimeIds.includes(id));
  const netatmoStatusLabel: Record<string, string> = {
    live: "Netatmo : relevés directs authentifiés",
    fresh_cache: "Netatmo : cache authentifié récent (service temporairement indisponible)",
    connected_empty: "Netatmo : connecté, aucune station exploitable dans le rayon",
    temporarily_unavailable: "Netatmo : service temporairement indisponible",
    not_connected: "Netatmo : aucune autorisation active pour cette session",
  };
  const modelIndicator = dash?.modelIndicator ?? null;
  const fusionTrace = (officialForecast as any)?.trace?.available === false ? null : (officialForecast as any)?.trace ?? null;
  const fusionParameters = [
    { key: "temperature", label: "Température" },
    { key: "precipitation", label: "Précipitations" },
    { key: "wind", label: "Vent" },
  ].map(({ key, label }) => ({
    key,
    label,
    sources: ((fusionTrace?.parameterSources?.[key] ?? []) as any[])
      .filter((source) => source.type === "model" && Number.isFinite(source.finalWeight) && source.finalWeight > 0),
  }));

  // Multi-regime data for alert badges
  const multiRegime = officialRegime
    ? { activeRegimes: officialRegime.active, confidenceScore: officialRegime.confidence }
    : (dash as any)?.multiRegime ?? null;
  const primaryRegimeId: string = multiRegime?.activeRegimes?.[0]?.id ?? (regime as any)?.regime ?? (regime as any)?.id ?? "variable";
  const regimeConfidence: number = multiRegime?.confidenceScore ?? 70;
  // La confiance mesure la qualité / accord des sources ; la stabilité mesure
  // seulement la dispersion des modèles. Ne jamais les confondre dans l'UI.
  const forecastConfidence: number = lw?.scores?.confidenceScore
    ?? officialForecast?.confidence?.current
    ?? dash?.meteoAI?.confidenceScore
    ?? 0;
  const stabilityIndex: number = officialForecast?.confidence?.stabilityIndex ?? today?.stabilityIndex ?? meteoAI?.stabilityIndex ?? 0;

  // Le Dashboard présente un unique snapshot officiel multi-modèles : les
  // observations locales restent auditables dans Fiabilité, sans modifier cette valeur.
  const currentHour = hours.find((h: any) => h.hour === nowHour) ?? hours[hours.length - 1] ?? null;
  const nextConditionChange = findNextConditionChange(hours, currentHour?.hour ?? nowHour);
  const nextWeatherAlert = getNextWeatherAlert(nextConditionChange);
  const officialCurrentTemp = currentHour?.temp ?? today?.tempMax ?? meteoAI?.tempMax ?? null;
  const currentTemp = officialCurrentTemp;
  const apparentTemp = currentHour?.apparentTemp ?? null;
  const currentUV = hours.find((h: any) => h.uvIndex != null && h.hour >= nowHour)?.uvIndex ?? null;
  const windDir = currentHour?.windDirection ?? null;
  const windSpeed = currentHour?.windSpeed ?? today?.windSpeed ?? meteoAI?.windSpeed ?? null;
  const currentCloudCover = currentHour?.cloudCover ?? today?.cloudCover ?? null;
  const nextRegimeChange = officialForecast?.nextRegimeChange ?? null;
  const modelFallbackContributors = locationWeather?.ultraLocal?.modelFallback?.contributors ?? [];

  return (
    <div className="min-h-screen bg-[#070b13] text-foreground">
      <div className="mx-auto max-w-2xl space-y-3 px-3 pb-3 pt-2 sm:space-y-6 sm:px-6 sm:py-8">

        {/* ── Header mobile fidèle à la référence ── */}
        <header className="sm:hidden">
          <div className="grid grid-cols-[48px_1fr_48px] items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowMobileNavigation((open) => !open)}
              aria-label="Ouvrir le menu MeteoAI"
              aria-expanded={showMobileNavigation}
              className="grid h-12 w-12 place-items-center rounded-full border border-slate-700/80 bg-slate-900/65 text-slate-100 shadow-[0_8px_22px_rgba(0,0,0,0.28)]"
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-center text-[34px] font-semibold tracking-tight text-white">
              Meteo<span className="text-blue-500">AI</span>
            </h1>
            <Link href="/favorites" aria-label="Ouvrir les réglages de lieux favoris" className="grid h-12 w-12 place-items-center justify-self-end rounded-full border border-slate-700/80 bg-slate-900/65 text-slate-100 shadow-[0_8px_22px_rgba(0,0,0,0.28)]">
              <Settings className="h-6 w-6" />
            </Link>
          </div>
          <div className="mt-5 flex items-start gap-3 px-1">
            <MapPin className="mt-1 h-8 w-8 shrink-0 fill-blue-500 text-blue-500" />
            <div>
              <p className="text-[29px] font-bold leading-none text-white">{selectedLocation?.name ?? "Hondeghem"}</p>
              <p className="mt-2 text-lg text-slate-400">{formatDashboardDate(officialForecast?.today ?? dash?.today)}</p>
            </div>
          </div>
          {showMobileNavigation && (
            <nav className="mt-4 space-y-3 rounded-2xl border border-slate-700/80 bg-slate-950/95 p-3 shadow-[0_18px_42px_rgba(0,0,0,0.38)]" aria-label="Navigation mobile MeteoAI">
              <div className="grid grid-cols-2 gap-2 text-sm font-semibold">
                <Link href="/" onClick={() => setShowMobileNavigation(false)} className="rounded-xl bg-blue-500/15 px-3 py-2.5 text-center text-blue-200">Dashboard</Link>
                <Link href="/ranking" onClick={() => setShowMobileNavigation(false)} className="rounded-xl bg-slate-900 px-3 py-2.5 text-center text-slate-200">Fiabilité</Link>
                <Link href="/history" onClick={() => setShowMobileNavigation(false)} className="rounded-xl bg-slate-900 px-3 py-2.5 text-center text-slate-200">Historique</Link>
                <Link href="/ai-lab" onClick={() => setShowMobileNavigation(false)} className="rounded-xl bg-slate-900 px-3 py-2.5 text-center text-slate-200">AI Lab</Link>
              </div>
              <FavoritesBar activeLocation={activeLocation} onLocationChange={handleLocationChange} prefetchedWeather={prefetchedWeather} />
            </nav>
          )}
        </header>

        {/* ── Header ── */}
        <div className="hidden items-center justify-between sm:flex">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
              MeteoAI
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground text-xs sm:text-sm">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span>{selectedLocation?.name ?? "Hondeghem, Nord"}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-card border border-border rounded-lg px-2.5 py-1.5">
            <Clock className="h-3 w-3" />
            <span>{formatDashboardDate(officialForecast?.today ?? dash?.today)}</span>
          </div>
        </div>

        {!authLoading && !user && (
          <div role="status" className="rounded-xl border border-blue-400/20 bg-blue-400/5 px-3 py-2 text-xs text-blue-100">
            {DASHBOARD_PREVIEW_MESSAGE}
          </div>
        )}

        {/* ── Favorites Bar ── */}
        <div className="hidden sm:block">
          <FavoritesBar
            activeLocation={activeLocation}
            onLocationChange={handleLocationChange}
            prefetchedWeather={prefetchedWeather}
          />
        </div>

        {/* ── Tendance : panneau autonome de la référence mobile ── */}
        {regime && (
          <section className="rounded-2xl border border-blue-400/60 bg-[linear-gradient(135deg,rgba(10,24,43,0.96),rgba(5,13,25,0.98))] p-3 shadow-[0_12px_30px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(147,197,253,0.12)] sm:hidden">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-blue-400">
              <Activity className="h-4 w-4" /> Tendance
            </div>
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setShowRegimeMenu((open) => !open)} aria-expanded={showRegimeMenu} aria-controls="regime-catalogue-mobile" className="flex min-w-0 items-center gap-2 text-left">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-950/35 text-3xl">{regime.emoji}</span>
                <span className="min-w-0"><strong className="block truncate text-xl text-white">{regime.label}</strong><span className="mt-0.5 block text-xs leading-tight text-slate-400">{regime.description}</span></span>
              </button>
              <div className="grid shrink-0 grid-cols-2 gap-1.5 text-xs">
                <span className="rounded-xl border border-orange-400/15 bg-slate-950/45 px-2 py-1.5 text-orange-300">☀ {Math.round(regime.weights.temp * 100)}%</span>
                <span className="rounded-xl border border-blue-400/15 bg-slate-950/45 px-2 py-1.5 text-blue-300">🌧 {Math.round(regime.weights.precip * 100)}%</span>
                <span className="rounded-xl border border-emerald-400/15 bg-slate-950/45 px-2 py-1.5 text-emerald-300">💨 {Math.round(regime.weights.wind * 100)}%</span>
                <span className="rounded-xl border border-violet-400/15 bg-slate-950/45 px-2 py-1.5 text-violet-300">☁ {Math.round(regime.weights.condition * 100)}%</span>
              </div>
            </div>
            {showRegimeMenu && (
              <div id="regime-catalogue-mobile" className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/45 p-2 text-[11px] text-slate-300">
                <p className="px-1 pb-2 text-xs font-semibold text-blue-200">Régime actif et pondérations détaillées</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: "Température", value: regime.weights.temp, color: "bg-orange-400" },
                    { label: "Précipitations", value: regime.weights.precip, color: "bg-blue-400" },
                    { label: "Vent", value: regime.weights.wind, color: "bg-emerald-400" },
                    { label: "Conditions", value: regime.weights.condition, color: "bg-violet-400" },
                  ].map((weight) => (
                    <div key={weight.label} className="rounded-lg bg-slate-900/80 p-2"><span>{weight.label} {Math.round(weight.value * 100)}%</span><div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-700"><div className={`h-full ${weight.color}`} style={{ width: `${Math.round(weight.value * 100)}%` }} /></div></div>
                  ))}
                </div>
                <p className="mt-2 px-1 text-[10px] text-slate-500">{regimeFreshnessLabel}</p>
              </div>
            )}
          </section>
        )}

        {/* ── Hero : Température actuelle + max/min ── */}
        <div className="relative overflow-hidden rounded-3xl border border-blue-500/65 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-4 shadow-[0_16px_38px_rgba(0,0,0,0.4),0_0_0_1px_rgba(59,130,246,0.12)] sm:rounded-2xl sm:border-slate-700 sm:p-6 sm:shadow-none">
          {/* Fond de la grande carte : condition de l’heure courante, puis repli régime/données. */}
          <img
            src={getDashboardWeatherImage({ condition: currentHour?.condition ?? today?.condition ?? meteoAI?.condition, regime: regime?.label, temperature: currentTemp ?? undefined, cloudCover: currentCloudCover ?? undefined, precipitation: currentHour?.precipitation ?? (today as any)?.precipitation ?? undefined, windSpeed: windSpeed ?? undefined })}
            alt="Paysage météo"
            className="absolute inset-0 h-full w-full object-cover opacity-45 pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/52 to-slate-950/88 pointer-events-none" />
          <div className="relative">
            {/* Source label + Regime badge */}
            <div className={`${dashboardTemperatureLayout.mobileHeader} hidden sm:flex`}>
              <div className="flex min-w-0 items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-primary sm:hidden">Tendance</span>
                <span className="hidden text-xs font-medium text-primary sm:inline">Tendance · {regimeSourceLabel}</span>
                {selectedLocation && <span className="hidden text-xs text-primary/60 sm:inline">· {selectedLocation.name}</span>}
              </div>
              <button
                type="button"
                onClick={refreshCurrentWeather}
                disabled={isRefreshing}
                className={dashboardTemperatureLayout.refreshButton}
                aria-label="Actualiser la météo maintenant"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
                Actualiser
              </button>
            </div>

            {/* ── Regime badge ── */}
            {regime && (
              <div className="mb-3 hidden rounded-xl border border-slate-600/50 bg-slate-800/60 px-3 py-2 sm:block">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowRegimeMenu((open) => !open)}
                    aria-expanded={showRegimeMenu}
                    aria-controls="regime-catalogue"
                    className="-mx-1 flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-950/35 text-base">{regime.emoji}</span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 text-xs font-semibold text-white">{regime.label} {showRegimeMenu ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-300" />}</p>
                      <p className="text-xs text-muted-foreground leading-tight hidden sm:block">{regime.description}</p>
                      <p className="mt-0.5 text-[10px] text-primary/80 sm:hidden">Voir les 20 régimes</p>
                    </div>
                  </button>
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
                {showRegimeMenu && (
                  <div id="regime-catalogue" className="mt-2 rounded-lg border border-slate-600/35 bg-slate-950/30 p-2" aria-label="Tous les régimes météo possibles">
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">Tous les régimes</p>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setExpandedRegimeIds(allRegimesExpanded ? [] : allRegimeIds)}
                          aria-label={allRegimesExpanded ? "Tout réduire les régimes" : "Tout développer les régimes"}
                          className="min-h-7 rounded-md border border-primary/30 bg-primary/10 px-2 text-[9px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {allRegimesExpanded ? "Tout réduire" : "Tout développer"}
                        </button>
                        <span className="rounded-full border border-slate-600/50 bg-slate-900/60 px-1.5 py-0.5 text-[9px] text-slate-400">{regimeCatalogue.length || 20}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1 sm:grid-cols-2">
                      {regimeCatalogue.map((candidate: any) => {
                        const isActive = candidate.id === primaryRegimeId;
                        const isExpanded = expandedRegimeIds.includes(candidate.id);
                        const detailsId = `regime-weights-${candidate.id}`;
                        const weights = candidate?.weights && typeof candidate.weights === "object" ? candidate.weights : null;
                        const weightRows = [
                          { label: "Temp.", value: weights?.temp, color: "bg-orange-400" },
                          { label: "Pluie", value: weights?.precip, color: "bg-blue-400" },
                          { label: "Vent", value: weights?.wind, color: "bg-cyan-400" },
                          { label: "Cond.", value: weights?.condition, color: "bg-violet-400" },
                        ];
                        return (
                          <div key={candidate.id} className={`min-w-0 rounded-md text-[10px] ${isActive ? "bg-primary/15 text-primary ring-1 ring-primary/25" : "bg-slate-900/25 text-slate-300"}`}>
                            <button
                              type="button"
                              onClick={() => setExpandedRegimeIds((current) => current.includes(candidate.id) ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])}
                              aria-expanded={isExpanded}
                              aria-controls={detailsId}
                              aria-label={`${isExpanded ? "Replier" : "Afficher"} les pondérations de ${candidate.label}`}
                              className="flex w-full min-w-0 items-start gap-1.5 px-1.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <span className="pt-px">{candidate.emoji}</span>
                              <span className="min-w-0 flex-1"><strong className="block truncate">{candidate.label}{isActive ? " · actif" : ""}</strong><span className="mt-0.5 hidden leading-snug text-slate-400 sm:block">{candidate.description}</span></span>
                              {isExpanded ? <ChevronUp className="mt-px h-3 w-3 shrink-0" aria-hidden="true" /> : <ChevronDown className="mt-px h-3 w-3 shrink-0 text-slate-500" aria-hidden="true" />}
                            </button>
                            {isExpanded && (
                              <div id={detailsId} className="mx-1.5 mb-1.5 grid grid-cols-2 gap-x-2 gap-y-1.5 border-t border-slate-700/40 pt-1.5 text-[8px] leading-tight text-slate-400">
                                {weightRows.map((weight) => {
                                  const percent = typeof weight.value === "number" && Number.isFinite(weight.value) ? Math.max(0, Math.min(100, Math.round(weight.value * 100))) : 0;
                                  return (
                                    <div key={weight.label} className="min-w-0">
                                      <div className="mb-0.5 flex items-center justify-between gap-1">
                                        <span>{weight.label}</span>
                                        <span className="font-medium text-slate-300">{formatRegimeWeight(weight.value)}</span>
                                      </div>
                                      <div className="h-1 overflow-hidden rounded-full bg-slate-700/70" role="progressbar" aria-label={`Poids ${weight.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                                        <div className={`h-full rounded-full ${weight.color}`} style={{ width: `${percent}%` }} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <p className="mt-1 text-[10px] text-slate-400">{regimeFreshnessLabel}<span className="hidden sm:inline">{regimeSourceUpdatedAt ? ` · source à ${regimeSourceUpdatedAt} (Europe/Paris)` : ""}</span></p>
                {modelIndicator && (
                  <button
                    type="button"
                    onClick={() => setShowFusionDetails((open) => !open)}
                    aria-expanded={showFusionDetails}
                    aria-controls="fusion-explication"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-blue-400/25 bg-blue-400/10 px-2 py-1 text-left text-[10px] text-blue-100"
                  >
                    <Activity className="h-3 w-3 text-blue-300" />
                    <span className="hidden sm:inline">
                      {modelIndicator.mode === "single_model" ? "Modèle utilisé" : `Fusion ${modelIndicator.modelCount} modèles`} : <strong>{modelIndicator.primaryModel}</strong>
                      {modelIndicator.mode === "multi_model" ? ` · poids moyen ${Math.round(modelIndicator.primaryWeight * 100)}%` : ""}
                    </span>
                    <span className="sm:hidden">{modelIndicator.mode === "single_model" ? "Modèle" : "Fusion"} · <strong>{modelIndicator.primaryModel}</strong>{modelIndicator.mode === "multi_model" ? ` ${Math.round(modelIndicator.primaryWeight * 100)}%` : ""}</span>
                    {showFusionDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
                {showFusionDetails && modelIndicator && (
                  <div id="fusion-explication" className="mt-2 rounded-lg border border-blue-400/20 bg-slate-950/45 p-2 text-[10px] text-slate-200">
                    <p className="flex items-start gap-1.5 font-medium text-blue-100"><Info className="mt-0.5 h-3 w-3 shrink-0 text-blue-300" />Comment est calculée la fusion officielle ?</p>
                    <p className="mt-1 leading-relaxed text-slate-400">{fusionTrace?.method ?? "La trace détaillée du snapshot n’est pas encore disponible."} Le pourcentage d’AROME est son poids appliqué, pas une mesure de station.</p>
                    {fusionParameters.some((parameter) => parameter.sources.length > 0) && (
                      <div className="mt-2 space-y-1.5">
                        {fusionParameters.filter((parameter) => parameter.sources.length > 0).map((parameter) => (
                          <div key={parameter.key}>
                            <span className="text-slate-400">{parameter.label} : </span>
                            {parameter.sources.map((source) => `${source.name} ${Math.round(source.finalWeight * 100)}%`).join(" · ")}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-slate-500">Les pondérations varient selon les traces archivées du snapshot et ne modifient pas les observations Netatmo.</p>
                  </div>
                )}
              </div>
            )}

            {nextWeatherAlert && (
              <div className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 ${
                nextWeatherAlert.kind === "thunderstorm"
                  ? "border-red-400/50 bg-red-500/15 text-red-100"
                  : nextWeatherAlert.kind === "wind"
                    ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                    : "border-blue-400/50 bg-blue-500/15 text-blue-100"
              }`}>
                <span className="animate-pulse"><MeteoIcon name={nextWeatherAlert.icon} size={24} /></span>
                <div className="min-w-0">
                  <p className="text-xs font-bold">{nextWeatherAlert.title}</p>
                  <p className="text-[11px] opacity-90">{nextWeatherAlert.detail}</p>
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
            <div className="flex items-start gap-3 sm:gap-6">
              {/* Icon — current hour condition (not day) */}
              <div className="w-28 shrink-0 pt-1 sm:w-auto sm:pt-0">
                <MeteoIcon name={getIconNameFromCondition(currentHour?.condition ?? today?.condition ?? meteoAI?.condition ?? null)} size={112} className="sm:hidden" />
                <MeteoIcon name={getIconNameFromCondition(currentHour?.condition ?? today?.condition ?? meteoAI?.condition ?? null)} size={64} className="hidden sm:block" />
              </div>

              <div className={dashboardTemperatureLayout.content}>
                {/* Big current temp */}
                <div className="min-w-0">
                  <p className={dashboardTemperatureLayout.currentValue}>
                    {currentTemp != null ? currentTemp.toFixed(1) : "—"}°
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {(currentHour?.condition ?? today?.condition ?? meteoAI?.condition ?? "Condition indisponible") + " actuellement"}
                  </p>
                  <p className="mt-1 text-[11px] text-sky-200/90">Prévision officielle consolidée</p>
                  {(nextRegimeChange ?? nextConditionChange) && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-sky-300">
                      <Clock className="h-3 w-3" />
                      <span className="sm:hidden">Prochain : {nextRegimeChange
                        ? `${nextRegimeChange.emoji} ${nextRegimeChange.label} · ${nextRegimeChange.hour}`
                        : `${nextConditionChange!.condition} · ${nextConditionChange!.hour}`}</span>
                      <span className="hidden sm:inline">Prochain changement de régime : {nextRegimeChange
                        ? `${nextRegimeChange.emoji} ${nextRegimeChange.label} à ${nextRegimeChange.hour}`
                        : `${nextConditionChange!.condition} à ${nextConditionChange!.hour}`}</span>
                    </p>
                  )}
                </div>

                {/* Max / Min */}
                <div className={dashboardTemperatureLayout.extremes}>
                  <div className="flex items-center justify-end gap-1 sm:gap-1.5">
                    <span className="text-[10px] sm:text-xs font-medium text-orange-400 uppercase tracking-normal sm:tracking-wide">max</span>
                    <span className={`${dashboardTemperatureLayout.extremeValue} text-orange-300`}>
                      {today?.tempMax != null ? Number(today.tempMax).toFixed(1) : meteoAI?.tempMax != null ? Number(meteoAI.tempMax).toFixed(1) : "—"}°
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1 sm:gap-1.5">
                    <span className="text-[10px] sm:text-xs font-medium text-blue-400 uppercase tracking-normal sm:tracking-wide">min</span>
                    <span className={`${dashboardTemperatureLayout.extremeValue} text-blue-300`}>
                      {today?.tempMin != null ? Number(today.tempMin).toFixed(1) : meteoAI?.tempMin != null ? Number(meteoAI.tempMin).toFixed(1) : "—"}°
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-4 divide-x divide-slate-700/60 rounded-xl bg-slate-950/40 py-2 sm:hidden">
              <div className="px-2 text-center"><p className="text-[10px] text-slate-400">Ressenti</p><p className="mt-0.5 text-base font-semibold text-white">{apparentTemp != null ? `${apparentTemp.toFixed(1)}°` : currentTemp != null ? `${currentTemp.toFixed(1)}°` : "—"}</p></div>
              <div className="px-2 text-center"><p className="text-[10px] text-slate-400">Humidité</p><p className="mt-0.5 text-base font-semibold text-white">{currentHour?.humidity ?? today?.humidity ?? "—"}%</p></div>
              <div className="px-2 text-center"><p className="text-[10px] text-slate-400">Vent</p><p className="mt-0.5 text-base font-semibold text-white">{windSpeed != null ? `${windSpeed.toFixed(0)} km/h` : "—"}</p></div>
              <div className="px-2 text-center"><p className="text-[10px] text-slate-400">Pression</p><p className="mt-0.5 text-base font-semibold text-white">{currentHour?.pressure != null ? `${Number(currentHour.pressure).toFixed(0)} hPa` : "—"}</p></div>
            </div>

            {/* Apparent temp + UV + Wind rose highlight row */}
            <div className={`${dashboardTemperatureLayout.compactMetrics} hidden border-t border-slate-700/60 sm:grid`}>
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
            <div className={`${dashboardTemperatureLayout.compactMetrics} hidden border-t border-slate-700 sm:grid`}>
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
                  <Activity className="h-3 w-3" />Confiance prévision
                </p>
                <p className={`text-base sm:text-lg font-semibold ${stabilityColor(forecastConfidence)}`}>
                  {Math.round(forecastConfidence)}%
                </p>
                <p className="text-[10px] text-muted-foreground">Stabilité {Math.round(stabilityIndex)}%</p>
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
                <p className="text-base sm:text-lg font-semibold">{currentCloudCover ?? "—"}%</p>
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

        {/* ── Link to details page ── */}
        <a href="/details" className="hidden min-h-10 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-2 hover:bg-primary/20 transition-colors sm:flex">
          <MeteoIcon name="chevron_right" size={16} />
          <span className="text-xs font-semibold text-primary">Voir les prévisions détaillées</span>
          <span className="text-primary text-xs">→</span>
        </a>

        <div className="grid min-h-14 grid-cols-2 gap-1 rounded-xl border border-slate-700 bg-slate-950/60 p-1 sm:hidden" aria-label="Mode de contexte local">
          <button type="button" onClick={() => handleModeChange("local")} className={`min-h-11 rounded-xl text-sm font-semibold ${localMode !== "ultra-local" ? "bg-blue-600 text-white" : "text-slate-400"}`}>⌖ Local</button>
          <button type="button" onClick={() => handleModeChange("ultra-local")} className={`min-h-11 rounded-xl text-sm font-semibold ${localMode === "ultra-local" ? "bg-blue-600 text-white" : "text-slate-400"}`}>◎ Ultra-local</button>
        </div>

        <div className="hidden min-h-11 items-center gap-2 rounded-xl border border-border bg-card p-2 sm:flex" aria-label="Mode de contexte local">
          <Radio className="h-4 w-4 shrink-0 text-primary" />
          <span className="mr-auto text-xs font-semibold text-muted-foreground">Contexte</span>
          <div className="flex gap-1">
            {(["standard", "local", "ultra-local"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${localMode === mode ? "border-primary/50 bg-primary/15 text-primary" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {mode === "ultra-local" ? "Ultra-local" : mode === "local" ? "Local" : "Officiel"}
              </button>
            ))}
          </div>
        </div>

        {locationWeather?.ultraLocal && (
          <section className="rounded-2xl border border-emerald-400/35 bg-[linear-gradient(135deg,rgba(4,53,47,0.72),rgba(4,24,31,0.9))] p-3 shadow-[inset_0_1px_0_rgba(110,231,183,0.12)] sm:hidden" aria-label="Observation locale">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-full border border-emerald-400/25 bg-emerald-400/10"><Thermometer className="h-6 w-6 text-emerald-300" /></div>
              <div className="min-w-0 flex-1"><p className="text-3xl font-bold text-white">{locationWeather.ultraLocal.temperature != null ? `${Number(locationWeather.ultraLocal.temperature).toFixed(1)}°` : "—"}</p><p className="text-sm text-emerald-300">Température locale</p><p className="mt-0.5 truncate text-[11px] text-slate-400">{locationWeather.ultraLocal.stationCount > 0 ? `${locationWeather.ultraLocal.stationCount} station${locationWeather.ultraLocal.stationCount > 1 ? "s" : ""} physique${locationWeather.ultraLocal.stationCount > 1 ? "s" : ""}` : "Repli de modèle explicitement qualifié"}</p></div>
              <div className="text-right text-xs"><p className="text-slate-400">Confiance</p><p className="mt-0.5 font-semibold text-emerald-200">{locationWeather.ultraLocal.confidenceScore}%</p></div>
            </div>
            <p className="mt-2 text-[10px] text-slate-400">{netatmoStatusLabel[locationWeather.netatmo?.status ?? "not_connected"]}</p>
          </section>
        )}

        {localMode !== "standard" && locationWeather?.ultraLocal && (
          <section className="hidden space-y-2 sm:block" aria-labelledby="local-context-title">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 id="local-context-title" className="text-sm font-semibold text-slate-100">Moyenne locale pondérée</h2>
              <span className="text-[10px] text-muted-foreground">n’influence pas la prévision officielle</span>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl font-bold text-emerald-300">{locationWeather.ultraLocal.temperature != null ? `${Number(locationWeather.ultraLocal.temperature).toFixed(1)}°C` : "—"}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {locationWeather.ultraLocal.stationCount > 0
                      ? `${locationWeather.ultraLocal.stationCount} station${locationWeather.ultraLocal.stationCount > 1 ? "s" : ""} physique${locationWeather.ultraLocal.stationCount > 1 ? "s" : ""} admise${locationWeather.ultraLocal.stationCount > 1 ? "s" : ""} pour ce calcul`
                      : `Repli explicite sur ${locationWeather.ultraLocal.modelFallback?.modelCount ?? 0} modèle${locationWeather.ultraLocal.modelFallback?.modelCount === 1 ? "" : "s"}`}
                  </p>
                </div>
                <span className="text-xs text-emerald-200">Confiance observation locale {locationWeather.ultraLocal.confidenceScore}%</span>
              </div>
              {locationWeather.ultraLocal.stationsUsed.length > 0 ? (
                <div className="mt-3 space-y-1.5 border-t border-emerald-500/15 pt-2">
                  {locationWeather.ultraLocal.stationsUsed.slice(0, 4).map((station: any) => (
                    <div key={station.stationId} className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                      <span className="min-w-0 truncate">{station.name} · {station.distanceKm.toFixed(1)} km</span>
                      <span className="shrink-0 text-emerald-200">{station.adjustedTemperature?.toFixed(1) ?? "—"}° · {Math.round(station.weight * 100)}%</span>
                    </div>
                  ))}
                  <p className="pt-1 text-[10px] leading-relaxed text-slate-400">Contrôles calculés à cette requête : distance, fraîcheur, fiabilité, cohérence et altitude si renseignée. La stabilité longue durée exige un historique et n’est pas déduite de ce seul affichage.</p>
                </div>
              ) : modelFallbackContributors.length > 0 ? (
                <p className="mt-3 border-t border-emerald-500/15 pt-2 text-[10px] leading-relaxed text-slate-400">Contributeurs de repli : {modelFallbackContributors.map((model: any) => `${model.name} ${Math.round(Number(model.weight) * 100)}%`).join(" · ")}. Aucun modèle n’est présenté comme station.</p>
              ) : null}
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{netatmoStatusLabel[locationWeather.netatmo?.status ?? "not_connected"]}</p>
            </div>
            <LocalOfficialDeltaChart points={localOfficialHistory} />
          </section>
        )}

        {/* Hourly Chart */}
        <div className="overflow-hidden rounded-2xl border border-blue-500/30 bg-[#07111f] p-0 shadow-[inset_0_1px_0_rgba(96,165,250,0.08)] sm:border-border sm:bg-card sm:shadow-none">
          {officialLoading ? (
            <div className="h-56 bg-muted rounded-xl animate-pulse" />
          ) : hours.length > 0 ? (
            <Suspense fallback={<div className="h-56 bg-muted rounded-xl animate-pulse" />}>
              <HourlyChart hours={hours} locationName={activeLocation?.name} />
            </Suspense>
          ) : (
            <p className="text-sm text-muted-foreground">Données horaires indisponibles.</p>
          )}
        </div>

        {/* ── 15-day chart enriched ── */}
        <div className="hidden overflow-hidden rounded-2xl border border-border bg-card p-0 sm:block">
          {officialLoading ? (
            <div className="h-72 bg-muted rounded-xl animate-pulse" />
          ) : days.length > 0 ? (
            <Suspense fallback={<div className="h-72 bg-muted rounded-xl animate-pulse" />}>
              <FifteenDayChart days={days} locationName={activeLocation?.name} />
            </Suspense>
          ) : null}
        </div>

      </div>
    </div>
  );
}
