import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Clock, MapPin, X, Thermometer, Wind, Droplets, Sun, Cloud, Navigation } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HourData {
  hour: string;
  temp: number | null;
  apparentTemp: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  cloudCover: number | null;
  humidity: number | null;
  uvIndex: number | null;
  condition: string | null;
}

interface Props {
  hours: HourData[];
  locationName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getConditionLabel(cloudCover: number | null, precip: number | null, condition: string | null): string {
  if (condition) return condition;
  if ((precip ?? 0) > 3) return "Pluie";
  if ((precip ?? 0) > 0.5) return "Averses";
  if ((cloudCover ?? 0) > 80) return "Couvert";
  if ((cloudCover ?? 0) > 50) return "Nuageux";
  return "Ensoleillé";
}

function getConditionBg(cloudCover: number | null, precip: number | null, condition: string | null): string {
  const cond = (condition ?? "").toLowerCase();
  if (cond.includes("orage")) return "rgba(55, 48, 83, 0.08)";
  if ((precip ?? 0) > 2 || cond.includes("pluie") || cond.includes("averse")) return "rgba(59, 130, 246, 0.06)";
  if ((cloudCover ?? 0) > 75 || cond.includes("couvert")) return "rgba(148, 163, 184, 0.05)";
  if ((cloudCover ?? 0) < 30 || cond.includes("ensoleillé")) return "rgba(251, 191, 36, 0.05)";
  return "rgba(148, 163, 184, 0.02)";
}

function degToCompass(deg: number | null): string {
  if (deg == null) return "—";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ─── Weather Icon SVG ─────────────────────────────────────────────────────────
function WeatherIconSVG({ condition, size = 20 }: { condition: string; size?: number }) {
  const s = size;
  const c = condition.toLowerCase();
  if (c.includes("ensoleillé") || c.includes("dégagé")) {
    return (<svg width={s} height={s} viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="7" fill="#fbbf24"/><g stroke="#fbbf24" strokeWidth="2" strokeLinecap="round"><line x1="16" y1="2" x2="16" y2="5"/><line x1="16" y1="27" x2="16" y2="30"/><line x1="2" y1="16" x2="5" y2="16"/><line x1="27" y1="16" x2="30" y2="16"/><line x1="6" y1="6" x2="8" y2="8"/><line x1="24" y1="24" x2="26" y2="26"/><line x1="6" y1="26" x2="8" y2="24"/><line x1="24" y1="8" x2="26" y2="6"/></g></svg>);
  }
  if (c.includes("partiellement") || c.includes("nuageux")) {
    return (<svg width={s} height={s} viewBox="0 0 32 32" fill="none"><circle cx="20" cy="12" r="6" fill="#fbbf24"/><path d="M8 24c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#94a3b8"/></svg>);
  }
  if (c.includes("couvert")) {
    return (<svg width={s} height={s} viewBox="0 0 32 32" fill="none"><path d="M8 24c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#64748b"/></svg>);
  }
  if (c.includes("pluie") || c.includes("averse") || c.includes("bruine")) {
    return (<svg width={s} height={s} viewBox="0 0 32 32" fill="none"><path d="M8 20c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#64748b"/><line x1="10" y1="23" x2="9" y2="27" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"/><line x1="16" y1="23" x2="15" y2="28" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"/><line x1="22" y1="23" x2="21" y2="27" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"/></svg>);
  }
  if (c.includes("orage")) {
    return (<svg width={s} height={s} viewBox="0 0 32 32" fill="none"><path d="M8 18c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#475569"/><polygon points="17,19 14,25 16,25 15,30 20,23 17,23 19,19" fill="#fbbf24"/></svg>);
  }
  return (<svg width={s} height={s} viewBox="0 0 32 32" fill="none"><path d="M8 24c-2.2 0-4-1.8-4-4s1.8-4 4-4c.4-2.8 2.8-5 5.7-5 2.5 0 4.6 1.6 5.3 3.8.4-.1.7-.1 1-.1 2.8 0 5 2.2 5 5s-2.2 5-5 5H8z" fill="#64748b"/></svg>);
}

// ─── Detail Overlay ──────────────────────────────────────────────────────────
function HourDetailOverlay({ hour, onClose }: { hour: HourData; onClose: () => void }) {
  const cond = getConditionLabel(hour.cloudCover, hour.precipitation, hour.condition);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 rounded-2xl p-5 shadow-2xl shadow-blue-500/10 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <WeatherIconSVG condition={cond} size={32} />
            <div>
              <h3 className="font-semibold text-white text-base">{hour.hour}</h3>
              <p className="text-xs text-slate-400">{cond}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors active:scale-95"><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Thermometer className="h-3.5 w-3.5 text-orange-400" /><span className="text-[10px] uppercase tracking-wider text-slate-500">Température</span></div>
            <p className="text-sm font-bold text-white">{hour.temp != null ? `${hour.temp.toFixed(1)}°C` : "—"}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Thermometer className="h-3.5 w-3.5 text-pink-400" /><span className="text-[10px] uppercase tracking-wider text-slate-500">Ressenti</span></div>
            <p className="text-sm font-bold text-white">{hour.apparentTemp != null ? `${hour.apparentTemp.toFixed(1)}°C` : "—"}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Wind className="h-3.5 w-3.5 text-emerald-400" /><span className="text-[10px] uppercase tracking-wider text-slate-500">Vent</span></div>
            <p className="text-sm font-bold text-white">{hour.windSpeed ?? "—"} <span className="text-[10px] text-slate-400">km/h</span></p>
          </div>
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Navigation className="h-3.5 w-3.5 text-sky-400" style={{ transform: `rotate(${((hour.windDirection ?? 0) + 180) % 360}deg)` }} /><span className="text-[10px] uppercase tracking-wider text-slate-500">Direction</span></div>
            <p className="text-sm font-bold text-white">{degToCompass(hour.windDirection)}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Droplets className="h-3.5 w-3.5 text-blue-400" /><span className="text-[10px] uppercase tracking-wider text-slate-500">Précipitations</span></div>
            <p className="text-sm font-bold text-blue-400">{hour.precipitation ?? 0} mm</p>
          </div>
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Droplets className="h-3.5 w-3.5 text-cyan-400" /><span className="text-[10px] uppercase tracking-wider text-slate-500">Humidité</span></div>
            <p className="text-sm font-bold text-cyan-400">{hour.humidity != null ? `${Math.round(hour.humidity)}%` : "—"}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Sun className="h-3.5 w-3.5 text-yellow-400" /><span className="text-[10px] uppercase tracking-wider text-slate-500">UV</span></div>
            <p className="text-sm font-bold text-yellow-400">{hour.uvIndex != null ? Math.round(hour.uvIndex) : "—"}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Cloud className="h-3.5 w-3.5 text-slate-400" /><span className="text-[10px] uppercase tracking-wider text-slate-500">Nébulosité</span></div>
            <p className="text-sm font-bold text-white">{hour.cloudCover != null ? `${Math.round(hour.cloudCover)}%` : "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function HourlyChart({ hours, locationName }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [animated, setAnimated] = useState(false);
  const [animProgress, setAnimProgress] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);

  const N = hours.length;
  const VISIBLE_HOURS = 8; // hours visible at once

  // Layout constants
  const COL_W = 56;
  const CHART_H = 180;
  const ICON_ROW = 24;
  const LABEL_ROW = 28;
  const PAD_T = 14;
  const TOTAL_H = CHART_H + ICON_ROW + LABEL_ROW;
  const scrollableW = COL_W * N;

  // Scales
  const allTemps = hours.map(h => h.temp ?? 0);
  const dataHigh = Math.max(...allTemps);
  const dataLow = Math.min(...allTemps);
  const gridStep = dataHigh - dataLow > 15 ? 5 : 2;
  const scaleTop = Math.ceil((dataHigh + 2) / gridStep) * gridStep;
  const scaleBot = Math.floor((dataLow - 2) / gridStep) * gridStep;
  const scaleRange = scaleTop - scaleBot || 1;

  const maxPrecip = Math.max(...hours.map(h => h.precipitation ?? 0), 1);
  const maxWind = Math.max(...hours.map(h => h.windSpeed ?? 0), 10);

  // Zone allocation: temp 55%, wind 20%, precip 20%
  const tempZoneTop = PAD_T;
  const tempZoneBot = PAD_T + (CHART_H - PAD_T) * 0.55;
  const windZoneTop = tempZoneBot + 4;
  const windZoneBot = windZoneTop + (CHART_H - PAD_T) * 0.20;
  const precipZoneTop = windZoneBot + 2;
  const precipZoneBot = CHART_H - 2;

  const tempToY = useCallback((t: number) => tempZoneTop + (1 - (t - scaleBot) / scaleRange) * (tempZoneBot - tempZoneTop), [scaleBot, scaleRange, tempZoneTop, tempZoneBot]);
  const windToY = useCallback((w: number) => windZoneTop + (1 - w / maxWind) * (windZoneBot - windZoneTop), [maxWind, windZoneTop, windZoneBot]);
  const colX = useCallback((i: number) => i * COL_W + COL_W / 2, []);

  // Current hour index
  const nowHour = useMemo(() => {
    const h = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).slice(0, 2) + ":00";
    return hours.findIndex(hr => hr.hour === h);
  }, [hours]);

  // Temp ticks
  const tempTicks: number[] = [];
  for (let t = scaleBot; t <= scaleTop; t += gridStep) tempTicks.push(t);
  const AXIS_W = 32;

  // ── Draw canvas ──────────────────────────────────────────────────────────────
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

    // Per-hour background
    hours.forEach((h, i) => {
      const x = i * COL_W;
      ctx.fillStyle = getConditionBg(h.cloudCover, h.precipitation, h.condition);
      ctx.fillRect(x, 0, COL_W, CHART_H);
    });

    // Vertical separators
    for (let i = 1; i < N; i++) {
      const x = i * COL_W;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CHART_H);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Horizontal grid (temp)
    for (let t = scaleBot; t <= scaleTop; t += gridStep) {
      const y = tempToY(t);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(scrollableW, y);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Current hour highlight
    if (nowHour >= 0 && nowHour < N) {
      const x = nowHour * COL_W;
      const g = ctx.createLinearGradient(x, 0, x + COL_W, 0);
      g.addColorStop(0, "rgba(99, 102, 241, 0)");
      g.addColorStop(0.5, "rgba(99, 102, 241, 0.12)");
      g.addColorStop(1, "rgba(99, 102, 241, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, COL_W, TOTAL_H);
      ctx.strokeStyle = "rgba(129, 140, 248, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, 0.5, COL_W - 1, CHART_H - 1);
    }

    // Selected hour highlight
    if (selectedHour !== null && selectedHour < N && selectedHour !== nowHour) {
      const x = selectedHour * COL_W;
      const g = ctx.createLinearGradient(x, 0, x + COL_W, 0);
      g.addColorStop(0, "rgba(168, 85, 247, 0)");
      g.addColorStop(0.5, "rgba(168, 85, 247, 0.08)");
      g.addColorStop(1, "rgba(168, 85, 247, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, COL_W, TOTAL_H);
    }

    // Animation progress
    const progress = animated ? 1 : animProgress;
    const visibleN = Math.max(1, Math.ceil(N * progress));

    // Temperature curve (orange gradient)
    const tempPts = hours.slice(0, visibleN).map((h, i) => ({ x: colX(i), y: tempToY(h.temp ?? 0) }));
    if (tempPts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(tempPts[0].x, tempPts[0].y);
      for (let i = 1; i < tempPts.length; i++) {
        const cpx = (tempPts[i - 1].x + tempPts[i].x) / 2;
        ctx.bezierCurveTo(cpx, tempPts[i - 1].y, cpx, tempPts[i].y, tempPts[i].x, tempPts[i].y);
      }
      ctx.strokeStyle = "#fb923c";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    // Points + values (every 2 hours to avoid clutter)
    tempPts.forEach((pt, i) => {
      const v = hours[i].temp;
      if (v == null) return;
      const sel = selectedHour === i || nowHour === i;
      const r = sel ? 5 : 3.5;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fillStyle = nowHour === i ? "#818cf8" : "#fb923c";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Show value every 2 hours or on selection
      if (i % 2 === 0 || sel) {
        ctx.fillStyle = nowHour === i ? "#a5b4fc" : "#fdba74";
        ctx.font = `bold ${sel ? 12 : 10}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText(`${v.toFixed(1)}°`, pt.x, pt.y - 10);
      }
    });

    // Wind dashed line (green)
    const windPts = hours.slice(0, visibleN).map((h, i) => ({ x: colX(i), y: windToY(h.windSpeed ?? 0) }));
    if (windPts.length > 1) {
      ctx.beginPath();
      ctx.setLineDash([5, 3]);
      ctx.moveTo(windPts[0].x, windPts[0].y);
      for (let i = 1; i < windPts.length; i++) ctx.lineTo(windPts[i].x, windPts[i].y);
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Wind values every 3 hours
    windPts.forEach((pt, i) => {
      const v = hours[i].windSpeed;
      if (v == null) return;
      if (i % 3 === 0 || selectedHour === i) {
        ctx.fillStyle = "#4ade80";
        ctx.font = "bold 9px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.round(v)}`, pt.x, pt.y - 6);
      }
      // Wind direction arrow every 3 hours
      const dir = hours[i].windDirection;
      if (dir != null && i % 3 === 0) {
        const angle = ((dir + 180) % 360) * (Math.PI / 180);
        ctx.save();
        ctx.translate(pt.x, pt.y + 2);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(-2, 2.5);
        ctx.lineTo(0, 1);
        ctx.lineTo(2, 2.5);
        ctx.closePath();
        ctx.fillStyle = "#4ade80";
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    });

    // Precipitation bars
    const precipH = precipZoneBot - precipZoneTop;
    hours.slice(0, visibleN).forEach((h, i) => {
      const p = h.precipitation ?? 0;
      if (p <= 0) return;
      const barH = Math.max(3, (p / maxPrecip) * precipH);
      const x = colX(i);
      const barW = Math.min(COL_W * 0.5, 20);
      const g = ctx.createLinearGradient(0, precipZoneBot - barH, 0, precipZoneBot);
      g.addColorStop(0, "rgba(96, 165, 250, 0.9)");
      g.addColorStop(1, "rgba(37, 99, 235, 0.5)");
      ctx.fillStyle = g;
      ctx.fillRect(x - barW / 2, precipZoneBot - barH, barW, barH);
      // Value
      if (p >= 0.5) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 8px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(`${p}`, x, precipZoneBot - barH - 2);
      }
    });

    // Hour labels
    hours.forEach((h, i) => {
      const x = colX(i);
      const lblY = CHART_H + ICON_ROW;
      const isCurrent = i === nowHour;
      const sel = i === selectedHour;
      ctx.fillStyle = isCurrent ? "#818cf8" : sel ? "#e2e8f0" : "rgba(148, 163, 184, 0.7)";
      ctx.font = `${isCurrent || sel ? "bold " : ""}10px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(h.hour, x, lblY + 14);
    });
  }, [hours, N, selectedHour, animated, animProgress, scrollableW, TOTAL_H, CHART_H, ICON_ROW, COL_W, PAD_T, scaleBot, scaleTop, scaleRange, gridStep, maxPrecip, maxWind, tempToY, windToY, colX, nowHour, tempZoneTop, tempZoneBot, windZoneTop, windZoneBot, precipZoneTop, precipZoneBot]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(e => setContainerWidth(e[0].contentRect.width));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Animation trigger
  useEffect(() => {
    if (N > 0 && !animated) {
      let start: number | null = null;
      const duration = 1000;
      const step = (ts: number) => {
        if (!start) start = ts;
        const elapsed = ts - start;
        const p = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setAnimProgress(eased);
        if (p < 1) {
          requestAnimationFrame(step);
        } else {
          setAnimated(true);
        }
      };
      const t = setTimeout(() => requestAnimationFrame(step), 100);
      return () => clearTimeout(t);
    }
  }, [N, animated]);

  // Scroll progress tracker
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

  // Auto-scroll to current hour on mount
  useEffect(() => {
    if (nowHour > 0 && scrollRef.current) {
      const targetScroll = Math.max(0, (nowHour - 2) * COL_W);
      scrollRef.current.scrollTo({ left: targetScroll, behavior: "smooth" });
    }
  }, [nowHour, COL_W]);

  useEffect(() => { draw(); }, [draw]);

  // Click handler
  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (N === 0) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const col = Math.floor(x / COL_W);
    if (col >= 0 && col < N) setSelectedHour(p => p === col ? null : col);
  }, [N, COL_W]);

  if (hours.length === 0) return null;

  return (
    <div ref={containerRef} className="w-full">
      {/* Header */}
      <div className="mb-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span>Heure par heure</span>
          </h2>
          <span className="text-[11px] text-slate-400">{N}h</span>
        </div>
        {locationName && (
          <p className="text-[11px] text-primary/70 flex items-center gap-1 mt-0.5">
            <MapPin className="h-3 w-3" /> {locationName}
          </p>
        )}
        <div className="flex items-center gap-3 text-[11px] mt-1.5">
          <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-4 rounded-full bg-orange-400 inline-block" /> Temp °C</span>
          <span className="flex items-center gap-1.5 text-green-400"><span className="w-4 h-0 border-t-2 border-dashed border-green-400 inline-block" /> Vent km/h</span>
          <span className="flex items-center gap-1.5 text-blue-400"><span className="w-3 h-3.5 bg-blue-500/80 inline-block rounded-sm" /> Pluie mm</span>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex" style={{ height: TOTAL_H }}>
        {/* Fixed left axis */}
        <div className="flex-shrink-0 relative" style={{ width: AXIS_W, height: TOTAL_H }}>
          <span className="absolute text-[8px] text-slate-500 font-bold" style={{ top: 0, left: 2 }}>°C</span>
          {tempTicks.map(t => (
            <span key={`t-${t}`} className="absolute text-[10px] font-bold text-slate-400 right-1" style={{ top: tempToY(t) - 5 }}>{t}°</span>
          ))}
        </div>

        {/* Scrollable chart */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto scrollbar-hide" style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
          <div className="relative" style={{ width: scrollableW, height: TOTAL_H }}>
            {/* Weather icons row */}
            <div className="absolute flex" style={{ top: CHART_H, height: ICON_ROW, left: 0, width: scrollableW }}>
              {hours.map((h, i) => {
                const cond = getConditionLabel(h.cloudCover, h.precipitation, h.condition);
                return (
                  <div key={h.hour} className="flex items-center justify-center cursor-pointer hover:scale-110 transition-transform active:scale-95" style={{ width: COL_W, scrollSnapAlign: "start" }} onClick={() => setSelectedHour(p => p === i ? null : i)}>
                    <WeatherIconSVG condition={cond} size={16} />
                  </div>
                );
              })}
            </div>
            <canvas ref={canvasRef} style={{ width: scrollableW, height: TOTAL_H, cursor: "pointer", display: "block" }} onClick={onClick} />
          </div>
        </div>
      </div>

      {/* Progress bar (interactive) */}
      {N > VISIBLE_HOURS && (
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
                width: `${(VISIBLE_HOURS / N) * 100}%`,
                transform: `translateX(${scrollProgress * ((N / VISIBLE_HOURS) - 1) * 100}%)`
              }}
            />
          </div>
          <p className="text-center text-[9px] text-slate-500 mt-1">Cliquez ou glissez pour naviguer</p>
        </div>
      )}

      {/* Detail overlay */}
      {selectedHour !== null && selectedHour < hours.length && (
        <HourDetailOverlay hour={hours[selectedHour]} onClose={() => setSelectedHour(null)} />
      )}
    </div>
  );
}
