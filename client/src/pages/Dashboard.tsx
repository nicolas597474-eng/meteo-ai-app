import { trpc } from "@/lib/trpc";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Droplets, Wind, Activity, MapPin, Clock, Eye, Thermometer, Sun, Radio, RefreshCw } from "lucide-react";
import { FavoritesBar } from "@/components/FavoritesBar";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "@/contexts/LocationContext";
import { getDashboardWeatherImage } from "@/lib/weatherImages";
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

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { activeLocation: contextLocation, setActiveLocation: setContextLocation } = useLocation();
  const [activeLocation, setActiveLocation] = useState<{ lat: number; lon: number; name: string; radiusKm?: number; favoriteId?: number; localMode?: "standard" | "local" | "ultra-local" } | null>(getStoredLocation);
  const [localMode, setLocalMode] = useState<"standard" | "local" | "ultra-local">(getStoredLocalMode);
  const [hasWaitTimedOut, setHasWaitTimedOut] = useState(false);
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
  const netatmoStatusLabel: Record<string, string> = {
    live: "Netatmo : relevés directs authentifiés",
    fresh_cache: "Netatmo : cache authentifié récent (service temporairement indisponible)",
    connected_empty: "Netatmo : connecté, aucune station exploitable dans le rayon",
    temporarily_unavailable: "Netatmo : service temporairement indisponible",
    not_connected: "Netatmo : aucune autorisation active pour cette session",
  };
  const modelIndicator = dash?.modelIndicator ?? null;

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
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-3 py-3 space-y-3 sm:px-6 sm:py-8 sm:space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
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
            <span>{officialForecast?.today ?? dash?.today}</span>
          </div>
        </div>

        {!authLoading && !user && (
          <div role="status" className="rounded-xl border border-blue-400/20 bg-blue-400/5 px-3 py-2 text-xs text-blue-100">
            {DASHBOARD_PREVIEW_MESSAGE}
          </div>
        )}

        {/* ── Favorites Bar ── */}
        <FavoritesBar
          activeLocation={activeLocation}
          onLocationChange={handleLocationChange}
          prefetchedWeather={prefetchedWeather}
        />

        {/* ── Hero : Température actuelle + max/min ── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-4 sm:p-6">
          {/* Fond de la grande carte : condition de l’heure courante, puis repli régime/données. */}
          <img
            src={getDashboardWeatherImage({ condition: currentHour?.condition ?? today?.condition ?? meteoAI?.condition, regime: regime?.label, temperature: currentTemp ?? undefined, cloudCover: currentCloudCover ?? undefined, precipitation: currentHour?.precipitation ?? (today as any)?.precipitation ?? undefined, windSpeed: windSpeed ?? undefined })}
            alt="Paysage météo"
            className="absolute inset-0 h-full w-full object-cover opacity-45 pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/52 to-slate-950/88 pointer-events-none" />
          <div className="relative">
            {/* Source label + Regime badge */}
            <div className={dashboardTemperatureLayout.mobileHeader}>
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
                <p className="mt-1 text-[10px] text-slate-400">{regimeFreshnessLabel}<span className="hidden sm:inline">{regimeSourceUpdatedAt ? ` · source à ${regimeSourceUpdatedAt} (Europe/Paris)` : ""}</span></p>
                {modelIndicator && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-blue-400/25 bg-blue-400/10 px-2 py-1 text-[10px] text-blue-100">
                    <Activity className="h-3 w-3 text-blue-300" />
                    <span className="hidden sm:inline">
                      {modelIndicator.mode === "single_model" ? "Modèle utilisé" : `Fusion ${modelIndicator.modelCount} modèles`} : <strong>{modelIndicator.primaryModel}</strong>
                      {modelIndicator.mode === "multi_model" ? ` · poids moyen ${Math.round(modelIndicator.primaryWeight * 100)}%` : ""}
                    </span>
                    <span className="sm:hidden">{modelIndicator.mode === "single_model" ? "Modèle" : "Fusion"} · <strong>{modelIndicator.primaryModel}</strong>{modelIndicator.mode === "multi_model" ? ` ${Math.round(modelIndicator.primaryWeight * 100)}%` : ""}</span>
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
              <div className="w-14 shrink-0 pt-1 sm:w-auto sm:pt-0">
                <MeteoIcon name={getIconNameFromCondition(currentHour?.condition ?? today?.condition ?? meteoAI?.condition ?? null)} size={56} className="sm:hidden" />
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

            {/* Apparent temp + UV + Wind rose highlight row */}
            <div className={`${dashboardTemperatureLayout.compactMetrics} border-t border-slate-700/60`}>
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
            <div className={`${dashboardTemperatureLayout.compactMetrics} border-t border-slate-700`}>
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
        <a href="/details" className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-2 hover:bg-primary/20 transition-colors">
          <MeteoIcon name="chevron_right" size={16} />
          <span className="text-xs font-semibold text-primary">Voir les prévisions détaillées</span>
          <span className="text-primary text-xs">→</span>
        </a>

        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card p-2" aria-label="Mode de contexte local">
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

        {localMode !== "standard" && locationWeather?.ultraLocal && (
          <section className="space-y-2" aria-labelledby="local-context-title">
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
        <div className="bg-card border border-border rounded-2xl p-0 overflow-hidden">
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
        <div className="bg-card border border-border rounded-2xl p-0 overflow-hidden">
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
