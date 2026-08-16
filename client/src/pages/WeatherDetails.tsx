/**
 * WeatherDetails — Page de prévisions météo ultra-détaillées
 * Sections: Prévisions horaires, Graphiques, Résumé IA, Prévisions jours, Tendances, Confiance
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { MeteoIcon, getIconNameFromCondition, getIconNameFromRegime } from "@/components/MeteoIcon";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { useLocation } from "@/contexts/LocationContext";
import { MeteoSurface } from "@/components/weather/MeteoSurface";
import { WeatherStatusBadge } from "@/components/weather/WeatherStatusBadge";
import { BackToTopButton } from "@/components/BackToTopButton";

// ─── Helpers ────────────────────────────────────────────────────────────────

function windDirectionLabel(deg: number | null | undefined): string {
  if (deg == null) return "—";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
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

// ─── Chart types ────────────────────────────────────────────────────────────

type ChartType = "temp" | "feels" | "precip" | "wind" | "gusts" | "humidity" | "pressure" | "clouds";

const CHART_OPTIONS: { key: ChartType; label: string }[] = [
  { key: "temp", label: "Température" },
  { key: "feels", label: "Ressenti" },
  { key: "precip", label: "Précipitations" },
  { key: "wind", label: "Vent" },
  { key: "gusts", label: "Rafales" },
  { key: "humidity", label: "Humidité" },
  { key: "pressure", label: "Pression" },
  { key: "clouds", label: "Nuages" },
];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function WeatherDetails() {
  const { activeLocation } = useLocation();
  const coordsInput = useMemo(() => activeLocation
    ? { lat: activeLocation.lat, lon: activeLocation.lon }
    : undefined, [activeLocation?.lat, activeLocation?.lon]);

  const { data, isLoading } = trpc.weather.getDetailedForecast.useQuery(coordsInput);
  const [activeChart, setActiveChart] = useState<ChartType>("temp");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const hourlyRef = useRef<HTMLDivElement>(null);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d1117]">
        <div className="max-w-2xl mx-auto px-3 py-4 space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const hours = data?.hours ?? [];
  const days = data?.days ?? [];
  const regime = data?.regime;
  const confidence = data?.confidence;

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <div className="mx-auto max-w-2xl space-y-3 px-3 py-3 pb-28">

        {/* ═══ HEADER ═══ */}
        <MeteoSurface as="section" tone="accent" className="rounded-[22px] p-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-sky-300/25 bg-slate-950/45 text-sky-200 transition-colors hover:border-sky-300/55 hover:bg-sky-400/10" aria-label="Retour au Dashboard">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-sky-200/75">Prévision officielle</p>
              <h1 className="mt-0.5 text-xl font-bold tracking-tight text-white">Prévisions détaillées</h1>
              <p className="mt-1 truncate text-xs text-slate-400">{activeLocation?.name ?? "Position actuelle"} · {formatDate(data?.today ?? "")}</p>
            </div>
            {regime && <WeatherStatusBadge compact tone="info" label="Régime" value={regime.primary.label} icon={<MeteoIcon name={getIconNameFromRegime(regime.primary.id)} size={15} />} />}
          </div>
        </MeteoSurface>

        {/* ═══ SECTION 1: PRÉVISIONS HORAIRES ═══ */}
        <MeteoSurface as="section" tone="default" className="rounded-[22px] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl border border-sky-300/25 bg-sky-400/10"><MeteoIcon name="refresh" size={16} /></span>
              <div><h2 className="text-base font-semibold text-white">Heure par heure</h2><p className="text-[11px] text-slate-400">Données officielles défilables</p></div>
            </div>
            <span className="rounded-full border border-slate-700/70 bg-slate-950/45 px-2 py-1 text-[10px] font-semibold text-slate-300">48 h</span>
          </div>
          
          {/* Horizontal scrollable hourly cards */}
          <div ref={hourlyRef} className="overflow-x-auto pb-2 -mx-3 px-3 scrollbar-hide">
            <div className="flex gap-3" style={{ width: `${hours.length * 214}px` }}>
              {hours.map((h: any, i: number) => {
                const isNow = i === currentHourIdx;
                const pTrend = pressureTrend(hours, i);
                return (
                  <div
                    key={h.hour}
                    className={`weather-surface-inset flex-shrink-0 w-[212px] rounded-2xl border p-4 transition-colors ${
                      isNow
                        ? "border-sky-300/60 bg-sky-950/55"
                        : "border-slate-700/70 bg-slate-950/50"
                    }`}
                  >
                    {/* Hour + Now badge */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-base font-bold ${isNow ? "text-blue-400" : "text-white"}`}>{h.hour}</span>
                      {isNow && <span className="rounded-full bg-blue-500/30 px-2 py-0.5 text-[9px] font-semibold text-blue-300">MAINTENANT</span>}
                    </div>
                    
                    {/* Icon + condition */}
                    <div className="mb-2 flex items-center gap-2">
                      <MeteoIcon name={getIconNameFromCondition(h.condition)} size={32} />
                      <span className="text-[11px] leading-tight text-slate-300">{h.condition ?? "—"}</span>
                    </div>
                    
                    {/* Temperature */}
                    <div className="mb-2 flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-white">{h.temp?.toFixed(1) ?? "—"}°</span>
                      <span className="text-[11px] text-slate-400">ressenti {h.apparentTemp?.toFixed(0) ?? "—"}°</span>
                    </div>
                    
                    {/* Precipitation */}
                    <div className="mb-1 flex items-center gap-1.5">
                      <MeteoIcon name="precipitation" size={12} />
                      <span className="text-xs text-blue-300">{h.precipProb ?? 0}%</span>
                      {(h.precipitation ?? 0) > 0 && (
                        <span className="text-xs font-medium text-blue-400">{h.precipitation?.toFixed(1)} mm</span>
                      )}
                      {h.precipType && <span className="text-[10px] text-slate-500">({h.precipType === "snow" ? "neige" : h.precipType === "freezing_rain" ? "verglas" : "pluie"})</span>}
                    </div>
                    {h.precipIntensity && (
                      <span className="mb-1 block text-[10px] text-slate-500">Intensité: {h.precipIntensity === "heavy" ? "forte" : h.precipIntensity === "moderate" ? "modérée" : "faible"}</span>
                    )}
                    
                    {/* Humidity + Dew point */}
                    <div className="mb-1 flex items-center gap-1.5">
                      <MeteoIcon name="humidity" size={12} />
                      <span className="text-xs text-slate-300">{h.humidity ?? "—"}%</span>
                      {h.dewPoint != null && <span className="text-[10px] text-slate-500">rosée {h.dewPoint.toFixed(0)}°</span>}
                    </div>
                    
                    {/* Wind */}
                    <div className="mb-1 flex items-center gap-1.5">
                      <MeteoIcon name="wind_param" size={12} />
                      <span className="text-xs text-slate-300">{h.windSpeed?.toFixed(0) ?? "—"} km/h</span>
                      <span className="text-[10px] text-slate-500" style={{ transform: `rotate(${(h.windDirection ?? 0) + 180}deg)`, display: "inline-block" }}>↑</span>
                      <span className="text-[10px] text-slate-500">{windDirectionLabel(h.windDirection)}</span>
                    </div>
                    {h.windGust != null && (
                      <span className="mb-1 block text-[10px] text-slate-500">Rafales: {h.windGust.toFixed(0)} km/h</span>
                    )}
                    
                    {/* Pressure */}
                    <div className="mb-1 flex items-center gap-1.5">
                      <MeteoIcon name="pressure" size={12} />
                      <span className="text-xs text-slate-300">{h.pressure?.toFixed(0) ?? "—"} hPa</span>
                      <span className="text-[10px]">{pTrend === "rising" ? "⬆️" : pTrend === "falling" ? "⬇️" : "➡️"}</span>
                    </div>
                    
                    {/* Cloud layers */}
                    <div className="mb-1 flex items-center gap-1.5">
                      <MeteoIcon name="cloud_cover" size={12} />
                      <span className="text-xs text-slate-300">{h.cloudCover ?? "—"}%</span>
                    </div>
                    {(h.cloudLow != null || h.cloudMid != null || h.cloudHigh != null) && (
                      <div className="mb-1 flex gap-1.5 text-[10px] text-slate-500">
                        {h.cloudLow != null && <span>Bas {h.cloudLow}%</span>}
                        {h.cloudMid != null && <span>Moy {h.cloudMid}%</span>}
                        {h.cloudHigh != null && <span>Haut {h.cloudHigh}%</span>}
                      </div>
                    )}
                    
                    {/* Visibility */}
                    {h.visibility != null && (
                      <div className="mb-1 text-[10px] text-slate-500">Visibilité: {h.visibility} km</div>
                    )}
                    
                    {/* UV */}
                    {h.uvIndex != null && h.uvIndex > 0 && (
                      <div className="mb-1 text-[10px] text-slate-500">UV: {h.uvIndex.toFixed(0)}</div>
                    )}
                    
                    {/* Solar radiation */}
                    {h.solarRadiation != null && h.solarRadiation > 0 && (
                      <div className="mb-1 text-[10px] text-slate-500">Rayonnement: {h.solarRadiation.toFixed(0)} W/m²</div>
                    )}
                    
                    {/* Régime opérationnel partagé */}
                    {regime && (
                      <div className="mt-1 pt-1 border-t border-slate-700/50">
                        <div className="flex items-center gap-1">
                          <MeteoIcon name={getIconNameFromRegime(regime.primary.id)} size={12} />
                          <span className="text-[10px] text-slate-400">{regime.primary.label}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-slate-500">← Glissez pour voir les heures suivantes →</p>
        </MeteoSurface>

        {/* ═══ SECTION 2: GRAPHIQUES INTERACTIFS ═══ */}
        <MeteoSurface as="section" tone="default" className="rounded-[22px] p-4">
          <div className="mb-3 flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-xl border border-sky-300/25 bg-sky-400/10"><MeteoIcon name="chart" size={16} /></span><div><h2 className="text-base font-semibold text-white">Graphiques</h2><p className="text-[11px] text-slate-400">Évolution par paramètre</p></div></div>
          
          {/* Chart selector */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide mb-3">
            {CHART_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setActiveChart(opt.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeChart === opt.key
                    ? "border border-sky-300/55 bg-sky-400/15 text-sky-100"
                    : "border border-slate-700/70 bg-slate-950/45 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          
          {/* Chart area */}
          <div className="weather-chart-3d rounded-2xl border p-3">
            <HourlyChart hours={hours} type={activeChart} currentIdx={currentHourIdx} />
          </div>
        </MeteoSurface>

        {/* ═══ SECTION 3: PRÉVISIONS DES PROCHAINS JOURS ═══ */}
        <MeteoSurface as="section" tone="default" className="rounded-[22px] p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl border border-sky-300/25 bg-sky-400/10"><MeteoIcon name="calendar" size={16} /></span>
            <div><h2 className="text-base font-semibold text-white">Prochains jours</h2><p className="text-[11px] text-slate-400">Ouvrez un jour pour consulter ses détails</p></div>
          </div>
          
          <div className="space-y-2">
            {days.map((day: any) => {
              const isExpanded = expandedDay === day.date;
              // Les données serveur distinguent la confiance (accord, qualité,
              // historique, échéance) de la simple dispersion des modèles.
              return (
                <div key={day.date} className="weather-surface-inset overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/45">
                  {/* Day summary card */}
                  <button
                    onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                    className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-sky-400/[0.05]"
                  >
                    <div className="flex-shrink-0">
                      <MeteoIcon name={getIconNameFromCondition(day.condition)} size={32} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold text-sm capitalize">{getDayOfWeek(day.date)}</span>
                        <span className="text-slate-500 text-xs">{formatDate(day.date)}</span>
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
                    <span className="text-[10px] text-slate-600">{isExpanded ? "▲" : "▼"}</span>
                  </button>
                  
                  {/* Expanded day details */}
                  {isExpanded && (
                    <div className="space-y-3 border-t border-slate-700/70 p-3">
                      {/* Day details grid */}
                      <div className="grid grid-cols-3 gap-2">
                        <DetailCell label="Ressenti" value={`${day.feelsLikeMin?.toFixed(0) ?? "?"}° / ${day.feelsLikeMax?.toFixed(0) ?? "?"}°`} />
                        <DetailCell label="Lever" value={day.sunrise ?? "—"} />
                        <DetailCell label="Coucher" value={day.sunset ?? "—"} />
                        <DetailCell label="Humidité" value={`${day.humidity?.toFixed(0) ?? "—"}%`} />
                        <DetailCell label="Vent" value={`${day.windSpeed?.toFixed(0) ?? "—"} km/h`} />
                        <DetailCell label="Rafales" value={`${day.windGust?.toFixed(0) ?? "—"} km/h`} />
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
                      <DayPeriodBreakdown dayDate={day.date} hours={hours} regime={regime} />
                      
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </MeteoSurface>

        {/* ═══ SECTION 5: TENDANCES ═══ */}
        <MeteoSurface as="section" tone="subtle" className="rounded-[22px] p-4">
          <h2 className="mb-3 text-base font-semibold text-white">Tendances</h2>
          <div className="weather-surface-inset rounded-2xl border border-slate-700/70 bg-slate-950/45 p-3">
            <TrendSection days={days} />
          </div>
        </MeteoSurface>

        {/* ═══ SECTION 6: CONFIANCE DE PRÉVISION ═══ */}
        <MeteoSurface as="section" tone="subtle" className="rounded-[22px] p-4">
          <div className="weather-surface-inset rounded-2xl border border-slate-700/70 bg-slate-950/45 p-3">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-white">
              <MeteoIcon name="confidence" size={14} />
              Confiance de prévision officielle
            </h2>
            <ConfidenceSection confidence={confidence} regime={regime} />
          </div>
        </MeteoSurface>

      </div>
      <BackToTopButton />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/30 rounded-lg p-2 text-center">
      <p className="text-[8px] text-slate-500">{label}</p>
      <p className="text-xs text-white font-medium">{value}</p>
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

function DayPeriodBreakdown({ dayDate, hours, regime }: { dayDate: string; hours: any[]; regime: any }) {
  // For today, use actual hourly data; for future days, show estimated from daily data
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const isToday = dayDate === todayStr;
  
  if (!isToday) {
    // For future days, we don't have hourly data — show placeholder
    return (
      <div className="text-[9px] text-slate-500 italic">
        Découpage horaire disponible uniquement pour aujourd'hui et demain.
      </div>
    );
  }

  const periods: Record<Period, any[]> = { matin: [], apres_midi: [], soir: [], nuit: [] };
  hours.forEach((h: any) => {
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
        return (
          <div key={p} className="bg-slate-800/30 rounded-xl p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px]">{PERIOD_LABELS[p].emoji}</span>
              <span className="text-[10px] text-white font-semibold">{PERIOD_LABELS[p].label}</span>
              <MeteoIcon name={getIconNameFromCondition(dominantCondition)} size={14} className="ml-auto" />
            </div>
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
  const chartH = 148;
  const chartW = Math.max(720, hours.length * 68);

  useEffect(() => {
    if (hours.length < 2 || currentIdx < 0 || currentIdx >= hours.length) return;

    const currentX = (currentIdx / (hours.length - 1)) * chartW;
    const chartScrollContainer = chartScrollRef.current;
    if (chartScrollContainer) {
      const targetLeft = Math.max(0, currentX - chartScrollContainer.clientWidth * 0.34);
      chartScrollContainer.scrollTo({ left: targetLeft, behavior: "auto" });
    }

    const detailScrollContainer = detailScrollRef.current;
    if (detailScrollContainer) {
      const detailCardStride = 186;
      const detailTargetLeft = Math.max(0, currentIdx * detailCardStride - detailScrollContainer.clientWidth * 0.18);
      detailScrollContainer.scrollTo({ left: detailTargetLeft, behavior: "auto" });
    }
  }, [chartW, currentIdx, hours.length]);

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
  const currentX = (currentIdx / Math.max(hours.length - 1, 1)) * chartW;
  const currentLabelX = Math.min(Math.max(currentX + 8, 6), chartW - 118);

  const points = values.map((v, hourIndex) => {
    if (v == null) return null;
    const x = (hourIndex / (hours.length - 1)) * chartW;
    const y = chartH - ((v - min) / range) * (chartH - 20) - 10;
    return { x, y, v, hourIndex };
  }).filter(Boolean) as { x: number; y: number; v: number; hourIndex: number }[];

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const color = getColor();

  return (
    <div className="space-y-3">
      <div ref={chartScrollRef} className="overflow-x-auto scrollbar-hide">
        <svg width={chartW} height={chartH + 34} className="min-w-full">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <line key={pct} x1={0} x2={chartW} y1={chartH - pct * (chartH - 20) - 10} y2={chartH - pct * (chartH - 20) - 10} stroke="#1e293b" strokeWidth="1" />
        ))}

        {/* Repères pour chaque heure afin de relier précisément valeurs et courbe. */}
        {hours.map((_, i) => {
          const x = (i / (hours.length - 1)) * chartW;
          return <line key={`hour-grid-${i}`} x1={x} x2={x} y1={0} y2={chartH} stroke="#334155" strokeWidth="0.5" opacity="0.45" />;
        })}
        
        {/* Current hour indicator */}
        {currentIdx < hours.length && (
          <>
            <line
            x1={currentX}
            x2={currentX}
            y1={0} y2={chartH}
              stroke="#60a5fa" strokeWidth="2" strokeDasharray="5 3" opacity="0.9"
            />
            <g transform={`translate(${currentLabelX} 8)`}>
              <rect width="110" height="20" rx="10" fill="#0f4c81" stroke="#93c5fd" strokeWidth="1" />
              <text x="55" y="13.5" textAnchor="middle" fill="#eff6ff" fontSize="10" fontWeight="700">Maintenant · {hours[currentIdx]?.hour ?? "—"}</text>
            </g>
          </>
        )}
        
        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Points */}
        {points.map((p) => (
          <g key={p.hourIndex}>
            {p.hourIndex === currentIdx && <circle cx={p.x} cy={p.y} r="8" fill="#60a5fa" opacity="0.28" />}
            <circle cx={p.x} cy={p.y} r={p.hourIndex === currentIdx ? 5 : 2.5} fill={color} stroke={p.hourIndex === currentIdx ? "#fff" : "none"} strokeWidth={p.hourIndex === currentIdx ? 2 : 0} />
          </g>
        ))}
        
        {/* Chaque heure est libellée : le défilement horizontal conserve la lisibilité. */}
        {hours.map((h: any, i: number) => {
          const x = (i / (hours.length - 1)) * chartW;
          return (
            <text key={i} x={x} y={chartH + 18} textAnchor="middle" fill={i === currentIdx ? "#93c5fd" : "#94a3b8"} fontSize="10" fontWeight={i === currentIdx ? "700" : "500"}>{h.hour}</text>
          );
        })}
        
        {/* Valeur sélectionnée au-dessus de chaque heure. */}
        {points.map((p) => {
          return (
            <text key={`value-${p.hourIndex}`} x={p.x} y={p.y - 9} textAnchor="middle" fill={color} fontSize="10" fontWeight="bold">
              {type === "pressure" ? p.v.toFixed(0) : p.v.toFixed(1)}
            </text>
          );
        })}
        </svg>
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
        <div ref={detailScrollRef} className="-mx-3 overflow-x-auto px-3 pb-2 scrollbar-hide" aria-label="Détails horaires défilables">
          <div className="flex gap-3" style={{ width: `${hours.length * 186}px` }}>
            {hours.map((h: any, i: number) => {
              const selectedValue = getValue(h);
              return (
                <div key={`detail-${h.hour}-${i}`} className={`w-[174px] flex-shrink-0 rounded-xl border p-2.5 ${i === currentIdx ? "border-sky-300/70 bg-sky-950/50" : "border-slate-700/70 bg-slate-950/40"}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white">{h.hour}</span>
                      {i === currentIdx && <span className="rounded-full bg-sky-400/20 px-1.5 py-0.5 text-[8px] font-bold text-sky-200">MAINTENANT</span>}
                    </div>
                    <span className="text-xs font-semibold" style={{ color }}>{selectedValue == null ? "—" : `${type === "pressure" ? selectedValue.toFixed(0) : selectedValue.toFixed(1)} ${getUnit()}`}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-300">
                    <span>Temp. <b className="text-white">{h.temp?.toFixed(1) ?? "—"}°</b></span>
                    <span>Ress. <b className="text-white">{h.apparentTemp?.toFixed(1) ?? "—"}°</b></span>
                    <span>Vent <b className="text-white">{h.windSpeed?.toFixed(0) ?? "—"}</b> km/h</span>
                    <span>Raf. <b className="text-white">{h.windGust?.toFixed(0) ?? "—"}</b> km/h</span>
                    <span>Pluie <b className="text-blue-300">{h.precipitation?.toFixed(1) ?? "—"}</b> mm</span>
                    <span>Prob. <b className="text-blue-300">{h.precipProb ?? "—"}%</b></span>
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
