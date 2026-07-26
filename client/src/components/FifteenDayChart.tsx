import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { TrendingUp, X, Thermometer, Wind, Droplets, Sun, Cloud, Sunrise, Sunset, Gauge, Navigation, Eye, MapPin } from "lucide-react";

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
  if (condition) return condition;
  if ((precip ?? 0) > 5) return "Pluie";
  if ((precip ?? 0) > 1) return "Averses";
  if ((cloudCover ?? 0) > 80) return "Couvert";
  if ((cloudCover ?? 0) > 50) return "Partiellement nuageux";
  return "Ensoleillé";
}

function getConditionBg(cloudCover: number | null, precip: number | null, condition: string | null): string {
  const cond = (condition ?? "").toLowerCase();
  if (cond.includes("orage")) return "rgba(55, 48, 83, 0.08)";
  if ((precip ?? 0) > 3 || cond.includes("pluie") || cond.includes("averse")) return "rgba(59, 130, 246, 0.06)";
  if ((cloudCover ?? 0) > 75 || cond.includes("couvert")) return "rgba(148, 163, 184, 0.05)";
  if ((cloudCover ?? 0) < 30 || cond.includes("ensoleillé")) return "rgba(251, 191, 36, 0.05)";
  return "rgba(148, 163, 184, 0.02)";
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
function WeatherIconSVG({ condition, size = 22 }: { condition: string; size?: number }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 rounded-2xl p-5 shadow-2xl shadow-blue-500/10 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <WeatherIconSVG condition={cond} size={36} />
            <div>
              <h3 className="font-semibold text-white text-base">{dateLabel}</h3>
              <p className="text-xs text-slate-400">{cond}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors active:scale-95"><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <DetailCard icon={<Thermometer className="h-3.5 w-3.5 text-orange-400" />} label="Température" value={<>{day.tempMax ?? "—"}° <span className="text-blue-400 text-xs">/ {day.tempMin ?? "—"}°</span></>} />
          <DetailCard icon={<Thermometer className="h-3.5 w-3.5 text-pink-400" />} label="Ressenti" value={<>{day.feelsLikeMax ?? "—"}° <span className="text-blue-400 text-xs">/ {day.feelsLikeMin ?? "—"}°</span></>} />
          <DetailCard icon={<Wind className="h-3.5 w-3.5 text-emerald-400" />} label="Vent" value={<>{day.windSpeed ?? "—"} <span className="text-[10px] text-slate-400">km/h</span>{day.windGust ? <span className="block text-[10px] text-orange-400 mt-0.5">Raf. {Math.round(day.windGust)}</span> : null}</>} />
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
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Confiance</span>
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

// ─── AI Analysis ──────────────────────────────────────────────────────────────
function AIAnalysis({ days }: { days: DayData[] }) {
  const analysis = useMemo(() => {
    if (days.length === 0) return null;
    const maxTemps = days.map(d => d.tempMax ?? 0);
    const minTemps = days.map(d => d.tempMin ?? 0);
    const precips = days.map(d => d.precipitation ?? 0);
    const winds = days.map(d => d.windSpeed ?? 0);

    const hottestIdx = maxTemps.indexOf(Math.max(...maxTemps));
    const coldestIdx = minTemps.indexOf(Math.min(...minTemps));
    const rainyDays = days.filter(d => (d.precipitation ?? 0) > 1);
    const avgMax = maxTemps.reduce((a, b) => a + b, 0) / maxTemps.length;
    const avgWind = winds.reduce((a, b) => a + b, 0) / winds.length;
    const maxWind = Math.max(...winds);
    const totalPrecip = precips.reduce((a, b) => a + b, 0);

    // Trend
    const firstHalf = maxTemps.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
    const secondHalf = maxTemps.slice(7).reduce((a, b) => a + b, 0) / Math.max(maxTemps.length - 7, 1);
    const trend = secondHalf - firstHalf > 2 ? "hausse" : secondHalf - firstHalf < -2 ? "baisse" : "stable";

    // Events
    const events: string[] = [];
    if (Math.max(...maxTemps) >= 33) events.push("🌡️ Épisode de forte chaleur détecté");
    if (days.some(d => (d.condition ?? "").toLowerCase().includes("orage"))) events.push("⚡ Risque orageux identifié");
    if (maxWind > 50) events.push("💨 Rafales importantes prévues");
    if (Math.min(...minTemps) < 5) events.push("❄️ Fraîcheur marquée en matinée");

    const hottestDate = formatDate(days[hottestIdx].date);
    const coldestDate = formatDate(days[coldestIdx].date);

    let summary = `**Tendance générale :** Températures en ${trend} sur la période, avec une moyenne des maximales de ${avgMax.toFixed(1)}°C. `;
    summary += `**Jour le plus chaud :** ${hottestDate.line1} ${hottestDate.line2} (${maxTemps[hottestIdx].toFixed(1)}°C). `;
    summary += `**Jour le plus frais :** ${coldestDate.line1} ${coldestDate.line2} (${minTemps[coldestIdx].toFixed(1)}°C). `;
    if (rainyDays.length > 0) {
      summary += `**Pluie :** ${rainyDays.length} jour${rainyDays.length > 1 ? "s" : ""} avec précipitations (cumul ${totalPrecip.toFixed(1)} mm). `;
    } else {
      summary += `**Pluie :** Aucune précipitation significative prévue. `;
    }
    summary += `**Vent :** Moyenne ${avgWind.toFixed(0)} km/h, pointes à ${maxWind.toFixed(0)} km/h.`;

    return { summary, events };
  }, [days]);

  if (!analysis) return null;

  return (
    <div className="mt-3 p-3 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 border border-indigo-500/10 rounded-xl">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">🤖 Analyse IA</span>
      </div>
      <p className="text-[11px] text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: analysis.summary.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
      {analysis.events.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {analysis.events.map((e, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-slate-300">{e}</span>
          ))}
        </div>
      )}
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
  const [viewMode, setViewMode] = useState<7 | 15>(7);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const displayDays = days.slice(0, viewMode);
  const N = displayDays.length;

  // ── Layout constants ────────────────────────────────────────────────────────
  const AXIS_W = 38;         // fixed axis width on left
  const COL_W = 72;          // width per day column
  const CHART_H = 220;       // main chart height (temp + wind + precip combined)
  const ICON_ROW = 28;       // icon row
  const LABEL_ROW = 36;      // date labels
  const PAD_T = 16;
  const TOTAL_H = CHART_H + ICON_ROW + LABEL_ROW;
  const scrollableW = COL_W * N;

  // ── Scales ──────────────────────────────────────────────────────────────────
  const allMax = displayDays.map(d => d.tempMax ?? 0);
  const allMin = displayDays.map(d => d.tempMin ?? 0);
  const dataHigh = Math.max(...allMax);
  const dataLow = Math.min(...allMin);
  const gridStep = dataHigh - dataLow > 20 ? 10 : 5;
  const scaleTop = Math.ceil((dataHigh + 3) / gridStep) * gridStep;
  const scaleBot = Math.max(Math.floor((dataLow - 3) / gridStep) * gridStep, -10);
  const scaleRange = scaleTop - scaleBot || 1;

  const maxPrecip = Math.max(...displayDays.map(d => d.precipitation ?? 0), 2);
  const maxWind = Math.max(...displayDays.map(d => d.windSpeed ?? 0), 10);

  // Zone allocation: temp 55%, wind 20%, precip 20%, gaps 5%
  const tempZoneTop = PAD_T;
  const tempZoneBot = PAD_T + (CHART_H - PAD_T) * 0.55;
  const windZoneTop = tempZoneBot + 4;
  const windZoneBot = windZoneTop + (CHART_H - PAD_T) * 0.20;
  const precipZoneTop = windZoneBot + 2;
  const precipZoneBot = CHART_H - 2;

  const tempToY = useCallback((t: number) => tempZoneTop + (1 - (t - scaleBot) / scaleRange) * (tempZoneBot - tempZoneTop), [scaleBot, scaleRange, tempZoneTop, tempZoneBot]);
  const windToY = useCallback((w: number) => windZoneTop + (1 - w / maxWind) * (windZoneBot - windZoneTop), [maxWind, windZoneTop, windZoneBot]);
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

    // ── Horizontal grid (temp) ───────────────────────────────────────────────
    for (let t = scaleBot; t <= scaleTop; t += gridStep) {
      const y = tempToY(t);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(scrollableW, y);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

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
      ctx.strokeStyle = "#fb923c";
      ctx.lineWidth = 3;
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
      ctx.lineWidth = 2.5;
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

    // ── Wind dashed line (green) ─────────────────────────────────────────────
    const windPts = displayDays.slice(0, visibleN).map((d, i) => ({ x: colX(i), y: windToY(d.windSpeed ?? 0) }));
    if (windPts.length > 1) {
      ctx.beginPath();
      ctx.setLineDash([6, 4]);
      ctx.moveTo(windPts[0].x, windPts[0].y);
      for (let i = 1; i < windPts.length; i++) ctx.lineTo(windPts[i].x, windPts[i].y);
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    windPts.forEach((pt, i) => {
      const v = displayDays[i].windSpeed;
      const dir = displayDays[i].windDirection;
      if (v == null) return;
      ctx.fillStyle = "#4ade80";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(v)}`, pt.x, pt.y - 8);
      if (dir != null) {
        const angle = ((dir + 180) % 360) * (Math.PI / 180);
        ctx.save();
        ctx.translate(pt.x, pt.y + 3);
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
      if (p <= 0) return;
      const barH = Math.max(4, (p / maxPrecip) * precipH);
      const x = colX(i);
      const barW = Math.min(COL_W * 0.45, 24);
      const g = ctx.createLinearGradient(0, precipZoneBot - barH, 0, precipZoneBot);
      g.addColorStop(0, "rgba(96, 165, 250, 0.9)");
      g.addColorStop(1, "rgba(37, 99, 235, 0.5)");
      ctx.fillStyle = g;
      ctx.fillRect(x - barW / 2, precipZoneBot - barH, barW, barH);
      // Value
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${p}`, x, precipZoneBot - barH - 3);
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
  }, [displayDays, N, selectedDay, animated, animProgress, scrollableW, TOTAL_H, CHART_H, ICON_ROW, COL_W, PAD_T, scaleBot, scaleTop, scaleRange, gridStep, maxPrecip, maxWind, tempToY, windToY, colX, tempZoneTop, tempZoneBot, windZoneTop, windZoneBot, precipZoneTop, precipZoneBot]);

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

  // ── Fixed axis ticks (rendered as DOM, stays in place) ──────────────────────
  const tempTicks: number[] = [];
  for (let t = scaleBot; t <= scaleTop; t += gridStep) tempTicks.push(t);

  return (
    <div ref={containerRef} className="w-full">
      {/* Header with toggle */}
      <div className="mb-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span>Températures & Météo</span>
          </h2>
          <div className="flex items-center bg-slate-800/80 rounded-full p-0.5 border border-slate-700/50">
            <button
              onClick={() => setViewMode(7)}
              className={`px-3 py-1 text-[11px] font-medium rounded-full transition-all duration-200 ${viewMode === 7 ? 'bg-indigo-500/90 text-white shadow-sm shadow-indigo-500/30' : 'text-slate-400 hover:text-slate-200'}`}
            >7 jours</button>
            <button
              onClick={() => setViewMode(15)}
              className={`px-3 py-1 text-[11px] font-medium rounded-full transition-all duration-200 ${viewMode === 15 ? 'bg-indigo-500/90 text-white shadow-sm shadow-indigo-500/30' : 'text-slate-400 hover:text-slate-200'}`}
            >15 jours</button>
          </div>
        </div>
        {locationName && (
          <p className="text-[11px] text-primary/70 flex items-center gap-1 mt-0.5">
            <MapPin className="h-3 w-3" /> {locationName}
          </p>
        )}
        <div className="flex items-center gap-3 text-[11px] mt-1.5">
          <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-4 rounded-full bg-orange-400 inline-block" /> Max °C</span>
          <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-4 rounded-full bg-blue-400 inline-block" /> Min °C</span>
          <span className="flex items-center gap-1.5 text-green-400"><span className="w-4 h-0 border-t-2 border-dashed border-green-400 inline-block" /> Vent km/h</span>
          <span className="flex items-center gap-1.5 text-blue-400"><span className="w-3 h-3.5 bg-blue-500/80 inline-block rounded-sm" /> Pluie mm</span>
        </div>
      </div>

      {/* ── Chart area: fixed axis + scrollable content ───────────────────── */}
      <div className="flex" style={{ height: TOTAL_H }}>
        {/* Fixed left axis — only temperature scale */}
        <div className="flex-shrink-0 relative" style={{ width: AXIS_W, height: TOTAL_H }}>
          <span className="absolute text-[9px] text-slate-500 font-bold" style={{ top: 0, left: 2 }}>°C</span>
          {tempTicks.map(t => (
            <span key={`t-${t}`} className="absolute text-[11px] font-bold text-slate-400 right-1" style={{ top: tempToY(t) - 6 }}>{t}°</span>
          ))}
        </div>

        {/* Scrollable chart */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto scrollbar-hide" style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
          <div className="relative" style={{ width: scrollableW, height: TOTAL_H }}>
            {/* Weather icons row */}
            <div className="absolute flex" style={{ top: CHART_H, height: ICON_ROW, left: 0, width: scrollableW }}>
              {displayDays.map((d, i) => {
                const cond = getConditionLabel(d.cloudCover, d.precipitation, d.condition);
                return (
                  <div key={d.date} className="flex items-center justify-center cursor-pointer hover:scale-110 transition-transform active:scale-95" style={{ width: COL_W, scrollSnapAlign: "start" }} onClick={() => setSelectedDay(p => p === i ? null : i)}>
                    <WeatherIconSVG condition={cond} size={20} />
                  </div>
                );
              })}
            </div>
            <canvas ref={canvasRef} style={{ width: scrollableW, height: TOTAL_H, cursor: "pointer", display: "block" }} onClick={onClick} />
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
              className="absolute h-full rounded-full bg-gradient-to-r from-indigo-400 to-purple-400 transition-transform duration-150 group-hover:from-indigo-300 group-hover:to-purple-300"
              style={{
                width: `${(7 / N) * 100}%`,
                transform: `translateX(${scrollProgress * ((N / 7) - 1) * 100}%)`
              }}
            />
          </div>
          <p className="text-center text-[9px] text-slate-500 mt-1">Cliquez ou glissez pour naviguer</p>
        </div>
      )}

      {/* ── AI Analysis ───────────────────────────────────────────────────── */}
      <AIAnalysis days={displayDays} />

      {/* ── Overlay detail panel ──────────────────────────────────────────── */}
      {selectedDay !== null && selectedDay < displayDays.length && (
        <DayDetailOverlay day={displayDays[selectedDay]} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  );
}
