import { trpc } from "@/lib/trpc";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentProps, type CSSProperties } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Droplets, Wind, Activity, Clock, CalendarDays, Eye, Thermometer, Sun, Radio, ChevronDown, ChevronUp, LogIn, Sparkles, X } from "lucide-react";
import { FavoritesBar } from "@/components/FavoritesBar";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "@/contexts/LocationContext";
import { getDashboardWeatherImage } from "@/lib/weatherImages";
import { formatDashboardCompactDate } from "@/lib/dashboardDate";
import { AlertBadge, isDangerousRegime } from "@/components/AlertBadge";
import { MeteoIcon, getIconNameFromCondition } from "@/components/MeteoIcon";
import { DashboardWeatherAtmosphere } from "@/components/DashboardWeatherAtmosphere";
import {
  getDashboardWeatherEffectsMode,
  getDashboardWeatherEffectsModeLabel,
  getNextDashboardWeatherEffectsMode,
  storeDashboardWeatherEffectsMode,
  type DashboardWeatherEffectsMode,
} from "@/lib/dashboardWeatherEffects";
import { findNextConditionChange, getNextWeatherAlert } from "@/lib/weatherCondition";
import { LocalOfficialDeltaChart } from "@/components/LocalOfficialDeltaChart";
import { LocalModelContributionNotice } from "@/components/LocalModelContributionNotice";
import { AltitudeCorrectionNotice } from "@/components/AltitudeCorrectionNotice";
import { dashboardTemperatureLayout } from "@/lib/dashboardTemperatureLayout";
import { getExtremeTemperatureTone } from "@/lib/extremeTemperatureTone";
import { DASHBOARD_LOAD_TIMEOUT_MS, DASHBOARD_PREVIEW_MESSAGE } from "@/lib/dashboardLoadState";
import { getLoginUrl } from "@/const";
import { BackToTopButton } from "@/components/BackToTopButton";
import { WeatherStatusBadge } from "@/components/weather/WeatherStatusBadge";
import { HourlyWeightingNotice } from "@/components/weather/HourlyWeightingNotice";
import { countArchivedSnapshotSlots, formatCollectionDuration } from "@/lib/collectionHealth";
import { getDashboardObservability } from "@/lib/dashboardObservability";
import { formatCollectionTimestamp } from "@/lib/collectionTimestamp";
import { formatCurrentStateProvenance, formatDashboardNumber, getRegimeProvenancePresentation, withCurrentSnapshotFallback, type CurrentStateFieldLike } from "@/lib/dashboardPresentation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_OFFICIAL_FORECAST_LOCATION, getActiveOfficialForecastHour, getOfficialForecastCoordinates } from "@/lib/officialForecast";
import { useOfficialForecast } from "@/hooks/useOfficialForecast";
import { OfficialForecastCalculationTimes } from "@/components/weather/OfficialForecastCalculationTimes";
import type { OfficialRegimeInputDiagnostic, RegimeInputStatus } from "@shared/regimeInputDiagnostics";

const HourlyChart = lazy(() => import("@/components/HourlyChart"));
const FifteenDayChart = lazy(() => import("@/components/FifteenDayChart"));
const EnvironmentalPanels = lazy(() =>
  import("@/components/EnvironmentalPanels").then(({ EnvironmentalPanels: Component }) => ({ default: Component })),
);

function EnvironmentalPanelsPlaceholder() {
  return (
    <div className="grid min-w-0 w-full grid-cols-1 gap-3 sm:grid-cols-2" aria-hidden="true">
      <div className="h-64 animate-pulse rounded-[22px] bg-slate-800/40" />
      <div className="h-64 animate-pulse rounded-[22px] bg-slate-800/40" />
    </div>
  );
}

function DeferredEnvironmentalPanels(props: ComponentProps<typeof EnvironmentalPanels>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const target = containerRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "800px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef}>
      {shouldLoad ? (
        <Suspense fallback={<EnvironmentalPanelsPlaceholder />}>
          <EnvironmentalPanels {...props} />
        </Suspense>
      ) : <EnvironmentalPanelsPlaceholder />}
    </div>
  );
}

// ─── Wind Rose ───────────────────────────────────────────────────────────────
function WindRose({ direction }: { direction: number | null }) {
  const cardinalDirections = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] as const;
  const cardinalNames = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"] as const;
  const cardinalLabelPositions = [
    "left-1/2 top-[4px] -translate-x-1/2",
    "right-[8px] top-[9px]",
    "right-[3px] top-1/2 -translate-y-1/2",
    "bottom-[9px] right-[8px]",
    "bottom-[4px] left-1/2 -translate-x-1/2",
    "bottom-[9px] left-[8px]",
    "left-[3px] top-1/2 -translate-y-1/2",
    "left-[8px] top-[9px]",
  ] as const;
  const hasDirection = typeof direction === "number" && Number.isFinite(direction) && direction >= 0 && direction <= 360;
  const directionIndex = hasDirection ? Math.round((direction % 360) / 45) % cardinalDirections.length : null;
  const directionName = directionIndex == null ? null : cardinalNames[directionIndex];
  const readableDirection = directionName ? `${directionName[0].toLocaleUpperCase("fr-FR")}${directionName.slice(1)}` : null;
  const bearingLabel = hasDirection ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(direction)}°` : null;
  const directionDescription = readableDirection && bearingLabel ? `${readableDirection} · ${bearingLabel}` : "Direction indisponible";

  return (
    <div className="flex flex-col items-center gap-0.5" role="img" aria-label={`Boussole du vent : huit directions, nord en haut. ${directionDescription}.`}>
      <div
        className="relative isolate grid size-[4.5rem] place-items-center rounded-full border border-[#31355e] bg-[radial-gradient(circle_at_32%_26%,#2c3157_0%,#12132a_55%,#07070f_100%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.22),inset_0_-3px_6px_rgba(0,0,0,0.65),0_10px_18px_rgba(0,0,0,0.65),0_0_18px_rgba(0,245,255,0.22)] ring-1 ring-black/50 before:absolute before:inset-[3px] before:rounded-full before:border before:border-white/10 before:bg-[radial-gradient(circle_at_35%_28%,rgba(140,200,255,0.1),transparent_46%)] before:content-[''] sm:size-20"
        style={{ transform: "perspective(320px) rotateX(10deg)" }}
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 z-10 size-full" aria-hidden="true">
          <defs>
            <radialGradient id="wind-compass-dial" cx="38%" cy="28%" r="82%">
              <stop offset="0%" stopColor="#182452" />
              <stop offset="42%" stopColor="#0A0E2A" />
              <stop offset="100%" stopColor="#05081c" />
            </radialGradient>
            <linearGradient id="wind-compass-bezel" x1="0.15" y1="0" x2="0.85" y2="1">
              <stop offset="0%" stopColor="#4c527e" />
              <stop offset="30%" stopColor="#262a4c" />
              <stop offset="55%" stopColor="#12131f" />
              <stop offset="80%" stopColor="#1c2038" />
              <stop offset="100%" stopColor="#3a3f68" />
            </linearGradient>
            <linearGradient id="wind-compass-needle" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e6feff" />
              <stop offset="42%" stopColor="#00F5FF" />
              <stop offset="100%" stopColor="#0077a8" />
            </linearGradient>
            <linearGradient id="wind-compass-needle-tail" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4a5474" />
              <stop offset="55%" stopColor="#232a42" />
              <stop offset="100%" stopColor="#0d1020" />
            </linearGradient>
            <radialGradient id="wind-compass-hub" cx="34%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#f4f8ff" />
              <stop offset="32%" stopColor="#aeb9d4" />
              <stop offset="68%" stopColor="#3d4460" />
              <stop offset="100%" stopColor="#171b2e" />
            </radialGradient>
            <filter id="wind-compass-neon" x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur stdDeviation="1.9" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx="50" cy="50" r="46.4" fill="none" stroke="url(#wind-compass-bezel)" strokeWidth="4.4" />
          <circle cx="50" cy="50" r="48.4" fill="none" stroke="rgba(0,245,255,0.5)" strokeWidth="0.55" filter="url(#wind-compass-neon)" />
          <path d="M17.2 17.2 A46.4 46.4 0 0 1 50 3.6" fill="none" stroke="rgba(170,220,255,0.5)" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M82.8 82.8 A46.4 46.4 0 0 1 50 96.4" fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="50" cy="50" r="43" fill="url(#wind-compass-dial)" stroke="rgba(0,245,255,0.32)" strokeWidth="0.9" />
          <circle cx="50" cy="50" r="39.5" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" />
          {Array.from({ length: 32 }, (_, index) => {
            const angle = (index * 11.25 - 90) * Math.PI / 180;
            const isMajor = index % 4 === 0;
            const innerRadius = isMajor ? 33 : 36;
            return <line key={index} x1={50 + innerRadius * Math.cos(angle)} y1={50 + innerRadius * Math.sin(angle)} x2={50 + 41.2 * Math.cos(angle)} y2={50 + 41.2 * Math.sin(angle)} stroke={isMajor ? "rgba(0,245,255,0.92)" : "rgba(150,225,245,0.38)"} strokeWidth={isMajor ? 1.4 : 0.55} filter={isMajor ? "url(#wind-compass-neon)" : undefined} />;
          })}
          {hasDirection ? <g transform={`rotate(${direction}, 50, 50)`}>
            <path d="M50 17.5 L54.6 49 L50 44.6 L45.4 49 Z" fill="url(#wind-compass-needle)" stroke="rgba(235,255,255,0.9)" strokeWidth="0.6" filter="url(#wind-compass-neon)" />
            <path d="M50 82.5 L54.6 51 L50 55.4 L45.4 51 Z" fill="url(#wind-compass-needle-tail)" stroke="rgba(130,140,170,0.55)" strokeWidth="0.5" />
          </g> : null}
          <circle cx="50" cy="50" r="5.6" fill="url(#wind-compass-hub)" stroke="rgba(255,255,255,0.28)" strokeWidth="0.7" />
          <circle cx="50" cy="50" r="1.9" fill="#00F5FF" filter="url(#wind-compass-neon)" />
          <circle cx="48.1" cy="47.9" r="0.9" fill="rgba(255,255,255,0.9)" />
        </svg>
        {cardinalDirections.map((label, index) => (
          <span key={label} aria-hidden="true" className={`absolute z-20 text-[8px] font-black leading-none text-white drop-shadow-[0_0_4px_rgba(0,245,255,0.95)] ${cardinalLabelPositions[index]}`}>
            {label}
          </span>
        ))}
      </div>
      <p className="min-h-4 text-center text-[10px] font-bold leading-tight text-cyan-100">{directionDescription}</p>
    </div>
  );
}


function currentStateFieldTitle(field?: CurrentStateFieldLike | null, snapshotAt?: string | null): string {
  const provenance = field?.provenance;
  if (!provenance) return snapshotAt ? `Snapshot Open-Meteo · ${snapshotAt}` : "Aucune provenance courante disponible.";
  const measurements = provenance.measurements.map((measurement) =>
    `${measurement.stationName} (${measurement.source}) · ${measurement.observedAt} · ${measurement.ageMinutes} min`
  );
  return [provenance.label, ...measurements, provenance.reason].filter(Boolean).join("\n");
}

function currentNumber(field?: CurrentStateFieldLike | null): number | null {
  return typeof field?.value === "number" && Number.isFinite(field.value) ? field.value : null;
}

function currentString(field?: CurrentStateFieldLike | null): string | null {
  const value = typeof field?.value === "string" ? field.value.trim() : "";
  return value && !/^(?:conditions? indisponibles|indisponible)$/i.test(value) ? value : null;
}

function formatHourlyForecastValidAt(validAt?: number | null): string {
  if (typeof validAt !== "number" || !Number.isFinite(validAt)) return "Échéance indisponible";
  return new Date(validAt).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }) + " · Europe/Paris";
}

function formatHourlyForecastSource(source?: string | null): string {
  const normalized = source?.trim();
  if (!normalized) return "Source non documentée";
  return normalized.toLowerCase() === "open-meteo" ? "Open-Meteo" : normalized;
}

function formatHourlyForecastComputedAt(computedAt?: string | null): string {
  if (!computedAt) return "Calcul indisponible";
  const date = new Date(computedAt);
  if (!Number.isFinite(date.getTime())) return "Calcul indisponible";
  return `Calcul ${date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  })} · Europe/Paris`;
}

// ─── UV Index indicator ────────────────────────────────────────────────────────
function UVBadge({ uv }: { uv: number | null }) {
  if (uv == null) return <span className="text-lg font-semibold">—</span>;
  const level = uv <= 2 ? { label: "Faible", color: "text-green-400" }
    : uv <= 5 ? { label: "Modéré", color: "text-yellow-400" }
    : uv <= 7 ? { label: "Élevé", color: "text-orange-400" }
    : uv <= 10 ? { label: "Très élevé", color: "text-red-400" }
    : { label: "Extrême", color: "text-purple-400" };
  return (
    <div className="flex flex-col items-center">
      <span className={`text-lg font-bold sm:text-2xl ${level.color}`}>{Math.round(uv)}</span>
      <span className={`text-[11px] sm:text-sm ${level.color} opacity-80`}>{level.label}</span>
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
  status: "stored" | "no_station" | "failed" | "missing";
  date: string;
  hour: number;
  attempts: number;
  stationCount: number;
  reason?: string | null;
};

type ForecastRunStatus = "completed" | "partial" | "failed";

function formatCollectionDateTime(value: string | Date | null | undefined): string {
  return value ? formatCollectionTimestamp(value) : "Aucun succès vérifiable";
}

function hourlyCollectionPresentation(trace: HourlyCollectionTrace) {
  if (trace.status === "stored" && trace.reason?.startsWith("Archivé via la reprise automatique")) return { label: "Archivé via reprise", className: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" };
  if (trace.status === "stored") return { label: "Données archivées", className: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" };
  if (trace.status === "no_station") return { label: "Aucune station qualifiée", className: "border-amber-300/25 bg-amber-300/10 text-amber-100" };
  if (trace.status === "missing") return { label: "Créneau sans trace", className: "border-orange-300/25 bg-orange-300/10 text-orange-100" };
  return { label: "Erreur technique", className: "border-red-300/25 bg-red-300/10 text-red-100" };
}

function hourlyCollectionMoment(trace: HourlyCollectionTrace) {
  return `${new Date(`${trace.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" })} · ${String(trace.hour).padStart(2, "0")} h`;
}

const regimeInputStatusLabels: Record<RegimeInputStatus, string> = {
  available: "Disponible",
  missing: "Absente",
  invalid: "Invalide",
  stale: "Périmée",
};

function DominantRegimePanel({
  regime,
  panelDate,
  regimeSourceLabel,
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
  regimeSourceLabel: string;
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
            <p className="text-[9px] leading-tight text-sky-200/80 sm:mt-0.5 sm:text-[10px]">{regimeSourceLabel} · {regimeFreshnessLabel}</p>
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
  const [weatherEffectsMode, setWeatherEffectsMode] = useState<DashboardWeatherEffectsMode>(getDashboardWeatherEffectsMode);
  const nextWeatherEffectsMode = getNextDashboardWeatherEffectsMode(weatherEffectsMode);
  const [hasWaitTimedOut, setHasWaitTimedOut] = useState(false);
  const [showRegimeMenu, setShowRegimeMenu] = useState(false);
  const [expandedRegimeIds, setExpandedRegimeIds] = useState<string[]>([]);
  const [personalTemperature, setPersonalTemperature] = useState("");
  const [personalWind, setPersonalWind] = useState("");
  const [personalPrecipitation, setPersonalPrecipitation] = useState("");
  const [personalCondition, setPersonalCondition] = useState<(typeof PERSONAL_CONDITION_OPTIONS)[number]["id"]>("partly_cloudy");
  const [personalSubmitResult, setPersonalSubmitResult] = useState<{ notice: string } | null>(null);
  const [isPersonalObservationOpen, setIsPersonalObservationOpen] = useState(false);
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
    ...getOfficialForecastCoordinates(selectedLocation),
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

  // Pre-loaded forecasts for all favorites (from the configured schedule)
  const { data: preloadedForecasts } = trpc.favorites.getPreloadedForecasts.useQuery(
    undefined,
    { enabled: !!user, staleTime: 5 * 60 * 1000 }
  );

  // Build prefetchedWeather map for FavoritesBar pills (key = "fav-{id}")
  const prefetchedWeather = useMemo(() => {
    if (!preloadedForecasts) return undefined;
    const map = new Map<string, { temp: number | null; condition: string | null }>();
    for (const pf of preloadedForecasts) {
      if (pf.forecast) {
        map.set(`fav-${pf.favoriteId}`, {
          temp: pf.forecast.tempCurrent ?? null,
          condition: pf.forecast.condition,
        });
      }
    }
    return map;
  }, [preloadedForecasts]);

  // Coordinates for weather queries — use active location or Hondeghem default
  const coordsInput = useMemo(() => ({
    ...getOfficialForecastCoordinates(selectedLocation),
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
  // Réponse officielle consolidée : le hook partagé alimente Dashboard et Détails avec le même lieu et la même politique de rafraîchissement.
  const { query: officialForecastQuery } = useOfficialForecast(selectedLocation);
  const { data: officialForecast, isLoading: officialLoading, isError: officialError, isFetching: officialFetching, refetch: refetchOfficialForecast } = officialForecastQuery;
  const { data: dashboardDailyForecast, isLoading: dashboardDailyLoading } = trpc.weather.getDashboardDailyForecast.useQuery(
    coordsInput,
    {
      // The daily horizon is visually below the current conditions. Waiting for
      // the critical hourly forecast prevents competing cold-start requests.
      enabled: !!officialForecast,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  );
  const { data: currentDashboardWeather } = trpc.favorites.getCurrentDashboardWeather.useQuery(
    coordsInput,
    { staleTime: 60 * 1000, refetchInterval: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: 1 },
  );
  const { data: fastCurrentSnapshot } = trpc.weather.getCurrentModelSnapshot.useQuery(
    coordsInput,
    { staleTime: 60 * 1000, refetchInterval: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: 1 },
  );
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
  const archivedSnapshotSlots = countArchivedSnapshotSlots(hourlyCollectionHistory);
  const technicalFailureStreak = collectionHealthReport?.technicalFailureStreak ?? 0;
  const missingSnapshotSlots = collectionHealthReport?.missingSnapshotSlots ?? 0;
  const latestHourlyCollection = hourlyCollectionHistory[0] ?? null;
  const latestForecastRun = collectionHealthReport?.lastForecastRun ?? null;
  const latestForecastRunStatus: ForecastRunStatus | null = latestForecastRun?.status === "failed"
    ? "failed"
    : latestForecastRun?.status === "partial"
      ? "partial"
      : latestForecastRun?.status === "completed"
        ? "completed"
        : null;
  const latestForecastSuccessAt = collectionHealthReport?.lastForecastSuccess?.collectedAt ?? null;
  const latestForecastSuccessDurationMs = collectionHealthReport?.lastForecastSuccess?.status === "completed" && latestForecastRun?.status === "completed" && latestForecastSuccessAt && latestForecastRun.collectedAt
    && new Date(latestForecastSuccessAt).getTime() === new Date(latestForecastRun.collectedAt).getTime()
    ? latestForecastRun.durationMs
    : null;
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
      setPersonalSubmitResult({ notice: result.notice });
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

  // The current model snapshot is explicitly distinct from the official
  // seven-model horizon, but lets the page render instead of holding a full
  // screen skeleton while that horizon refreshes after a cold start.
  const isLoading = officialLoading && hourlyLoading && !fastCurrentSnapshot;
  const isError = officialError && hourlyError && !fastCurrentSnapshot;
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
    if (previousKey && previousKey !== latestCollectionTraceKey && latestHourlyCollection.status !== "missing") {
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
  const days: any[] = dashboardDailyForecast?.days ?? officialForecast?.days ?? (lw ? lw.forecast15d : []);
  const today = days[0] ?? null;
  const officialHours = officialForecast?.hours ?? [];
  const hours = officialHours;
  const currentSnapshot = officialForecast?.currentSnapshot ?? fastCurrentSnapshot ?? null;
  const dailyFallback = officialForecast?.dailyFallback ?? dash?.dailyFallback ?? null;
  const currentFields = currentDashboardWeather?.fields;
  const hasPhysicalCurrentState = Object.values(currentFields ?? {}).some((field) => field.provenance.kind === "physical_stations");
  const hasAvailableCurrentState = Object.values(currentFields ?? {}).some((field) => field.value != null);
  const nowHour = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).slice(0, 2) + ":00";
  const forecastNowMs = Date.now();
  const panelDate = formatDashboardCompactDate(officialForecast?.today ?? dash?.today);
  const localPrimaryRegime = lw?.multiRegime?.activeRegimes?.[0] ?? null;
  const localObservedRegime = localPrimaryRegime
    ? { id: localPrimaryRegime.id, label: localPrimaryRegime.label, emoji: localPrimaryRegime.emoji }
    : null;
  const regimeUnavailable = officialRegime?.status === "unknown" || (!officialPrimaryRegime && !dash?.regime);
  const regime = officialPrimaryRegime
      ? {
          regime: officialPrimaryRegime.id,
          label: officialPrimaryRegime.label,
          emoji: officialPrimaryRegime.emoji,
          description: officialPrimaryRegime.description,
          weights: officialPrimaryRegime.weights ?? null,
        }
      : regimeUnavailable
        ? { regime: "unknown", label: "Régime indisponible", emoji: "—", description: officialRegime?.description ?? "Des données météo requises sont absentes ou invalides.", weights: null }
        : dash?.regime;
  const regimeProvenance = getRegimeProvenancePresentation({
    source: officialRegime?.source,
    sourceLabel: officialRegime?.sourceLabel,
    sourceUpdatedAt: officialRegime?.sourceUpdatedAt,
    hasRegime: !!officialPrimaryRegime,
  });
  const regimeSourceLabel = regimeProvenance.sourceLabel;
  const regimeSourceUpdatedAt = regimeProvenance.sourceTimeLabel;
  const liveRegimeFreshnessLabel = regimeProvenance.freshnessLabel;
  const regimeInputDiagnostics = Array.isArray(officialRegime?.inputDiagnostics)
    ? officialRegime.inputDiagnostics as OfficialRegimeInputDiagnostic[]
    : null;
  const dashboardObservability = getDashboardObservability({
    selectedLocationLabel: selectedLocation?.name,
    selectedLocationRegimeInputs: regimeInputDiagnostics,
    latestGlobalBatchStatus: latestForecastRunStatus,
    latestGlobalBatchAt: latestForecastRun?.collectedAt ?? null,
  });
  const regimeInputCoverage = dashboardObservability.selectedLocationCoverage;
  const collectionHealth = dashboardObservability.latestGlobalBatchHealth;
  const allRegimeIds = regimeCatalogue.map((candidate: any) => candidate.id);
  const allRegimesExpanded = allRegimeIds.length > 0 && allRegimeIds.every((id) => expandedRegimeIds.includes(id));
  const netatmoStatusLabel: Record<string, string> = {
    live: "Netatmo : relevés directs authentifiés",
    fresh_cache: "Netatmo : cache authentifié récent (service temporairement indisponible)",
    connected_empty: "Netatmo : connecté, aucune station exploitable dans le rayon",
    temporarily_unavailable: "Netatmo : service temporairement indisponible",
    not_connected: "Netatmo : aucune autorisation active pour cette session",
  };

  // Heuristic multi-regime score for regime-signal badges
  const multiRegime = officialRegime
    ? { activeRegimes: officialRegime.active, confidenceScore: officialRegime.confidence }
    : (dash as any)?.multiRegime ?? null;
  const primaryRegimeId: string = multiRegime?.activeRegimes?.[0]?.id ?? (regime as any)?.regime ?? (regime as any)?.id ?? "unknown";
  const regimeScore: number | null = multiRegime?.confidenceScore ?? null;
  // L’accord est affiché en unités physiques et demeure distinct de la fiabilité historique.
  const activeOfficialHour = getActiveOfficialForecastHour(hours, forecastNowMs);
  const currentHourIndex = activeOfficialHour?.index ?? -1;
  const currentHour = activeOfficialHour?.hour ?? null;
  const isDailyFallback = currentHour == null && currentSnapshot == null && !hasPhysicalCurrentState && dailyFallback?.kind === "daily_fusion";
  const fallbackDateLabel = isDailyFallback
    ? new Date(`${dailyFallback.date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Paris" })
    : null;
  const fallbackComputedAtLabel = isDailyFallback
    ? new Date(dailyFallback.computedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
    : null;
  const regimeFreshnessLabel = liveRegimeFreshnessLabel;
  const nextConditionChange = isDailyFallback ? null : findNextConditionChange(hours, currentHour?.hour ?? nowHour, currentHour?.validAt);
  const nextWeatherAlert = getNextWeatherAlert(nextConditionChange);
  const officialSnapshotTemp = currentSnapshot?.temp ?? null;
  const snapshotCapturedAt = currentSnapshot?.capturedAt ?? null;
  const temperatureField = withCurrentSnapshotFallback(currentFields?.temperature, currentSnapshot?.temp, snapshotCapturedAt);
  const conditionField = withCurrentSnapshotFallback(currentFields?.condition, currentSnapshot?.condition, snapshotCapturedAt);
  const currentTemp = currentNumber(temperatureField);
  const selectedCondition = currentString(conditionField);
  const displayedCondition = selectedCondition ?? (isDailyFallback ? dailyFallback.condition : null);
  const activeFavoriteWeather = {
    temp: officialSnapshotTemp,
    condition: currentSnapshot?.condition ?? (isDailyFallback ? dailyFallback.condition : null),
  };
  const maxTemperature = isDailyFallback ? dailyFallback.tempMax : today?.tempMax ?? meteoAI?.tempMax ?? null;
  const minTemperature = isDailyFallback ? dailyFallback.tempMin : today?.tempMin ?? meteoAI?.tempMin ?? null;
  const maxTemperatureTone = getExtremeTemperatureTone("max", maxTemperature);
  const minTemperatureTone = getExtremeTemperatureTone("min", minTemperature);
  const apparentTemperatureField = withCurrentSnapshotFallback(currentFields?.apparentTemperature, currentSnapshot?.apparentTemp, snapshotCapturedAt);
  const apparentTemp = currentNumber(apparentTemperatureField);
  const futureUVHour = hours.find((hour) => typeof hour.validAt === "number" && hour.validAt > forecastNowMs && hour.uvIndex != null) ?? null;
  const uvForecastHour = currentHour?.uvIndex != null ? currentHour : futureUVHour;
  const currentUV = currentHour?.uvIndex ?? futureUVHour?.uvIndex ?? null;
  const currentUVLabel = uvForecastHour && uvForecastHour !== currentHour ? "UV prévu à l’échéance suivante" : "UV prévu pour cette heure";
  const windDirectionField = withCurrentSnapshotFallback(currentFields?.windDirection, currentSnapshot?.windDirection, snapshotCapturedAt);
  const windSpeedField = withCurrentSnapshotFallback(currentFields?.windSpeed, currentSnapshot?.windSpeed, snapshotCapturedAt);
  const windGustField = withCurrentSnapshotFallback(currentFields?.windGust, currentSnapshot?.windGust, snapshotCapturedAt);
  const precipitationField = withCurrentSnapshotFallback(currentFields?.precipitation, currentSnapshot?.precipitation, snapshotCapturedAt);
  const cloudCoverField = withCurrentSnapshotFallback(currentFields?.cloudCover, currentSnapshot?.cloudCover, snapshotCapturedAt);
  const humidityField = withCurrentSnapshotFallback(currentFields?.humidity, currentSnapshot?.humidity, snapshotCapturedAt);
  const pressureField = currentFields?.pressure ?? null;
  const weatherCodeField = withCurrentSnapshotFallback(currentFields?.weatherCode, currentSnapshot?.weatherCode, snapshotCapturedAt);
  const currentWeatherCode = currentNumber(weatherCodeField);
  const windDir = currentNumber(windDirectionField);
  const windSpeed = currentNumber(windSpeedField);
  const currentWindGust = currentNumber(windGustField);
  const currentPrecipitation = currentNumber(precipitationField);
  const currentPressure = currentNumber(pressureField);
  const hourlyForecastSource = forecastProvenance?.source ?? officialForecast?.officialSnapshot?.source ?? null;
  const hourlyForecastComputedAt = forecastProvenance?.updatedAt ?? officialForecast?.officialSnapshot?.computedAt ?? null;
  const currentCloudCover = currentNumber(cloudCoverField);
  const currentHumidity = currentNumber(humidityField);
  const dashboardSkyImage = getDashboardWeatherImage({ condition: displayedCondition, regime: regime?.label, temperature: currentTemp ?? undefined, cloudCover: currentCloudCover ?? undefined, precipitation: currentPrecipitation ?? (isDailyFallback ? dailyFallback.precipitation : undefined) ?? undefined, windSpeed: windSpeed ?? undefined });
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
    <div className="dashboard-weather-page min-h-dvh w-full overflow-x-clip bg-background" style={dashboardSkyStyle}>
      <DashboardWeatherAtmosphere condition={displayedCondition} regime={regime?.label} weatherCode={currentWeatherCode} temperature={currentTemp} visibilityKm={currentHour?.visibility} precipitation={currentPrecipitation ?? (isDailyFallback ? dailyFallback.precipitation : null)} cloudCover={currentCloudCover} windSpeed={windSpeed} windDirection={windDir} windGust={currentWindGust} effectsMode={weatherEffectsMode} />
      <div className="mx-auto w-full min-w-0 max-w-none space-y-2 px-1 pb-3 pt-[max(env(safe-area-inset-top),0.25rem)] sm:max-w-2xl sm:space-y-6 sm:px-6 sm:py-8">

        {!authLoading && !user && (
          <div role="status" className="rounded-xl border border-blue-400/20 bg-blue-400/5 px-3 py-2 text-xs text-blue-100">
            <p>{DASHBOARD_PREVIEW_MESSAGE}</p>
            <a
              href={getLoginUrl()}
              className="mt-2 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-blue-300/30 bg-blue-300/10 px-3 py-1.5 font-semibold text-blue-50 transition-colors hover:bg-blue-300/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              Se connecter
            </a>
          </div>
        )}

        {/* ── Favorites Bar ── */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              storeDashboardWeatherEffectsMode(nextWeatherEffectsMode);
              setWeatherEffectsMode(nextWeatherEffectsMode);
            }}
            aria-label={`Mode actuel des animations météo 3D : ${getDashboardWeatherEffectsModeLabel(weatherEffectsMode)}. Un clic passe au niveau suivant.`}
            aria-pressed={weatherEffectsMode !== "off"}
            title="Basculer entre effets 3D complets, réduits et désactivés"
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 ${weatherEffectsMode === "off" ? "border-slate-600 bg-slate-900/70 text-slate-300" : weatherEffectsMode === "reduced" ? "border-amber-300/30 bg-amber-300/10 text-amber-100" : "border-sky-300/30 bg-sky-300/10 text-sky-100"}`}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Effets 3D · {getDashboardWeatherEffectsModeLabel(weatherEffectsMode)}</span>
          </button>
        </div>
        <FavoritesBar
          activeLocation={activeLocation}
          onLocationChange={handleLocationChange}
          prefetchedWeather={prefetchedWeather}
          activeWeather={activeFavoriteWeather}
        />

        {/* ── Hero : Température actuelle + max/min ── */}
        <div className="dashboard-sky-card relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-slate-700 rounded-2xl px-3 pb-3 pt-1 sm:p-6">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/58 via-slate-950/34 to-slate-950/82 pointer-events-none" />
          <div className="relative">
            {/* ── Regime badge ── */}
            {regime && (
              <div className="mb-1 sm:mb-2 sm:rounded-xl sm:border sm:border-slate-600/50 sm:bg-slate-800/60 sm:px-3 sm:py-1.5">
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
                      <p className="text-[9px] leading-tight text-sky-200/80 sm:mt-0.5 sm:text-[10px]">{regimeSourceLabel} · {regimeFreshnessLabel}</p>
                      <span className="sr-only">Voir les 20 régimes</span>
                    </div>
                  </button>
                </div>
                {/* Weight pills */}
                <div className="mt-0.5 flex flex-wrap gap-1 sm:mt-1">
                  <span className="rounded-full border border-orange-500/30 bg-orange-500/20 px-1.5 py-px text-[11px] font-medium text-orange-300 sm:px-2 sm:py-0.5 sm:text-xs">
                    🌡 {regime?.weights?.temp == null ? "—" : `${Math.round(regime.weights.temp * 100)}%`}
                  </span>
                  <span className="rounded-full border border-blue-500/30 bg-blue-500/20 px-1.5 py-px text-[11px] font-medium text-blue-300 sm:px-2 sm:py-0.5 sm:text-xs">
                    🌧 {regime?.weights?.precip == null ? "—" : `${Math.round(regime.weights.precip * 100)}%`}
                  </span>
                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/20 px-1.5 py-px text-[11px] font-medium text-cyan-300 sm:px-2 sm:py-0.5 sm:text-xs">
                    💨 {regime?.weights?.wind == null ? "—" : `${Math.round(regime.weights.wind * 100)}%`}
                  </span>
                  <span className="rounded-full border border-purple-500/30 bg-purple-500/20 px-1.5 py-px text-[11px] font-medium text-purple-300 sm:px-2 sm:py-0.5 sm:text-xs">
                    ☁ {regime?.weights?.condition == null ? "—" : `${Math.round(regime.weights.condition * 100)}%`}
                  </span>
                </div>
                <details className="mt-2 rounded-lg border border-slate-600/35 bg-slate-950/25 px-2 py-1.5">
                  <summary className="cursor-pointer text-[9px] font-semibold text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
                    Couverture du lieu choisi · {dashboardObservability.selectedLocationLabel} · {regimeInputCoverage.status === "unavailable" ? "diagnostic indisponible" : `${regimeInputCoverage.available}/${regimeInputCoverage.total} disponibles`}
                  </summary>
                  <div className="mt-1.5 space-y-1.5" aria-label="Entrées réellement retenues pour le régime">
                    <p className="text-[8px] leading-relaxed text-slate-400">Valeurs exactes retenues pour ce calcul; elles ne prouvent pas, à elles seules, la cause d’un régime indisponible.</p>
                    {regimeInputDiagnostics?.length ? regimeInputDiagnostics.map((input) => {
                      const sourceTime = formatCollectionTimestamp(input.sourceUpdatedAt);
                      const validityTime = input.validAt && input.validAt !== input.sourceUpdatedAt
                        ? ` · validité ${formatCollectionTimestamp(input.validAt)}`
                        : "";
                      const sourceAge = input.sourceAgeMinutes == null ? "âge inconnu" : `âge ${input.sourceAgeMinutes} min`;
                      return (
                        <div key={input.key} className="rounded-md border border-slate-700/40 bg-black/15 px-2 py-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                            <span className="text-[9px] font-semibold text-slate-100">{input.label}</span>
                            <span className="text-[9px] font-medium text-slate-200">
                              {regimeInputStatusLabels[input.status]} · {input.value == null ? "—" : `${formatDashboardNumber(input.value)} ${input.unit}`}
                            </span>
                          </div>
                          <p className="mt-0.5 break-words text-[8px] leading-relaxed text-slate-400">{input.sourceLabel ?? "Source indisponible"} · source {sourceTime}{validityTime} · {sourceAge}</p>
                        </div>
                      );
                    }) : <p className="text-[9px] text-slate-400">Diagnostic détaillé des valeurs sélectionnées indisponible.</p>}
                  </div>
                </details>
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
                <p className="mt-0.5 hidden text-[10px] font-medium text-slate-300 sm:block">{regimeSourceLabel} · {regimeFreshnessLabel}{regimeSourceUpdatedAt ? ` · source à ${regimeSourceUpdatedAt} (Europe/Paris)` : ""}</p>
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
                <span className="flex min-w-0 items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${collectionHealth.dot}`} aria-hidden="true" /><span className="min-w-0"><span className="block text-[9px] font-semibold uppercase tracking-[0.12em] opacity-75">Santé du dernier lot global</span><strong className="block truncate text-[11px]">{collectionHealth.label}</strong><span className="block truncate text-[9px] opacity-80">{collectionHealth.detail}</span>{collectionUpdateNotice && <span className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold text-cyan-100" role="status" aria-live="polite"><Activity className="h-3 w-3 shrink-0" aria-hidden="true" />Trace · {hourlyCollectionMoment(collectionUpdateNotice)} · {hourlyCollectionPresentation(collectionUpdateNotice).label}</span>}</span></span><span className="shrink-0 text-[9px] font-semibold text-white/80">Détails&nbsp;→</span>
                <span className="shrink-0 text-right text-[9px] leading-tight opacity-85">{collectionHealthReport ? `${archivedSnapshotSlots}/${hourlyCollectionHistory.length}` : "—/24"}<br />créneaux archivés pour ce lieu</span>
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
            {isDangerousRegime(primaryRegimeId) && regimeScore != null && (
              <div className="mb-3">
                <AlertBadge regimeId={primaryRegimeId} regimeScore={regimeScore} regimeScoreThreshold={60} />
              </div>
            )}

            {/* Main current temperature row: qualified physical estimate or field-level model fallback. */}
            <div className="flex items-start gap-2 sm:gap-6">
              {/* The main temperature is selected from the current-state read model, independently of forecasts. */}
              <div className="w-[4.75rem] shrink-0 pt-0.5 sm:w-[5.25rem] sm:pt-0">
                {displayedCondition
                  ? <MeteoIcon name={getIconNameFromCondition(displayedCondition)} size={64} />
                  : <div className="grid h-16 w-16 place-items-center rounded-full border border-slate-500/30 bg-slate-900/45 text-2xl font-medium text-slate-500" role="img" aria-label="Condition météo indisponible">?</div>}
              </div>

              <div className={dashboardTemperatureLayout.content}>
                {/* Big current temp */}
                <div className="min-w-0">
                  <p className={dashboardTemperatureLayout.currentValue}>
                    {currentTemp != null ? currentTemp.toFixed(1) : "—"}°
                  </p>
                  <p className="mt-0.5 text-[9px] leading-tight text-slate-400" title={currentStateFieldTitle(temperatureField, currentSnapshot?.capturedAt)}>
                    {formatCurrentStateProvenance(temperatureField, currentSnapshot?.capturedAt)}
                  </p>
                </div>

                {/* Max / Min */}
                <div className={dashboardTemperatureLayout.extremes}>
                  <div className={`flex items-center justify-end gap-1 rounded-lg border px-1.5 py-0.5 sm:gap-1.5 ${maxTemperatureTone.container}`}>
                    <span className={`text-[8px] sm:text-xs font-bold uppercase tracking-normal sm:tracking-wide ${maxTemperatureTone.label}`}>Max prévue</span>
                    <span className={`${dashboardTemperatureLayout.extremeValue} font-black ${maxTemperatureTone.value}`}>
                      {maxTemperature != null ? Number(maxTemperature).toFixed(1) : "—"}°
                    </span>
                  </div>
                  <div className={`flex items-center justify-end gap-1 rounded-lg border px-1.5 py-0.5 sm:gap-1.5 ${minTemperatureTone.container}`}>
                    <span className={`text-[8px] sm:text-xs font-bold uppercase tracking-normal sm:tracking-wide ${minTemperatureTone.label}`}>Min prévue</span>
                    <span className={`${dashboardTemperatureLayout.extremeValue} font-black ${minTemperatureTone.value}`}>
                      {minTemperature != null ? Number(minTemperature).toFixed(1) : "—"}°
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-1 min-w-0 space-y-0.5 sm:mt-1.5 sm:space-y-1">
              <p className="whitespace-nowrap text-[15px] font-medium leading-tight text-slate-100/90 sm:text-lg">
                <span className="font-semibold text-sky-200/90">{isDailyFallback ? "Tendance quotidienne · " : currentSnapshot || hasAvailableCurrentState ? "État actuel · " : "État courant indisponible · "}</span>
                <span className="text-white">{displayedCondition ?? "Condition indisponible"}</span>
              </p>
              <p className="text-[9px] leading-tight text-slate-400" title={currentStateFieldTitle(conditionField, currentSnapshot?.capturedAt)}>
                {isDailyFallback && !conditionField ? "Tendance quotidienne · pas une observation instantanée" : formatCurrentStateProvenance(conditionField, currentSnapshot?.capturedAt)}
                {currentWeatherCode == null ? "" : ` · code WMO ${currentWeatherCode}`}
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

            <section aria-label="Observations actuelles et valeurs prévisionnelles" className="rounded-xl border border-cyan-400/20 bg-cyan-950/10 px-2 pb-2">
              <p className="pt-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/90 sm:text-sm">Observations actuelles <span className="font-normal normal-case tracking-normal text-slate-400">· nature, source et échéance indiquées par valeur</span></p>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_5.75rem_minmax(0,1fr)] items-center gap-1 border-t border-cyan-400/20 pt-3 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)] sm:gap-3">
                <div className="min-w-0 rounded-lg border border-white/5 bg-black/20 p-1.5 text-center sm:p-2" title={currentStateFieldTitle(apparentTemperatureField, currentSnapshot?.capturedAt)}>
                  <p className="flex items-center justify-center gap-1 text-[12px] font-medium leading-tight text-slate-200 sm:text-sm"><Thermometer className="h-3.5 w-3.5 shrink-0" />Ressenti</p>
                  <p className="mt-1 text-lg font-bold text-white sm:text-2xl">{apparentTemp != null ? `${apparentTemp.toFixed(1)}°` : "—"}</p>
                  <p className="mt-1 text-[9px] leading-tight text-slate-400 sm:text-[10px]">{formatCurrentStateProvenance(apparentTemperatureField, currentSnapshot?.capturedAt)}</p>
                </div>
                <div className="min-w-0 text-center">
                  <p className="mb-1 flex items-center justify-center gap-1 text-[12px] font-medium leading-tight text-slate-200 sm:text-sm"><Wind className="h-3.5 w-3.5 shrink-0" />Direction du vent</p>
                  <WindRose direction={windDir} />
                  <p className="mt-1 text-[9px] leading-tight text-slate-400 sm:text-[10px]" title={currentStateFieldTitle(windDirectionField, currentSnapshot?.capturedAt)}>
                    {formatCurrentStateProvenance(windDirectionField, currentSnapshot?.capturedAt)}
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-white/5 bg-black/20 p-1.5 text-center sm:p-2" title={currentStateFieldTitle(cloudCoverField, currentSnapshot?.capturedAt)}>
                  <p className="flex items-center justify-center gap-1 text-[12px] font-medium leading-tight text-slate-200 sm:text-sm"><Eye className="h-3.5 w-3.5 shrink-0" />Nuages actuels</p>
                  <p className="mt-1 text-lg font-bold text-white sm:text-2xl">{currentCloudCover == null ? "—" : `${formatDashboardNumber(currentCloudCover, 0)}%`}</p>
                  <p className="mt-1 text-[9px] leading-tight text-slate-400 sm:text-[10px]">{formatCurrentStateProvenance(cloudCoverField, currentSnapshot?.capturedAt)}</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="min-w-0 rounded-lg border border-white/5 bg-black/20 p-2 text-center" title={currentStateFieldTitle(windSpeedField, currentSnapshot?.capturedAt)}>
                  <p className="flex items-center justify-center gap-1 text-[12px] font-medium leading-tight text-slate-200 sm:text-sm"><Wind className="h-3.5 w-3.5 shrink-0" />Vent actuel</p>
                  <p className="mt-1 text-lg font-semibold text-white sm:text-xl">{windSpeed == null ? "—" : `${windSpeed.toFixed(1)} km/h`}</p>
                  <p className="mt-1 text-[9px] leading-tight text-slate-400 sm:text-[10px]">{formatCurrentStateProvenance(windSpeedField, currentSnapshot?.capturedAt)}</p>
                </div>
                <div className="min-w-0 rounded-lg border border-white/5 bg-black/20 p-2 text-center" title={currentStateFieldTitle(windGustField, currentSnapshot?.capturedAt)}>
                  <p className="flex items-center justify-center gap-1 text-[12px] font-medium leading-tight text-slate-200 sm:text-sm"><Wind className="h-3.5 w-3.5 shrink-0" />Rafales actuelles</p>
                  <p className="mt-1 text-lg font-semibold text-white sm:text-xl">{currentWindGust == null ? "—" : `${currentWindGust.toFixed(1)} km/h`}</p>
                  <p className="mt-1 text-[9px] leading-tight text-slate-400 sm:text-[10px]">{formatCurrentStateProvenance(windGustField, currentSnapshot?.capturedAt)}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-white/5 bg-black/20 p-2" title={currentStateFieldTitle(pressureField)}>
                <p className="flex items-center gap-1 text-[12px] font-medium text-slate-200 sm:text-sm"><Thermometer className="h-3.5 w-3.5" />Pression mesurée localement</p>
                <p className="text-lg font-semibold text-white sm:text-xl">{currentPressure == null ? "—" : `${currentPressure.toFixed(0)} hPa`}</p>
                <p className="w-full text-[9px] leading-tight text-slate-400 sm:text-[10px]">{currentPressure == null ? "Indisponible : références barométriques des stations non comparables." : formatCurrentStateProvenance(pressureField)}</p>
                <div className="w-full border-t border-white/5 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="flex items-center gap-1 text-[12px] font-medium text-sky-100 sm:text-sm"><Thermometer className="h-3.5 w-3.5" />Pression de surface estimée (modèle)</p>
                    <p className="text-lg font-semibold text-white sm:text-xl">{typeof currentHour?.pressure === "number" && Number.isFinite(currentHour.pressure) ? `${formatDashboardNumber(currentHour.pressure, 0)} hPa` : "—"}</p>
                  </div>
                  <p className="mt-1 text-[9px] leading-tight text-slate-400 sm:text-[10px]">{formatHourlyForecastValidAt(currentHour?.validAt)} · {formatHourlyForecastSource(hourlyForecastSource)} · {formatHourlyForecastComputedAt(hourlyForecastComputedAt)}</p>
                  <p className="mt-1 text-[9px] leading-tight text-slate-500"><code className="font-mono">surface_pressure</code> en hPa · pression de surface du lieu, non ramenée au niveau de la mer; estimation de modèle, pas une mesure de station.</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="min-w-0 rounded-lg border border-white/5 bg-black/20 p-2 text-center" title={currentStateFieldTitle(humidityField, currentSnapshot?.capturedAt)}>
                  <p className="flex items-center justify-center gap-1 text-[12px] font-medium leading-tight text-slate-200 sm:text-sm"><MeteoIcon name="humidity" size={16} className="shrink-0" />Humidité actuelle</p>
                  <p className="mt-1 text-lg font-semibold text-white sm:text-xl">{currentHumidity == null ? "—" : `${formatDashboardNumber(currentHumidity)}%`}</p>
                  <p className="mt-1 text-[9px] leading-tight text-slate-400 sm:text-[10px]">{formatCurrentStateProvenance(humidityField, currentSnapshot?.capturedAt)}</p>
                </div>
                <div className="min-w-0 rounded-lg border border-white/5 bg-black/20 p-2 text-center" title={currentStateFieldTitle(precipitationField, currentSnapshot?.capturedAt)}>
                  <p className="flex items-center justify-center gap-1 text-[12px] font-medium leading-tight text-slate-200 sm:text-sm"><Droplets className="h-3.5 w-3.5 shrink-0" />Précipitations actuelles</p>
                  <p className="mt-1 text-lg font-semibold text-white sm:text-xl">{currentPrecipitation == null ? "—" : `${currentPrecipitation.toFixed(1)} mm`}</p>
                  <p className="mt-1 text-[9px] leading-tight text-slate-400 sm:text-[10px]">{formatCurrentStateProvenance(precipitationField, currentSnapshot?.capturedAt)}</p>
                  <p className="mt-1 text-[9px] leading-tight text-slate-500">Cumul station non comparable</p>
                </div>
              </div>
              <div className="mt-2 border-t border-sky-400/20 pt-2">
                <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0 rounded-lg border border-sky-300/15 bg-slate-950/35 p-2 text-center">
                  <p className="flex items-center justify-center gap-1 text-[12px] font-medium leading-tight text-sky-100 sm:text-sm"><Sun className="h-3.5 w-3.5 shrink-0" />{currentUVLabel}</p>
                  <UVBadge uv={currentUV} />
                  <p className="mt-1 text-[9px] leading-tight text-slate-400 sm:text-[10px]">{formatHourlyForecastValidAt(uvForecastHour?.validAt)}</p>
                  <p className="mt-1 text-[9px] leading-tight text-slate-500 sm:text-[10px]">{formatHourlyForecastSource(hourlyForecastSource)} · {formatHourlyForecastComputedAt(hourlyForecastComputedAt)}</p>
                </div>
                <div className="min-w-0 rounded-lg border border-sky-300/15 bg-slate-950/35 p-2 text-center" title="Visibilité météorologique en kilomètres ; le contrat ne fournit pas de mesure distincte de visibilité des nuages.">
                  <p className="flex items-center justify-center gap-1 text-[12px] font-medium leading-tight text-sky-100 sm:text-sm"><Eye className="h-3.5 w-3.5 shrink-0" />Visibilité prévue</p>
                  <p className="mt-1 text-lg font-semibold text-white sm:text-xl">{currentHour?.visibility == null ? "—" : `${currentHour.visibility.toFixed(1)} km`}</p>
                  <p className="mt-1 text-[9px] leading-tight text-slate-400 sm:text-[10px]">{formatHourlyForecastValidAt(currentHour?.validAt)}</p>
                  <p className="mt-1 text-[9px] leading-tight text-slate-500">Visibilité météo, pas spécifique aux nuages</p>
                  <p className="mt-1 text-[9px] leading-tight text-slate-500 sm:text-[10px]">{formatHourlyForecastSource(hourlyForecastSource)} · {formatHourlyForecastComputedAt(hourlyForecastComputedAt)}</p>
                </div>
                </div>
              </div>
            </section>

            </div>
          </div>

        <Dialog open={isCollectionHealthOpen} onOpenChange={setIsCollectionHealthOpen}>
          <DialogContent id="collection-health-panel" showCloseButton={false} className="max-h-[calc(100dvh-1rem)] overflow-y-auto border-slate-700 bg-[#10131a] p-4 text-slate-100 sm:max-w-xl" aria-label="Santé des collectes automatiques">
            <DialogHeader><div className="flex items-start justify-between gap-3"><div><DialogTitle className="text-white">Santé des collectes</DialogTitle><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Les 24 derniers créneaux physiques pour ce lieu. Une absence de station qualifiée n’est pas une erreur technique ; un créneau sans trace est affiché explicitement.</p></div><button type="button" onClick={() => setIsCollectionHealthOpen(false)} aria-label="Fermer l’historique des collectes" className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-600 text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"><X className="h-4 w-4" /></button></div></DialogHeader>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Le statut du dernier lot est global; snapshots de couverture et créneaux physiques ci-dessous concernent <strong>{selectedLocation?.name ?? "le lieu affiché"}</strong>.</p>
            {collectionUpdateNotice && <div className="mt-3 flex items-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-400/10 px-3 py-2 text-cyan-50" role="status" aria-live="polite"><Activity className="h-4 w-4 shrink-0" aria-hidden="true" /><div><p className="text-[11px] font-semibold">Trace horaire mise à jour</p><p className="mt-0.5 text-[10px] text-cyan-100/80">Passage de {hourlyCollectionMoment(collectionUpdateNotice)} · {hourlyCollectionPresentation(collectionUpdateNotice).label}.</p></div></div>}
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-sky-200/75">Couverture du lieu choisi</p><p className="mt-1 text-sm font-semibold text-slate-100">{formatCollectionDateTime(collectionHealthReport?.lastForecastSuccess?.collectedAt)}</p><p className="mt-1 text-[10px] text-slate-400">{collectionHealthReport?.lastForecastSuccess?.status === "completed" ? "Dernier snapshot complet pour ce lieu" : collectionHealthReport?.lastForecastSuccess?.status === "partial" ? "Dernier snapshot partiel pour ce lieu" : collectionHealthReport?.lastForecastSuccess ? "Statut du dernier snapshot local indisponible" : "Aucun snapshot local vérifiable"} · durée {formatCollectionDuration(latestForecastSuccessDurationMs)} · prochain passage global {collectionHealthReport?.nextForecastRun ? formatCollectionDateTime(collectionHealthReport.nextForecastRun) : "non connu"}.</p></div><div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-cyan-200/75">Stations physiques du lieu</p><p className="mt-1 text-sm font-semibold text-slate-100">{latestHourlyCollection ? hourlyCollectionMoment(latestHourlyCollection) : "Aucun passage vérifiable"}</p><p className="mt-1 text-[10px] text-slate-400">{technicalFailureStreak ? `${technicalFailureStreak} échec(s) technique(s) consécutif(s).` : "Aucune série d’échecs techniques."}</p></div></div>
            <div className="mt-3 space-y-2" aria-label="Deux dernières collectes globales de prévisions">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">Deux derniers lots globaux de prévisions</p>
              <p className="text-[10px] leading-relaxed text-slate-400">Le total horaire exige une série archivée complète, sa projection attendue et le résultat du modèle dans le journal du lot. La couverture par lieu et les relevés physiques restent suivis séparément.</p>
              {(collectionHealthReport?.recentForecastRuns ?? []).length > 0 ? collectionHealthReport!.recentForecastRuns.map((run, index) => (
                <article key={`${run.startedAt}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-semibold text-slate-100">{formatCollectionDateTime(run.startedAt)}</p>
                    <span className="shrink-0 text-[10px] font-medium text-slate-300">{run.status === "completed" ? "Terminée" : run.status === "partial" ? "Partielle" : run.status === "failed" ? "Échec" : "En cours"}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">Journalier {run.dailyModelsCollected}/{run.dailyModelsExpected} · horaire {run.hourlyModelsCollected}/{run.hourlyModelsExpected} · {run.locationsProcessed} lieu(x).</p>
                  {run.errorMessage && <p className="mt-1 text-[10px] leading-relaxed text-amber-200/90">{run.errorMessage}</p>}
                </article>
              )) : <p className="rounded-xl border border-slate-700 bg-black/20 p-3 text-[10px] text-slate-400">Aucune collecte de prévisions horodatée n’est encore archivée.</p>}
            </div>
            <div className="mt-3 space-y-2" aria-label="Historique des 24 derniers créneaux horaires">{hourlyCollectionHistory.length ? hourlyCollectionHistory.map((trace) => { const presentation = hourlyCollectionPresentation(trace); return <article key={`${trace.date}-${trace.hour}`} className={`rounded-xl border p-3 ${presentation.className}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[11px] font-semibold">{hourlyCollectionMoment(trace)} · {presentation.label}</p><p className="mt-1 text-[10px] leading-relaxed opacity-85">{trace.status === "stored" ? `${trace.stationCount} station(s) qualifiée(s) archivée(s) après ${trace.attempts} tentative${trace.attempts > 1 ? "s" : ""}.` : trace.status === "no_station" ? `Passage terminé après ${trace.attempts} tentative${trace.attempts > 1 ? "s" : ""} ; aucune station qualifiée.` : trace.status === "missing" ? "Le créneau est arrivé à échéance sans trace archivée ; la reprise automatique devait le rattraper." : `Échec après ${trace.attempts} tentative${trace.attempts > 1 ? "s" : ""}.`}{trace.reason ? ` ${trace.reason}` : ""}</p></div><span className="shrink-0 text-[10px] font-semibold">{trace.status === "stored" ? "✓" : trace.status === "no_station" ? "—" : trace.status === "missing" ? "?" : "!"}</span></div></article>; }) : <p className="rounded-xl border border-slate-700 bg-black/20 p-3 text-xs text-slate-400">Aucun passage horaire n’est encore archivé pour ce lieu.</p>}</div>
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
            {personalSubmitResult ? <div className="mt-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-100"><p>{personalSubmitResult.notice}</p></div> : null}
            <div className="mt-3 border-t border-sky-300/15 pt-2 text-[11px] text-slate-400">{personalizedHourly?.applied ? `Calibration qualifiée disponible pour l’analyse personnelle (${personalizedHourly.comparedModels.join(", ")}); elle reste séparée de la série horaire officielle.` : personalObservationState?.evidence.state === "qualified" ? "Calibration qualifiée disponible en analyse personnelle; elle ne remplace pas la série horaire officielle." : personalObservationState?.evidence.state === "provisional" ? `Tendance personnelle provisoire : ${personalObservationState.evidence.comparisonCount}/50 comparaisons avant qualification. Elle ne modifie pas la série horaire officielle.` : `Données insuffisantes : ${personalObservationState?.evidence.comparisonCount ?? 0}/20 comparaisons pour une première tendance personnelle; la calibration reste séparée de la série horaire officielle.`}</div>
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
              <div className="min-w-0">
                <h2 id="local-context-title" className="text-sm font-semibold text-slate-100">Moyenne locale pondérée</h2>
                <LocalModelContributionNotice
                  localMode={localMode}
                  isPlaceholderData={locationWeatherIsPlaceholder}
                  estimateTemperature={locationWeather.ultraLocal.temperature}
                  stationCount={locationWeather.ultraLocal.stationCount}
                  modelContribution={locationWeather.ultraLocal.modelContribution}
                  modelWeight={locationWeather.ultraLocal.modelWeight}
                  usesOfficialFallback={locationWeather.ultraLocal.usesOfficialFallback}
                  usesModelFallback={locationWeather.ultraLocal.usesModelFallback}
                />
              </div>
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
                <WeatherStatusBadge compact tone="success" label="Relevés locaux" value={locationWeather.ultraLocal.stationCount > 0 ? `${locationWeather.ultraLocal.stationCount} station(s)` : "Données insuffisantes"} pulse={locationWeather.ultraLocal.stationCount > 0} description="Nombre de stations locales retenues pour le contexte physique. Ce compteur n’est pas un score et ne mesure pas la fiabilité des prévisions." />
              </div>
              <AltitudeCorrectionNotice correction={locationWeather.ultraLocal.altitudeCorrection} isPlaceholderData={locationWeatherIsPlaceholder} />
              {hasMaterialLocalDelta ? <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5" role="status">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold text-amber-100">Écart du calcul local avec le snapshot du modèle</p><p className="mt-0.5 text-[10px] leading-relaxed text-slate-300">L’indicateur principal utilise les stations physiques retenues ou, champ par champ, le snapshot Open-Meteo. Ce calcul Local/Ultra-local séparé peut comporter une contribution modèle; la prévision horaire reste dans sa série dédiée.</p></div><span className="shrink-0 text-sm font-bold text-amber-200">{localOfficialDelta > 0 ? "+" : ""}{localOfficialDelta.toFixed(1)}°</span></div>
                <p className="mt-1.5 text-[10px] text-slate-400">Snapshot du modèle : {officialSnapshotTemp == null ? "—" : `${officialSnapshotTemp.toFixed(1)}°C`} · résultat du mode Local/Ultra-local (distinct de l’indicateur principal) : {localObservation?.temperature.toFixed(1)}°C{localObservation?.observedAt ? ` · mesure source la plus récente ${new Date(localObservation.observedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}` : ""}.</p>
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
                    {visibleLocalContributors.map((station: any) => {
                      const hasAppliedAdjustment = Number.isFinite(Number(station.altitudeAdjustment)) && Number(station.altitudeAdjustment) !== 0;
                      const displayedTemperature = hasAppliedAdjustment ? station.adjustedTemperature : station.temperature;
                      return (
                        <div key={station.stationId} className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                          <span className="min-w-0 truncate">{station.name} · {station.band} · {station.distanceKm.toFixed(1)} km</span>
                          <span className="shrink-0 text-emerald-200">{displayedTemperature == null ? "—" : Number(displayedTemperature).toFixed(1)}° · {hasAppliedAdjustment ? "alt. corrigée" : "brute"} · {Math.round(station.weight * 100)}%</span>
                        </div>
                      );
                    })}
                  </div>
                  {localContributors.length > 6 ? (
                    <button type="button" onClick={() => setShowAllLocalContributors((open) => !open)} className="mt-2 min-h-8 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2.5 text-[10px] font-semibold text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                      {showAllLocalContributors ? "Réduire les stations" : `Afficher les ${localContributors.length - 6} autres stations`}
                    </button>
                  ) : null}
                  <p className="pt-2 text-[10px] leading-relaxed text-slate-400">Contrôles calculés à cette requête : distance, fraîcheur, fiabilité, cohérence et altitude seulement avec une référence explicite. Sans cible, le contrôle altitude est non vérifiable et les températures restent brutes. La stabilité longue durée exige un historique et n’est pas déduite de ce seul affichage.</p>
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
          <HourlyWeightingNotice
            weighting={officialForecast?.officialSnapshot?.hourlyWeighting}
            showCoverageDistribution={false}
            showFallbackDetails={false}
          />
          <OfficialForecastCalculationTimes
            hourlyComputedAt={officialForecast?.officialSnapshot?.hourlyComputedAt}
            computedAt={officialForecast?.officialSnapshot?.computedAt}
            className="mb-2 px-1"
          />
          {hourlyLoading ? (
            <div className="h-56 bg-muted rounded-xl animate-pulse" />
          ) : hours.length > 0 ? (
            <Suspense fallback={<div className="h-56 bg-muted rounded-xl animate-pulse" />}>
              <HourlyChart hours={hours} locationName={selectedLocation?.name ?? DEFAULT_OFFICIAL_FORECAST_LOCATION.name} activeHourIndex={currentHourIndex} />
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
          {officialLoading || dashboardDailyLoading ? (
            <div className="h-72 bg-muted rounded-xl animate-pulse" />
          ) : days.length > 0 ? (
            <Suspense fallback={<div className="h-72 bg-muted rounded-xl animate-pulse" />}>
              <FifteenDayChart days={days} locationName={selectedLocation?.name ?? DEFAULT_OFFICIAL_FORECAST_LOCATION.name} />
            </Suspense>
          ) : null}
        </div>

        <DeferredEnvironmentalPanels data={environmentalData} isLoading={environmentalFetching} />

      </div>
      <BackToTopButton />
    </div>
  );
}
