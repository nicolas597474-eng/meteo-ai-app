import { trpc } from "@/lib/trpc";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Droplets, Wind, Activity, Clock, CalendarDays, Eye, Thermometer, Sun, Radio, ChevronDown, ChevronUp, X } from "lucide-react";
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
import { ForecastProvenanceBadge } from "@/components/weather/ForecastProvenanceBadge";
import { ForecastMetricDefinitions } from "@/components/weather/ForecastMetricDefinitions";
import { EnvironmentalPanels } from "@/components/EnvironmentalPanels";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative h-8 w-8">
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
      <p className="text-[10px] font-bold text-blue-300">{cardinalDir(dir)}</p>
      {speed != null && <p className="text-[10px] text-muted-foreground">{speed}km/h</p>}
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
      <span className={`text-sm sm:text-lg font-bold ${level.color}`}>{Math.round(uv)}</span>
      <span className={`text-[10px] sm:text-xs ${level.color} opacity-80`}>{level.label}</span>
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

const PERSONAL_CONDITION_OPTIONS = [
  { id: "sunny", label: "Ensoleillé" },
  { id: "few_clouds", label: "Quelques nuages" },
  { id: "partly_cloudy", label: "Partiellement nuageux" },
  { id: "very_cloudy", label: "Très nuageux" },
  { id: "overcast", label: "Ciel couvert" },
  { id: "fog", label: "Brouillard" },
  { id: "few_drops", label: "Quelques gouttes" },
  { id: "drizzle", label: "Bruine" },
  { id: "light_rain", label: "Pluie faible" },
  { id: "rain", label: "Pluie" },
  { id: "heavy_rain", label: "Forte pluie" },
  { id: "showers", label: "Averses" },
  { id: "storm", label: "Orage" },
  { id: "snow", label: "Neige" },
] as const;

const PERSONAL_PRECIPITATION_CONDITIONS = new Set(["few_drops", "drizzle", "light_rain", "rain", "heavy_rain", "showers", "storm"]);
const acceptsPersonalPrecipitation = (condition: string) => PERSONAL_PRECIPITATION_CONDITIONS.has(condition);

type HourlyCollectionTrace = {
  status: "stored" | "no_station" | "failed";
  date: string;
  hour: number;
  attempts: number;
  stationCount: number;
  reason?: string | null;
};

function hourlyCollectionPresentation(status: HourlyCollectionTrace["status"]) {
  if (status === "stored") return { label: "Données archivées", className: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" };
  if (status === "no_station") return { label: "Aucune station qualifiée", className: "border-amber-300/25 bg-amber-300/10 text-amber-100" };
  return { label: "Erreur technique", className: "border-red-300/25 bg-red-300/10 text-red-100" };
}

function hourlyCollectionMoment(trace: HourlyCollectionTrace) {
  return `${new Date(`${trace.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" })} · ${String(trace.hour).padStart(2, "0")} h`;
}

function DominantRegimePanel({
  regime,
  panelDate,
  regimeFreshnessLabel,
  regimeSourceUpdatedAt,
  showRegimeMenu,
  setShowRegimeMenu,
  regimeCatalogue,
  allRegimeIds,
  allRegimesExpanded,
  expandedRegimeIds,
  setExpandedRegimeIds,
  primaryRegimeId,
}: {
  regime: any;
  panelDate: string;
  regimeFreshnessLabel: string;
  regimeSourceUpdatedAt: string | null;
  showRegimeMenu: boolean;
  setShowRegimeMenu: any;
  regimeCatalogue: any[];
  allRegimeIds: string[];
  allRegimesExpanded: boolean;
  expandedRegimeIds: string[];
  setExpandedRegimeIds: any;
  primaryRegimeId: string;
}) {
  return (
    <section className="dashboard-sky-card rounded-xl border border-slate-600/50 bg-slate-900/65 px-2.5 py-1 sm:px-3 sm:py-1.5" aria-label="Régime de prévision dominant">
      <div className="mb-1 flex justify-center sm:mb-1.5">
        <p className="text-lg font-bold tracking-tight text-slate-50 sm:text-xl">{panelDate}</p>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => setShowRegimeMenu((open: boolean) => !open)}
          aria-expanded={showRegimeMenu}
          aria-controls="regime-catalogue"
          className="-mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-950/35 text-sm sm:h-7 sm:w-7 sm:text-base">{regime.emoji}</span>
          <div className="min-w-0">
            <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-sky-200/75 sm:text-[9px] sm:tracking-[0.14em]">État du ciel</p>
            <p className="flex items-center gap-1 text-[11px] font-semibold text-white sm:text-xs">{regime.label} {showRegimeMenu ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-300" />}</p>
            <p className="hidden text-xs leading-tight text-muted-foreground sm:block">{regime.description}</p>
            <p className="text-[9px] leading-tight text-sky-200/80 sm:mt-0.5 sm:text-[10px]">Synthèse horaire · {regimeFreshnessLabel}</p>
            <span className="sr-only">Voir les 20 régimes</span>
          </div>
        </button>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-1 sm:mt-1">
        <span className="rounded-full border border-orange-500/30 bg-orange-500/20 px-1.5 py-px text-[11px] font-medium text-orange-300 sm:px-2 sm:py-0.5 sm:text-xs">🌡 {Math.round(regime.weights.temp * 100)}%</span>
        <span className="rounded-full border border-blue-500/30 bg-blue-500/20 px-1.5 py-px text-[11px] font-medium text-blue-300 sm:px-2 sm:py-0.5 sm:text-xs">🌧 {Math.round(regime.weights.precip * 100)}%</span>
        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/20 px-1.5 py-px text-[11px] font-medium text-cyan-300 sm:px-2 sm:py-0.5 sm:text-xs">💨 {Math.round(regime.weights.wind * 100)}%</span>
        <span className="rounded-full border border-purple-500/30 bg-purple-500/20 px-1.5 py-px text-[11px] font-medium text-purple-300 sm:px-2 sm:py-0.5 sm:text-xs">☁ {Math.round(regime.weights.condition * 100)}%</span>
      </div>
      {showRegimeMenu && (
        <div id="regime-catalogue" className="mt-2 rounded-lg border border-slate-600/35 bg-slate-950/30 p-2" aria-label="Tous les régimes météo possibles">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">Tous les régimes</p>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setExpandedRegimeIds(allRegimesExpanded ? [] : allRegimeIds)} aria-label={allRegimesExpanded ? "Tout réduire les régimes" : "Tout développer les régimes"} className="min-h-7 rounded-md border border-primary/30 bg-primary/10 px-2 text-[9px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
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
                  <button type="button" onClick={() => setExpandedRegimeIds((current: string[]) => current.includes(candidate.id) ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])} aria-expanded={isExpanded} aria-controls={detailsId} aria-label={`${isExpanded ? "Replier" : "Afficher"} les pondérations de ${candidate.label}`} className="flex w-full min-w-0 items-start gap-1.5 px-1.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="pt-px">{candidate.emoji}</span>
                    <span className="min-w-0 flex-1"><strong className="block truncate">{candidate.label}{isActive ? " · actif" : ""}</strong><span className="mt-0.5 hidden leading-snug text-slate-400 sm:block">{candidate.description}</span></span>
                    {isExpanded ? <ChevronUp className="mt-px h-3 w-3 shrink-0" aria-hidden="true" /> : <ChevronDown className="mt-px h-3 w-3 shrink-0 text-slate-500" aria-hidden="true" />}
                  </button>
                  {isExpanded && (
                    <div id={detailsId} className="mx-1.5 mb-1.5 grid grid-cols-2 gap-x-2 gap-y-1.5 border-t border-slate-700/40 pt-1.5 text-[8px] leading-tight text-slate-400">
                      {weightRows.map((weight) => {
                        const percent = typeof weight.value === "number" && Number.isFinite(weight.value) ? Math.max(0, Math.min(100, Math.round(weight.value * 100))) : 0;
                        return <div key={weight.label} className="min-w-0"><div className="mb-0.5 flex items-center justify-between gap-1"><span>{weight.label}</span><span className="font-medium text-slate-300">{formatRegimeWeight(weight.value)}</span></div><div className="h-1 overflow-hidden rounded-full bg-slate-700/70" role="progressbar" aria-label={`Poids ${weight.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><div className={`h-full rounded-full ${weight.color}`} style={{ width: `${percent}%` }} /></div></div>;
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
    </section>
  );
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { activeLocation: contextLocation, setActiveLocation: setContextLocation } = useLocation();
  const [activeLocation, setActiveLocation] = useState<{ lat: number; lon: number; name: string; radiusKm?: number; favoriteId?: number; localMode?: "standard" | "local" | "ultra-local" } | null>(getStoredLocation);
  const [localMode, setLocalMode] = useState<"standard" | "local" | "ultra-local">(getStoredLocalMode);
  const [hasWaitTimedOut, setHasWaitTimedOut] = useState(false);
  const [showRegimeMenu, setShowRegimeMenu] = useState(false);
  const [expandedRegimeIds, setExpandedRegimeIds] = useState<string[]>([]);
  const [personalTemperature, setPersonalTemperature] = useState("");
  const [personalWind, setPersonalWind] = useState("");
  const [personalPrecipitation, setPersonalPrecipitation] = useState("");
  const [personalCondition, setPersonalCondition] = useState<(typeof PERSONAL_CONDITION_OPTIONS)[number]["id"]>("partly_cloudy");
  const [personalSubmitResult, setPersonalSubmitResult] = useState<{ notice: string; topModel?: { modelName: string; overallScore: number } } | null>(null);
  const [isPersonalObservationOpen, setIsPersonalObservationOpen] = useState(false);
  const [isForecastInfoOpen, setIsForecastInfoOpen] = useState(false);
  const [isPersonalHistoryOpen, setIsPersonalHistoryOpen] = useState(false);
  const [isCollectionHealthOpen, setIsCollectionHealthOpen] = useState(false);
  const [collectionUpdateNotice, setCollectionUpdateNotice] = useState<HourlyCollectionTrace | null>(null);
  const latestCollectionTraceKeyRef = useRef<string | null>(null);
  const [showAllLocalContributors, setShowAllLocalContributors] = useState(false);
  const [editingPersonalObservation, setEditingPersonalObservation] = useState<{ id: number; temperature: string; windSpeed: string; precipitation: string; condition: (typeof PERSONAL_CONDITION_OPTIONS)[number]["id"] } | null>(null);
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
  const { data: locationWeather, isFetching: locationWeatherFetching, isPlaceholderData: locationWeatherIsPlaceholder } = trpc.favorites.getLocationWeather.useQuery(
    queryInput,
    {
      enabled: !!selectedLocation && needsLocalStations,
      staleTime: 90 * 1000,
      gcTime: 10 * 60 * 1000,
      placeholderData: keepPreviousData,
    }
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
          temp: pf.forecast.tempCurrent ?? null,
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
    { ...coordsInput, includeExtendedPeriods: false },
    {
      staleTime: 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 2,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
    }
  );
  const hourlySnapshot = officialForecast ? { hours: officialForecast.hours } : null;
  const hourlyLoading = officialLoading;
  const hourlyError = officialError;
  const hourlyFetching = officialFetching;
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
  const { data: forecastProvenance } = trpc.weather.getForecastProvenance.useQuery(
    coordsInput, { staleTime: 60 * 1000, refetchOnWindowFocus: false }
  );
  const { data: collectionHealthReport } = trpc.weather.getForecastCollectionReport.useQuery(
    coordsInput,
    {
      staleTime: 15_000,
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    }
  );
  const hourlyCollectionHistory = (collectionHealthReport?.hourlyHistory ?? []) as HourlyCollectionTrace[];
  const technicalFailureStreak = collectionHealthReport?.technicalFailureStreak ?? 0;
  const latestHourlyCollection = hourlyCollectionHistory[0] ?? null;
  const latestCollectionTraceKey = latestHourlyCollection
    ? [
        latestHourlyCollection.date,
        latestHourlyCollection.hour,
        latestHourlyCollection.status,
        latestHourlyCollection.stationCount,
        latestHourlyCollection.attempts,
        latestHourlyCollection.reason ?? "",
      ].join("|")
    : null;
  const utils = trpc.useUtils();
  const { data: personalObservationState, refetch: refetchPersonalObservationState } = trpc.personalObservations.dashboardState.useQuery(
    coordsInput,
    { enabled: !!user, staleTime: 60 * 1000 }
  );
  const { data: personalizedHourly } = trpc.personalObservations.personalizedHourly.useQuery(
    coordsInput,
    { enabled: !!user && personalObservationState?.evidence.state === "qualified", staleTime: 2 * 60 * 1000 }
  );
  const { data: personalHistory = [], refetch: refetchPersonalHistory } = trpc.personalObservations.history.useQuery(
    coordsInput,
    { enabled: !!user && isPersonalHistoryOpen, staleTime: 60 * 1000 }
  );
  const refreshPersonalObservationData = async () => {
    await Promise.all([
      refetchPersonalObservationState(),
      refetchPersonalHistory(),
      utils.personalObservations.dashboardState.invalidate(coordsInput),
      utils.personalObservations.personalizedHourly.invalidate(coordsInput),
      utils.personalObservations.history.invalidate(coordsInput),
    ]);
  };
  const submitPersonalObservation = trpc.personalObservations.submit.useMutation({
    onSuccess: async (result) => {
      setPersonalSubmitResult({ notice: result.notice, topModel: result.modelResults[0] });
      await refreshPersonalObservationData();
    },
  });
  const updatePersonalObservation = trpc.personalObservations.update.useMutation({
    onSuccess: async () => { setEditingPersonalObservation(null); await refreshPersonalObservationData(); },
  });
  const deletePersonalObservation = trpc.personalObservations.delete.useMutation({
    onSuccess: async () => { await refreshPersonalObservationData(); },
  });

  const handlePersonalObservationSubmit = () => {
    const temperature = personalTemperature.trim() === "" ? null : Number(personalTemperature.replace(",", "."));
    const windSpeed = personalWind.trim() === "" ? null : Number(personalWind.replace(",", "."));
    const precipitationInput = personalPrecipitation.trim() === "" ? null : Number(personalPrecipitation.replace(",", "."));
    const precipitation = acceptsPersonalPrecipitation(personalCondition) ? precipitationInput : null;
    if ((temperature != null && !Number.isFinite(temperature)) || (windSpeed != null && !Number.isFinite(windSpeed)) || (precipitation != null && (!Number.isFinite(precipitation) || precipitation < 0))) return;
    setPersonalSubmitResult(null);
    submitPersonalObservation.mutate({ ...coordsInput, temperature, condition: personalCondition, windSpeed, precipitation });
  };
  const savePersonalObservationEdit = () => {
    if (!editingPersonalObservation) return;
    const temperature = editingPersonalObservation.temperature.trim() === "" ? null : Number(editingPersonalObservation.temperature.replace(",", "."));
    const windSpeed = editingPersonalObservation.windSpeed.trim() === "" ? null : Number(editingPersonalObservation.windSpeed.replace(",", "."));
    const precipitationInput = editingPersonalObservation.precipitation.trim() === "" ? null : Number(editingPersonalObservation.precipitation.replace(",", "."));
    const precipitation = acceptsPersonalPrecipitation(editingPersonalObservation.condition) ? precipitationInput : null;
    if ((temperature != null && !Number.isFinite(temperature)) || (windSpeed != null && !Number.isFinite(windSpeed)) || (precipitation != null && (!Number.isFinite(precipitation) || precipitation < 0))) return;
    updatePersonalObservation.mutate({ id: editingPersonalObservation.id, observation: { temperature, condition: editingPersonalObservation.condition, windSpeed, precipitation } });
  };

  const isLoading = officialLoading && hourlyLoading;
  const isError = officialError && hourlyError;
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

  useEffect(() => {
    latestCollectionTraceKeyRef.current = null;
    setCollectionUpdateNotice(null);
  }, [coordsInput.lat, coordsInput.lon]);

  useEffect(() => {
    if (!latestCollectionTraceKey || !latestHourlyCollection) return;
    const previousKey = latestCollectionTraceKeyRef.current;
    latestCollectionTraceKeyRef.current = latestCollectionTraceKey;
    if (previousKey && previousKey !== latestCollectionTraceKey) {
      setCollectionUpdateNotice(latestHourlyCollection);
    }
  }, [latestCollectionTraceKey, latestHourlyCollection]);

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
  const officialHours: any[] = hourlySnapshot?.hours ?? officialForecast?.hours ?? (lw ? lw.hourly : []);
  const personalizedByHour = new Map((personalizedHourly?.hours ?? []).map((hour) => [hour.hour, hour]));
  const hours: any[] = personalizedHourly?.applied
    ? officialHours.map((hour) => hour.isCurrent ? hour : (personalizedByHour.get(hour.hour) ?? hour))
    : officialHours;
  const dailyFallback = officialForecast?.dailyFallback ?? dash?.dailyFallback ?? null;
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
  const liveRegimeFreshnessLabel = regimeAgeMinutes == null
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

  // Multi-regime data for alert badges
  const multiRegime = officialRegime
    ? { activeRegimes: officialRegime.active, confidenceScore: officialRegime.confidence }
    : (dash as any)?.multiRegime ?? null;
  const primaryRegimeId: string = multiRegime?.activeRegimes?.[0]?.id ?? (regime as any)?.regime ?? (regime as any)?.id ?? "variable";
  const regimeConfidence: number = multiRegime?.confidenceScore ?? 70;
  const fallbackConfidence = dailyFallback?.kind === "daily_fusion" ? dailyFallback.confidenceScore : null;
  // La confiance mesure la qualité / accord des sources ; la stabilité mesure
  // seulement la dispersion des modèles. Ne jamais les confondre dans l'UI.
  const forecastConfidence: number = lw?.scores?.confidenceScore
    ?? officialForecast?.confidence?.current
    ?? fallbackConfidence
    ?? dash?.meteoAI?.confidenceScore
    ?? 0;
  const stabilityIndex: number = officialForecast?.confidence?.stabilityIndex ?? today?.stabilityIndex ?? meteoAI?.stabilityIndex ?? 0;

  // Le Dashboard présente un unique snapshot officiel multi-modèles : les
  // observations locales restent auditables dans Fiabilité, sans modifier cette valeur.
  const currentHour = hours.find((h: any) => h.hour === nowHour) ?? hours[hours.length - 1] ?? null;
  const isDailyFallback = currentHour == null && dailyFallback?.kind === "daily_fusion";
  const fallbackDateLabel = isDailyFallback
    ? new Date(`${dailyFallback.date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Paris" })
    : null;
  const fallbackComputedAtLabel = isDailyFallback
    ? new Date(dailyFallback.computedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
    : null;
  const regimeFreshnessLabel = isDailyFallback
    ? `Fusion quotidienne du ${fallbackDateLabel}`
    : liveRegimeFreshnessLabel;
  const nextConditionChange = isDailyFallback ? null : findNextConditionChange(hours, currentHour?.hour ?? nowHour);
  const nextWeatherAlert = getNextWeatherAlert(nextConditionChange);
  const officialCurrentTemp = currentHour?.temp ?? null;
  const currentTemp = officialCurrentTemp;
  const displayedCondition = currentHour?.condition ?? (isDailyFallback ? dailyFallback.condition : today?.condition ?? meteoAI?.condition ?? null);
  const activeFavoriteWeather = {
    temp: currentTemp,
    condition: displayedCondition,
    confidenceScore: forecastConfidence,
  };
  const maxTemperature = isDailyFallback ? dailyFallback.tempMax : today?.tempMax ?? meteoAI?.tempMax ?? null;
  const minTemperature = isDailyFallback ? dailyFallback.tempMin : today?.tempMin ?? meteoAI?.tempMin ?? null;
  const maxTemperatureTone = getExtremeTemperatureTone("max", maxTemperature);
  const minTemperatureTone = getExtremeTemperatureTone("min", minTemperature);
  const apparentTemp = currentHour?.apparentTemp ?? null;
  const currentUV = hours.find((h: any) => h.uvIndex != null && h.hour >= nowHour)?.uvIndex ?? null;
  const windDir = currentHour?.windDirection ?? null;
  const windSpeed = currentHour?.windSpeed ?? (isDailyFallback ? dailyFallback.windSpeed : today?.windSpeed ?? meteoAI?.windSpeed) ?? null;
  const currentCloudCover = currentHour?.cloudCover ?? today?.cloudCover ?? null;
  const collectionHealth = technicalFailureStreak >= 3
    ? { label: "Échecs techniques répétés", detail: `${technicalFailureStreak} passages consécutifs à corriger`, tone: "border-red-300/35 bg-red-400/15 text-red-50", dot: "bg-red-300" }
    : latestHourlyCollection?.status === "failed"
      ? { label: "Incident à surveiller", detail: "Dernier passage en erreur technique", tone: "border-red-300/35 bg-red-400/15 text-red-50", dot: "bg-red-300" }
      : latestHourlyCollection?.status === "no_station"
        ? { label: "Aucune station qualifiée", detail: "Le passage a fonctionné, sans donnée physique exploitable", tone: "border-amber-300/35 bg-amber-400/15 text-amber-50", dot: "bg-amber-300" }
        : latestHourlyCollection?.status === "stored"
          ? { label: "Collectes opérationnelles", detail: "Dernier passage physique archivé", tone: "border-emerald-300/35 bg-emerald-400/15 text-emerald-50", dot: "bg-emerald-300" }
          : { label: "En attente de trace", detail: "Aucun passage récent n’est disponible pour ce lieu", tone: "border-slate-500/40 bg-slate-900/45 text-slate-100", dot: "bg-slate-400" };
  const dashboardSkyImage = getDashboardWeatherImage({ condition: displayedCondition, regime: regime?.label, temperature: currentTemp ?? undefined, cloudCover: currentCloudCover ?? undefined, precipitation: currentHour?.precipitation ?? (isDailyFallback ? dailyFallback.precipitation : (today as any)?.precipitation) ?? undefined, windSpeed: windSpeed ?? undefined });
  const dashboardSkyStyle = { "--dashboard-sky-image": `url("${dashboardSkyImage}")` } as CSSProperties;
  const nextRegimeChange = officialForecast?.nextRegimeChange ?? null;
  const modelFallbackContributors = locationWeather?.ultraLocal?.modelFallback?.contributors ?? [];
  const localObservation = locationWeather?.currentObservation?.source === "local_validated"
    ? locationWeather.currentObservation
    : null;
  const localOfficialDelta = localObservation?.deltaFromOfficialC ?? null;
  const hasMaterialLocalDelta = localOfficialDelta !== null && Math.abs(localOfficialDelta) >= 2;
  const localCoverageBands = locationWeather?.ultraLocal?.bandBreakdown ?? [];
  const localContributors = locationWeather?.ultraLocal?.stationsUsed ?? [];
  const localModeLabel = localMode === "ultra-local" ? "Ultra-local" : "Local";
  const localRadiusKm = localMode === "ultra-local" ? 10 : 30;
  const visibleLocalContributors = showAllLocalContributors ? localContributors : localContributors.slice(0, 6);

  return (
    <div className="dashboard-weather-page min-h-screen bg-background" style={dashboardSkyStyle}>
      <div className="mx-auto max-w-2xl space-y-2 px-3 pb-3 pt-1 sm:space-y-6 sm:px-6 sm:py-8">

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
          activeWeather={activeFavoriteWeather}
        />

        {/* ── Hero : Température actuelle + max/min ── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-slate-700 rounded-2xl px-3 pb-3 pt-1 sm:p-6">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/58 via-slate-950/34 to-slate-950/82 pointer-events-none" />
          <div className="relative">
            {/* ── Regime badge ── */}
            {regime && (
              <div className="mb-1 rounded-xl border border-slate-600/50 bg-slate-800/60 px-2.5 py-1 sm:mb-2 sm:px-3 sm:py-1.5">
                <div className="mb-1 flex justify-center sm:mb-1.5">
                  <p className="text-lg font-bold tracking-tight text-slate-50 sm:text-xl">
                    {panelDate}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRegimeMenu((open) => !open)}
                    aria-expanded={showRegimeMenu}
                    aria-controls="regime-catalogue"
                    className="-mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-950/35 text-sm sm:h-7 sm:w-7 sm:text-base">{regime?.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-sky-200/75 sm:text-[9px] sm:tracking-[0.14em]">État du ciel</p>
                      <p className="flex items-center gap-1 text-[11px] font-semibold text-white sm:text-xs">{regime?.label} {showRegimeMenu ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-300" />}</p>
                      <p className="text-xs text-muted-foreground leading-tight hidden sm:block">{regime?.description}</p>
                      <p className="text-[9px] leading-tight text-sky-200/80 sm:mt-0.5 sm:text-[10px]">Synthèse horaire · {regimeFreshnessLabel}</p>
                      <span className="sr-only">Voir les 20 régimes</span>
                    </div>
                  </button>
                </div>
                {/* Weight pills */}
                <div className="mt-0.5 flex flex-wrap gap-1 sm:mt-1">
                  <span className="rounded-full border border-orange-500/30 bg-orange-500/20 px-1.5 py-px text-[11px] font-medium text-orange-300 sm:px-2 sm:py-0.5 sm:text-xs">
                    🌡 {Math.round((regime?.weights?.temp ?? 0) * 100)}%
                  </span>
                  <span className="rounded-full border border-blue-500/30 bg-blue-500/20 px-1.5 py-px text-[11px] font-medium text-blue-300 sm:px-2 sm:py-0.5 sm:text-xs">
                    🌧 {Math.round((regime?.weights?.precip ?? 0) * 100)}%
                  </span>
                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/20 px-1.5 py-px text-[11px] font-medium text-cyan-300 sm:px-2 sm:py-0.5 sm:text-xs">
                    💨 {Math.round((regime?.weights?.wind ?? 0) * 100)}%
                  </span>
                  <span className="rounded-full border border-purple-500/30 bg-purple-500/20 px-1.5 py-px text-[11px] font-medium text-purple-300 sm:px-2 sm:py-0.5 sm:text-xs">
                    ☁ {Math.round((regime?.weights?.condition ?? 0) * 100)}%
                  </span>
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
              </div>
            )}

            {isDailyFallback && (
              <div role="status" className="mb-3 rounded-xl border border-amber-300/35 bg-amber-300/[0.09] px-3 py-2 text-[11px] leading-relaxed text-amber-50">
                <div className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                  <div>
                    <p className="font-semibold">Créneaux horaires indisponibles</p>
                    <p className="mt-0.5 text-amber-100/85">Dernière fusion quotidienne réelle : {fallbackDateLabel} · calculée le {fallbackComputedAtLabel}. Les valeurs ci-dessous sont des indicateurs journaliers, pas une météo observée à l’instant.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-3">
              <button type="button" onClick={() => setIsCollectionHealthOpen(true)} aria-haspopup="dialog" aria-expanded={isCollectionHealthOpen} aria-controls="collection-health-panel" aria-label={`Ouvrir l’historique des collectes : ${collectionHealth.detail}`} className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left shadow-sm transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${collectionHealth.tone}`}>
                <span className="flex min-w-0 items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${collectionHealth.dot}`} aria-hidden="true" /><span className="min-w-0"><span className="block text-[9px] font-semibold uppercase tracking-[0.12em] opacity-75">Santé des collectes</span><strong className="block truncate text-[11px]">{collectionHealth.label}</strong>{collectionUpdateNotice && <span className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold text-cyan-100" role="status" aria-live="polite"><Activity className="h-3 w-3 shrink-0" aria-hidden="true" />Actualisé · passage de {hourlyCollectionMoment(collectionUpdateNotice)}</span>}</span></span>
                <span className="shrink-0 text-right text-[9px] leading-tight opacity-85">{hourlyCollectionHistory.length}/24<br />passages</span>
              </button>
            </div>

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
            <div className="flex items-start gap-2 sm:gap-6">
              {/* The condition remains daily only when the hourly feed is unavailable. */}
              <div className="w-[4.25rem] shrink-0 pt-0.5 sm:w-[5.25rem] sm:pt-0">
                <MeteoIcon name={getIconNameFromCondition(displayedCondition)} size={64} className="sm:hidden" />
                <MeteoIcon name={getIconNameFromCondition(displayedCondition)} size={80} className="hidden sm:block" />
              </div>

              <div className={dashboardTemperatureLayout.content}>
                {/* Big current temp */}
                <div className="min-w-0">
                  <p className={dashboardTemperatureLayout.currentValue}>
                    {currentTemp != null ? currentTemp.toFixed(1) : "—"}°
                  </p>
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

            <div className="mt-1 min-w-0 space-y-0.5 sm:mt-1.5 sm:space-y-1">
              <p className="whitespace-nowrap text-[15px] font-medium leading-tight text-slate-100/90 sm:text-lg">
                <span className="font-semibold text-sky-200/90">{isDailyFallback ? "Tendance quotidienne · " : "Phénomène actuel · "}</span>
                <span className="text-white">{displayedCondition ?? "Condition indisponible"}</span>
              </p>
              {(nextRegimeChange ?? nextConditionChange) && (
                <>
                  <p className="whitespace-nowrap text-[15px] font-medium leading-tight sm:hidden">
                    <span className="text-sky-200/90">Évolution · {nextRegimeChange
                      ? `${nextRegimeChange.hour.replace(":00", "h")} · ${nextRegimeChange.emoji} `
                      : `${nextConditionChange!.hour.replace(":00", "h")} · `}</span>
                    <span className="text-white">{nextRegimeChange ? nextRegimeChange.label : nextConditionChange!.condition}</span>
                  </p>
                  <p className="hidden items-center gap-1 text-[11px] font-medium text-sky-300 sm:flex">
                    <Clock className="h-3 w-3" />
                    <span>Évolution horaire : {nextRegimeChange ? `${nextRegimeChange.emoji} ` : ""}</span>
                    <span className="text-white">{nextRegimeChange ? nextRegimeChange.label : nextConditionChange!.condition}</span>
                    <span>à {nextRegimeChange ? nextRegimeChange.hour : nextConditionChange!.hour}</span>
                  </p>
                </>
              )}
            </div>

            {/* Apparent temp + UV + Wind rose highlight row */}
            <div className={`${dashboardTemperatureLayout.compactMetrics} border-t border-slate-700/60`}>
              {/* Ressenti */}
              <div className="text-center">
                <p className="mb-0 flex items-center justify-center gap-1 text-[10px] text-muted-foreground sm:mb-1 sm:text-xs">
                  <Thermometer className="h-3 w-3" />Ressenti
                </p>
                <p className="text-lg font-bold sm:text-2xl">
                  {apparentTemp != null ? `${apparentTemp.toFixed(1)}°` : currentTemp != null ? `${currentTemp.toFixed(1)}°` : "—"}
                </p>
              </div>
              {/* UV Index */}
              <div className="text-center">
                <p className="mb-0 flex items-center justify-center gap-1 text-[10px] text-muted-foreground sm:mb-1 sm:text-xs">
                  <Sun className="h-3 w-3" />Indice UV
                </p>
                <UVBadge uv={currentUV} />
              </div>
              {/* Wind Rose */}
              <div className="text-center">
                <p className="mb-0 flex items-center justify-center gap-1 text-[10px] text-muted-foreground sm:mb-1 sm:text-xs">
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
                <p className="mb-0 flex items-center justify-center gap-1 text-[10px] text-muted-foreground sm:mb-0.5 sm:text-xs">
                  <Droplets className="h-3 w-3" />Précip.
                </p>
                <p className="text-sm font-semibold sm:text-lg">{isDailyFallback ? dailyFallback.precipitation ?? "—" : today?.precipitation ?? meteoAI?.precipitation ?? "—"} mm</p>
              </div>
              <div className="text-center">
                <p className="mb-0 flex items-center justify-center gap-1 text-[10px] text-muted-foreground sm:mb-0.5 sm:text-xs">
                  <Wind className="h-3 w-3" />Rafales
                </p>
                <p className="text-sm font-semibold sm:text-lg">{today?.windGust ?? "—"} km/h</p>
              </div>
                <div className="text-center">
                  <p className="mb-0 flex items-center justify-center gap-1 text-[10px] text-muted-foreground sm:mb-0.5 sm:text-xs">
                    <MeteoIcon name="wind_param" size={16} className="shrink-0" />Vent max
                  </p>
                <p className="text-sm font-semibold sm:text-lg">{today?.windSpeed ?? meteoAI?.windSpeed ?? "—"} km/h</p>
              </div>
                <div className="text-center">
                  <p className="mb-0 flex items-center justify-center gap-1 text-[10px] text-muted-foreground sm:mb-0.5 sm:text-xs">
                    <MeteoIcon name="humidity" size={16} className="shrink-0" />Humidité
                  </p>
                <p className="text-sm font-semibold sm:text-lg">{today?.humidity ?? "—"}%</p>
              </div>
              <div className="text-center">
                  <p className="mb-0 flex items-center justify-center gap-1 text-[10px] text-muted-foreground sm:mb-0.5 sm:text-xs">
                    <Eye className="h-3 w-3" />Nuages
                  </p>
                <p className="text-sm font-semibold sm:text-lg">{currentCloudCover ?? "—"}%</p>
              </div>
              <div className="text-center">
                  <p className="mb-0 flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground sm:mb-0.5 sm:text-xs">
                    <Activity className="h-3 w-3" />Confiance prévision
                    <button
                      type="button"
                      onClick={() => setIsForecastInfoOpen((open) => !open)}
                      aria-expanded={isForecastInfoOpen}
                      aria-controls="forecast-information-panel"
                      aria-label={isForecastInfoOpen ? "Masquer les informations de confiance" : "Afficher les informations de confiance"}
                      className="inline-flex size-5 items-center justify-center rounded-full text-sky-200 transition-colors hover:bg-sky-400/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                    >
                      {isForecastInfoOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    </button>
                  </p>
                <p className={`text-sm font-semibold sm:text-lg ${stabilityColor(forecastConfidence)}`}>
                  {Math.round(forecastConfidence)}%
                </p>
                <p className="text-[9px] text-muted-foreground sm:text-[10px]">Stabilité {Math.round(stabilityIndex)}%</p>
              </div>
            </div>
          </div>
        </div>

        <Dialog open={isCollectionHealthOpen} onOpenChange={setIsCollectionHealthOpen}>
          <DialogContent id="collection-health-panel" showCloseButton={false} className="max-h-[calc(100dvh-1rem)] overflow-y-auto border-slate-700 bg-[#10131a] p-4 text-slate-100 sm:max-w-xl" aria-label="Santé des collectes automatiques">
            <DialogHeader><div className="flex items-start justify-between gap-3"><div><DialogTitle className="text-white">Santé des collectes</DialogTitle><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Les 24 derniers passages physiques enregistrés pour ce lieu. Une absence de station qualifiée n’est pas une erreur technique.</p></div><button type="button" onClick={() => setIsCollectionHealthOpen(false)} aria-label="Fermer l’historique des collectes" className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-600 text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><X className="h-4 w-4" /></button></div></DialogHeader>
            {collectionUpdateNotice && <div className="mt-3 flex items-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-400/10 px-3 py-2 text-cyan-50" role="status" aria-live="polite"><Activity className="h-4 w-4 shrink-0" aria-hidden="true" /><div><p className="text-[11px] font-semibold">Nouveau snapshot détecté</p><p className="mt-0.5 text-[10px] text-cyan-100/80">Passage de {hourlyCollectionMoment(collectionUpdateNotice)} ajouté à l’historique.</p></div></div>}
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-sky-200/75">Prévisions</p><p className="mt-1 text-sm font-semibold text-slate-100">{collectionHealthReport?.lastForecastSuccess?.collectedAt ? new Date(collectionHealthReport.lastForecastSuccess.collectedAt).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) : "Aucun succès vérifiable"}</p><p className="mt-1 text-[10px] text-slate-400">Cycle quotidien à 05:00 Europe/Paris.</p></div><div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-cyan-200/75">Stations physiques</p><p className="mt-1 text-sm font-semibold text-slate-100">{latestHourlyCollection ? hourlyCollectionMoment(latestHourlyCollection) : "Aucun passage vérifiable"}</p><p className="mt-1 text-[10px] text-slate-400">{technicalFailureStreak ? `${technicalFailureStreak} échec(s) technique(s) consécutif(s).` : "Aucune série d’échecs techniques."}</p></div></div>
            <div className="mt-3 space-y-2" aria-label="Historique des 24 derniers passages horaires">{hourlyCollectionHistory.length ? hourlyCollectionHistory.map((trace) => { const presentation = hourlyCollectionPresentation(trace.status); return <article key={`${trace.date}-${trace.hour}`} className={`rounded-xl border p-3 ${presentation.className}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[11px] font-semibold">{hourlyCollectionMoment(trace)} · {presentation.label}</p><p className="mt-1 text-[10px] leading-relaxed opacity-85">{trace.status === "stored" ? `${trace.stationCount} station(s) qualifiée(s) archivée(s).` : trace.status === "no_station" ? `Passage terminé après ${trace.attempts} tentative${trace.attempts > 1 ? "s" : ""} ; aucune station qualifiée.` : `Échec après ${trace.attempts} tentative${trace.attempts > 1 ? "s" : ""}.`}{trace.reason ? ` ${trace.reason}` : ""}</p></div><span className="shrink-0 text-[10px] font-semibold">{trace.status === "stored" ? "✓" : trace.status === "no_station" ? "—" : "!"}</span></div></article>; }) : <p className="rounded-xl border border-slate-700 bg-black/20 p-3 text-xs text-slate-400">Aucun passage horaire n’est encore archivé pour ce lieu.</p>}</div>
          </DialogContent>
        </Dialog>

        <Dialog open={isForecastInfoOpen} onOpenChange={setIsForecastInfoOpen}>
          <DialogContent
            id="forecast-information-panel"
            showCloseButton={false}
            aria-label="Informations de prévision et de confiance"
            className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] overflow-y-auto border-sky-300/35 bg-[#08131f]/[0.98] p-3 text-slate-100 shadow-2xl sm:max-w-xl"
          >
            <div className="flex items-center justify-between gap-3 pr-0">
              <DialogHeader className="text-left">
                <DialogTitle className="text-base font-semibold text-slate-50">Informations de prévision</DialogTitle>
              </DialogHeader>
              <button
                type="button"
                onClick={() => setIsForecastInfoOpen(false)}
                aria-label="Fermer les informations de prévision et de confiance"
                title="Fermer"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-900/90 text-slate-200 transition-colors hover:border-sky-300/65 hover:bg-sky-400/15 hover:text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 active:scale-95"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-3">
              <ForecastProvenanceBadge data={forecastProvenance} />
              <ForecastMetricDefinitions />
            </div>
          </DialogContent>
        </Dialog>

        <div className="dashboard-sky-card flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card p-2" aria-label="Mode de contexte local">
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

        <section className="dashboard-sky-card rounded-xl border border-sky-400/25 bg-sky-400/5" aria-labelledby="personal-observation-title">
          <button type="button" aria-expanded={isPersonalObservationOpen} onClick={() => setIsPersonalObservationOpen((open) => !open)} className="flex min-h-12 w-full items-center gap-2 px-3 text-left">
            <Eye className="h-5 w-5 shrink-0 text-sky-300" />
            <div className="min-w-0 flex-1"><h2 id="personal-observation-title" className="text-sm font-semibold text-slate-100">Mes observations</h2><p className="mt-0.5 text-[10px] text-slate-400">Signaler ce que vous observez et améliorer les modèles.</p></div>
            {isPersonalObservationOpen ? <ChevronUp className="h-5 w-5 shrink-0 text-sky-300" /> : <ChevronDown className="h-5 w-5 shrink-0 text-sky-300" />}
          </button>
          {isPersonalObservationOpen ? <div className="border-t border-sky-300/15 px-3 pb-3 pt-2">
          {!user ? <p className="rounded-lg border border-slate-700 bg-black/20 px-3 py-2 text-xs text-slate-300">Connectez-vous pour enregistrer vos observations et construire votre calibration locale.</p> : <>
            <p className="text-[11px] leading-relaxed text-slate-400">Indiquez ce que vous voyez. L’application compare cette observation aux modèles archivés du même lieu et du même créneau.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium text-slate-300">Température observée (°C)<input aria-label="Température observée" inputMode="decimal" value={personalTemperature} onChange={(event) => setPersonalTemperature(event.target.value)} placeholder="Ex. 24" className="mt-1 min-h-10 w-full rounded-lg border border-slate-600 bg-[#0b1019]/80 px-3 text-sm text-white outline-none focus:border-sky-400" /></label>
              <label className="text-[11px] font-medium text-slate-300">Vent observé (km/h)<input aria-label="Vent observé" inputMode="decimal" value={personalWind} onChange={(event) => setPersonalWind(event.target.value)} placeholder="Facultatif" className="mt-1 min-h-10 w-full rounded-lg border border-slate-600 bg-[#0b1019]/80 px-3 text-sm text-white outline-none focus:border-sky-400" /></label>
            </div>
            <p className="mt-3 text-[11px] font-medium text-slate-300">Quel temps observez-vous ?</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Propositions de conditions météo">
              {PERSONAL_CONDITION_OPTIONS.map((option) => <button key={option.id} type="button" onClick={() => setPersonalCondition(option.id)} className={`min-h-9 rounded-lg border px-2.5 text-[11px] font-medium ${personalCondition === option.id ? "border-sky-300/60 bg-sky-400/15 text-sky-100" : "border-slate-700 bg-black/15 text-slate-300"}`}>{option.label}</button>)}
            </div>
            {acceptsPersonalPrecipitation(personalCondition) ? <label className="mt-3 block text-[11px] font-medium text-slate-300">Précipitations observées (mm)<input aria-label="Précipitations observées en millimètres" inputMode="decimal" value={personalPrecipitation} onChange={(event) => setPersonalPrecipitation(event.target.value)} placeholder="Ex. 1,2" className="mt-1 min-h-10 w-full rounded-lg border border-sky-400/40 bg-[#0b1019]/80 px-3 text-sm text-white outline-none focus:border-sky-300" /></label> : null}
            <button type="button" onClick={handlePersonalObservationSubmit} disabled={submitPersonalObservation.isPending} className="mt-3 min-h-10 w-full rounded-lg border border-sky-300/45 bg-sky-400/15 px-3 text-xs font-semibold text-sky-100 disabled:cursor-wait disabled:opacity-60">{submitPersonalObservation.isPending ? "Comparaison des modèles…" : "Enregistrer et comparer aux modèles"}</button>
            {submitPersonalObservation.isError ? <p className="mt-2 text-[11px] text-red-300">L’observation n’a pas pu être enregistrée. Vérifiez les valeurs puis réessayez.</p> : null}
            {personalSubmitResult ? <div className="mt-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-100"><p>{personalSubmitResult.notice}</p>{personalSubmitResult.topModel ? <p className="mt-1 font-semibold">Meilleur accord sur cette observation : {personalSubmitResult.topModel.modelName} — {Math.round(personalSubmitResult.topModel.overallScore)}/100.</p> : null}</div> : null}
            <div className="mt-3 border-t border-sky-300/15 pt-2 text-[11px] text-slate-400">{personalizedHourly?.applied ? `Calibration qualifiée active : les heures à venir sont pondérées selon ${personalizedHourly.comparedModels.join(", ")}. La condition actuelle reste la source à 15 minutes.` : personalObservationState?.evidence.state === "qualified" ? "Calibration qualifiée : mise à jour de la fusion en cours." : personalObservationState?.evidence.state === "provisional" ? `Tendance provisoire : ${personalObservationState.evidence.comparisonCount}/50 comparaisons avant une influence sur les poids.` : `Données insuffisantes : ${personalObservationState?.evidence.comparisonCount ?? 0}/20 comparaisons pour une première tendance, 50 pour influencer les poids.`}</div>
            <button type="button" onClick={() => setIsPersonalHistoryOpen(true)} className="mt-3 min-h-10 w-full rounded-lg border border-slate-600 bg-black/15 px-3 text-xs font-semibold text-slate-200">Consulter l’historique complet</button>
          </>}
          </div> : null}
        </section>

        <Dialog open={isPersonalHistoryOpen} onOpenChange={setIsPersonalHistoryOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto border-slate-700 bg-[#10131a] p-4 text-slate-100 sm:max-w-xl">
            <DialogHeader><DialogTitle className="pr-7 text-white">Historique de mes observations</DialogTitle></DialogHeader>
            {personalHistory.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">Aucune observation personnelle n’est encore enregistrée pour ce lieu.</p> : <div className="space-y-2">{personalHistory.slice().reverse().map((observation) => <div key={observation.id} className="rounded-xl border border-slate-700 bg-black/20 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-100">{observation.temperature == null ? "Température non renseignée" : `${Number(observation.temperature).toFixed(1)} °C`} · {PERSONAL_CONDITION_OPTIONS.find((option) => option.id === observation.condition)?.label ?? observation.condition}</p><p className="mt-1 text-[11px] text-slate-400">{new Date(observation.observedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}{observation.windSpeed == null ? "" : ` · vent ${Number(observation.windSpeed).toFixed(0)} km/h`}{observation.precipitation == null ? "" : ` · pluie ${Number(observation.precipitation).toFixed(1)} mm`}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => setEditingPersonalObservation({ id: observation.id, temperature: observation.temperature?.toString() ?? "", windSpeed: observation.windSpeed?.toString() ?? "", precipitation: observation.precipitation?.toString() ?? "", condition: observation.condition as (typeof PERSONAL_CONDITION_OPTIONS)[number]["id"] })} className="min-h-9 rounded-lg border border-sky-400/35 px-2.5 text-[11px] font-semibold text-sky-200">Modifier</button><button type="button" disabled={deletePersonalObservation.isPending} onClick={() => { if (window.confirm("Supprimer cette observation et recalculer la calibration ?")) deletePersonalObservation.mutate({ id: observation.id }); }} className="min-h-9 rounded-lg border border-red-400/35 px-2.5 text-[11px] font-semibold text-red-200 disabled:opacity-60">Supprimer</button></div></div></div>)}</div>}
          </DialogContent>
        </Dialog>

        <Dialog open={editingPersonalObservation !== null} onOpenChange={(open) => { if (!open) setEditingPersonalObservation(null); }}>
          <DialogContent className="max-h-[85vh] overflow-y-auto border-slate-700 bg-[#10131a] p-4 text-slate-100 sm:max-w-md"><DialogHeader><DialogTitle className="pr-7 text-white">Modifier mon observation</DialogTitle></DialogHeader>{editingPersonalObservation ? <div className="space-y-3"><div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-300">Température (°C)<input inputMode="decimal" value={editingPersonalObservation.temperature} onChange={(event) => setEditingPersonalObservation({ ...editingPersonalObservation, temperature: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-600 bg-black/20 px-3 text-sm text-white" /></label><label className="text-xs text-slate-300">Vent (km/h)<input inputMode="decimal" value={editingPersonalObservation.windSpeed} onChange={(event) => setEditingPersonalObservation({ ...editingPersonalObservation, windSpeed: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-slate-600 bg-black/20 px-3 text-sm text-white" /></label></div><div className="flex flex-wrap gap-1.5">{PERSONAL_CONDITION_OPTIONS.map((option) => <button key={option.id} type="button" onClick={() => setEditingPersonalObservation({ ...editingPersonalObservation, condition: option.id })} className={`min-h-9 rounded-lg border px-2 text-[11px] ${editingPersonalObservation.condition === option.id ? "border-sky-300/60 bg-sky-400/15 text-sky-100" : "border-slate-700 text-slate-300"}`}>{option.label}</button>)}</div>{acceptsPersonalPrecipitation(editingPersonalObservation.condition) ? <label className="block text-xs text-slate-300">Précipitations (mm)<input inputMode="decimal" value={editingPersonalObservation.precipitation} onChange={(event) => setEditingPersonalObservation({ ...editingPersonalObservation, precipitation: event.target.value })} placeholder="Ex. 1,2" className="mt-1 min-h-10 w-full rounded-lg border border-sky-400/40 bg-black/20 px-3 text-sm text-white" /></label> : null}<button type="button" disabled={updatePersonalObservation.isPending} onClick={savePersonalObservationEdit} className="min-h-10 w-full rounded-lg border border-emerald-400/40 bg-emerald-400/10 text-xs font-semibold text-emerald-100 disabled:opacity-60">{updatePersonalObservation.isPending ? "Recalcul en cours…" : "Enregistrer la correction"}</button><p className="text-[11px] leading-relaxed text-slate-400">La correction reconstruit les scores et les poids à partir de tout l’historique.</p></div> : null}</DialogContent>
        </Dialog>

        {localMode !== "standard" && locationWeather?.ultraLocal && (
          <section className="space-y-2" aria-labelledby="local-context-title">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 id="local-context-title" className="text-sm font-semibold text-slate-100">Moyenne locale pondérée</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{locationWeatherFetching && locationWeatherIsPlaceholder ? "Filtre local en cours…" : "n’influence pas la prévision officielle"}</span>
                <button type="button" onClick={() => handleModeChange("standard")} aria-label="Fermer le contexte local et revenir au mode Officiel" title="Revenir au mode Officiel" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-600/70 bg-slate-900/70 text-slate-200 transition-colors hover:border-sky-300/65 hover:bg-sky-400/15 hover:text-sky-100 active:scale-95">
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="dashboard-sky-card rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl font-bold text-emerald-300">{locationWeather.ultraLocal.temperature != null ? `${Number(locationWeather.ultraLocal.temperature).toFixed(1)}°C` : "—"}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {locationWeather.ultraLocal.stationCount > 0
                      ? `${locationWeather.ultraLocal.stationCount} station${locationWeather.ultraLocal.stationCount > 1 ? "s" : ""} physique${locationWeather.ultraLocal.stationCount > 1 ? "s" : ""} admise${locationWeather.ultraLocal.stationCount > 1 ? "s" : ""} pour ce calcul`
                      : `Repli explicite sur ${locationWeather.ultraLocal.modelFallback?.modelCount ?? 0} modèle${locationWeather.ultraLocal.modelFallback?.modelCount === 1 ? "" : "s"}`}
                  </p>
                </div>
                <WeatherStatusBadge compact tone="success" label="Confiance locale" value={locationWeather.ultraLocal.confidenceScore == null ? "Données insuffisantes" : `${locationWeather.ultraLocal.confidenceScore}%`} pulse={locationWeather.ultraLocal.confidenceScore != null && locationWeather.ultraLocal.stationCount > 0} description="Cet indice décrit l’accord et la qualité des observations locales disponibles. Sans au moins deux observations comparables, il reste indiqué comme données insuffisantes. Il concerne le contexte local et ne remplace pas la confiance de la prévision officielle." />
              </div>
              {hasMaterialLocalDelta ? <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5" role="status">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold text-amber-100">Écart observé avec la prévision officielle</p><p className="mt-0.5 text-[10px] leading-relaxed text-slate-300">Les stations locales et le modèle officiel ne décrivent pas la même source. La température principale reste la prévision au point du lieu.</p></div><span className="shrink-0 text-sm font-bold text-amber-200">{localOfficialDelta > 0 ? "+" : ""}{localOfficialDelta.toFixed(1)}°</span></div>
                <p className="mt-1.5 text-[10px] text-slate-400">Modèle officiel : {officialCurrentTemp == null ? "—" : `${officialCurrentTemp.toFixed(1)}°C`} · synthèse station : {localObservation?.temperature.toFixed(1)}°C{localObservation?.observedAt ? ` · relevé le ${new Date(localObservation.observedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}` : ""}.</p>
              </div> : null}
              <div className="mt-3 border-t border-emerald-500/15 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold text-emerald-100">Couverture locale</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{localModeLabel} · rayon maximum {localRadiusKm} km</p>
                  </div>
                  <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">{localCoverageBands.reduce((total: number, band: any) => total + band.stationCount, 0)} station{localCoverageBands.reduce((total: number, band: any) => total + band.stationCount, 0) > 1 ? "s" : ""}</span>
                </div>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {localCoverageBands.map((band: any) => {
                    const hasContributors = band.stationCount > 0;
                    return (
                      <div key={band.band} className={`rounded-lg border px-2 py-1.5 ${hasContributors ? "border-emerald-400/25 bg-emerald-400/10" : "border-slate-700/70 bg-slate-950/25"}`}>
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <span className={hasContributors ? "font-semibold text-emerald-100" : "font-semibold text-slate-300"}>{band.band}</span>
                          <span className={hasContributors ? "text-emerald-200" : "text-slate-500"}>{band.stationCount} station{band.stationCount > 1 ? "s" : ""}</span>
                        </div>
                        <p className="mt-0.5 text-[9px] text-slate-400">{hasContributors ? `Poids réellement utilisé : ${Math.round(Number(band.effectiveWeight) * 100)} %` : "Aucune station contributrice dans cette bande"}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              {localContributors.length > 0 ? (
                <div className="mt-3 border-t border-emerald-500/15 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold text-emerald-100">Stations contributrices</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">Seules les stations admises par les contrôles apparaissent ici.</p>
                    </div>
                    <span className="text-[10px] font-medium text-emerald-200">{localContributors.length}</span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {visibleLocalContributors.map((station: any) => (
                      <div key={station.stationId} className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                        <span className="min-w-0 truncate">{station.name} · {station.band} · {station.distanceKm.toFixed(1)} km</span>
                        <span className="shrink-0 text-emerald-200">{station.adjustedTemperature?.toFixed(1) ?? "—"}° · {Math.round(station.weight * 100)}%</span>
                      </div>
                    ))}
                  </div>
                  {localContributors.length > 6 ? (
                    <button type="button" onClick={() => setShowAllLocalContributors((open) => !open)} className="mt-2 min-h-8 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2.5 text-[10px] font-semibold text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                      {showAllLocalContributors ? "Réduire les stations" : `Afficher les ${localContributors.length - 6} autres stations`}
                    </button>
                  ) : null}
                  <p className="pt-2 text-[10px] leading-relaxed text-slate-400">Contrôles calculés à cette requête : distance, fraîcheur, fiabilité, cohérence et altitude si renseignée. La stabilité longue durée exige un historique et n’est pas déduite de ce seul affichage.</p>
                </div>
              ) : modelFallbackContributors.length > 0 ? (
                <p className="mt-3 border-t border-emerald-500/15 pt-2 text-[10px] leading-relaxed text-slate-400">Aucune station contributrice n’est disponible dans ce rayon. Contributeurs de repli : {modelFallbackContributors.map((model: any) => `${model.name} ${Math.round(Number(model.weight) * 100)}%`).join(" · ")}. Aucun modèle n’est présenté comme station.</p>
              ) : (
                <p className="mt-3 border-t border-emerald-500/15 pt-2 text-[10px] leading-relaxed text-slate-400">Aucune station contributrice n’est disponible dans ce rayon. Le mode local reste explicite et ne remplace pas la prévision officielle.</p>
              )}
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
              <button type="button" disabled={hourlyFetching} onClick={() => void refetchOfficialForecast()} className="mt-3 min-h-10 rounded-md border border-primary/50 px-3 text-xs font-semibold text-primary disabled:cursor-wait disabled:opacity-60">{hourlyFetching ? "Relance en cours…" : "Réessayer les heures"}</button>
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
