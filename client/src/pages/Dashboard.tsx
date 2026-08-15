import { trpc } from "@/lib/trpc";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Droplets, Wind, Activity, Clock, CalendarDays, Eye, Thermometer, Sun, Radio, ChevronDown, ChevronUp, Info } from "lucide-react";
import { FavoritesBar } from "@/components/FavoritesBar";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "@/contexts/LocationContext";
import { getDashboardWeatherImage } from "@/lib/weatherImages";
import { formatDashboardCompactDate } from "@/lib/dashboardDate";
import { AlertBadge, isDangerousRegime } from "@/components/AlertBadge";
import { MeteoIcon, getIconNameFromCondition } from "@/components/MeteoIcon";
import { findNextConditionChange, getNextWeatherAlert } from "@/lib/weatherCondition";
import { LocalOfficialDeltaChart } from "@/components/LocalOfficialDeltaChart";
import { dashboardTemperatureLayout } from "@/lib/dashboardTemperatureLayout";
import { getExtremeTemperatureTone } from "@/lib/extremeTemperatureTone";
import { DASHBOARD_LOAD_TIMEOUT_MS, DASHBOARD_PREVIEW_MESSAGE } from "@/lib/dashboardLoadState";
import { BackToTopButton } from "@/components/BackToTopButton";
import { WeatherStatusBadge } from "@/components/weather/WeatherStatusBadge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EnvironmentalPanels } from "@/components/EnvironmentalPanels";

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

  const needsLocalStations = localMode !== "standard";
  const { data: locationWeather } = trpc.favorites.getLocationWeather.useQuery(
    queryInput,
    { enabled: !!selectedLocation && needsLocalStations, staleTime: 2 * 60 * 1000 }
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
  const { data: dash, isFetching: dashFetching, refetch: refetchDashboard } = trpc.weather.getDashboard.useQuery(
    coordsInput,
    {
      staleTime: 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  );
  // Réponse officielle consolidée : la même source alimente désormais Dashboard
  // et Détails pour les heures, les jours et les indices de confiance.
  const { data: officialForecast, isLoading: officialLoading, isError: officialError, isFetching: officialFetching, refetch: refetchOfficialForecast, dataUpdatedAt: officialDataUpdatedAt } = trpc.weather.getDetailedForecast.useQuery(
    coordsInput,
    {
      staleTime: 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 2,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
    }
  );
  const { data: hourlySnapshot, isLoading: hourlyLoading, isError: hourlyError, refetch: refetchHourlySnapshot } = trpc.weather.getHourlyForecast.useQuery(
    coordsInput,
    {
      staleTime: 2 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 2,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
    }
  );
  const { data: environmentalData, isFetching: environmentalFetching } = trpc.weather.getEnvironmentalSnapshot.useQuery(
    coordsInput,
    { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false, retry: 1 }
  );
  const { data: localOfficialHistory } = trpc.weather.getLocalOfficialDeltaHistory.useQuery(
    coordsInput, { staleTime: 5 * 60 * 1000 }
  );
  const { data: regimeCatalogue = [] } = trpc.weather.getRegimeCatalogue.useQuery(
    undefined, { staleTime: 60 * 60 * 1000 }
  );

  const isLoading = officialLoading && hourlyLoading;
  const isError = officialError && hourlyError;
  const refreshCurrentWeather = async () => {
    setHasWaitTimedOut(false);
    await Promise.all([refetchDashboard(), refetchOfficialForecast(), refetchHourlySnapshot()]);
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
            <h2 className="text-lg font-semibold">Prévisions officielles en cours de chargement</h2>
            <p className="mt-2 text-sm text-muted-foreground">Les données horaires restent en attente de la source météo. Aucune donnée estimée n’est affichée.</p>
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
  const hours: any[] = hourlySnapshot?.hours ?? officialForecast?.hours ?? (lw ? lw.hourly : []);
  const nowHour = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).slice(0, 2) + ":00";
  const panelDate = formatDashboardCompactDate(officialForecast?.today ?? dash?.today);
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
  const maxTemperature = today?.tempMax ?? meteoAI?.tempMax ?? null;
  const minTemperature = today?.tempMin ?? meteoAI?.tempMin ?? null;
  const maxTemperatureTone = getExtremeTemperatureTone("max", maxTemperature);
  const minTemperatureTone = getExtremeTemperatureTone("min", minTemperature);
  const apparentTemp = currentHour?.apparentTemp ?? null;
  const currentUV = hours.find((h: any) => h.uvIndex != null && h.hour >= nowHour)?.uvIndex ?? null;
  const windDir = currentHour?.windDirection ?? null;
  const windSpeed = currentHour?.windSpeed ?? today?.windSpeed ?? meteoAI?.windSpeed ?? null;
  const currentCloudCover = currentHour?.cloudCover ?? today?.cloudCover ?? null;
  const nextRegimeChange = officialForecast?.nextRegimeChange ?? null;
  const modelFallbackContributors = locationWeather?.ultraLocal?.modelFallback?.contributors ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl space-y-3 px-3 pb-3 pt-1 sm:space-y-6 sm:px-6 sm:py-8">

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
            className="absolute inset-0 h-full w-full object-cover opacity-70 pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/58 via-slate-950/34 to-slate-950/82 pointer-events-none" />
          <div className="relative">
            {/* Source label + Regime badge */}
            <div className="mb-2 flex justify-center sm:mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/35 bg-slate-950/50 px-3 py-1.5 text-sm font-bold text-slate-50 shadow-[0_0_16px_rgba(56,189,248,0.16)]">
                <CalendarDays className="h-4 w-4 text-sky-300" aria-hidden="true" />
                {panelDate}
              </span>
            </div>

            {/* ── Regime badge ── */}
            {regime && (
              <div className="mb-2 rounded-xl border border-slate-600/50 bg-slate-800/60 px-3 py-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowRegimeMenu((open) => !open)}
                    aria-expanded={showRegimeMenu}
                    aria-controls="regime-catalogue"
                    className="-mx-1 flex min-w-0 items-center gap-2 rounded-lg px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
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
                <p className="mt-0.5 hidden text-[10px] font-medium text-slate-300 sm:block">{regimeFreshnessLabel}{regimeSourceUpdatedAt ? ` · source à ${regimeSourceUpdatedAt} (Europe/Paris)` : ""}</p>
                {modelIndicator && (
                  <Tooltip><TooltipTrigger asChild><button
                    type="button"
                    onClick={() => setShowFusionDetails((open) => !open)}
                    aria-expanded={showFusionDetails}
                    aria-controls="fusion-explication"
                    className="mt-1 inline-flex max-w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                  >
                    <WeatherStatusBadge dense tone="info" icon={<Activity className="h-3 w-3" />} label={modelIndicator.mode === "single_model" ? "Modèle utilisé" : `Fusion · ${modelIndicator.modelCount} modèles`} value={modelIndicator.mode === "multi_model" ? `${modelIndicator.primaryModel} · ${Math.round(modelIndicator.primaryWeight * 100)}%` : modelIndicator.primaryModel} />
                    {showFusionDetails ? <ChevronUp className="ml-1 h-3 w-3 text-sky-200" /> : <ChevronDown className="ml-1 h-3 w-3 text-sky-200" />}
                  </button></TooltipTrigger><TooltipContent side="top" sideOffset={8} className="max-w-64 border border-slate-600 bg-[#101622] px-3 py-2 text-[11px] leading-relaxed text-slate-100">Indique le ou les modèles qui contribuent à la prévision officielle du snapshot en cours. Le pourcentage est un poids de fusion, pas une mesure de station.</TooltipContent></Tooltip>
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
                  <p className="mt-1 text-base font-medium text-slate-100/90 sm:text-lg">
                    {(currentHour?.condition ?? today?.condition ?? meteoAI?.condition ?? "Condition indisponible") + " actuellement"}
                  </p>
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
                  <div className={`flex items-center justify-end gap-1 rounded-lg border px-1.5 py-0.5 sm:gap-1.5 ${maxTemperatureTone.container}`}>
                    <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-normal sm:tracking-wide ${maxTemperatureTone.label}`}>max</span>
                    <span className={`${dashboardTemperatureLayout.extremeValue} font-black ${maxTemperatureTone.value}`}>
                      {maxTemperature != null ? Number(maxTemperature).toFixed(1) : "—"}°
                    </span>
                  </div>
                  <div className={`flex items-center justify-end gap-1 rounded-lg border px-1.5 py-0.5 sm:gap-1.5 ${minTemperatureTone.container}`}>
                    <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-normal sm:tracking-wide ${minTemperatureTone.label}`}>min</span>
                    <span className={`${dashboardTemperatureLayout.extremeValue} font-black ${minTemperatureTone.value}`}>
                      {minTemperature != null ? Number(minTemperature).toFixed(1) : "—"}°
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
                  <Wind className="h-3 w-3" />Vent max
                </p>
                <p className="text-base sm:text-lg font-semibold">{today?.windSpeed ?? meteoAI?.windSpeed ?? "—"} km/h</p>
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
                  <Activity className="h-3 w-3" />Confiance prévision
                </p>
                <p className={`text-base sm:text-lg font-semibold ${stabilityColor(forecastConfidence)}`}>
                  {Math.round(forecastConfidence)}%
                </p>
                <p className="text-[10px] text-muted-foreground">Stabilité {Math.round(stabilityIndex)}%</p>
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
                <WeatherStatusBadge compact tone="success" label="Confiance locale" value={`${locationWeather.ultraLocal.confidenceScore}%`} pulse={locationWeather.ultraLocal.stationCount > 0} description="Mesure l’accord et la qualité des observations locales utilisées pour le contexte local. Elle ne remplace pas la confiance de la prévision officielle." />
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
        <div className="overflow-visible rounded-[22px]">
          {hourlyLoading ? (
            <div className="h-56 bg-muted rounded-xl animate-pulse" />
          ) : hours.length > 0 ? (
            <Suspense fallback={<div className="h-56 bg-muted rounded-xl animate-pulse" />}>
              <HourlyChart hours={hours} locationName={activeLocation?.name} />
            </Suspense>
          ) : (
            <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 px-4 py-5 text-center">
              <p className="text-sm font-medium text-blue-100">Données horaires temporairement indisponibles.</p>
              <p className="mt-1 text-xs text-muted-foreground">La dernière prévision officielle n’a pas encore répondu. Aucune donnée n’est inventée.</p>
              <button type="button" onClick={() => void Promise.all([refetchHourlySnapshot(), refetchOfficialForecast()])} className="mt-3 min-h-10 rounded-md border border-primary/50 px-3 text-xs font-semibold text-primary">Réessayer les heures</button>
            </div>
          )}
        </div>

        {/* ── 15-day chart enriched ── */}
        <div className="overflow-visible rounded-[22px]">
          {officialLoading ? (
            <div className="h-72 bg-muted rounded-xl animate-pulse" />
          ) : days.length > 0 ? (
            <Suspense fallback={<div className="h-72 bg-muted rounded-xl animate-pulse" />}>
              <FifteenDayChart days={days} locationName={activeLocation?.name} />
            </Suspense>
          ) : null}
        </div>

        <EnvironmentalPanels data={environmentalData} isLoading={environmentalFetching} />

      </div>
      <BackToTopButton />
    </div>
  );
}
