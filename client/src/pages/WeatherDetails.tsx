/**
 * WeatherDetails — Page de prévisions météo ultra-détaillées
 * Sections: Prévisions horaires, Graphiques, Résumé IA, Prévisions jours, Tendances, Confiance
 */
import { useState, useMemo, useRef, useEffect, type UIEvent } from "react";
import { trpc } from "@/lib/trpc";
import { MeteoIcon, getIconNameFromCondition, getIconNameFromRegime } from "@/components/MeteoIcon";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "@/contexts/LocationContext";
import { usePageWeatherSky } from "@/hooks/usePageWeatherSky";
import { MeteoSurface } from "@/components/weather/MeteoSurface";
import { HourlyWeightingNotice } from "@/components/weather/HourlyWeightingNotice";
import { BackToTopButton } from "@/components/BackToTopButton";
import { getCenteredHourScrollLeft, getHourCenterX, getNearestCenteredHourIndex, getNearestHourIndex } from "@/lib/hourlyScrollSync";
import { shouldRetryWeatherQuery, WEATHER_QUERY_SLOW_MS, weatherRetryDelay } from "@/lib/weatherQueryRecovery";
import { WindyMap } from "@/components/WindyMap";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Helpers ────────────────────────────────────────────────────────────────

function windDirectionLabel(deg: number | null | undefined): string {
  if (deg == null) return "—";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function windDirectionText(deg: number | null | undefined): string {
  if (deg == null) return "Direction indisponible";
  const dirs = ["Nord", "Nord-nord-est", "Nord-est", "Est-nord-est", "Est", "Est-sud-est", "Sud-est", "Sud-sud-est", "Sud", "Sud-sud-ouest", "Sud-ouest", "Ouest-sud-ouest", "Ouest", "Ouest-nord-ouest", "Nord-ouest", "Nord-nord-ouest"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function pressureTrend(hours: any[], currentIdx: number): "rising" | "falling" | "stable" {
  if (currentIdx < 2) return "stable";
  const prev = hours[currentIdx - 2]?.pressure;
  const curr = hours[currentIdx]?.pressure;
  if (prev == null || curr == null) return "stable";
  const diff = curr - prev;
  if (diff > 1) return "rising";
  if (diff < -1) return "falling";
  return "stable";
}

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "long" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function hourlyTemperatureTone(temperature: number | null | undefined): string {
  if (temperature == null || !Number.isFinite(temperature)) return "text-white";
  if (temperature <= 0) return "text-cyan-200";
  if (temperature <= 7) return "text-sky-200";
  if (temperature <= 14) return "text-blue-200";
  if (temperature < 20) return "text-amber-200";
  if (temperature < 26) return "text-orange-300";
  if (temperature < 33) return "text-orange-400";
  return "text-red-300";
}

function hourlyCardKey(hour: any, index: number): string {
  return `${hour?.date ?? "date-inconnue"}-${hour?.hour ?? "heure-inconnue"}-${index}`;
}

// Period splitting for a day
type Period = "matin" | "apres_midi" | "soir" | "nuit";
function getPeriod(hour: string): Period {
  const h = parseInt(hour.split(":")[0]);
  if (h >= 6 && h < 12) return "matin";
  if (h >= 12 && h < 18) return "apres_midi";
  if (h >= 18 && h < 22) return "soir";
  return "nuit";
}

const PERIOD_LABELS: Record<Period, { label: string; emoji: string }> = {
  matin: { label: "Matin", emoji: "🌅" },
  apres_midi: { label: "Après-midi", emoji: "☀️" },
  soir: { label: "Soir", emoji: "🌇" },
  nuit: { label: "Nuit", emoji: "🌙" },
};

/**
 * Indicateur local de créneau : il combine uniquement l'accord pluie réellement
 * comparé et la dispersion thermique réellement disponible. Il ne prétend pas
 * reproduire le score officiel de confiance, qui reste présenté séparément.
 */
type AgreementDetail = { label: string; value: number; detail?: string };
type HourlyConditionDetail = { icon: string; label: string; detail?: string };

function getSlotAgreementDetails(hour: any, historical: any = null): AgreementDetail[] {
  const bound = (value: number) => Math.max(0, Math.min(100, value));
  const details: AgreementDetail[] = [];
  const metrics = hour?.multiModelMetrics;
  const dispersion = metrics?.dispersion;
  const precipitation = metrics?.precipitation;
  if (typeof precipitation?.frequencyPercent === "number") details.push({
    label: "Fréquence modèle pluie",
    value: precipitation.frequencyPercent,
    detail: `${precipitation.rainModelCount}/${precipitation.availableModelCount} modèles valides`,
  });
  if (typeof metrics?.temperature?.range === "number") details.push({ label: "Température", value: bound(100 - metrics.temperature.range * 25) });
  if (typeof dispersion?.windSpeed?.range === "number") details.push({ label: "Vent", value: bound(100 - dispersion.windSpeed.range * 10) });
  if (typeof dispersion?.windGust?.range === "number") details.push({ label: "Rafales", value: bound(100 - dispersion.windGust.range * 8) });
  if (typeof dispersion?.windDirection?.range === "number") details.push({ label: "Direction", value: bound(100 - dispersion.windDirection.range / 1.8) });
  if (typeof dispersion?.humidity?.range === "number") details.push({ label: "Humidité", value: bound(100 - dispersion.humidity.range) });
  if (typeof dispersion?.cloudCover?.range === "number") details.push({ label: "Nuages", value: bound(100 - dispersion.cloudCover.range) });
  if (typeof historical?.score === "number" && typeof historical?.comparisons === "number" && historical.comparisons > 0) {
    details.push({ label: `Historique qualifié (${historical.comparisons} comp.)`, value: bound(historical.score) });
  }
  return details.map((detail) => ({ ...detail, value: Math.round(detail.value) }));
}

function getSlotAgreementConfidence(hour: any, historical: any = null): number | null {
  const details = getSlotAgreementDetails(hour, historical);
  return details.length > 0 ? Math.round(details.reduce((sum, detail) => sum + detail.value, 0) / details.length) : null;
}

function getHourlyConditionDetails(hour: any): HourlyConditionDetail[] {
  const precipitationDetail = hour?.precipIntensity === "heavy"
    ? "intensité forte"
    : hour?.precipIntensity === "moderate"
      ? "intensité modérée"
      : hour?.precipIntensity === "light"
        ? "intensité faible"
        : hour?.precipType === "snow"
          ? "neige"
          : hour?.precipType === "freezing_rain"
            ? "verglas"
            : undefined;
  const cloudLayers = [
    hour?.cloudLow != null ? `bas ${hour.cloudLow}%` : null,
    hour?.cloudMid != null ? `moy. ${hour.cloudMid}%` : null,
    hour?.cloudHigh != null ? `haut ${hour.cloudHigh}%` : null,
  ].filter((value): value is string => value !== null).join(" · ");

  return [
    hour?.precipitation != null
      ? { icon: "precipitation", label: `${hour.precipitation.toFixed(1)} mm`, detail: precipitationDetail }
      : null,
    hour?.uvIndex != null && hour.uvIndex > 0
      ? { icon: "sunny", label: `UV ${hour.uvIndex.toFixed(0)}` }
      : null,
    cloudLayers ? { icon: "cloud_cover", label: "Couches nuageuses", detail: cloudLayers } : null,
  ].filter((detail): detail is HourlyConditionDetail => detail !== null);
}

function SlotConfidenceBadge({ details, historicalModels = [] }: { details: AgreementDetail[]; historicalModels?: Array<{ name: string; score: number; comparisons: number; temperatureMae?: number | null; precipitationMae?: number | null; windMae?: number | null }> }) {
  const [open, setOpen] = useState(false);
  if (details.length === 0) return null;
  const value = Math.round(details.reduce((sum, detail) => sum + detail.value, 0) / details.length);
  const tone = value >= 75
    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
    : value >= 55
      ? "border-sky-300/25 bg-sky-300/10 text-sky-100"
      : "border-amber-300/25 bg-amber-300/10 text-amber-100";
  const level = value >= 75 ? "élevé" : value >= 55 ? "modéré" : "faible";
  return <span className="relative inline-block">
    <button type="button" onClick={() => setOpen((shown) => !shown)} aria-expanded={open} className={`!min-h-5 inline-flex items-center rounded-full border px-1.5 py-0 text-[8px] font-semibold leading-[9px] ${tone}`}>Accord des modèles {value}% · {level}</button>
    {open && <span className="absolute left-0 top-full z-20 mt-1 w-36 rounded-xl border border-white/15 bg-slate-950/95 p-2 text-[9px] shadow-xl">
      <span className="mb-1 block text-slate-300">Accord par paramètre</span>
      {details.map((detail) => <span key={detail.label} className="flex justify-between text-slate-100"><span>{detail.label}</span><span>{detail.detail ? `${detail.detail} · ` : ""}{detail.value}%</span></span>)}
      {historicalModels.length > 0 && <span className="mt-1 block border-t border-white/10 pt-1 text-slate-300">
        <span className="mb-0.5 block">Historique qualifié par modèle</span>
        {historicalModels.map((model) => <span key={model.name} className="block text-[8px] text-slate-200">
          {model.name} · T {model.temperatureMae == null ? "—" : `${model.temperatureMae}°C`} · Pluie {model.precipitationMae == null ? "—" : `${model.precipitationMae} mm`} · Vent {model.windMae == null ? "—" : `${model.windMae} km/h`}
        </span>)}
      </span>}
    </span>}
  </span>;
}

// ─── Main Component ─────────────────────────────────────────────────────────

type ChartType = "temp" | "feels" | "precip" | "wind" | "gusts" | "humidity" | "pressure" | "clouds";

export default function WeatherDetails() {
  const { activeLocation } = useLocation();
  const { user } = useAuth();
  const { style: pageSkyStyle } = usePageWeatherSky();
  const coordsInput = useMemo(() => activeLocation
    ? { lat: activeLocation.lat, lon: activeLocation.lon }
    : undefined, [activeLocation?.lat, activeLocation?.lon]);

  const { data, isLoading, isFetching, isError, error, refetch } = trpc.weather.getDetailedForecast.useQuery(coordsInput, {
    retry: shouldRetryWeatherQuery,
    retryDelay: weatherRetryDelay,
    refetchOnWindowFocus: false,
  });
  const { data: forecastProvenance } = trpc.weather.getForecastProvenance.useQuery(coordsInput, { staleTime: 60 * 1000, refetchOnWindowFocus: false });
  const reliabilityInput = useMemo(() => ({
    lat: activeLocation?.lat ?? 50.7567,
    lon: activeLocation?.lon ?? 2.5204,
    period: "7d" as const,
    horizon: "6-24h" as const,
  }), [activeLocation?.lat, activeLocation?.lon]);
  const { data: reliabilityLaboratory } = trpc.weather.getReliabilityLaboratory.useQuery(reliabilityInput, { staleTime: 2 * 60 * 1000 });
  const bestForecastModel = reliabilityLaboratory?.bestModel as { name?: string; normalizedScore?: number | null } | undefined;
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const hourlyRef = useRef<HTMLDivElement>(null);
  const [slowLoad, setSlowLoad] = useState(false);
  const aromeShadow = trpc.weather.compareHondeghemAromeShadow.useMutation();

  const isHondeghem = !activeLocation || (
    Math.abs(activeLocation.lat - 50.7567) < 0.001 && Math.abs(activeLocation.lon - 2.5204) < 0.001
  );
  const bestMatchValueAt = (validAt: string, key: "temp" | "precipitation" | "windSpeed") => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(validAt));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    const date = `${part("year")}-${part("month")}-${part("day")}`;
    const hour = `${part("hour")}:${part("minute")}`;
    return hours.find((item: any) => item.date === date && item.hour === hour)?.[key] ?? null;
  };
  const parisDateAt = (validAt: string) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(validAt));

  useEffect(() => {
    if (!isLoading && !isFetching) {
      setSlowLoad(false);
      return;
    }
    const timeout = window.setTimeout(() => setSlowLoad(true), WEATHER_QUERY_SLOW_MS);
    return () => window.clearTimeout(timeout);
  }, [isLoading, isFetching]);

  // Current hour index
  const currentHourStr = useMemo(() => {
    const now = new Date();
    return now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).slice(0, 2) + ":00";
  }, []);

  const currentHourIdx = useMemo(() => {
    if (!data?.hours) return 0;
    const idx = data.hours.findIndex((h: any) => h.hour === currentHourStr);
    return idx >= 0 ? idx : 0;
  }, [data?.hours, currentHourStr]);

  // À l’ouverture ou au changement de lieu, placer directement la carte de
  // l’heure réelle de Paris au début du ruban horizontal, sans révéler les
  // cartes voisines sur les côtés.
  useEffect(() => {
    const rail = hourlyRef.current;
    if (!rail || !data?.hours?.length) return;
    const firstCard = rail.querySelector<HTMLElement>('[data-hour-index="0"]');
    const currentCard = rail.querySelector<HTMLElement>(`[data-hour-index="${currentHourIdx}"]`);
    const targetLeft = Math.max(0, (currentCard?.offsetLeft ?? 0) - (firstCard?.offsetLeft ?? 0));
    const frame = requestAnimationFrame(() => rail.scrollTo({ left: targetLeft, behavior: "auto" }));
    return () => cancelAnimationFrame(frame);
  }, [data?.hours?.length, currentHourIdx, activeLocation?.lat, activeLocation?.lon]);

  if (isLoading) {
    return (
      <div className="weather-page-sky min-h-dvh w-full overflow-x-clip bg-[#0d1117]" style={pageSkyStyle}>
        <div className="mx-auto w-full min-w-0 max-w-none space-y-4 px-1 pt-[max(env(safe-area-inset-top),0.25rem)] sm:max-w-2xl sm:px-3 sm:py-4">
          <Skeleton className="h-10 w-48" />
          {slowLoad && <div role="status" className="min-w-0 w-full max-w-full rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs leading-relaxed text-amber-100">La source météo met plus de temps que prévu. MeteoAI réessaie uniquement les erreurs temporaires.</div>}
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    const isTimeout = /timeout|délai|aborted/i.test(error?.message ?? "");
    return <div className="weather-page-sky min-h-dvh w-full overflow-x-clip bg-[#0d1117]" style={pageSkyStyle}><div className="mx-auto w-full min-w-0 max-w-none px-1 pt-[max(env(safe-area-inset-top),0.25rem)] sm:max-w-2xl sm:px-3 sm:py-5"><MeteoSurface tone="default" className="min-w-0 w-full max-w-full rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-3 text-center sm:rounded-[24px] sm:p-5"><MeteoIcon name="refresh" size={26} /><h1 className="mt-3 text-base font-semibold text-white">Prévisions temporairement indisponibles</h1><p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-300">{isTimeout ? "Le délai de la source météo a été dépassé après les réessais autorisés." : "La prévision ne peut pas être chargée pour le moment. Aucune donnée n’est remplacée ou inventée."}</p><button type="button" onClick={() => void refetch()} disabled={isFetching} className="mt-4 min-h-10 rounded-xl border border-sky-300/40 bg-sky-300/10 px-4 text-xs font-semibold text-sky-100 disabled:opacity-50">{isFetching ? "Nouvel essai…" : "Réessayer"}</button></MeteoSurface></div><BackToTopButton /></div>;
  }

  const hours = data.hours ?? [];
  const periodHours = data?.periodHours ?? hours;
  const days = data?.days ?? [];
  const regime = data?.regime;
  const confidence = data?.confidence;
  const historicalPerformance = data?.historicalModelPerformance ?? null;
  const currentHour = hours[currentHourIdx] ?? hours[0];

  return (
    <div className="weather-page-sky min-h-dvh w-full overflow-x-clip bg-[#0d1117]" style={pageSkyStyle}>
      <div className="mx-auto w-full min-w-0 max-w-none space-y-3 px-1 pt-[max(env(safe-area-inset-top),0.25rem)] pb-3 sm:max-w-2xl sm:space-y-5 sm:px-3 sm:py-4 sm:pb-28">
        {/* ═══ SECTION 1: PRÉVISIONS HORAIRES ═══ */}
        <MeteoSurface as="section" tone="default" className="min-w-0 w-full max-w-full rounded-2xl border border-white/10 bg-[rgba(26,48,70,0.56)] p-2 sm:rounded-[26px] sm:p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-2xl border border-sky-200/20 bg-sky-300/10"><MeteoIcon name="refresh" size={18} /></span>
              <div><p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-100/55">Déroulé temporel</p><h2 className="mt-0.5 text-lg font-semibold tracking-tight text-white">Heure par heure</h2>{bestForecastModel?.name && bestForecastModel.normalizedScore != null ? <span aria-label={`Meilleur modèle : ${bestForecastModel.name}`} className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-300/45 bg-amber-300/10 px-1.5 py-0.5 text-[8px] font-bold text-amber-100"><span>Meilleur modèle</span><span className="text-white">{bestForecastModel.name}</span><span className="text-amber-100/75">{Math.round(bestForecastModel.normalizedScore)} /100</span></span> : null}</div>
            </div>
            <span className="rounded-full border border-sky-200/20 bg-sky-300/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-sky-100">48 h</span>
          </div>
          <HourlyWeightingNotice weighting={data?.officialSnapshot?.hourlyWeighting} />
          
          {/* Horizontal scrollable hourly cards */}
          <div ref={hourlyRef} className="-mx-2 overflow-x-auto overscroll-x-contain px-2 pb-1 scrollbar-hide snap-x snap-mandatory scroll-px-2">
            <div className="flex items-start gap-2.5">
              {hours.map((h: any, i: number) => {
                const isNow = i === currentHourIdx;
                const pTrend = pressureTrend(hours, i);
                const conditionDetails = getHourlyConditionDetails(h);
                const multiModelMetrics = h.multiModelMetrics ?? null;
                const temperatureMetrics = multiModelMetrics?.temperature;
                const precipitationMetrics = multiModelMetrics?.precipitation;
                return (
                  <div
                    key={hourlyCardKey(h, i)}
                    data-hour-index={i}
                    className={`w-[calc((100%-10px)/2)] shrink-0 snap-start rounded-[22px] border px-3 pb-4 pt-3 transition-colors ${
                      isNow
                        ? "border-sky-200/65 bg-[linear-gradient(160deg,rgba(44,128,181,0.30),rgba(10,35,60,0.34))]"
                        : "border-white/20 bg-[linear-gradient(160deg,rgba(77,105,132,0.20),rgba(16,36,56,0.28))]"
                    }`}
                  >
                    {/* Hour + Now badge */}
                    <div className="flex items-center justify-between">
                      <span className={`text-[19px] font-semibold tracking-[-0.05em] ${isNow ? "text-sky-100" : "text-white"}`}>{h.hour}</span>
                      {isNow && <span className="rounded-full border border-sky-200/25 bg-sky-300/10 px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.1em] text-sky-100">MAINTENANT</span>}
                    </div>
                    
                    {/* Icon + condition */}
                    <div className="mb-3 mt-3 flex items-center justify-between">
                      <MeteoIcon name={getIconNameFromCondition(h.condition)} size={38} />
                      <span className="max-w-[72px] text-right text-[11px] font-medium leading-tight text-slate-100">{h.condition ?? "—"}</span>
                    </div>
                    
                    {/* Temperature */}
                    <div className="mb-2 pb-2">
                      <span className="mb-1 block text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-300">Moyenne pondérée officielle</span>
                      <span className={`text-[36px] font-semibold leading-none tracking-[-0.075em] ${hourlyTemperatureTone(h.temp)}`}>{h.temp?.toFixed(1) ?? "—"}°</span>
                      <span className="mt-1 block text-[10px] font-medium text-slate-300">ressenti {h.apparentTemp?.toFixed(0) ?? "—"}°</span>
                      <div className="mt-1"><SlotConfidenceBadge details={getSlotAgreementDetails(h, historicalPerformance)} historicalModels={historicalPerformance?.models ?? []} /></div>
                    </div>

                    {multiModelMetrics && <div className="mb-2 rounded-xl border border-amber-200/15 bg-amber-200/[0.035] p-2 text-[9px] leading-relaxed text-slate-200">
                      <p className="mb-1 font-semibold text-amber-100">Ensemble horaire · Best Match exclu</p>
                      <p>Température ({temperatureMetrics?.availableModelCount ?? 0}/{multiModelMetrics.expectedModelCount} modèles valides) : min <b>{temperatureMetrics?.min == null ? "—" : `${temperatureMetrics.min.toFixed(1)}°`}</b> · max <b>{temperatureMetrics?.max == null ? "—" : `${temperatureMetrics.max.toFixed(1)}°`}</b></p>
                      <p>Médiane <b>{temperatureMetrics?.median == null ? "—" : `${temperatureMetrics.median.toFixed(1)}°`}</b> · écart-type population <b>{temperatureMetrics?.standardDeviation == null ? "—" : `${temperatureMetrics.standardDeviation.toFixed(1)}°`}</b></p>
                      <p>Dispersion (étendue max–min) <b>{temperatureMetrics?.range == null ? "—" : `${temperatureMetrics.range.toFixed(1)}°`}</b></p>
                      <p>Modèles température : {temperatureMetrics?.modelsWithData.join(", ") || "aucun"}</p>
                      {precipitationMetrics && <div className="mt-1 border-t border-white/10 pt-1">
                        <p>Modèles pluvieux (≥0,1 mm) : <b>{precipitationMetrics.rainModelCount}/{precipitationMetrics.availableModelCount}</b> · fréquence modèle <b>{precipitationMetrics.frequencyPercent == null ? "—" : `${precipitationMetrics.frequencyPercent.toFixed(0)}%`}</b></p>
                        <p>Valeurs pluie valides : {precipitationMetrics.availableModelCount}/{multiModelMetrics.expectedModelCount} · fréquence non calibrée comme probabilité météorologique.</p>
                        <p>Quantité officielle pondérée : <b>{h.precipitation == null ? "—" : `${h.precipitation.toFixed(1)} mm`}</b></p>
                        <p>Quantité conditionnelle pondérée parmi les modèles pluvieux : <b>{precipitationMetrics.rainModelCount === 0 ? "aucun modèle au seuil" : precipitationMetrics.conditionalWeightedMean == null ? "indisponible sans poids historiques qualifiés" : `${precipitationMetrics.conditionalWeightedMean.toFixed(1)} mm`}</b></p>
                        <p>Modèles pluvieux : {precipitationMetrics.modelsPredictingRain.join(", ") || "aucun"}</p>
                      </div>}
                    </div>}

                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                      <HourlyMetric icon="humidity" label="Humidité" value={`${h.humidity ?? "—"}%`} detail={h.dewPoint != null ? `Rosée ${h.dewPoint.toFixed(0)}°` : undefined} />
                      <HourlyMetric icon="wind_param" label="Vent" value={`${h.windSpeed?.toFixed(0) ?? "—"} km/h`} detail={`${windDirectionText(h.windDirection)}${h.windGust != null ? ` · raf. ${h.windGust.toFixed(0)}` : ""}`} />
                      <HourlyMetric icon="pressure" label="Pression" value={`${h.pressure?.toFixed(0) ?? "—"} hPa`} detail={pTrend === "rising" ? "En hausse" : pTrend === "falling" ? "En baisse" : "Stable"} />
                      <HourlyMetric icon="cloud_cover" label="Nuages" value={`${h.cloudCover ?? "—"}%`} />
                    </div>
                    {conditionDetails.length > 0 && (
                      <div className="mt-2 border-t border-white/12 pt-2">
                        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-sky-100/55">Conditions du créneau</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {conditionDetails.map((detail) => {
                            const isCloudLayers = detail.label === "Couches nuageuses";
                            const pill = <span className={`inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.045] px-1.5 text-[8px] leading-tight text-slate-200 ${isCloudLayers ? "min-h-8 py-1" : "min-h-5 py-0.5"}`}>
                              <MeteoIcon name={detail.icon} size={11} />
                              <span>{detail.label}</span>
                              {detail.detail && <span className="text-slate-400">· {detail.detail}</span>}
                            </span>;
                            return isCloudLayers
                              ? <div key={`${detail.icon}-${detail.label}`} className="mt-0.5 basis-full">{pill}</div>
                              : <span key={`${detail.icon}-${detail.label}`}>{pill}</span>;
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Régime opérationnel partagé */}
                    {regime && (
                      <div className="mt-3 hidden border-t border-slate-300/20 pt-2 md:block">
                        <div className="flex items-center gap-1">
                          <MeteoIcon name={getIconNameFromRegime(regime.primary.id)} size={14} />
                          <span className="text-[10px] font-medium text-slate-300">{regime.primary.label}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-1 text-center text-[10px] text-slate-500">← Glissez pour voir les heures suivantes →</p>
        </MeteoSurface>

        {user?.role === "admin" && <MeteoSurface as="section" tone="default" className="min-w-0 w-full max-w-full rounded-2xl border border-violet-300/25 bg-violet-300/[0.045] p-3 sm:rounded-[24px] sm:p-4" aria-labelledby="arome-shadow-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-violet-200/75">Diagnostic manuel · mode shadow</p>
              <h2 id="arome-shadow-title" className="mt-1 text-base font-semibold text-white">AROME officiel ↔ Open-Meteo</h2>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-300">Profil AROME France HD · Hondeghem uniquement. La requête n’est envoyée qu’au clic; aucun résultat ne modifie les prévisions affichées.</p>
            </div>
            <button type="button" onClick={() => aromeShadow.mutate()} disabled={!isHondeghem || aromeShadow.isPending} className="min-h-10 shrink-0 rounded-xl border border-violet-200/35 bg-violet-300/10 px-3 py-2 text-xs font-semibold text-violet-100 disabled:cursor-not-allowed disabled:opacity-50">
              {aromeShadow.isPending ? "Comparaison en cours…" : aromeShadow.data ? "Relancer la comparaison" : "Comparer les runs"}
            </button>
          </div>
          {!isHondeghem && <p className="mt-3 rounded-xl border border-amber-200/20 bg-amber-200/[0.05] p-2 text-[10px] text-amber-100">Cette comparaison est limitée à Hondeghem (50,7567° N, 2,5204° E); choisissez ce lieu pour l’activer.</p>}
          {aromeShadow.error && <p role="alert" className="mt-3 rounded-xl border border-rose-300/25 bg-rose-300/[0.06] p-2 text-[10px] text-rose-100">Requête impossible : {aromeShadow.error.message}</p>}
          {aromeShadow.data && <div className="mt-3 space-y-3" role="status">
            <div className={`rounded-xl border p-2 text-[10px] leading-relaxed ${aromeShadow.data.status === "ok" ? "border-emerald-300/25 bg-emerald-300/[0.05] text-emerald-100" : aromeShadow.data.status === "missing-key" || aromeShadow.data.status === "authentication-error" ? "border-amber-300/25 bg-amber-300/[0.05] text-amber-100" : "border-sky-300/20 bg-sky-300/[0.04] text-sky-100"}`}>
              <p className="font-semibold">{aromeShadow.data.status === "missing-key" ? "Clé AROME manquante" : aromeShadow.data.status === "authentication-error" ? "Authentification AROME refusée" : aromeShadow.data.status === "request-impossible" ? "Requête impossible" : aromeShadow.data.status === "partial" ? "Comparaison partielle" : "Comparaison terminée"}</p>
              <p className="mt-0.5">{aromeShadow.data.message}</p>
              {aromeShadow.data.run && <p className="mt-1">Run commun demandé : <strong>{aromeShadow.data.run}</strong> (UTC) · profil {aromeShadow.data.profile} · Open-Meteo {aromeShadow.data.openMeteoModel}, run exact {aromeShadow.data.openMeteoRun} UTC.</p>}
              <p>Référence courante Best Match : run non identifié par Open-Meteo; elle n’est pas présentée comme run équivalent.</p>
              <p>Dernière tentative : {new Date(aromeShadow.data.comparedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} (Europe/Paris).</p>
            </div>
            {aromeShadow.data.daily.length > 0 && <div>
              <h3 className="text-[11px] font-semibold text-white">Synthèse journalière sur les heures comparées</h3>
              <div className="mt-2 space-y-2">
                {aromeShadow.data.daily.map((day: any) => <div key={day.date} className="rounded-xl border border-white/10 bg-black/15 p-2">
                  <p className="text-[10px] font-semibold text-slate-100">{day.date} · {day.metrics.temperature.hours} échéance(s) horaires avec valeurs appariées</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {(["temperature", "precipitation", "windSpeed"] as const).map((metric) => {
                      const value = day.metrics[metric];
                      const bestMatchKey = metric === "temperature" ? "temp" : metric;
                      const bestValues = aromeShadow.data.hourly.filter((hour: any) => parisDateAt(hour.validAt) === day.date)
                        .map((hour: any) => bestMatchValueAt(hour.validAt, bestMatchKey))
                        .filter((item: unknown): item is number => typeof item === "number" && Number.isFinite(item));
                      const bestSummary = bestValues.length ? metric === "precipitation" ? `${bestValues.reduce((sum, item) => sum + item, 0).toFixed(1)} mm` : `${(bestValues.reduce((sum, item) => sum + item, 0) / bestValues.length).toFixed(1)} ${metric === "temperature" ? "°C" : "km/h"}` : "—";
                      const label = metric === "temperature" ? "Température moyenne" : metric === "precipitation" ? "Précipitations cumulées" : "Vent moyen";
                      const fmt = (item: number | null) => item == null ? "—" : `${item.toFixed(1)} ${metric === "temperature" ? "°C" : metric === "precipitation" ? "mm" : "km/h"}`;
                      return <div key={metric} className="rounded-lg border border-white/8 bg-white/[0.025] p-2 text-[9px] text-slate-300">
                        <p className="font-semibold text-slate-100">{label} · {value.hours} h avec valeurs</p>
                        <p>AROME WCS: {fmt(value.arome)} · Open-Meteo même run: {fmt(value.openMeteoArome)}</p>
                        <p>Best Match affiché (run inconnu): {bestSummary}</p>
                        <p>Écart AROME WCS − Single Runs: {fmt(value.difference)}</p>
                      </div>;
                    })}
                  </div>
                </div>)}
              </div>
              <details className="mt-2 rounded-xl border border-white/10 bg-black/10 p-2">
                <summary className="cursor-pointer text-[10px] font-semibold text-violet-100">Détail horaire, valeurs et écarts ({aromeShadow.data.hourly.length} échéances UTC)</summary>
                <div className="mt-2 max-h-96 overflow-auto">
                  <table className="w-full border-collapse text-left text-[9px]">
                    <thead className="sticky top-0 bg-slate-950 text-slate-300"><tr><th className="p-1">Validité</th><th className="p-1">Variable</th><th className="p-1">AROME WCS</th><th className="p-1">OM même run</th><th className="p-1">Best Match*</th><th className="p-1">Écart WCS−OM</th></tr></thead>
                    <tbody>{aromeShadow.data.hourly.flatMap((hour: any) => (["temperature", "precipitation", "windSpeed"] as const).map((metric) => {
                      const item = hour.metrics[metric];
                      const bestKey = metric === "temperature" ? "temp" : metric;
                      const unit = metric === "temperature" ? "°C" : metric === "precipitation" ? "mm" : "km/h";
                      const fmt = (value: number | null) => value == null ? "—" : `${value.toFixed(1)} ${unit}`;
                      const label = metric === "temperature" ? "Température" : metric === "precipitation" ? "Précipitations" : "Vent";
                      return <tr key={`${hour.validAt}-${metric}`} className="border-t border-white/8 text-slate-200"><td className="whitespace-nowrap p-1">{hour.validAt.replace("T", " ").replace(":00.000Z", "Z")}</td><td className="p-1">{label}</td><td className="p-1">{fmt(item.arome)}</td><td className="p-1">{fmt(item.openMeteoArome)}</td><td className="p-1">{fmt(bestMatchValueAt(hour.validAt, bestKey))}</td><td className="p-1">{fmt(item.difference)}{item.issue ? <span className="block text-amber-200">{item.issue}</span> : null}</td></tr>;
                    }))}</tbody>
                  </table>
                </div>
                <p className="mt-2 text-[9px] text-slate-400">* Best Match reprend les valeurs déjà affichées par l’application. Son run n’est pas identifié; seuls AROME WCS et Single Runs sont comparés comme runs équivalents.</p>
              </details>
            </div>}
            {aromeShadow.data.missing.length > 0 && <div className="rounded-xl border border-amber-200/20 bg-amber-200/[0.04] p-2 text-[9px] text-amber-100"><p className="font-semibold">Manquants et limites détectés</p><ul className="mt-1 list-inside list-disc">{aromeShadow.data.missing.map((message: string, index: number) => <li key={`${index}-${message}`}>{message}</li>)}</ul></div>}
          </div>}
          <p className="mt-2 text-[9px] text-slate-500">Appel externe authentifié côté serveur uniquement; l’authentification live n’est pas testée dans l’environnement de développement. Open-Meteo Best Match, les fusions journalières et la Vigilance restent inchangés.</p>
        </MeteoSurface>}

        {/* ═══ SECTION : CARTE MÉTÉO ANIMÉE ═══ */}
        <MeteoSurface as="section" tone="default" className="min-w-0 w-full max-w-full rounded-2xl border border-white/10 bg-[rgba(26,48,70,0.56)] p-2 sm:rounded-[26px] sm:p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-2xl border border-sky-200/20 bg-sky-300/10 text-lg">🌍</span>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-100/55">Temps réel</p>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-white">Carte météorologique</h2>
            </div>
          </div>
          {activeLocation ? (
            <WindyMap lat={activeLocation.lat} lon={activeLocation.lon} locationName={activeLocation.name} />
          ) : (
            <p className="text-xs text-slate-400">Sélectionnez un lieu favori pour afficher la carte météo.</p>
          )}
        </MeteoSurface>

        {/* ═══ SECTION 2: PRÉVISIONS DES PROCHAINS JOURS ═══ */}
        <MeteoSurface as="section" tone="default" className="min-w-0 w-full max-w-full rounded-2xl border border-white/10 bg-[rgba(11,17,28,0.86)] p-2 sm:rounded-[24px] sm:p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-white/12 bg-white/[0.04]"><MeteoIcon name="calendar" size={16} /></span>
            <div><p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">Tendance étendue</p><h2 className="mt-0.5 text-lg font-semibold tracking-tight text-white">Prochains jours</h2></div>
          </div>
          
          {data.periodHoursSource === "open_meteo_best_match_reference" && <p className="mb-3 rounded-lg border border-sky-200/15 bg-sky-300/[0.035] px-2.5 py-2 text-[9px] leading-relaxed text-sky-100/75">Le découpage par période utilise la référence agrégée Open-Meteo Best Match. Elle reste distincte et n’est pas comptée parmi les sept modèles horaires officiels.</p>}
          <div className="space-y-2">
            {days.map((day: any) => {
              const isExpanded = expandedDay === day.date;
              // Les données serveur distinguent la confiance (accord, qualité,
              // historique, échéance) de la simple dispersion des modèles.
              return (
                <div key={day.date} className="weather-surface-inset overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.025]">
                  {/* Day summary card */}
                  <button
                    onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                    className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-white/[0.045] active:scale-[0.99]"
                  >
                    <div className="flex-shrink-0">
                      <MeteoIcon name={getIconNameFromCondition(day.condition)} size={32} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold text-sm capitalize">{getDayOfWeek(day.date)}</span>
                        <span className="text-slate-400 text-xs">{formatDate(day.date)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-white font-bold text-sm">{day.tempMax?.toFixed(0)}°</span>
                        <span className="text-slate-400 text-sm">{day.tempMin?.toFixed(0)}°</span>
                        {(day.precipitation ?? 0) > 0 && (
                          <span className="text-blue-400 text-xs">{day.precipitation?.toFixed(1)} mm</span>
                        )}
                        <span className="text-slate-500 text-xs">{day.windSpeed?.toFixed(0)} km/h</span>
                      </div>
                    </div>
                    <span className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[10px] text-slate-300">{isExpanded ? "▲" : "▼"}</span>
                  </button>
                  
                  {/* Expanded day details */}
                  {isExpanded && (
                    <div className="space-y-3 border-t border-white/8 p-3">
                      {/* Day details grid */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <DetailCell label="Ressenti" value={`${day.feelsLikeMin?.toFixed(0) ?? "?"}° / ${day.feelsLikeMax?.toFixed(0) ?? "?"}°`} />
                        <DetailCell label="Lever" value={day.sunrise ?? "—"} />
                        <DetailCell label="Coucher" value={day.sunset ?? "—"} />
                        <DetailCell label="Humidité" value={`${day.humidity?.toFixed(0) ?? "—"}%`} />
                        <DetailCell className="col-span-2" label="Vent" value={`${day.windSpeed?.toFixed(0) ?? "—"} km/h${day.windGust != null ? ` · raf. ${day.windGust.toFixed(0)}` : ""}`} />
                        <DetailCell label="Précip." value={`${day.precipitation?.toFixed(1) ?? "0"} mm`} />
                        <DetailCell label="UV" value={`${(day as any).uvIndex?.toFixed(0) ?? "—"}`} />
                      </div>
                      
                      {/* Duration of sunshine */}
                      {day.sunrise && day.sunset && (
                        <div className="text-[10px] text-slate-500">
                          Durée d'ensoleillement: {calculateSunshineDuration(day.sunrise, day.sunset)}
                        </div>
                      )}
                      
                      {/* Period breakdown */}
                      <DayPeriodBreakdown dayDate={day.date} hours={periodHours} regime={regime} historicalPerformance={historicalPerformance} />
                      
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </MeteoSurface>

        <MeteoSurface as="section" tone="default" className="min-w-0 w-full max-w-full rounded-2xl border border-emerald-400/35 bg-emerald-400/[0.06] p-2 shadow-[0_0_24px_rgba(52,211,153,0.08)] sm:rounded-[24px] sm:p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full border border-emerald-300/25 bg-emerald-400/10"><MeteoIcon name="calendar" size={15} /></span><h2 className="text-sm font-semibold text-white">Historique des prévisions</h2></div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">Graphiques, observations archivées et comparaisons par modèle.</p>
            </div>
            <Link href="/history" className="shrink-0 rounded-xl border border-emerald-300/70 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition-colors hover:bg-emerald-400/20 active:scale-[0.97]">Ouvrir <span aria-hidden="true">→</span></Link>
          </div>
        </MeteoSurface>

        {/* ═══ SECTION 5: TENDANCES ═══ */}
        <MeteoSurface as="section" tone="subtle" className="min-w-0 w-full max-w-full rounded-2xl border border-white/8 bg-black/20 p-2 sm:rounded-[24px] sm:p-4">
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-white">Tendances</h2>
          <TrendSection days={days} />
        </MeteoSurface>

        {/* ═══ SECTION 6: CONFIANCE DE PRÉVISION ═══ */}
        <MeteoSurface as="section" tone="subtle" className="min-w-0 w-full max-w-full rounded-2xl border border-white/8 bg-black/20 p-2 sm:rounded-[24px] sm:p-4">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
              <MeteoIcon name="confidence" size={18} />
              Confiance de prévision officielle
            </h2>
            <ConfidenceSection confidence={confidence} regime={regime} />
        </MeteoSurface>

      </div>
      <BackToTopButton />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function DetailCell({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex min-h-[52px] flex-col justify-center rounded-xl bg-slate-800/30 px-2.5 py-2 text-center ${className}`}>
      <p className="text-[8px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-xs font-medium leading-tight text-white">{value}</p>
    </div>
  );
}

function HourlyMetric({ icon, label, value, detail }: { icon: string; label: string; value: string; detail?: string }) {
  return (
    <div className="border-t border-white/12 pt-1.5">
      <div className="flex items-center gap-1 text-[8px] font-medium uppercase tracking-wide text-slate-200/85">
        <MeteoIcon name={icon} size={12} />
        <span>{label}</span>
      </div>
      <p className="mt-0.5 text-[11px] font-semibold text-white">{value}</p>
      {detail && <p className="mt-0.5 truncate text-[8px] text-slate-200/75">{detail}</p>}
    </div>
  );
}

function calculateSunshineDuration(sunrise: string, sunset: string): string {
  const [sh, sm] = sunrise.split(":").map(Number);
  const [eh, em] = sunset.split(":").map(Number);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

function DayPeriodBreakdown({ dayDate, hours, regime, historicalPerformance }: { dayDate: string; hours: any[]; regime: any; historicalPerformance: any }) {
  const dayHours = hours.filter((hour) => hour.date === dayDate);

  if (dayHours.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {(["matin", "apres_midi", "soir", "nuit"] as Period[]).map((period) => (
          <div key={period} className="rounded-xl border border-white/8 bg-slate-950/25 p-2.5">
            <p className="text-[10px] font-semibold text-slate-200">{PERIOD_LABELS[period].emoji} {PERIOD_LABELS[period].label}</p>
            <p className="mt-2 text-[9px] leading-relaxed text-slate-500">Détail horaire non disponible pour cette journée.</p>
          </div>
        ))}
      </div>
    );
  }

  const periods: Record<Period, any[]> = { matin: [], apres_midi: [], soir: [], nuit: [] };
  dayHours.forEach((h: any) => {
    const p = getPeriod(h.hour);
    periods[p].push(h);
  });

  return (
    <div className="grid grid-cols-2 gap-2">
      {(["matin", "apres_midi", "soir", "nuit"] as Period[]).map((p) => {
        const periodHours = periods[p];
        if (periodHours.length === 0) return null;
        const avgTemp = Math.round(periodHours.reduce((s: number, h: any) => s + (h.temp ?? 0), 0) / periodHours.length);
        const avgWind = Math.round(periodHours.reduce((s: number, h: any) => s + (h.windSpeed ?? 0), 0) / periodHours.length);
        const maxGust = Math.round(Math.max(...periodHours.map((h: any) => h.windGust ?? 0)));
        const totalPrecip = periodHours.reduce((s: number, h: any) => s + (h.precipitation ?? 0), 0);
        const avgHumidity = Math.round(periodHours.reduce((s: number, h: any) => s + (h.humidity ?? 0), 0) / periodHours.length);
        const avgCloud = Math.round(periodHours.reduce((s: number, h: any) => s + (h.cloudCover ?? 0), 0) / periodHours.length);
        const dominantCondition = periodHours[Math.floor(periodHours.length / 2)]?.condition ?? "—";
        const detailByLabel = new Map<string, number[]>();
        periodHours.flatMap((hour) => getSlotAgreementDetails(hour, historicalPerformance)).forEach((detail) => {
          detailByLabel.set(detail.label, [...(detailByLabel.get(detail.label) ?? []), detail.value]);
        });
        const periodAgreementDetails = Array.from(detailByLabel.entries()).map(([label, values]: [string, number[]]) => ({
          label,
          value: Math.round(values.reduce((sum: number, value: number) => sum + value, 0) / values.length),
        }));
        return (
          <div key={p} className="bg-slate-800/30 rounded-xl p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px]">{PERIOD_LABELS[p].emoji}</span>
              <span className="text-[10px] text-white font-semibold">{PERIOD_LABELS[p].label}</span>
              <MeteoIcon name={getIconNameFromCondition(dominantCondition)} size={14} className="ml-auto" />
            </div>
            <div className="mb-1.5"><SlotConfidenceBadge details={periodAgreementDetails} historicalModels={historicalPerformance?.models ?? []} /></div>
            <div className="space-y-0.5 text-[9px] text-slate-300">
              <div className="flex justify-between"><span>Temp.</span><span className="text-white font-medium">{avgTemp}°C</span></div>
              <div className="flex justify-between"><span>Vent</span><span>{avgWind} km/h</span></div>
              <div className="flex justify-between"><span>Rafales</span><span>{maxGust} km/h</span></div>
              <div className="flex justify-between"><span>Précip.</span><span>{totalPrecip.toFixed(1)} mm</span></div>
              <div className="flex justify-between"><span>Humidité</span><span>{avgHumidity}%</span></div>
              <div className="flex justify-between"><span>Nuages</span><span>{avgCloud}%</span></div>
            </div>
            {regime && (
              <div className="flex items-center gap-1 mt-1 pt-1 border-t border-slate-700/30">
                <MeteoIcon name={getIconNameFromRegime(regime.primary.id)} size={10} />
                <span className="text-[8px] text-slate-500">{regime.primary.label}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HourlyChart({ hours, type, currentIdx }: { hours: any[]; type: ChartType; currentIdx: number }) {
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const snapTimerRef = useRef<number | null>(null);
  const chartH = 148;
  const detailCardWidth = 174;
  const detailCardStride = 186;
  const chartW = Math.max(720, hours.length * detailCardStride);
  const chartHourStride = detailCardStride;
  const [selectedIdx, setSelectedIdx] = useState(currentIdx);

  const scrollToCenteredHour = (container: HTMLDivElement | null, index: number, behavior: ScrollBehavior) => {
    if (!container) return;
    container.scrollTo({
      left: getCenteredHourScrollLeft(index, detailCardStride, detailCardWidth, hours.length, container.clientWidth),
      behavior,
    });
  };

  const syncSelectedHour = (index: number, origin: "chart" | "detail" | "initial") => {
    const nextIndex = getNearestHourIndex(index, 1, hours.length);
    setSelectedIdx(nextIndex);

    if (origin !== "chart" && chartScrollRef.current) {
      scrollToCenteredHour(chartScrollRef.current, nextIndex, "auto");
    }
    if (origin !== "detail" && detailScrollRef.current) {
      scrollToCenteredHour(detailScrollRef.current, nextIndex, "auto");
    }
  };

  const scheduleCenteredSnap = (origin: "chart" | "detail") => {
    if (snapTimerRef.current != null) window.clearTimeout(snapTimerRef.current);
    snapTimerRef.current = window.setTimeout(() => {
      const source = origin === "chart" ? chartScrollRef.current : detailScrollRef.current;
      if (!source) return;
      const nextIndex = getNearestCenteredHourIndex(
        source.scrollLeft,
        source.clientWidth,
        detailCardStride,
        detailCardWidth,
        hours.length,
      );
      setSelectedIdx(nextIndex);
      scrollToCenteredHour(chartScrollRef.current, nextIndex, "smooth");
      scrollToCenteredHour(detailScrollRef.current, nextIndex, "smooth");
    }, 120);
  };

  useEffect(() => {
    if (hours.length < 2 || currentIdx < 0 || currentIdx >= hours.length) return;
    syncSelectedHour(currentIdx, "initial");
  }, [currentIdx, hours.length]);

  useEffect(() => () => {
    if (snapTimerRef.current != null) window.clearTimeout(snapTimerRef.current);
  }, []);

  const syncDetailScroll = (event: UIEvent<HTMLDivElement>) => {
    syncSelectedHour(getNearestCenteredHourIndex(event.currentTarget.scrollLeft, event.currentTarget.clientWidth, detailCardStride, detailCardWidth, hours.length), "chart");
    scheduleCenteredSnap("chart");
  };

  const syncChartScroll = (event: UIEvent<HTMLDivElement>) => {
    syncSelectedHour(getNearestCenteredHourIndex(event.currentTarget.scrollLeft, event.currentTarget.clientWidth, detailCardStride, detailCardWidth, hours.length), "detail");
    scheduleCenteredSnap("detail");
  };

  if (hours.length === 0) return <p className="text-slate-500 text-xs">Aucune donnée disponible</p>;

  const getValue = (h: any): number | null => {
    switch (type) {
      case "temp": return h.temp;
      case "feels": return h.apparentTemp;
      case "precip": return h.precipitation;
      case "wind": return h.windSpeed;
      case "gusts": return h.windGust;
      case "humidity": return h.humidity;
      case "pressure": return h.pressure;
      case "clouds": return h.cloudCover;
    }
  };

  const getUnit = (): string => {
    switch (type) {
      case "temp": case "feels": return "°C";
      case "precip": return "mm";
      case "wind": case "gusts": return "km/h";
      case "humidity": case "clouds": return "%";
      case "pressure": return "hPa";
    }
  };

  const getColor = (): string => {
    switch (type) {
      case "temp": return "#ef4444";
      case "feels": return "#f97316";
      case "precip": return "#3b82f6";
      case "wind": case "gusts": return "#06b6d4";
      case "humidity": return "#8b5cf6";
      case "pressure": return "#22c55e";
      case "clouds": return "#94a3b8";
    }
  };

  const values = hours.map(getValue);
  const validValues = values.filter((v): v is number => v != null);
  if (validValues.length === 0) return <p className="text-slate-500 text-xs">Données non disponibles</p>;

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const range = max - min || 1;
  const chartTop = 36;
  const chartBottom = chartH - 8;
  const chartPlotHeight = chartBottom - chartTop;
  const currentX = getHourCenterX(currentIdx, chartHourStride, detailCardWidth, hours.length);

  const points = values.map((v, hourIndex) => {
    if (v == null) return null;
    const x = getHourCenterX(hourIndex, chartHourStride, detailCardWidth, hours.length);
    const y = chartBottom - ((v - min) / range) * chartPlotHeight;
    return { x, y, v, hourIndex };
  }).filter(Boolean) as { x: number; y: number; v: number; hourIndex: number }[];

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const color = getColor();

  return (
    <div className="space-y-3">
      <div ref={chartScrollRef} onScroll={syncDetailScroll} className="-mx-3 overflow-x-auto px-3 scrollbar-hide">
        <div className="min-w-[720px] rounded-[18px] border border-sky-300/25 bg-[linear-gradient(180deg,rgba(25,48,72,0.75),rgba(9,20,31,0.96))] p-3">
          <div className="mb-3 border-b border-slate-500/45 pb-2"><div className="flex h-10 items-end gap-1.5 overflow-hidden">
            {hours.map((hour: any, index: number) => {
              const agreement = hour.multiModelMetrics?.precipitation.frequencyPercent;
              const spread = hour.multiModelMetrics?.temperature.range;
              const quality = agreement == null && spread == null ? 0 : Math.max(0, Math.min(100, ((agreement ?? 70) + (spread == null ? 70 : 100 - spread * 25)) / 2));
              const barTone = quality >= 75 ? "from-lime-300 to-lime-700" : quality >= 55 ? "from-teal-300 to-teal-700" : quality > 0 ? "from-amber-300 to-amber-700" : "from-slate-500 to-slate-700";
              return <span key={`quality-${hour.hour}-${index}`} className={`min-w-[14px] flex-1 rounded-t-[8px] bg-gradient-to-b ${barTone}`} style={{ height: `${28 + ((index % 4) * 3)}px` }} />;
            })}
          </div><div className="mt-1.5 flex justify-between text-[9px] text-slate-500"><span>{hours[0]?.hour ?? "—"}</span><span>Prochaines 48 h</span><span>{hours[hours.length - 1]?.hour ?? "—"}</span></div></div>
          <div className="relative flex h-[188px] items-end gap-2 border-b border-slate-500/35 pt-5">
            <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-slate-500/20" /><div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-slate-500/20" />
            {hours.map((hour: any, index: number) => {
              const value = getValue(hour);
              const normalized = value == null ? 0 : type === "precip" ? Math.min(1, value / Math.max(max, 0.1)) : Math.max(0.08, (value - min) / range);
              const selected = index === selectedIdx;
              return <button key={`bar-${hour.hour}-${index}`} type="button" onClick={() => syncSelectedHour(index, "chart")} className={`relative flex h-full min-w-[42px] flex-1 snap-center flex-col justify-end rounded-t-xl px-0.5 text-center ${selected ? "bg-sky-400/10" : ""}`}>
                <span className="mb-1 text-[11px] font-bold" style={{ color }}>{value == null ? "—" : `${type === "pressure" ? value.toFixed(0) : value.toFixed(1)}${getUnit()}`}</span>
                <span className="w-full rounded-t-[9px] border border-white/10" style={{ height: `${Math.round(normalized * 132)}px`, background: `linear-gradient(180deg, ${color}, rgba(15,23,42,0.45))` }} />
                <span className={`mt-1.5 text-[10px] font-semibold ${selected ? "text-sky-100" : "text-slate-400"}`}>{hour.hour}</span>{index === currentIdx && <span className="text-[8px] font-bold text-sky-200">MAINTENANT</span>}
              </button>;
            })}
          </div>
        </div>
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-slate-500">Min: {min.toFixed(1)} {getUnit()}</span>
        <span className="text-[9px] text-slate-500">Max: {max.toFixed(1)} {getUnit()}</span>
      </div>

      <div className="mt-3 border-t border-slate-700/70 pt-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-200">Détails par heure</p>
          <p className="text-[10px] text-slate-400">Temp. · ressenti · vent · pluie · humidité · pression</p>
        </div>
        <div ref={detailScrollRef} onScroll={syncChartScroll} className="-mx-3 overflow-x-auto px-3 pb-2 scrollbar-hide" aria-label="Détails horaires défilables">
          <div className="flex gap-3" style={{ width: `${hours.length * 186}px` }}>
            {hours.map((h: any, i: number) => {
              const selectedValue = getValue(h);
              const temperatureMetrics = h.multiModelMetrics?.temperature;
              const precipitationMetrics = h.multiModelMetrics?.precipitation;
              return (
                <div key={`detail-${h.hour}-${i}`} className={`w-[174px] flex-shrink-0 rounded-xl border p-2.5 ${i === selectedIdx ? "border-sky-300/70 bg-sky-950/50" : "border-slate-700/70 bg-slate-950/40"}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white">{h.hour}</span>
                      {i === currentIdx && <span className="rounded-full bg-sky-400/20 px-1.5 py-0.5 text-[8px] font-bold text-sky-200">MAINTENANT</span>}
                    </div>
                    <span className="text-xs font-semibold" style={{ color }}>{selectedValue == null ? "—" : `${type === "pressure" ? selectedValue.toFixed(0) : selectedValue.toFixed(1)} ${getUnit()}`}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-300">
                    <span>Moyenne pondérée <b className="text-white">{temperatureMetrics?.weightedMean?.toFixed(1) ?? "—"}°</b></span>
                    <span>Min/max modèles <b className="text-white">{temperatureMetrics?.min?.toFixed(1) ?? "—"}/{temperatureMetrics?.max?.toFixed(1) ?? "—"}°</b></span>
                    <span>Médiane <b className="text-white">{temperatureMetrics?.median?.toFixed(1) ?? "—"}°</b></span>
                    <span>σ population <b className="text-white">{temperatureMetrics?.standardDeviation?.toFixed(1) ?? "—"}°</b></span>
                    <span>Modèles temp. <b className="text-white">{temperatureMetrics?.availableModelCount ?? 0}/{h.multiModelMetrics?.expectedModelCount ?? 7}</b></span>
                    <span>Ress. <b className="text-white">{h.apparentTemp?.toFixed(1) ?? "—"}°</b></span>
                    <span>Vent <b className="text-white">{h.windSpeed?.toFixed(0) ?? "—"}</b> km/h</span>
                    <span>Raf. <b className="text-white">{h.windGust?.toFixed(0) ?? "—"}</b> km/h</span>
                    <span>Pluie pondérée <b className="text-blue-300">{h.precipitation?.toFixed(1) ?? "—"}</b> mm</span>
                    <span title="Fréquence des modèles, non probabilité calibrée">Fréquence pluie <b className="text-blue-300">{precipitationMetrics ? `${precipitationMetrics.rainModelCount}/${precipitationMetrics.availableModelCount} · ${precipitationMetrics.frequencyPercent == null ? "—" : `${precipitationMetrics.frequencyPercent.toFixed(0)}%`}` : "—"}</b></span>
                    <span className="col-span-2">Quantité conditionnelle pondérée <b className="text-blue-300">{precipitationMetrics?.rainModelCount === 0 ? "aucun modèle au seuil" : precipitationMetrics?.conditionalWeightedMean == null ? "indisponible" : `${precipitationMetrics.conditionalWeightedMean.toFixed(1)} mm`}</b></span>
                    <span>Hum. <b className="text-white">{h.humidity ?? "—"}%</b></span>
                    <span>Press. <b className="text-white">{h.pressure?.toFixed(0) ?? "—"}</b></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrendSection({ days }: { days: any[] }) {
  if (days.length < 3) return <p className="text-slate-500 text-xs">Pas assez de données</p>;

  const getTrend = (values: (number | null)[]): "rising" | "falling" | "stable" => {
    const valid = values.filter((v): v is number => v != null);
    if (valid.length < 3) return "stable";
    const first3 = valid.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const last3 = valid.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const diff = last3 - first3;
    if (Math.abs(diff) < 1) return "stable";
    return diff > 0 ? "rising" : "falling";
  };

  const trendIcon = (t: "rising" | "falling" | "stable") => {
    if (t === "rising") return <MeteoIcon name="trend_up" size={16} />;
    if (t === "falling") return <MeteoIcon name="trend_down" size={16} />;
    return <span className="text-slate-400 text-sm">➡️</span>;
  };

  const trendLabel = (t: "rising" | "falling" | "stable") => {
    if (t === "rising") return "En hausse";
    if (t === "falling") return "En baisse";
    return "Stable";
  };

  const trends = [
    { label: "Températures", trend: getTrend(days.map((d: any) => d.tempMax)), icon: "temperature" },
    { label: "Vent", trend: getTrend(days.map((d: any) => d.windSpeed)), icon: "wind_param" },
    { label: "Précipitations", trend: getTrend(days.map((d: any) => d.precipitation)), icon: "precipitation" },
    { label: "Pression", trend: getTrend(days.map((d: any) => (d as any).pressure ?? null)), icon: "pressure" },
    { label: "Couverture nuageuse", trend: getTrend(days.map((d: any) => d.cloudCover)), icon: "cloud_cover" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {trends.map((t) => (
        <div key={t.label} className="flex items-center gap-2 bg-slate-800/30 rounded-lg p-2.5">
          <MeteoIcon name={t.icon} size={16} />
          <div className="flex-1">
            <span className="text-[10px] text-slate-400 block">{t.label}</span>
            <span className="text-xs text-white font-medium">{trendLabel(t.trend)}</span>
          </div>
          {trendIcon(t.trend)}
        </div>
      ))}
    </div>
  );
}

function ConfidenceSection({
  confidence,
  regime,
}: {
  confidence?: { current?: number; today?: number; week?: number; stabilityIndex?: number | null };
  regime: any;
}) {
  const periodConfidence = Math.round(confidence?.current ?? 0);
  const todayConfidence = Math.round(confidence?.today ?? 0);
  const weekConfidence = Math.round(confidence?.week ?? 0);

  return (
    <div className="space-y-3">
      <ConfidenceBar label="Période en cours" value={periodConfidence} />
      <ConfidenceBar label="Aujourd'hui" value={todayConfidence} />
      <ConfidenceBar label="J+4 à J+7" value={weekConfidence} />
      {regime && (
        <div className="text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-700/50">
          Cette confiance de prévision combine l’accord des modèles, leurs performances historiques qualifiées, la cohérence des stations si disponible et l’horizon de prévision.
          {confidence?.stabilityIndex != null && ` Stabilité des modèles : ${Math.round(confidence.stabilityIndex)}%.`}
        </div>
      )}
    </div>
  );
}

function ConfidenceBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "bg-green-500" : value >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-300 w-36">{label}</span>
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-white font-bold w-10 text-right">{value}%</span>
    </div>
  );
}
