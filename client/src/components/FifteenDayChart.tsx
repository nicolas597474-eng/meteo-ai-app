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

function wmoToCondition(_wmo: number | null | undefined, cloudCover: number | null, precip: number | null): string {
  if ((precip ?? 0) > 5) return "Pluie";
  if ((precip ?? 0) > 1) return "Averses";
  if ((cloudCover ?? 0) > 80) return "Couvert";
  if ((cloudCover ?? 0) > 50) return "Partiellement nuageux";
  if ((cloudCover ?? 0) > 20) return "Partiellement nuageux";
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

// ─── Weather Icon SVG (compact) ───────────────────────────────────────────────
function WeatherIconSVG({ condition, size = 24 }: { condition: string; size?: number }) {
  const s = size;
  const c = condition.toLowerCase();
  if (c.includes("ensoleillé") || c.includes("dégagé")) {
    return (<svg width={s} height={s} viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="7" fill="#fbbf24"/><g stroke="#fbbf24" strokeWidth="2" strokeLinecap="round"><line x1="16" y1="2" x2="16" y2="5"/><line x1="16" y1="27" x2="16" y2="30"/><line x1="2" y1="16" x2="5" y2="16"/><line x1="27" y1="16" x2="30" y2="16"/><line x1="6" y1="6" x2="8" y2="8"/><line x1="24" y1="24" x2="26" y2="26"/><line x1="6" y1="26" x2="8" y2="24"/><line x1="24" y1="8" x2="26" y2="6"/></g></svg>);
  }
  if (c.includes("partiellement")) {
    return (<svg width={s} height={s} viewBox="0 0 32 32" fill="none"><circle cx="20" cy="12" r="6" fill="#fbbf24"/><path d="M8 24c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#94a3b8"/></svg>);
  }
  if (c.includes("couvert") || c.includes("nuageux")) {
    return (<svg width={s} height={s} viewBox="0 0 32 32" fill="none"><path d="M8 24c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#64748b"/></svg>);
  }
  if (c.includes("pluie") || c.includes("averse") || c.includes("bruine")) {
    return (<svg width={s} height={s} viewBox="0 0 32 32" fill="none"><path d="M8 20c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#64748b"/><line x1="10" y1="23" x2="9" y2="27" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"/><line x1="16" y1="23" x2="15" y2="28" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"/><line x1="22" y1="23" x2="21" y2="27" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"/></svg>);
  }
  if (c.includes("orage")) {
    return (<svg width={s} height={s} viewBox="0 0 32 32" fill="none"><path d="M8 18c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#475569"/><polygon points="17,19 14,25 16,25 15,30 20,23 17,23 19,19" fill="#fbbf24"/></svg>);
  }
  if (c.includes("neige")) {
    return (<svg width={s} height={s} viewBox="0 0 32 32" fill="none"><path d="M8 20c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#94a3b8"/><circle cx="10" cy="25" r="1.5" fill="white"/><circle cx="16" cy="27" r="1.5" fill="white"/><circle cx="22" cy="25" r="1.5" fill="white"/></svg>);
  }
  return (<svg width={s} height={s} viewBox="0 0 32 32" fill="none"><path d="M8 24c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#64748b"/></svg>);
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
    <div className="mt-3 bg-gradient-to-br from-slate-800/80 to-slate-900/90 backdrop-blur-sm border border-white/10 rounded-xl p-4 shadow-2xl shadow-blue-500/5 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <WeatherIconSVG condition={cond} size={32} />
          <div>
            <h3 className="font-semibold text-white text-sm">{dateLabel}</h3>
            <p className="text-[11px] text-slate-400">{cond}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors active:scale-95">
          <X className="h-4 w-4 text-slate-400" />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <DetailCard icon={<Thermometer className="h-3.5 w-3.5 text-orange-400" />} label="Température" value={<>{day.tempMax ?? "—"}° <span className="text-blue-400 text-xs">/ {day.tempMin ?? "—"}°</span></>} />
        <DetailCard icon={<Thermometer className="h-3.5 w-3.5 text-pink-400" />} label="Ressenti" value={<>{day.feelsLikeMax ?? "—"}° <span className="text-blue-400 text-xs">/ {day.feelsLikeMin ?? "—"}°</span></>} />
        <DetailCard icon={<Wind className="h-3.5 w-3.5 text-emerald-400" />} label="Vent" value={<>{day.windSpeed ?? "—"} <span className="text-[10px] font-normal text-slate-400">km/h</span>{day.windGust ? <span className="block text-[10px] text-orange-400 mt-0.5">Raf. {day.windGust}</span> : null}</>} />
        <DetailCard icon={<Navigation className="h-3.5 w-3.5 text-sky-400" style={{ transform: `rotate(${(day.windDirection ?? 0) + 180}deg)` }} />} label="Direction" value={<>{degToCompass(day.windDirection)} <span className="text-[10px] text-slate-500">{day.windDirection != null ? `${Math.round(day.windDirection)}°` : ""}</span></>} />
        <DetailCard icon={<Droplets className="h-3.5 w-3.5 text-blue-400" />} label="Précipitations" value={<span className="text-blue-400">{day.precipitation ?? 0} mm</span>} />
        <DetailCard icon={<Eye className="h-3.5 w-3.5 text-cyan-400" />} label="Humidité" value={<span className="text-cyan-400">{day.humidity != null ? `${Math.round(day.humidity)}%` : "—"}</span>} />
        <DetailCard icon={<Sun className="h-3.5 w-3.5 text-yellow-400" />} label="Indice UV" value={<><span className={uv.color}>{day.uvIndex != null ? Math.round(day.uvIndex) : "—"}</span> <span className={`text-[10px] ${uv.color}`}>{uv.text}</span></>} />
        <DetailCard icon={<Cloud className="h-3.5 w-3.5 text-slate-400" />} label="Nébulosité" value={<>{day.cloudCover != null ? `${Math.round(day.cloudCover)}%` : "—"}</>} />
        <DetailCard icon={<Sunrise className="h-3.5 w-3.5 text-amber-400" />} label="Lever" value={<span className="text-amber-400">{day.sunrise ?? "—"}</span>} />
        <DetailCard icon={<Sunset className="h-3.5 w-3.5 text-orange-500" />} label="Coucher" value={<span className="text-orange-500">{day.sunset ?? "—"}</span>} />
        <div className="bg-white/5 rounded-lg p-2.5 border border-white/5 col-span-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Gauge className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Confiance</span>
            <span className={`ml-auto text-sm font-bold ${stabilityColor}`}>{day.stabilityIndex}%</span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${day.stabilityIndex >= 70 ? "bg-green-400" : day.stabilityIndex >= 45 ? "bg-yellow-400" : "bg-red-400"}`} style={{ width: `${day.stabilityIndex}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

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

// ─── Main Chart Component ─────────────────────────────────────────────────────
export default function FifteenDayChart({ days, locationName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // ── Compact dimensions (30% smaller height) ────────────────────────────────
  const CHART_HEIGHT = 200;  // reduced from 320 → 200 (−37%)
  const ICON_ROW = 32;       // weather icons
  const LABEL_ROW = 36;      // date labels
  const TOTAL_HEIGHT = CHART_HEIGHT + ICON_ROW + LABEL_ROW;
  const PAD_L = 32;
  const PAD_R = 8;
  const PAD_T = 16;          // minimal top margin
  const PAD_B = 28;          // bottom for precip bars

  const displayDays = days.slice(0, 15);
  const N = displayDays.length;
  const VISIBLE_DAYS = 7;
  const colW = containerWidth > 0 ? (containerWidth - PAD_L - PAD_R) / VISIBLE_DAYS : 0;
  const totalW = PAD_L + PAD_R + colW * N;

  // ── Auto-adapted scale (tight to actual data) ──────────────────────────────
  const maxTemps = displayDays.map(d => d.tempMax ?? 0);
  const minTemps = displayDays.map(d => d.tempMin ?? 0);
  const dataMax = Math.max(...maxTemps);
  const dataMin = Math.min(...minTemps);
  // Add only 2° padding above/below actual data for tight scale
  const scaleTop = dataMax + 2;
  const scaleBottom = dataMin - 2;
  const scaleRange = Math.max(scaleTop - scaleBottom, 8); // minimum 8° range

  const maxPrecip = Math.max(...displayDays.map(d => d.precipitation ?? 0), 0.5);
  const maxWind = Math.max(...displayDays.map(d => d.windSpeed ?? 0), 5);

  // Temperature → Y (occupies 75% of chart height for max visibility)
  const tempZoneTop = PAD_T;
  const tempZoneBottom = CHART_HEIGHT - PAD_B;
  const tempZoneH = tempZoneBottom - tempZoneTop;
  const tempToY = useCallback((t: number) => {
    return tempZoneTop + (1 - (t - scaleBottom) / scaleRange) * tempZoneH;
  }, [scaleBottom, scaleRange, tempZoneTop, tempZoneH]);

  // Wind → Y (shares space between min curve and precip bars)
  const windToY = useCallback((w: number) => {
    const windTop = tempToY(dataMin - 1) + 14;
    const windBot = CHART_HEIGHT - PAD_B - 6;
    const range = Math.max(windBot - windTop, 20);
    return windTop + (1 - w / maxWind) * range;
  }, [tempToY, dataMin, maxWind, CHART_HEIGHT, PAD_B]);

  const colX = useCallback((i: number) => PAD_L + i * colW + colW / 2, [PAD_L, colW]);

  // ── Draw ───────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || totalW === 0 || N === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalW * dpr;
    canvas.height = TOTAL_HEIGHT * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalW, TOTAL_HEIGHT);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, CHART_HEIGHT);
    bg.addColorStop(0, "rgba(15, 23, 42, 0.5)");
    bg.addColorStop(1, "rgba(15, 23, 42, 0.15)");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(PAD_L - 4, 2, totalW - PAD_L - PAD_R + 8, CHART_HEIGHT - 4, 10);
    ctx.fill();

    // Grid lines (3 lines, tight to data)
    const gridCount = 3;
    ctx.textAlign = "right";
    for (let i = 0; i <= gridCount; i++) {
      const t = scaleBottom + (scaleRange * i) / gridCount;
      const y = tempToY(t);
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(totalW - PAD_R, y);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(148, 163, 184, 0.45)";
      ctx.font = "bold 10px system-ui";
      ctx.fillText(`${Math.round(t)}°`, PAD_L - 4, y + 4);
    }

    // ── Precipitation bars (inside chart, at bottom) ─────────────────────────
    const precipMaxH = 30;
    const precipBase = CHART_HEIGHT - 6;
    displayDays.forEach((d, i) => {
      const p = d.precipitation ?? 0;
      if (p <= 0) return;
      const h = Math.max(3, (p / maxPrecip) * precipMaxH);
      const x = colX(i);
      const w = Math.min(colW * 0.45, 18);
      const g = ctx.createLinearGradient(0, precipBase - h, 0, precipBase);
      g.addColorStop(0, "rgba(96, 165, 250, 0.85)");
      g.addColorStop(1, "rgba(59, 130, 246, 0.25)");
      ctx.fillStyle = g;
      ctx.shadowColor = "rgba(96, 165, 250, 0.3)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, precipBase - h, w, h, [3, 3, 0, 0]);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Label
      ctx.fillStyle = "#93c5fd";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${p}`, x, precipBase - h - 3);
    });

    // ── Context zones ────────────────────────────────────────────────────────
    displayDays.forEach((d, i) => {
      const x = colX(i) - colW / 2;
      if ((d.tempMax ?? 0) >= 33) {
        const g = ctx.createLinearGradient(0, PAD_T, 0, CHART_HEIGHT * 0.5);
        g.addColorStop(0, "rgba(239, 68, 68, 0.12)");
        g.addColorStop(1, "rgba(239, 68, 68, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(x, PAD_T, colW, CHART_HEIGHT * 0.4);
      }
      if ((d.condition ?? "").toLowerCase().includes("orage")) {
        const g = ctx.createLinearGradient(0, PAD_T, 0, CHART_HEIGHT * 0.5);
        g.addColorStop(0, "rgba(139, 92, 246, 0.12)");
        g.addColorStop(1, "rgba(139, 92, 246, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(x, PAD_T, colW, CHART_HEIGHT * 0.4);
      }
    });

    // ── Curves ───────────────────────────────────────────────────────────────
    const maxPts = displayDays.map((d, i) => ({ x: colX(i), y: tempToY(d.tempMax ?? 0) }));
    const minPts = displayDays.map((d, i) => ({ x: colX(i), y: tempToY(d.tempMin ?? 0) }));

    // Fill between
    ctx.beginPath();
    ctx.moveTo(maxPts[0].x, maxPts[0].y);
    for (let i = 1; i < maxPts.length; i++) {
      const cpx = (maxPts[i - 1].x + maxPts[i].x) / 2;
      ctx.bezierCurveTo(cpx, maxPts[i - 1].y, cpx, maxPts[i].y, maxPts[i].x, maxPts[i].y);
    }
    for (let i = minPts.length - 1; i >= 0; i--) {
      if (i === minPts.length - 1) ctx.lineTo(minPts[i].x, minPts[i].y);
      else {
        const cpx = (minPts[i + 1].x + minPts[i].x) / 2;
        ctx.bezierCurveTo(cpx, minPts[i + 1].y, cpx, minPts[i].y, minPts[i].x, minPts[i].y);
      }
    }
    ctx.closePath();
    const fg = ctx.createLinearGradient(0, PAD_T, 0, tempZoneBottom);
    fg.addColorStop(0, "rgba(251, 146, 60, 0.15)");
    fg.addColorStop(0.5, "rgba(147, 197, 253, 0.06)");
    fg.addColorStop(1, "rgba(96, 165, 250, 0.03)");
    ctx.fillStyle = fg;
    ctx.fill();

    // Max curve (thick, glowing)
    ctx.beginPath();
    ctx.moveTo(maxPts[0].x, maxPts[0].y);
    for (let i = 1; i < maxPts.length; i++) {
      const cpx = (maxPts[i - 1].x + maxPts[i].x) / 2;
      ctx.bezierCurveTo(cpx, maxPts[i - 1].y, cpx, maxPts[i].y, maxPts[i].x, maxPts[i].y);
    }
    ctx.strokeStyle = "#fb923c";
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(251, 146, 60, 0.6)";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Max points + labels (larger)
    maxPts.forEach((pt, i) => {
      const v = displayDays[i].tempMax;
      if (v == null) return;
      const sel = selectedDay === i;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, sel ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fb923c";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#fdba74";
      ctx.font = `bold ${sel ? 12 : 11}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(v)}°`, pt.x, pt.y - 9);
    });

    // Min curve (thick)
    ctx.beginPath();
    ctx.moveTo(minPts[0].x, minPts[0].y);
    for (let i = 1; i < minPts.length; i++) {
      const cpx = (minPts[i - 1].x + minPts[i].x) / 2;
      ctx.bezierCurveTo(cpx, minPts[i - 1].y, cpx, minPts[i].y, minPts[i].x, minPts[i].y);
    }
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "rgba(96, 165, 250, 0.5)";
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Min points + labels
    minPts.forEach((pt, i) => {
      const v = displayDays[i].tempMin;
      if (v == null) return;
      const sel = selectedDay === i;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, sel ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#60a5fa";
      ctx.fill();
      ctx.fillStyle = "#93c5fd";
      ctx.font = `${sel ? "bold 12" : "bold 11"}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(v)}°`, pt.x, pt.y + 14);
    });

    // ── Wind dashed line ─────────────────────────────────────────────────────
    const windPts = displayDays.map((d, i) => ({ x: colX(i), y: windToY(d.windSpeed ?? 0) }));
    ctx.beginPath();
    ctx.setLineDash([5, 3]);
    ctx.moveTo(windPts[0].x, windPts[0].y);
    for (let i = 1; i < windPts.length; i++) ctx.lineTo(windPts[i].x, windPts[i].y);
    ctx.strokeStyle = "#4ade80";
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.setLineDash([]);

    // Wind labels + arrows
    windPts.forEach((pt, i) => {
      const v = displayDays[i].windSpeed;
      const dir = displayDays[i].windDirection;
      if (v == null) return;
      ctx.fillStyle = "#4ade80";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(v)}`, pt.x, pt.y - 5);
      if (dir != null) {
        const a = ((dir + 180) % 360) * (Math.PI / 180);
        ctx.save();
        ctx.translate(pt.x, pt.y + 7);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(-2.5, 3);
        ctx.lineTo(2.5, 3);
        ctx.closePath();
        ctx.fillStyle = "#4ade80";
        ctx.globalAlpha = 0.75;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    });

    // ── Selected highlight ───────────────────────────────────────────────────
    if (selectedDay !== null && selectedDay < N) {
      const x = colX(selectedDay) - colW / 2;
      ctx.fillStyle = "rgba(99, 102, 241, 0.08)";
      ctx.beginPath();
      ctx.roundRect(x + 1, 4, colW - 2, CHART_HEIGHT - 8, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(129, 140, 248, 0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ── Date labels ──────────────────────────────────────────────────────────
    const lblY = CHART_HEIGHT + ICON_ROW;
    displayDays.forEach((d, i) => {
      const { line1, line2 } = formatDate(d.date);
      const x = colX(i);
      const today = d.date === new Date().toISOString().slice(0, 10);
      const sel = selectedDay === i;
      ctx.fillStyle = today ? "#818cf8" : sel ? "#e2e8f0" : "rgba(148, 163, 184, 0.8)";
      ctx.font = `${today || sel ? "bold " : ""}11px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(line1, x, lblY + 12);
      if (line2) {
        ctx.font = "9px system-ui";
        ctx.fillStyle = today ? "#a5b4fc" : "rgba(107, 114, 128, 0.7)";
        ctx.fillText(line2, x, lblY + 24);
      }
    });
  }, [totalW, displayDays, selectedDay, N, colX, colW, tempToY, windToY, scaleBottom, scaleRange, maxPrecip, maxWind, dataMin, CHART_HEIGHT, ICON_ROW, TOTAL_HEIGHT, PAD_L, PAD_R, PAD_T, PAD_B, tempZoneBottom]);

  // Resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(e => setContainerWidth(e[0].contentRect.width));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { draw(); }, [draw]);

  // Click
  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (N === 0 || colW === 0) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const col = Math.floor((x - PAD_L) / colW);
    if (col >= 0 && col < N) setSelectedDay(p => p === col ? null : col);
  }, [N, colW, PAD_L]);

  if (displayDays.length === 0) return null;

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span>Températures &amp; Météo — 15 jours</span>
          {locationName && <span className="text-[11px] text-primary/60 font-normal">· {locationName}</span>}
        </h2>
        <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-[3px] bg-orange-400 inline-block rounded-full" /> Max</span>
          <span className="flex items-center gap-1"><span className="w-3 h-[2.5px] bg-blue-400 inline-block rounded-full" /> Min</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0 border-t border-dashed border-green-400 inline-block" /> Vent</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2.5 bg-blue-400/60 inline-block rounded-sm" /> Pluie</span>
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="w-full">
        <div className="overflow-x-auto scrollbar-hide" style={{ scrollBehavior: "smooth", WebkitOverflowScrolling: "touch", scrollSnapType: "x mandatory" }}>
          <div className="relative" style={{ width: totalW, minHeight: TOTAL_HEIGHT }}>
            {/* Icons row */}
            {totalW > 0 && N > 0 && (
              <div className="absolute flex" style={{ top: CHART_HEIGHT, height: ICON_ROW, left: PAD_L, width: colW * N }}>
                {displayDays.map((d, i) => {
                  const cond = d.condition ?? wmoToCondition(null, d.cloudCover, d.precipitation);
                  return (
                    <div
                      key={d.date}
                      className="flex items-center justify-center cursor-pointer transition-transform hover:scale-110 active:scale-95"
                      style={{ width: colW, flexShrink: 0, scrollSnapAlign: "start" }}
                      onClick={() => setSelectedDay(p => p === i ? null : i)}
                    >
                      <WeatherIconSVG condition={cond} size={Math.min(26, colW * 0.5)} />
                    </div>
                  );
                })}
              </div>
            )}
            <canvas
              ref={canvasRef}
              style={{ width: totalW, height: TOTAL_HEIGHT, cursor: "pointer", display: "block" }}
              onClick={onClick}
            />
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selectedDay !== null && selectedDay < displayDays.length && (
        <DayDetailPanel day={displayDays[selectedDay]} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  );
}
