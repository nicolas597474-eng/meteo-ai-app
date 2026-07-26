import { useRef, useState, useEffect, useCallback } from "react";
import { TrendingUp, X, Thermometer, Wind, Droplets, Eye, Sun, Cloud, Sunrise, Sunset, Gauge, Navigation } from "lucide-react";

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
  const days = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
  const months = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sep.", "oct.", "nov.", "déc."];
  const isToday = dateStr === new Date().toISOString().slice(0, 10);
  if (isToday) return { line1: "Auj.", line2: `${d.getDate()} ${months[d.getMonth()]}` };
  return { line1: days[d.getDay()], line2: `${d.getDate()} ${months[d.getMonth()]}` };
}

function wmoToCondition(wmoCode: number | null | undefined, cloudCover: number | null, precip: number | null): string {
  if (wmoCode != null) {
    if (wmoCode === 0) return "Ensoleillé";
    if (wmoCode <= 2) return "Partiellement nuageux";
    if (wmoCode === 3) return "Couvert";
    if (wmoCode <= 49) return "Brouillard";
    if (wmoCode <= 59) return "Bruine";
    if (wmoCode <= 69) return "Pluie";
    if (wmoCode <= 79) return "Neige";
    if (wmoCode <= 84) return "Averses";
    if (wmoCode <= 94) return "Orages";
    return "Orage violent";
  }
  if ((precip ?? 0) > 5) return "Pluie";
  if ((precip ?? 0) > 1) return "Averses";
  if ((cloudCover ?? 0) > 80) return "Couvert";
  if ((cloudCover ?? 0) > 50) return "Partiellement nuageux";
  return "Ensoleillé";
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

// ─── Weather Icon SVG ─────────────────────────────────────────────────────────
function WeatherIconSVG({ condition, size = 28 }: { condition: string; size?: number }) {
  const s = size;
  const condLower = condition.toLowerCase();

  if (condLower.includes("ensoleillé") || condLower.includes("dégagé")) {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="7" fill="#fbbf24" />
        <g stroke="#fbbf24" strokeWidth="2" strokeLinecap="round">
          <line x1="16" y1="2" x2="16" y2="5" /><line x1="16" y1="27" x2="16" y2="30" />
          <line x1="2" y1="16" x2="5" y2="16" /><line x1="27" y1="16" x2="30" y2="16" />
          <line x1="6" y1="6" x2="8" y2="8" /><line x1="24" y1="24" x2="26" y2="26" />
          <line x1="6" y1="26" x2="8" y2="24" /><line x1="24" y1="8" x2="26" y2="6" />
        </g>
      </svg>
    );
  }
  if (condLower.includes("partiellement")) {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <circle cx="20" cy="12" r="6" fill="#fbbf24" />
        <path d="M8 24c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#94a3b8" />
      </svg>
    );
  }
  if (condLower.includes("couvert") || condLower.includes("nuageux")) {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <path d="M8 24c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#64748b" />
      </svg>
    );
  }
  if (condLower.includes("pluie") || condLower.includes("averse") || condLower.includes("bruine")) {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <path d="M8 20c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#64748b" />
        <line x1="10" y1="23" x2="9" y2="27" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="16" y1="23" x2="15" y2="28" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="22" y1="23" x2="21" y2="27" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (condLower.includes("orage")) {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <path d="M8 18c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#475569" />
        <polygon points="17,19 14,25 16,25 15,30 20,23 17,23 19,19" fill="#fbbf24" />
      </svg>
    );
  }
  if (condLower.includes("neige")) {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <path d="M8 20c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#94a3b8" />
        <circle cx="10" cy="25" r="1.5" fill="white" /><circle cx="16" cy="27" r="1.5" fill="white" /><circle cx="22" cy="25" r="1.5" fill="white" />
      </svg>
    );
  }
  // Default: cloudy
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
      <path d="M8 24c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#64748b" />
    </svg>
  );
}

// ─── Day Detail Panel ─────────────────────────────────────────────────────────
function DayDetailPanel({ day, onClose }: { day: DayData; onClose: () => void }) {
  const d = new Date(day.date + "T12:00:00");
  const dayName = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"][d.getDay()];
  const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const dateLabel = `${dayName} ${d.getDate()} ${months[d.getMonth()]}`;
  const cond = day.condition ?? wmoToCondition(null, day.cloudCover, day.precipitation);
  const stabilityColor = day.stabilityIndex >= 70 ? "text-green-400" : day.stabilityIndex >= 45 ? "text-yellow-400" : "text-red-400";
  const uv = uvLabel(day.uvIndex);

  return (
    <div className="mt-3 bg-gradient-to-br from-slate-800/80 to-slate-900/90 backdrop-blur-sm border border-white/10 rounded-xl p-4 shadow-2xl shadow-blue-500/5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <WeatherIconSVG condition={cond} size={36} />
          <div>
            <h3 className="font-semibold text-white text-sm">{dateLabel}</h3>
            <p className="text-xs text-slate-400">{cond}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <X className="h-4 w-4 text-slate-400" />
        </button>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {/* Température */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Thermometer className="h-3.5 w-3.5 text-orange-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Température</span>
          </div>
          <p className="text-lg font-bold text-white">{day.tempMax ?? "—"}° <span className="text-blue-400 text-sm">/ {day.tempMin ?? "—"}°</span></p>
        </div>

        {/* Ressenti */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Thermometer className="h-3.5 w-3.5 text-pink-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Ressenti</span>
          </div>
          <p className="text-lg font-bold text-white">{day.feelsLikeMax ?? "—"}° <span className="text-blue-400 text-sm">/ {day.feelsLikeMin ?? "—"}°</span></p>
        </div>

        {/* Vent */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Wind className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Vent</span>
          </div>
          <p className="text-sm font-bold text-white">{day.windSpeed ?? "—"} <span className="text-xs font-normal text-slate-400">km/h</span></p>
          {day.windGust && <p className="text-xs text-orange-400 mt-0.5">Rafales {day.windGust} km/h</p>}
        </div>

        {/* Direction */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Navigation className="h-3.5 w-3.5 text-sky-400" style={{ transform: `rotate(${(day.windDirection ?? 0) + 180}deg)` }} />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Direction</span>
          </div>
          <p className="text-lg font-bold text-white">{degToCompass(day.windDirection)}</p>
          <p className="text-xs text-slate-500">{day.windDirection != null ? `${Math.round(day.windDirection)}°` : ""}</p>
        </div>

        {/* Précipitations */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Droplets className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Précipitations</span>
          </div>
          <p className="text-lg font-bold text-blue-400">{day.precipitation ?? 0} <span className="text-xs font-normal">mm</span></p>
        </div>

        {/* Humidité */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Eye className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Humidité</span>
          </div>
          <p className="text-lg font-bold text-cyan-400">{day.humidity != null ? `${Math.round(day.humidity)}%` : "—"}</p>
        </div>

        {/* UV */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sun className="h-3.5 w-3.5 text-yellow-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Indice UV</span>
          </div>
          <p className={`text-lg font-bold ${uv.color}`}>{day.uvIndex != null ? Math.round(day.uvIndex) : "—"}</p>
          <p className={`text-xs ${uv.color}`}>{uv.text}</p>
        </div>

        {/* Nébulosité */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Cloud className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Nébulosité</span>
          </div>
          <p className="text-lg font-bold text-white">{day.cloudCover != null ? `${Math.round(day.cloudCover)}%` : "—"}</p>
        </div>

        {/* Lever du soleil */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sunrise className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Lever</span>
          </div>
          <p className="text-lg font-bold text-amber-400">{day.sunrise ?? "—"}</p>
        </div>

        {/* Coucher du soleil */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sunset className="h-3.5 w-3.5 text-orange-500" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Coucher</span>
          </div>
          <p className="text-lg font-bold text-orange-500">{day.sunset ?? "—"}</p>
        </div>

        {/* Confiance */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Gauge className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Confiance</span>
          </div>
          <p className={`text-lg font-bold ${stabilityColor}`}>{day.stabilityIndex}%</p>
          <div className="mt-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${day.stabilityIndex >= 70 ? "bg-green-400" : day.stabilityIndex >= 45 ? "bg-yellow-400" : "bg-red-400"}`} style={{ width: `${day.stabilityIndex}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Chart Component ─────────────────────────────────────────────────────
export default function FifteenDayChart({ days, locationName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Canvas dimensions — generous for readability
  const CHART_HEIGHT = 320; // main area: temp curves + precip bars + wind
  const ICON_HEIGHT = 40;   // weather icons row
  const LABEL_HEIGHT = 44;  // date labels
  const TOTAL_HEIGHT = CHART_HEIGHT + ICON_HEIGHT + LABEL_HEIGHT;
  const PADDING_LEFT = 40;
  const PADDING_RIGHT = 16;
  const PADDING_TOP = 36;
  const PADDING_BOTTOM = 50; // space for precip bars at bottom of chart area

  const displayDays = days.slice(0, 15);
  const N = displayDays.length;

  // Fixed column width: show 7 days in the visible area
  const VISIBLE_DAYS = 7;
  const colWidth = containerWidth > 0 ? (containerWidth - PADDING_LEFT - PADDING_RIGHT) / VISIBLE_DAYS : 0;
  const canvasWidth = PADDING_LEFT + PADDING_RIGHT + colWidth * N;

  // Temperature range
  const allMax = displayDays.map(d => d.tempMax ?? 0);
  const allMin = displayDays.map(d => d.tempMin ?? 0);
  const allWind = displayDays.map(d => d.windSpeed ?? 0);
  const tMax = Math.max(...allMax, 20);
  const tMin = Math.min(...allMin, 0);
  const tRange = Math.max(tMax - tMin + 10, 20);
  const tPadded = tMin - 5;

  const maxPrecip = Math.max(...displayDays.map(d => d.precipitation ?? 0), 1);
  const maxWind = Math.max(...allWind, 10);

  // Map temperature to Y coordinate within chart area (upper 65%)
  const tempAreaBottom = CHART_HEIGHT - PADDING_BOTTOM;
  const tempAreaTop = PADDING_TOP;
  const tempToY = useCallback((temp: number) => {
    return tempAreaTop + (tempAreaBottom - tempAreaTop) * 0.65 - ((temp - tPadded) / tRange) * ((tempAreaBottom - tempAreaTop) * 0.65);
  }, [tPadded, tRange, tempAreaTop, tempAreaBottom]);

  // Map wind to Y coordinate (lower portion)
  const windToY = useCallback((wind: number) => {
    const windAreaTop = tempAreaTop + (tempAreaBottom - tempAreaTop) * 0.55;
    const windAreaBottom = tempAreaBottom - 30;
    return windAreaTop + (1 - wind / maxWind) * (windAreaBottom - windAreaTop);
  }, [maxWind, tempAreaTop, tempAreaBottom]);

  // X center of column i
  const colX = useCallback((i: number) => PADDING_LEFT + i * colWidth + colWidth / 2, [PADDING_LEFT, colWidth]);

  // Draw the canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasWidth === 0 || N === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = TOTAL_HEIGHT * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, canvasWidth, TOTAL_HEIGHT);

    // ── Background gradient ──────────────────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, 0, CHART_HEIGHT);
    bgGrad.addColorStop(0, "rgba(15, 23, 42, 0.6)");
    bgGrad.addColorStop(1, "rgba(15, 23, 42, 0.2)");
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.roundRect(PADDING_LEFT - 8, 4, canvasWidth - PADDING_LEFT - PADDING_RIGHT + 16, CHART_HEIGHT - 8, 12);
    ctx.fill();

    // ── Horizontal grid lines ────────────────────────────────────────────────
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const temp = tPadded + (tRange * i) / gridSteps;
      const y = tempToY(temp);
      if (y < PADDING_TOP || y > tempAreaBottom * 0.7) continue;
      ctx.beginPath();
      ctx.moveTo(PADDING_LEFT, y);
      ctx.lineTo(canvasWidth - PADDING_RIGHT, y);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Label
      ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
      ctx.font = "9px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(`${Math.round(temp)}°`, PADDING_LEFT - 6, y + 3);
    }

    // ── Precipitation bars (inside chart area, at bottom) ────────────────────
    const precipBarMaxH = 45;
    const precipBaseY = CHART_HEIGHT - 16;
    displayDays.forEach((d, i) => {
      const precip = d.precipitation ?? 0;
      if (precip <= 0) return;
      const barH = Math.max(4, (precip / maxPrecip) * precipBarMaxH);
      const x = colX(i);
      const barW = Math.min(colWidth * 0.5, 20);

      // Gradient bar
      const barGrad = ctx.createLinearGradient(0, precipBaseY - barH, 0, precipBaseY);
      barGrad.addColorStop(0, "rgba(96, 165, 250, 0.8)");
      barGrad.addColorStop(1, "rgba(59, 130, 246, 0.3)");
      ctx.fillStyle = barGrad;
      ctx.beginPath();
      ctx.roundRect(x - barW / 2, precipBaseY - barH, barW, barH, [3, 3, 0, 0]);
      ctx.fill();

      // Glow effect
      ctx.shadowColor = "rgba(96, 165, 250, 0.4)";
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Value label
      ctx.fillStyle = "#93c5fd";
      ctx.font = "bold 9px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${precip}`, x, precipBaseY - barH - 4);
    });

    // ── Context zones (canicule / orage) ─────────────────────────────────────
    displayDays.forEach((d, i) => {
      const x = colX(i) - colWidth / 2;
      const w = colWidth;
      if ((d.tempMax ?? 0) >= 33) {
        // Canicule zone
        const grad = ctx.createLinearGradient(0, PADDING_TOP, 0, CHART_HEIGHT * 0.4);
        grad.addColorStop(0, "rgba(239, 68, 68, 0.15)");
        grad.addColorStop(1, "rgba(239, 68, 68, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, PADDING_TOP, w, CHART_HEIGHT * 0.35);
      }
      const condLower = (d.condition ?? "").toLowerCase();
      if (condLower.includes("orage")) {
        const grad = ctx.createLinearGradient(0, PADDING_TOP, 0, CHART_HEIGHT * 0.5);
        grad.addColorStop(0, "rgba(139, 92, 246, 0.15)");
        grad.addColorStop(1, "rgba(139, 92, 246, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, PADDING_TOP, w, CHART_HEIGHT * 0.4);
      }
    });

    // ── Max temperature curve (orange with gradient fill) ─────────────────────
    const maxPoints = displayDays.map((d, i) => ({ x: colX(i), y: tempToY(d.tempMax ?? 0) }));
    const minPoints = displayDays.map((d, i) => ({ x: colX(i), y: tempToY(d.tempMin ?? 0) }));

    // Fill between curves
    ctx.beginPath();
    ctx.moveTo(maxPoints[0].x, maxPoints[0].y);
    for (let i = 1; i < maxPoints.length; i++) {
      const cp1x = (maxPoints[i - 1].x + maxPoints[i].x) / 2;
      ctx.bezierCurveTo(cp1x, maxPoints[i - 1].y, cp1x, maxPoints[i].y, maxPoints[i].x, maxPoints[i].y);
    }
    for (let i = minPoints.length - 1; i >= 0; i--) {
      if (i === minPoints.length - 1) {
        ctx.lineTo(minPoints[i].x, minPoints[i].y);
      } else {
        const cp1x = (minPoints[i + 1].x + minPoints[i].x) / 2;
        ctx.bezierCurveTo(cp1x, minPoints[i + 1].y, cp1x, minPoints[i].y, minPoints[i].x, minPoints[i].y);
      }
    }
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, PADDING_TOP, 0, tempAreaBottom);
    fillGrad.addColorStop(0, "rgba(251, 146, 60, 0.12)");
    fillGrad.addColorStop(0.5, "rgba(96, 165, 250, 0.06)");
    fillGrad.addColorStop(1, "rgba(96, 165, 250, 0.02)");
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Max curve line
    ctx.beginPath();
    ctx.moveTo(maxPoints[0].x, maxPoints[0].y);
    for (let i = 1; i < maxPoints.length; i++) {
      const cp1x = (maxPoints[i - 1].x + maxPoints[i].x) / 2;
      ctx.bezierCurveTo(cp1x, maxPoints[i - 1].y, cp1x, maxPoints[i].y, maxPoints[i].x, maxPoints[i].y);
    }
    ctx.strokeStyle = "#fb923c";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "rgba(251, 146, 60, 0.5)";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Max points + labels
    maxPoints.forEach((pt, i) => {
      const val = displayDays[i].tempMax;
      if (val == null) return;
      const isSelected = selectedDay === i;
      // Glow
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isSelected ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(251, 146, 60, 0.2)";
      ctx.fill();
      // Point
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isSelected ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fb923c";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Label
      ctx.fillStyle = "#fdba74";
      ctx.font = `bold ${isSelected ? 11 : 10}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(val)}°`, pt.x, pt.y - 10);
    });

    // ── Min temperature curve (blue) ─────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(minPoints[0].x, minPoints[0].y);
    for (let i = 1; i < minPoints.length; i++) {
      const cp1x = (minPoints[i - 1].x + minPoints[i].x) / 2;
      ctx.bezierCurveTo(cp1x, minPoints[i - 1].y, cp1x, minPoints[i].y, minPoints[i].x, minPoints[i].y);
    }
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(96, 165, 250, 0.4)";
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Min points + labels
    minPoints.forEach((pt, i) => {
      const val = displayDays[i].tempMin;
      if (val == null) return;
      const isSelected = selectedDay === i;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isSelected ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = "#60a5fa";
      ctx.fill();
      ctx.fillStyle = "#93c5fd";
      ctx.font = `${isSelected ? "bold 11" : "10"}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(val)}°`, pt.x, pt.y + 16);
    });

    // ── Wind dashed line (green) ─────────────────────────────────────────────
    const windPoints = displayDays.map((d, i) => ({ x: colX(i), y: windToY(d.windSpeed ?? 0) }));
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.moveTo(windPoints[0].x, windPoints[0].y);
    for (let i = 1; i < windPoints.length; i++) {
      ctx.lineTo(windPoints[i].x, windPoints[i].y);
    }
    ctx.strokeStyle = "#4ade80";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // Wind values + direction arrows
    windPoints.forEach((pt, i) => {
      const val = displayDays[i].windSpeed;
      const dir = displayDays[i].windDirection;
      if (val == null) return;
      ctx.fillStyle = "#4ade80";
      ctx.font = "bold 9px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(val)}`, pt.x, pt.y - 6);
      // Direction arrow
      if (dir != null) {
        const arrowSize = 5;
        const angle = ((dir + 180) % 360) * (Math.PI / 180);
        ctx.save();
        ctx.translate(pt.x, pt.y + 8);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, -arrowSize);
        ctx.lineTo(-3, arrowSize * 0.5);
        ctx.lineTo(3, arrowSize * 0.5);
        ctx.closePath();
        ctx.fillStyle = "#4ade80";
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    });

    // ── Selected day highlight ───────────────────────────────────────────────
    if (selectedDay !== null && selectedDay < N) {
      const x = colX(selectedDay) - colWidth / 2;
      ctx.fillStyle = "rgba(99, 102, 241, 0.08)";
      ctx.beginPath();
      ctx.roundRect(x + 2, 8, colWidth - 4, CHART_HEIGHT - 16, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(99, 102, 241, 0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ── Date labels ──────────────────────────────────────────────────────────
    const labelY = CHART_HEIGHT + ICON_HEIGHT;
    displayDays.forEach((d, i) => {
      const { line1, line2 } = formatDate(d.date);
      const x = colX(i);
      const isToday = d.date === new Date().toISOString().slice(0, 10);
      const isSelected = selectedDay === i;
      ctx.fillStyle = isToday ? "#818cf8" : isSelected ? "#e2e8f0" : "rgba(148, 163, 184, 0.8)";
      ctx.font = `${isToday || isSelected ? "bold " : ""}11px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(line1, x, labelY + 14);
      if (line2) {
        ctx.font = "9px system-ui";
        ctx.fillStyle = isToday ? "#818cf8" : "rgba(107, 114, 128, 0.8)";
        ctx.fillText(line2, x, labelY + 27);
      }
    });

  }, [canvasWidth, displayDays, selectedDay, N, colX, colWidth, tempToY, windToY, tPadded, tRange, maxPrecip, maxWind, CHART_HEIGHT, ICON_HEIGHT, LABEL_HEIGHT, TOTAL_HEIGHT, PADDING_LEFT, PADDING_RIGHT, PADDING_TOP, PADDING_BOTTOM, tempAreaBottom, tempAreaTop]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      setContainerWidth(w);
    });
    ro.observe(container);
    setContainerWidth(container.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { draw(); }, [draw]);

  // Click handler
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (N === 0 || colWidth === 0) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const col = Math.floor((x - PADDING_LEFT) / colWidth);
    if (col >= 0 && col < N) {
      setSelectedDay(prev => prev === col ? null : col);
    }
  }, [N, colWidth, PADDING_LEFT]);

  if (displayDays.length === 0) return null;

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2 flex-wrap">
          <TrendingUp className="h-4 w-4 text-primary" />
          Températures &amp; Météo — 15 jours
          {locationName && <span className="text-xs text-primary/70 font-normal">· {locationName}</span>}
        </h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block rounded" /> Max</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block rounded" /> Min</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 border-t border-dashed border-green-400 inline-block" /> Vent</span>
          <span className="flex items-center gap-1"><span className="w-2 h-3 bg-blue-400/60 inline-block rounded-sm" /> Pluie</span>
        </div>
      </div>

      {/* Scroll hint */}
      {N > VISIBLE_DAYS && (
        <p className="text-[10px] text-muted-foreground/50 mb-1 text-right italic">← Glissez pour voir les jours suivants →</p>
      )}

      {/* Outer container */}
      <div ref={containerRef} className="w-full">
        {/* Scrollable wrapper */}
        <div
          ref={scrollRef}
          className="overflow-x-auto scrollbar-hide relative"
          style={{ scrollBehavior: "smooth", WebkitOverflowScrolling: "touch" }}
        >
          {/* Inner content */}
          <div className="relative" style={{ width: canvasWidth, minHeight: TOTAL_HEIGHT }}>
            {/* Weather icons row */}
            {canvasWidth > 0 && N > 0 && (
              <div
                className="absolute flex"
                style={{ top: CHART_HEIGHT, height: ICON_HEIGHT, left: PADDING_LEFT, width: colWidth * N }}
              >
                {displayDays.map((d, i) => {
                  const cond = d.condition ?? wmoToCondition(null, d.cloudCover, d.precipitation);
                  return (
                    <div
                      key={d.date}
                      className="flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                      style={{ width: colWidth, flexShrink: 0 }}
                      onClick={() => setSelectedDay(prev => prev === i ? null : i)}
                    >
                      <WeatherIconSVG condition={cond} size={Math.min(32, colWidth * 0.55)} />
                    </div>
                  );
                })}
              </div>
            )}

            <canvas
              ref={canvasRef}
              style={{ width: canvasWidth, height: TOTAL_HEIGHT, cursor: "pointer", display: "block" }}
              onClick={handleCanvasClick}
            />
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selectedDay !== null && selectedDay < displayDays.length && (
        <DayDetailPanel
          day={displayDays[selectedDay]}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}
