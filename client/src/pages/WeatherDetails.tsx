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
import { BackToTopButton } from "@/components/BackToTopButton";
import { getCenteredHourScrollLeft, getHourCenterX, getNearestCenteredHourIndex, getNearestHourIndex } from "@/lib/hourlyScrollSync";

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
function getSlotAgreementConfidence(hour: any): number | null {
  const components: number[] = [];
  if (typeof hour?.precipAgreement === "number") components.push(hour.precipAgreement);
  if (typeof hour?.tempSpread === "number") components.push(Math.max(0, Math.min(100, 100 - hour.tempSpread * 25)));
  if (components.length === 0) return null;
  return Math.round(components.reduce((sum, value) => sum + value, 0) / components.length);
}

function SlotConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) return null;
  const tone = value >= 75
    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
    : value >= 55
      ? "border-sky-300/25 bg-sky-300/10 text-sky-100"
      : "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${tone}`}>Accord {value}%</span>;
}

// ─── Main Component ─────────────────────────────────────────────────────────

type ChartType = "temp" | "feels" | "precip" | "wind" | "gusts" | "humidity" | "pressure" | "clouds";

export default function WeatherDetails() {
  const { activeLocation } = useLocation();
  const { style: pageSkyStyle } = usePageWeatherSky();
  const coordsInput = useMemo(() => activeLocation
    ? { lat: activeLocation.lat, lon: activeLocation.lon }
    : undefined, [activeLocation?.lat, activeLocation?.lon]);

  const { data, isLoading } = trpc.weather.getDetailedForecast.useQuery(coordsInput);
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

  // À l’ouverture ou au changement de lieu, placer directement la carte de
  // l’heure réelle de Paris au début du ruban horizontal.
  useEffect(() => {
    const rail = hourlyRef.current;
    if (!rail || !data?.hours?.length) return;
    const hourlyCardStride = 170; // largeur 160px + espacement 10px
    const targetLeft = Math.max(0, currentHourIdx * hourlyCardStride - 8);
    const frame = requestAnimationFrame(() => rail.scrollTo({ left: targetLeft, behavior: "auto" }));
    return () => cancelAnimationFrame(frame);
  }, [data?.hours?.length, currentHourIdx, activeLocation?.lat, activeLocation?.lon]);

  if (isLoading) {
    return (
      <div className="weather-page-sky min-h-screen bg-[#0d1117]" style={pageSkyStyle}>
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
  const periodHours = data?.periodHours ?? hours;
  const days = data?.days ?? [];
  const regime = data?.regime;
  const confidence = data?.confidence;
  const currentHour = hours[currentHourIdx] ?? hours[0];

  return (
    <div className="weather-page-sky min-h-screen bg-[#0d1117]" style={pageSkyStyle}>
      <div className="mx-auto max-w-2xl space-y-5 px-3 py-4 pb-28">

        {/* ═══ SECTION 1: PRÉVISIONS HORAIRES ═══ */}
        <MeteoSurface as="section" tone="default" className="rounded-[26px] border border-white/10 bg-[rgba(26,48,70,0.56)] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-2xl border border-sky-200/20 bg-sky-300/10"><MeteoIcon name="refresh" size={18} /></span>
              <div><p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-100/55">Déroulé temporel</p><h2 className="mt-0.5 text-lg font-semibold tracking-tight text-white">Heure par heure</h2></div>
            </div>
            <span className="rounded-full border border-sky-200/20 bg-sky-300/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-sky-100">48 h</span>
          </div>
          
          {/* Horizontal scrollable hourly cards */}
          <div ref={hourlyRef} className="overflow-x-auto pb-2 -mx-3 px-3 scrollbar-hide">
            <div className="flex gap-2.5" style={{ width: `${hours.length * 170}px` }}>
              {hours.map((h: any, i: number) => {
                const isNow = i === currentHourIdx;
                const pTrend = pressureTrend(hours, i);
                return (
                  <div
                    key={h.hour}
                    className={`flex-shrink-0 w-[160px] rounded-[22px] border p-3 transition-colors ${
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
                    <div className="mb-3 border-b border-white/12 pb-3">
                      <span className={`text-[36px] font-semibold leading-none tracking-[-0.075em] ${hourlyTemperatureTone(h.temp)}`}>{h.temp?.toFixed(1) ?? "—"}°</span>
                      <span className="mt-1 block text-[10px] font-medium text-slate-300">ressenti {h.apparentTemp?.toFixed(0) ?? "—"}°</span>
                      <div className="mt-1.5"><SlotConfidenceBadge value={getSlotAgreementConfidence(h)} /></div>
                    </div>
                    
                    {/* Precipitation */}
                    <div className="mb-2.5 flex items-center gap-1.5 rounded-xl border border-sky-100/20 bg-sky-100/[0.08] px-2 py-1.5">
                      <MeteoIcon name="precipitation" size={14} />
                      <span className="text-[11px] font-semibold text-slate-50">Accord pluie {h.precipAgreement ?? 0}%</span>
                      {(h.precipitation ?? 0) > 0 && (
                        <span className="text-[11px] font-semibold text-sky-100">{h.precipitation?.toFixed(1)} mm</span>
                      )}
                      {h.precipType && <span className="text-[9px] text-sky-50/75">{h.precipType === "snow" ? "neige" : h.precipType === "freezing_rain" ? "verglas" : "pluie"}</span>}
                    </div>
                    {h.precipIntensity && (
                      <span className="-mt-1 mb-2 block text-[9px] text-slate-200">Intensité {h.precipIntensity === "heavy" ? "forte" : h.precipIntensity === "moderate" ? "modérée" : "faible"}</span>
                    )}

                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                      <HourlyMetric icon="humidity" label="Humidité" value={`${h.humidity ?? "—"}%`} detail={h.dewPoint != null ? `Rosée ${h.dewPoint.toFixed(0)}°` : undefined} />
                      <HourlyMetric icon="wind_param" label="Vent" value={`${h.windSpeed?.toFixed(0) ?? "—"} km/h`} detail={`${windDirectionLabel(h.windDirection)}${h.windGust != null ? ` · raf. ${h.windGust.toFixed(0)}` : ""}`} />
                      <HourlyMetric icon="pressure" label="Pression" value={`${h.pressure?.toFixed(0) ?? "—"} hPa`} detail={pTrend === "rising" ? "En hausse" : pTrend === "falling" ? "En baisse" : "Stable"} />
                      <HourlyMetric icon="cloud_cover" label="Nuages" value={`${h.cloudCover ?? "—"}%`} />
                    </div>
                    {(h.cloudLow != null || h.cloudMid != null || h.cloudHigh != null) && (
                      <div className="mt-2 hidden gap-1.5 text-[10px] text-slate-300 md:flex">
                        {h.cloudLow != null && <span>Bas {h.cloudLow}%</span>}
                        {h.cloudMid != null && <span>Moy {h.cloudMid}%</span>}
                        {h.cloudHigh != null && <span>Haut {h.cloudHigh}%</span>}
                      </div>
                    )}
                    
                    {/* Visibility */}
                    {h.visibility != null && (
                      <div className="mt-2 hidden text-[10px] text-slate-300 md:block">Visibilité {h.visibility} km</div>
                    )}
                    
                    {/* UV */}
                    {h.uvIndex != null && h.uvIndex > 0 && (
                      <div className="mt-1 hidden text-[10px] text-slate-300 md:block">UV {h.uvIndex.toFixed(0)}</div>
                    )}
                    
                    {/* Solar radiation */}
                    {h.solarRadiation != null && h.solarRadiation > 0 && (
                      <div className="mt-1 hidden text-[10px] text-slate-300 md:block">Rayonnement {h.solarRadiation.toFixed(0)} W/m²</div>
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
          <p className="mt-2 text-center text-[10px] text-slate-500">← Glissez pour voir les heures suivantes →</p>
        </MeteoSurface>

        {/* ═══ SECTION 2: PRÉVISIONS DES PROCHAINS JOURS ═══ */}
        <MeteoSurface as="section" tone="default" className="rounded-[24px] border border-white/10 bg-[rgba(11,17,28,0.86)] p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-white/12 bg-white/[0.04]"><MeteoIcon name="calendar" size={16} /></span>
            <div><p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">Tendance étendue</p><h2 className="mt-0.5 text-lg font-semibold tracking-tight text-white">Prochains jours</h2></div>
          </div>
          
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
                      <DayPeriodBreakdown dayDate={day.date} hours={periodHours} regime={regime} />
                      
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </MeteoSurface>

        {/* ═══ SECTION 5: TENDANCES ═══ */}
        <MeteoSurface as="section" tone="subtle" className="rounded-[24px] border border-white/8 bg-black/20 p-4">
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-white">Tendances</h2>
          <div className="weather-surface-inset rounded-[18px] border border-white/8 bg-white/[0.025] p-3">
            <TrendSection days={days} />
          </div>
        </MeteoSurface>

        {/* ═══ SECTION 6: CONFIANCE DE PRÉVISION ═══ */}
        <MeteoSurface as="section" tone="subtle" className="rounded-[24px] border border-white/8 bg-black/20 p-4">
          <div className="weather-surface-inset rounded-[18px] border border-white/8 bg-white/[0.025] p-3">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
              <MeteoIcon name="confidence" size={18} />
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

function DayPeriodBreakdown({ dayDate, hours, regime }: { dayDate: string; hours: any[]; regime: any }) {
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
        const agreementValues = periodHours.map(getSlotAgreementConfidence).filter((value): value is number => value != null);
        const periodAgreement = agreementValues.length > 0
          ? Math.round(agreementValues.reduce((sum, value) => sum + value, 0) / agreementValues.length)
          : null;
        return (
          <div key={p} className="bg-slate-800/30 rounded-xl p-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px]">{PERIOD_LABELS[p].emoji}</span>
              <span className="text-[10px] text-white font-semibold">{PERIOD_LABELS[p].label}</span>
              <MeteoIcon name={getIconNameFromCondition(dominantCondition)} size={14} className="ml-auto" />
            </div>
            <div className="mb-1.5"><SlotConfidenceBadge value={periodAgreement} /></div>
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
              const agreement = hour.precipAgreement;
              const spread = hour.tempSpread;
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
                    <span>Temp. <b className="text-white">{h.temp?.toFixed(1) ?? "—"}°</b></span>
                    <span>Ress. <b className="text-white">{h.apparentTemp?.toFixed(1) ?? "—"}°</b></span>
                    <span>Vent <b className="text-white">{h.windSpeed?.toFixed(0) ?? "—"}</b> km/h</span>
                    <span>Raf. <b className="text-white">{h.windGust?.toFixed(0) ?? "—"}</b> km/h</span>
                    <span>Pluie <b className="text-blue-300">{h.precipitation?.toFixed(1) ?? "—"}</b> mm</span>
                    <span>Accord pluie <b className="text-blue-300">{h.precipAgreement ?? "—"}%</b></span>
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
