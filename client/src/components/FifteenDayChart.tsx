import { useRef, useState, useEffect, useCallback } from "react";
import { TrendingUp, X, Thermometer, Wind, Droplets, Sun, Cloud, Sunrise, Sunset, Gauge, Navigation, Eye, MapPin } from "lucide-react";
import { MeteoIcon, getIconNameFromCondition } from "@/components/MeteoIcon";
import { conditionFromWeatherValues } from "@shared/weatherConditionLabels";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DayData {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDirection: number | null;
  humidity: number | null;
  cloudCover: number | null;
  condition: string | null;
  stabilityIndex: number;
  stabilityLabel?: string;
  uvIndex: number | null;
  feelsLikeMax: number | null;
  feelsLikeMin: number | null;
  sunrise: string | null;
  sunset: string | null;
}

interface Props {
  days: DayData[];
  locationName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const dayNames = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
  const months = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sep.", "oct.", "nov.", "déc."];
  const isToday = dateStr === new Date().toISOString().slice(0, 10);
  if (isToday) return { line1: "Auj.", line2: `${d.getDate()} ${months[d.getMonth()]}` };
  return { line1: dayNames[d.getDay()], line2: `${d.getDate()} ${months[d.getMonth()]}` };
}

function getConditionLabel(cloudCover: number | null, precip: number | null, condition: string | null): string {
  if (condition && /(orage|brouillard|neige|pluie|averse)/i.test(condition)) return condition;
  if (cloudCover != null || precip != null) return conditionFromWeatherValues(precip, cloudCover);
  return condition ?? "Ensoleillé";
}

function getConditionBg(cloudCover: number | null, precip: number | null, condition: string | null): string {
  const cond = (condition ?? "").toLowerCase();
  if (cond.includes("orage")) return "rgba(148, 163, 184, 0.045)";
  if ((precip ?? 0) > 3 || cond.includes("pluie") || cond.includes("averse")) return "rgba(148, 163, 184, 0.032)";
  if ((cloudCover ?? 0) > 75 || cond.includes("couvert")) return "rgba(148, 163, 184, 0.04)";
  if ((cloudCover ?? 0) < 30 || cond.includes("ensoleillé")) return "rgba(255, 255, 255, 0.025)";
  return "rgba(255, 255, 255, 0.014)";
}

function degToCompass(deg: number | null): string {
  if (deg == null) return "—";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function uvLabel(uv: number | null): { text: string; color: string } {
  if (uv == null) return { text: "—", color: "text-muted-foreground" };
  if (uv <= 2) return { text: "Faible", color: "text-green-400" };
  if (uv <= 5) return { text: "Modéré", color: "text-yellow-400" };
  if (uv <= 7) return { text: "Élevé", color: "text-orange-400" };
  if (uv <= 10) return { text: "Très élevé", color: "text-red-400" };
  return { text: "Extrême", color: "text-purple-400" };
}

// ─── Weather Icon (MeteoAI pack) ─────────────────────────────────────────────────────────
function WeatherIconSVG({ condition, size = 22 }: { condition: string; size?: number }) {
  return <MeteoIcon name={getIconNameFromCondition(condition)} size={size} />;
}

function ForecastScaleLabels({
  totalHeight,
  tempTop,
  tempBottom,
  windTop,
  windBottom,
  precipTop,
  precipBottom,
  scaleTop,
  scaleBot,
  windMax,
  precipMax,
}: {
  totalHeight: number;
  tempTop: number;
  tempBottom: number;
  windTop: number;
  windBottom: number;
  precipTop: number;
  precipBottom: number;
  scaleTop: number;
  scaleBot: number;
  windMax: number;
  precipMax: number;
}) {
  const tempTicks = Array.from({ length: Math.max(0, Math.round((scaleTop - scaleBot) / 5) + 1) }, (_, index) => scaleBot + index * 5);
  const tempToAxisY = (value: number) => tempTop + (1 - (value - scaleBot) / (scaleTop - scaleBot || 1)) * (tempBottom - tempTop);
  return (
    <aside aria-label="Échelles du graphique de prévisions" className="relative z-10 w-10 shrink-0 border-r border-slate-700/70 bg-[#06080d] text-right text-[8px] font-medium text-slate-500" style={{ height: totalHeight }}>
      <span className="absolute left-1 top-1 text-[7px] font-semibold text-white">°C</span>
      {tempTicks.map((tick) => <span key={tick} className="absolute right-1.5 -translate-y-1/2 text-white" style={{ top: tempToAxisY(tick) }}>{tick}°</span>)}
      <span className="absolute left-1 text-[7px] font-semibold text-emerald-400" style={{ top: windTop + 1 }}>km/h</span>
      <span className="absolute right-1.5 text-emerald-400" style={{ top: windTop + 12 }}>{windMax}</span>
      <span className="absolute right-1.5 text-emerald-400/80" style={{ top: windBottom - 10 }}>0</span>
      <span className="absolute left-1 text-[7px] font-semibold text-sky-400" style={{ top: precipTop + 1 }}>mm</span>
      <span className="absolute right-1.5 text-sky-400" style={{ top: precipTop + 12 }}>{precipMax.toFixed(1)}</span>
      <span className="absolute right-1.5 text-sky-400/80" style={{ top: precipBottom - 10 }}>0</span>
    </aside>
  );
}

// ─── Detail Card ──────────────────────────────────────────────────────────────
function DetailCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <p className="text-sm font-bold text-white leading-tight">{value}</p>
    </div>
  );
}

// ─── Overlay Detail Panel ─────────────────────────────────────────────────────
function DayDetailOverlay({ day, onClose }: { day: DayData; onClose: () => void }) {
  const d = new Date(day.date + "T12:00:00");
  const dayName = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"][d.getDay()];
  const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const dateLabel = `${dayName} ${d.getDate()} ${months[d.getMonth()]}`;
  const cond = getConditionLabel(day.cloudCover, day.precipitation, day.condition);
  const stabilityColor = day.stabilityIndex >= 70 ? "text-green-400" : day.stabilityIndex >= 45 ? "text-yellow-400" : "text-red-400";
  const uv = uvLabel(day.uvIndex);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#0a0e14] p-5 shadow-2xl shadow-blue-500/10 animate-in slide-in-from-bottom-4 duration-200 sm:rounded-2xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="day-detail-title">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-600 sm:hidden" />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/25 bg-blue-500/10">
              <WeatherIconSVG condition={cond} size={44} />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300">Prévision détaillée</p>
              <h3 id="day-detail-title" className="font-semibold text-white text-base">{dateLabel}</h3>
              <p className="text-xs text-slate-400">{cond}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer les détails de la prévision" className="p-2 rounded-xl hover:bg-white/10 transition-colors active:scale-95"><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="mb-4 grid grid-cols-3 overflow-hidden rounded-xl border border-white/8 bg-white/[0.03]">
          <div className="border-r border-white/8 px-3 py-2.5 text-center"><p className="text-[9px] uppercase tracking-wide text-slate-500">Max.</p><p className="mt-0.5 text-base font-bold text-orange-300">{day.tempMax != null ? `${day.tempMax}°` : "—"}</p></div>
          <div className="border-r border-white/8 px-3 py-2.5 text-center"><p className="text-[9px] uppercase tracking-wide text-slate-500">Min.</p><p className="mt-0.5 text-base font-bold text-blue-300">{day.tempMin != null ? `${day.tempMin}°` : "—"}</p></div>
          <div className="px-3 py-2.5 text-center"><p className="text-[9px] uppercase tracking-wide text-slate-500">Pluie</p><p className="mt-0.5 text-base font-bold text-sky-300">{day.precipitation ?? 0} mm</p></div>
        </div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Paramètres météo</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <DetailCard icon={<Thermometer className="h-3.5 w-3.5 text-orange-400" />} label="Température" value={<>{day.tempMax ?? "—"}° <span className="text-blue-400 text-xs">/ {day.tempMin ?? "—"}°</span></>} />
          <DetailCard icon={<Thermometer className="h-3.5 w-3.5 text-pink-400" />} label="Ressenti" value={<>{day.feelsLikeMax ?? "—"}° <span className="text-blue-400 text-xs">/ {day.feelsLikeMin ?? "—"}°</span></>} />
          <DetailCard icon={<Wind className="h-3.5 w-3.5 text-emerald-400" />} label="Vent moyen" value={<>{day.windSpeed ?? "—"} <span className="text-[10px] text-slate-400">km/h</span></>} />
          <DetailCard icon={<Wind className="h-3.5 w-3.5 text-orange-400" />} label="Rafales" value={<>{day.windGust != null ? Math.round(day.windGust) : "—"} <span className="text-[10px] text-slate-400">km/h</span></>} />
          <DetailCard icon={<Navigation className="h-3.5 w-3.5 text-sky-400" style={{ transform: `rotate(${(day.windDirection ?? 0) + 180}deg)` }} />} label="Direction" value={<>{degToCompass(day.windDirection)} <span className="text-[10px] text-slate-500">{day.windDirection != null ? `${Math.round(day.windDirection)}°` : ""}</span></>} />
          <DetailCard icon={<Droplets className="h-3.5 w-3.5 text-blue-400" />} label="Précipitations" value={<span className="text-blue-400">{day.precipitation ?? 0} mm</span>} />
          <DetailCard icon={<Eye className="h-3.5 w-3.5 text-cyan-400" />} label="Humidité" value={<span className="text-cyan-400">{day.humidity != null ? `${Math.round(day.humidity)}%` : "—"}</span>} />
          <DetailCard icon={<Sun className="h-3.5 w-3.5 text-yellow-400" />} label="Indice UV" value={<><span className={uv.color}>{day.uvIndex != null ? Math.round(day.uvIndex) : "—"}</span> <span className={`text-[10px] ${uv.color}`}>{uv.text}</span></>} />
          <DetailCard icon={<Cloud className="h-3.5 w-3.5 text-slate-400" />} label="Nébulosité" value={<>{day.cloudCover != null ? `${Math.round(day.cloudCover)}%` : "—"}</>} />
          <DetailCard icon={<Sunrise className="h-3.5 w-3.5 text-amber-400" />} label="Lever" value={<span className="text-amber-400">{day.sunrise ?? "—"}</span>} />
          <DetailCard icon={<Sunset className="h-3.5 w-3.5 text-orange-500" />} label="Coucher" value={<span className="text-orange-500">{day.sunset ?? "—"}</span>} />
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5 col-span-2 sm:col-span-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Gauge className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Confiance de la prévision</span>
              <span className={`ml-auto text-sm font-bold ${stabilityColor}`}>{day.stabilityIndex}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${day.stabilityIndex >= 70 ? "bg-green-400" : day.stabilityIndex >= 45 ? "bg-yellow-400" : "bg-red-400"}`} style={{ width: `${day.stabilityIndex}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function FifteenDayChart({ days, locationName }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [animated, setAnimated] = useState(false);
  const [animProgress, setAnimProgress] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // The chart deliberately stays on one consistent 15-day horizon.
  const displayDays = days.slice(0, 15);
  const N = displayDays.length;

  // ── Layout constants ────────────────────────────────────────────────────────
  const COL_W = 76;          // width per day column
  const CHART_H = 310;       // main chart height (temp + wind + precip combined)
  const ICON_ROW = 0;        // weather header is positioned inside the chart columns
  const LABEL_ROW = 0;       // weather header is positioned inside the chart columns
  const PAD_T = 82;
  const TOTAL_H = CHART_H + ICON_ROW + LABEL_ROW;
  const scrollableW = COL_W * N;

  // ── Scales ──────────────────────────────────────────────────────────────────
  const allMax = displayDays.map(d => d.tempMax ?? 0);
  const allMin = displayDays.map(d => d.tempMin ?? 0);
  const dataHigh = Math.max(...allMax);
  const dataLow = Math.min(...allMin);
  const gridStep = 5;
  const scaleTop = Math.ceil((dataHigh + 3) / gridStep) * gridStep;
  const scaleBot = Math.max(Math.floor((dataLow - 3) / gridStep) * gridStep, -10);
  const scaleRange = scaleTop - scaleBot || 1;

  const maxPrecip = Math.max(...displayDays.map(d => d.precipitation ?? 0), 2);
  const maxWind = Math.max(...displayDays.map(d => d.windSpeed ?? 0), 5);
  const windScaleTop = Math.ceil(maxWind / 5) * 5;
  const precipScaleTop = Math.ceil(maxPrecip * 10) / 10;
  // Zone allocation: temp 55%, wind 20%, precip 20%, gaps 5%
  const tempZoneTop = PAD_T;
  const tempZoneBot = PAD_T + (CHART_H - PAD_T) * 0.55;
  const windZoneTop = tempZoneBot + 4;
  const windZoneBot = windZoneTop + (CHART_H - PAD_T) * 0.20;
  const precipZoneTop = windZoneBot + 2;
  const precipZoneBot = CHART_H - 2;

  const tempToY = useCallback((t: number) => tempZoneTop + (1 - (t - scaleBot) / scaleRange) * (tempZoneBot - tempZoneTop), [scaleBot, scaleRange, tempZoneTop, tempZoneBot]);
  const colX = useCallback((i: number) => i * COL_W + COL_W / 2, []);

  // ── Draw scrollable canvas ──────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || N === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = scrollableW * dpr;
    canvas.height = TOTAL_H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, scrollableW, TOTAL_H);

    // ── Per-day background (weather-adaptive) ────────────────────────────────
    displayDays.forEach((d, i) => {
      const x = i * COL_W;
      ctx.fillStyle = getConditionBg(d.cloudCover, d.precipitation, d.condition);
      ctx.fillRect(x, 0, COL_W, CHART_H);
    });

    // ── Vertical separators ──────────────────────────────────────────────────
    for (let i = 1; i < N; i++) {
      const x = i * COL_W;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CHART_H);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ── Lignes de température alignées à l’échelle de 5 °C ──────────────────
    for (let t = scaleBot; t <= scaleTop; t += gridStep) {
      const y = tempToY(t);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(scrollableW, y);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Clear reading bands: temperatures, wind, then precipitation.
    [windZoneTop - 3, precipZoneTop - 3].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(scrollableW, y);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.26)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // ── Selected day highlight ───────────────────────────────────────────────
    if (selectedDay !== null && selectedDay < N) {
      const x = selectedDay * COL_W;
      // Glow
      const g = ctx.createLinearGradient(x, 0, x + COL_W, 0);
      g.addColorStop(0, "rgba(99, 102, 241, 0)");
      g.addColorStop(0.5, "rgba(99, 102, 241, 0.08)");
      g.addColorStop(1, "rgba(99, 102, 241, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, COL_W, TOTAL_H);
      // Borders
      ctx.strokeStyle = "rgba(129, 140, 248, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, 0.5, COL_W - 1, CHART_H - 1);
    }

    // ── Context zone labels ──────────────────────────────────────────────────
    let caniculeLabeled = false;
    let orageLabeled = false;
    displayDays.forEach((d, i) => {
      if ((d.tempMax ?? 0) >= 33 && !caniculeLabeled) {
        ctx.fillStyle = "#f87171";
        ctx.font = "bold 10px system-ui";
        ctx.textAlign = "left";
        ctx.fillText("☀ Canicule", i * COL_W + 4, 12);
        caniculeLabeled = true;
      }
      if ((d.condition ?? "").toLowerCase().includes("orage") && !orageLabeled) {
        ctx.fillStyle = "#a78bfa";
        ctx.font = "bold 10px system-ui";
        ctx.textAlign = "left";
        ctx.fillText("⚡ Orage", i * COL_W + 4, 12);
        orageLabeled = true;
      }
    });

    // ── Animation progress ───────────────────────────────────────────────────
    const progress = animated ? 1 : animProgress;
    const visibleN = Math.max(1, Math.ceil(N * progress));

    // ── Max curve (orange) ───────────────────────────────────────────────────
    const maxPts = displayDays.slice(0, visibleN).map((d, i) => ({ x: colX(i), y: tempToY(d.tempMax ?? 0) }));
    if (maxPts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(maxPts[0].x, maxPts[0].y);
      for (let i = 1; i < maxPts.length; i++) {
        const cpx = (maxPts[i - 1].x + maxPts[i].x) / 2;
        ctx.bezierCurveTo(cpx, maxPts[i - 1].y, cpx, maxPts[i].y, maxPts[i].x, maxPts[i].y);
      }
      ctx.save();
      ctx.strokeStyle = "rgba(249, 115, 22, 0.45)";
      ctx.lineWidth = 5;
      ctx.shadowColor = "#f97316";
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "#fb923c";
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    // Points + values
    maxPts.forEach((pt, i) => {
      const v = displayDays[i].tempMax;
      if (v == null) return;
      const sel = selectedDay === i;
      const r = sel ? 7 : 5;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#fb923c";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Value
      ctx.fillStyle = "#fdba74";
      ctx.font = `bold ${sel ? 13 : 12}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(`${v.toFixed(1)}`, pt.x, pt.y - 14);
    });

    // ── Min curve (blue) ─────────────────────────────────────────────────────
    const minPts = displayDays.slice(0, visibleN).map((d, i) => ({ x: colX(i), y: tempToY(d.tempMin ?? 0) }));
    if (minPts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(minPts[0].x, minPts[0].y);
      for (let i = 1; i < minPts.length; i++) {
        const cpx = (minPts[i - 1].x + minPts[i].x) / 2;
        ctx.bezierCurveTo(cpx, minPts[i - 1].y, cpx, minPts[i].y, minPts[i].x, minPts[i].y);
      }
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    minPts.forEach((pt, i) => {
      const v = displayDays[i].tempMin;
      if (v == null) return;
      const sel = selectedDay === i;
      const r = sel ? 6 : 4;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#60a5fa";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#93c5fd";
      ctx.font = `bold ${sel ? 12 : 11}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(`${v.toFixed(1)}`, pt.x, pt.y - 10);
    });

    // ── Wind readings by column (no wind curve) ─────────────────────────────
    displayDays.slice(0, visibleN).forEach((d, i) => {
      const v = displayDays[i].windSpeed;
      const dir = displayDays[i].windDirection;
      if (v == null) return;
      const x = colX(i);
      const y = windZoneTop + 17;
      ctx.fillStyle = "#4ade80";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(v)}`, x, y);
      if (dir != null) {
        const angle = ((dir + 180) % 360) * (Math.PI / 180);
        ctx.save();
        ctx.translate(x + 15, y - 4);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(-2.5, 3);
        ctx.lineTo(0, 1.5);
        ctx.lineTo(2.5, 3);
        ctx.closePath();
        ctx.fillStyle = "#4ade80";
        ctx.globalAlpha = 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    });

    // ── Precipitation bars ───────────────────────────────────────────────────
    const precipH = precipZoneBot - precipZoneTop;
    displayDays.slice(0, visibleN).forEach((d, i) => {
      const p = d.precipitation ?? 0;
      const x = colX(i);
      ctx.fillStyle = p > 0 ? "#93c5fd" : "rgba(147,197,253,0.66)";
      ctx.font = "bold 9px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(p.toFixed(1), x, precipZoneTop + 11);
      if (p <= 0) return;
      const barH = Math.max(4, (p / maxPrecip) * precipH);
      const barW = Math.min(COL_W * 0.45, 24);
      const g = ctx.createLinearGradient(0, precipZoneBot - barH, 0, precipZoneBot);
      g.addColorStop(0, "rgba(96, 165, 250, 0.9)");
      g.addColorStop(1, "rgba(37, 99, 235, 0.5)");
      ctx.fillStyle = g;
      ctx.fillRect(x - barW / 2, precipZoneBot - barH, barW, barH);
    });

    // ── Date labels + icons ──────────────────────────────────────────────────
    displayDays.forEach((d, i) => {
      const { line1, line2 } = formatDate(d.date);
      const x = colX(i);
      const today = d.date === new Date().toISOString().slice(0, 10);
      const sel = selectedDay === i;
      const lblY = CHART_H + ICON_ROW;
      ctx.fillStyle = today ? "#818cf8" : sel ? "#e2e8f0" : "rgba(148, 163, 184, 0.8)";
      ctx.font = `${today || sel ? "bold " : ""}11px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(line1, x, lblY + 12);
      ctx.font = "9px system-ui";
      ctx.fillStyle = today ? "#a5b4fc" : "rgba(107, 114, 128, 0.7)";
      ctx.fillText(line2, x, lblY + 24);
    });
  }, [displayDays, N, selectedDay, animated, animProgress, scrollableW, TOTAL_H, CHART_H, ICON_ROW, COL_W, PAD_T, scaleBot, scaleTop, scaleRange, gridStep, maxPrecip, tempToY, colX, tempZoneTop, tempZoneBot, windZoneTop, windZoneBot, precipZoneTop, precipZoneBot]);

  // ── Resize observer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(e => setContainerWidth(e[0].contentRect.width));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // ── Animation trigger (progressive draw) ────────────────────────────────────
  useEffect(() => {
    if (N > 0 && !animated) {
      let start: number | null = null;
      const duration = 1200; // ms
      const step = (ts: number) => {
        if (!start) start = ts;
        const elapsed = ts - start;
        const p = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - p, 3);
        setAnimProgress(eased);
        if (p < 1) {
          requestAnimationFrame(step);
        } else {
          setAnimated(true);
        }
      };
      const t = setTimeout(() => requestAnimationFrame(step), 150);
      return () => clearTimeout(t);
    }
  }, [N, animated]);

  // ── Scroll progress tracker ─────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll > 0) setScrollProgress(el.scrollLeft / maxScroll);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { draw(); }, [draw]);

  // ── Click handler ───────────────────────────────────────────────────────────
  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (N === 0) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const col = Math.floor(x / COL_W);
    if (col >= 0 && col < N) setSelectedDay(p => p === col ? null : col);
  }, [N]);

  if (displayDays.length === 0) return null;

  return (
    <section ref={containerRef} className="w-full rounded-[22px] border border-slate-700/70 bg-[#080b10] p-3 shadow-[0_12px_32px_rgba(0,0,0,0.38)]">
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center">
          <h2 className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-300/40 bg-blue-500/25 shadow-[0_0_18px_rgba(59,130,246,0.45)]"><TrendingUp className="h-4 w-4 text-blue-200" /></span>
            <span>
              <span className="block text-base font-bold text-white">Températures & Météo</span>
              <span className="block text-[11px] font-normal text-slate-400">Prévisions détaillées</span>
            </span>
          </h2>
        </div>
        {locationName && (
          <p className="text-[11px] text-primary/70 flex items-center gap-1 mt-0.5">
            <MapPin className="h-3 w-3" /> {locationName}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
          <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-4 rounded-full bg-orange-400 inline-block" /> Max °C</span>
          <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-4 rounded-full bg-blue-400 inline-block" /> Min °C</span>
          <span className="flex items-center gap-1.5 text-green-400"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" /> Vent km/h</span>
          <span className="flex items-center gap-1.5 text-blue-400"><span className="w-3 h-3.5 bg-blue-500/80 inline-block rounded-sm" /> Pluie mm</span>
        </div>
      </div>

      {/* ── Full-width scrollable chart ───────────────────────────────────── */}
      <div className="overflow-hidden rounded-[16px] border border-slate-700/70 bg-[#05070a]" style={{ height: TOTAL_H }}>
        <div className="flex h-full">
          <ForecastScaleLabels totalHeight={TOTAL_H} tempTop={tempZoneTop} tempBottom={tempZoneBot} windTop={windZoneTop} windBottom={windZoneBot} precipTop={precipZoneTop} precipBottom={precipZoneBot} scaleTop={scaleTop} scaleBot={scaleBot} windMax={windScaleTop} precipMax={precipScaleTop} />
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto scrollbar-hide" style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
          <div className="relative" style={{ width: scrollableW, height: TOTAL_H }}>
            {/* En-tête de chaque journée : jour + grande icône météo */}
            <div className="pointer-events-none absolute left-0 top-0 flex" style={{ height: 78, width: scrollableW }}>
              {displayDays.map((d, i) => {
                const cond = getConditionLabel(d.cloudCover, d.precipitation, d.condition);
                const date = formatDate(d.date);
                const isSelected = i === selectedDay;
                return (
                  <div key={d.date} className={`flex flex-col items-center justify-start pt-2 ${isSelected ? "rounded-xl border border-blue-300/50 bg-blue-500/20 shadow-[0_0_18px_rgba(59,130,246,0.38)]" : ""}`} style={{ width: COL_W }}>
                    <span className={`text-[10px] font-semibold ${isSelected ? "text-blue-100" : "text-slate-200"}`}>{date.line1}</span>
                    <span className="text-[9px] text-slate-500">{date.line2}</span>
                    <span className="mt-1"><WeatherIconSVG condition={cond} size={31} /></span>
                  </div>
                );
              })}
            </div>
            <canvas ref={canvasRef} style={{ width: scrollableW, height: TOTAL_H, cursor: "pointer", display: "block" }} onClick={onClick} />
          </div>
        </div>
        </div>
      </div>

      {/* ── Scroll progress bar ────────────────────────────────────────── */}
      {N > 7 && (
        <div className="mt-2 mx-auto" style={{ width: "60%", maxWidth: 200 }}>
          <div
            ref={progressBarRef}
            className="h-[6px] rounded-full bg-slate-700/40 relative cursor-pointer group"
            onClick={(e) => {
              const bar = progressBarRef.current;
              const scroll = scrollRef.current;
              if (!bar || !scroll) return;
              const rect = bar.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const ratio = Math.max(0, Math.min(1, clickX / rect.width));
              const maxScroll = scroll.scrollWidth - scroll.clientWidth;
              scroll.scrollTo({ left: ratio * maxScroll, behavior: 'smooth' });
            }}
          >
            <div
              className="absolute h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-transform duration-150 group-hover:from-blue-500 group-hover:to-blue-300"
              style={{
                width: `${(7 / N) * 100}%`,
                transform: `translateX(${scrollProgress * ((N / 7) - 1) * 100}%)`
              }}
            />
          </div>
          <p className="text-center text-[9px] text-slate-500 mt-1">Cliquez ou glissez pour naviguer</p>
        </div>
      )}

      {/* ── Overlay detail panel ──────────────────────────────────────────── */}
      {selectedDay !== null && selectedDay < displayDays.length && (
        <DayDetailOverlay day={displayDays[selectedDay]} onClose={() => setSelectedDay(null)} />
      )}
    </section>
  );
}
