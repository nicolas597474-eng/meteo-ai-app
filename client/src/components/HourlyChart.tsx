import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Clock, MapPin, X, Thermometer, Wind, Droplets, Sun, Cloud, Navigation } from "lucide-react";
import { MeteoIcon, getIconNameFromCondition } from "@/components/MeteoIcon";
import { conditionFromWeatherValues } from "@shared/weatherConditionLabels";
import { getChartTemperatureScale } from "@/lib/chartTemperatureScale";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HourData {
  hour: string;
  temp: number | null;
  apparentTemp: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust?: number | null;
  windDirection: number | null;
  cloudCover: number | null;
  humidity: number | null;
  uvIndex: number | null;
  condition: string | null;
  // Multi-model spread
  tempSpread?: number | null;
  precipProb?: number | null;
  modelCount?: number;
}

interface Props {
  hours: HourData[];
  locationName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getConditionLabel(cloudCover: number | null, precip: number | null, condition: string | null): string {
  if (condition && /(orage|brouillard|neige|pluie|averse)/i.test(condition)) return condition;
  if (cloudCover != null || precip != null) return conditionFromWeatherValues(precip, cloudCover);
  return condition ?? "Ensoleillé";
}

function getConditionBg(cloudCover: number | null, precip: number | null, condition: string | null): string {
  const cond = (condition ?? "").toLowerCase();
  if (cond.includes("orage")) return "rgba(148, 163, 184, 0.045)";
  if ((precip ?? 0) > 2 || cond.includes("pluie") || cond.includes("averse")) return "rgba(148, 163, 184, 0.032)";
  if ((cloudCover ?? 0) > 75 || cond.includes("couvert")) return "rgba(148, 163, 184, 0.04)";
  if ((cloudCover ?? 0) < 30 || cond.includes("ensoleillé")) return "rgba(255, 255, 255, 0.025)";
  return "rgba(255, 255, 255, 0.014)";
}

function degToCompass(deg: number | null): string {
  if (deg == null) return "—";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ─── Weather Icon (MeteoAI pack) ─────────────────────────────────────────────
function WeatherIconSVG({ condition, size = 20 }: { condition: string; size?: number }) {
  return <MeteoIcon name={getIconNameFromCondition(condition)} size={size} />;
}

function HourlyScaleLabels({
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
  const tempTicks = getChartTemperatureScale([scaleBot, scaleTop], 0).ticks;
  const tempToAxisY = (value: number) => tempTop + (1 - (value - scaleBot) / (scaleTop - scaleBot || 1)) * (tempBottom - tempTop);
  return (
    <aside aria-label="Échelles du graphique horaire" className="relative z-10 w-10 shrink-0 border-r border-slate-700/70 bg-[#06080d] text-right text-[8px] font-medium text-slate-500" style={{ height: totalHeight }}>
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

// ─── Detail Overlay ──────────────────────────────────────────────────────────
function HourDetailOverlay({ hour, onClose }: { hour: HourData; onClose: () => void }) {
  const cond = getConditionLabel(hour.cloudCover, hour.precipitation, hour.condition);
  const hasSpread = hour.tempSpread != null && hour.tempSpread > 0;
  const hasPrecipProb = hour.precipProb != null;
  const hasGust = hour.windGust != null && hour.windGust > 0;

  // Confidence from spread: low spread = high confidence
  const spreadConfidence = hasSpread
    ? Math.max(0, Math.round(100 - (hour.tempSpread! * 25)))
    : null;
  const confidenceColor = spreadConfidence == null ? "text-slate-400"
    : spreadConfidence >= 80 ? "text-green-400"
    : spreadConfidence >= 60 ? "text-yellow-400"
    : "text-orange-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 rounded-2xl p-5 shadow-2xl shadow-blue-500/10 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <WeatherIconSVG condition={cond} size={32} />
            <div>
              <h3 className="font-semibold text-white text-base">{hour.hour}</h3>
              <p className="text-xs text-slate-400">{cond}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors active:scale-95"><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        {/* Multi-model confidence banner */}
        {(hasSpread || hasPrecipProb) && (
          <div className="mb-3 bg-slate-700/40 border border-slate-600/30 rounded-xl px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">🤖 {hour.modelCount ?? 2} modèles</span>
              {hasSpread && (
                <span className="text-xs text-slate-400">
                  · Écart T: <span className={`font-mono font-bold ${(hour.tempSpread! < 0.5) ? 'text-green-400' : (hour.tempSpread! < 1.5) ? 'text-yellow-400' : 'text-orange-400'}`}>
                    ±{hour.tempSpread!.toFixed(1)}°C
                  </span>
                </span>
              )}
            </div>
            {spreadConfidence != null && (
              <span className={`text-xs font-bold ${confidenceColor}`}>{spreadConfidence}% conf.</span>
            )}
          </div>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Temperature */}
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Thermometer className="h-3.5 w-3.5 text-orange-400" /><span className="text-[10px] uppercase tracking-wider text-slate-500">Température</span></div>
            <p className="text-sm font-bold text-white">{hour.temp != null ? `${hour.temp.toFixed(1)}°C` : "—"}</p>
            {hasSpread && <p className="text-[10px] text-slate-500 mt-0.5">±{hour.tempSpread!.toFixed(1)}°C entre modèles</p>}
          </div>

          {/* Ressenti */}
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Thermometer className="h-3.5 w-3.5 text-pink-400" /><span className="text-[10px] uppercase tracking-wider text-slate-500">Ressenti</span></div>
            <p className="text-sm font-bold text-white">{hour.apparentTemp != null ? `${hour.apparentTemp.toFixed(1)}°C` : "—"}</p>
          </div>

          {/* Vent */}
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Wind className="h-3.5 w-3.5 text-emerald-400" /><span className="text-[10px] uppercase tracking-wider text-slate-500">Vent</span></div>
            <p className="text-sm font-bold text-white">{hour.windSpeed ?? "—"} <span className="text-[10px] text-slate-400">km/h</span></p>
            {hasGust && <p className="text-[10px] text-orange-300 mt-0.5">Rafales: {hour.windGust!.toFixed(0)} km/h</p>}
          </div>

          {/* Direction */}
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Navigation className="h-3.5 w-3.5 text-sky-400" style={{ transform: `rotate(${((hour.windDirection ?? 0) + 180) % 360}deg)` }} /><span className="text-[10px] uppercase tracking-wider text-slate-500">Direction</span></div>
            <p className="text-sm font-bold text-white">{degToCompass(hour.windDirection)}</p>
            {hour.windDirection != null && <p className="text-[10px] text-slate-500 mt-0.5">{Math.round(hour.windDirection)}°</p>}
          </div>

          {/* Précipitations */}
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Droplets className="h-3.5 w-3.5 text-blue-400" /><span className="text-[10px] uppercase tracking-wider text-slate-500">Précipitations</span></div>
            <p className="text-sm font-bold text-blue-400">{hour.precipitation ?? 0} mm</p>
            {hasPrecipProb && (
              <div className="mt-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] text-slate-500">Probabilité</span>
                  <span className={`text-[10px] font-bold ${(hour.precipProb! >= 70) ? 'text-blue-400' : (hour.precipProb! >= 30) ? 'text-yellow-400' : 'text-slate-400'}`}>{hour.precipProb}%</span>
                </div>
                <div className="bg-slate-700 rounded-full h-1 overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full" style={{ width: `${hour.precipProb}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Humidité */}
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Droplets className="h-3.5 w-3.5 text-cyan-400" /><span className="text-[10px] uppercase tracking-wider text-slate-500">Humidité</span></div>
            <p className="text-sm font-bold text-cyan-400">{hour.humidity != null ? `${Math.round(hour.humidity)}%` : "—"}</p>
          </div>

          {/* UV */}
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1"><Sun className="h-3.5 w-3.5 text-yellow-400" /><span className="text-[10px] uppercase tracking-wider text-slate-500">UV</span></div>
            <p className="text-sm font-bold text-yellow-400">{hour.uvIndex != null ? Math.round(hour.uvIndex) : "—"}</p>
            {hour.uvIndex != null && (
              <p className="text-[10px] text-slate-500 mt-0.5">
                {hour.uvIndex <= 2 ? "Faible" : hour.uvIndex <= 5 ? "Modéré" : hour.uvIndex <= 7 ? "Élevé" : hour.uvIndex <= 10 ? "Très élevé" : "Extrême"}
              </p>
            )}
          </div>

          {/* Nébulosité */}
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
  const COL_W = 76;
  const CHART_H = 300;
  const ICON_ROW = 0;
  const LABEL_ROW = 0;
  const PAD_T = 82;
  const TOTAL_H = CHART_H + ICON_ROW + LABEL_ROW;
  const scrollableW = COL_W * N;

  // Scales
  const { scaleTop, scaleBot, scaleRange, gridStep } = getChartTemperatureScale(hours.map(h => h.temp), 2);

  const maxPrecip = Math.max(...hours.map(h => h.precipitation ?? 0), 1);
  const maxWind = Math.max(...hours.map(h => h.windSpeed ?? 0), 5);
  const windScaleTop = Math.ceil(maxWind / 5) * 5;
  const precipScaleTop = Math.ceil(maxPrecip * 10) / 10;
  // Zone allocation: temp 55%, wind 20%, precip 20%
  const tempZoneTop = PAD_T;
  const tempZoneBot = PAD_T + (CHART_H - PAD_T) * 0.55;
  const windZoneTop = tempZoneBot + 4;
  const windZoneBot = windZoneTop + (CHART_H - PAD_T) * 0.20;
  const precipZoneTop = windZoneBot + 2;
  const precipZoneBot = CHART_H - 2;

  const tempToY = useCallback((t: number) => tempZoneTop + (1 - (t - scaleBot) / scaleRange) * (tempZoneBot - tempZoneTop), [scaleBot, scaleRange, tempZoneTop, tempZoneBot]);
  const colX = useCallback((i: number) => i * COL_W + COL_W / 2, []);

  // Current hour index
  const nowHour = useMemo(() => {
    const h = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).slice(0, 2) + ":00";
    return hours.findIndex(hr => hr.hour === h);
  }, [hours]);

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

    // Clear reading bands: temperatures, wind, then precipitation.
    [windZoneTop - 3, precipZoneTop - 3].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(scrollableW, y);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.26)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Current hour highlight
    if (nowHour >= 0 && nowHour < N) {
      const x = nowHour * COL_W;
      const g = ctx.createLinearGradient(x, 0, x + COL_W, 0);
      g.addColorStop(0, "rgba(37, 99, 235, 0)");
      g.addColorStop(0.5, "rgba(37, 99, 235, 0.16)");
      g.addColorStop(1, "rgba(37, 99, 235, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, COL_W, TOTAL_H);
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
      ctx.save();
      ctx.strokeStyle = "rgba(249, 115, 22, 0.45)";
      ctx.lineWidth = 5;
      ctx.shadowColor = "#f97316";
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "#fb923c";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Points + température affichée à chaque heure
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
      ctx.fillStyle = nowHour === i ? "#a5b4fc" : "#fdba74";
      ctx.font = `bold ${sel ? 12 : 10}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(`${v.toFixed(1)}°`, pt.x, pt.y - 10);
    });

    // Ressenti : ligne continue avec un décalage visuel de 3 px pour distinguer
    // deux valeurs proches sans modifier les valeurs textuelles ni l’échelle.
    const apparentPts = hours.slice(0, visibleN).map((h, i) => ({ x: colX(i), y: tempToY(h.apparentTemp ?? h.temp ?? 0) + 3 }));
    if (apparentPts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(apparentPts[0].x, apparentPts[0].y);
      for (let i = 1; i < apparentPts.length; i++) {
        const cpx = (apparentPts[i - 1].x + apparentPts[i].x) / 2;
        ctx.bezierCurveTo(cpx, apparentPts[i - 1].y, cpx, apparentPts[i].y, apparentPts[i].x, apparentPts[i].y);
      }
      ctx.save();
      ctx.strokeStyle = "rgba(96, 165, 250, 0.35)";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#60a5fa";
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "#93c5fd";
      ctx.lineWidth = 1.7;
      ctx.stroke();
    }
    // Ressenti affiché à chaque heure, sous la température pour éviter le chevauchement.
    apparentPts.forEach((pt, i) => {
      const v = hours[i].apparentTemp;
      if (v == null) return;
      const sel = selectedHour === i;
      ctx.fillStyle = "#bfdbfe";
      ctx.font = `${sel ? "bold 11" : "9"}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(`${v.toFixed(1)}°`, pt.x, pt.y + 13);
    });

    // Wind readings by column (no wind curve).
    hours.slice(0, visibleN).forEach((h, i) => {
      const v = hours[i].windSpeed;
      if (v == null) return;
      const x = colX(i);
      const y = windZoneTop + 17;
      ctx.fillStyle = "#4ade80";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(v)} km/h`, x, y);
      const dir = hours[i].windDirection;
      if (dir != null) {
        ctx.fillStyle = "rgba(74, 222, 128, 0.78)";
        ctx.font = "10px system-ui";
        ctx.fillText(degToCompass(dir), x, y + 14);
      }
    });

    // Precipitation bars
    const precipLabelBand = 16;
    const precipBarTop = precipZoneTop + precipLabelBand;
    const precipH = precipZoneBot - precipBarTop;
    hours.slice(0, visibleN).forEach((h, i) => {
      const p = h.precipitation ?? 0;
      const x = colX(i);
      ctx.fillStyle = p > 0 ? "#93c5fd" : "rgba(147,197,253,0.66)";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      if (p <= 0) {
        ctx.fillText(p.toFixed(1), x, precipZoneBot - 5);
        return;
      }
      const barH = Math.max(3, (p / maxPrecip) * precipH);
      const barTop = precipZoneBot - barH;
      ctx.fillText(p.toFixed(1), x, barTop - 5);
      const barW = Math.min(COL_W * 0.5, 20);
      const g = ctx.createLinearGradient(0, precipZoneBot - barH, 0, precipZoneBot);
      g.addColorStop(0, "rgba(96, 165, 250, 0.9)");
      g.addColorStop(1, "rgba(37, 99, 235, 0.5)");
      ctx.fillStyle = g;
      ctx.fillRect(x - barW / 2, barTop, barW, barH);
    });

  }, [hours, N, selectedHour, animated, animProgress, scrollableW, TOTAL_H, CHART_H, ICON_ROW, COL_W, PAD_T, scaleBot, scaleTop, scaleRange, gridStep, maxPrecip, tempToY, colX, nowHour, tempZoneTop, tempZoneBot, windZoneTop, windZoneBot, precipZoneTop, precipZoneBot]);

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
    <section ref={containerRef} className="weather-chart-3d w-full rounded-[22px] border p-2 sm:p-3">
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-300/40 bg-blue-500/25 shadow-[0_0_18px_rgba(59,130,246,0.45)]"><Clock className="h-4 w-4 text-blue-200" /></span>
            <span>
              <span className="block text-base font-bold text-white">Heure par heure</span>
              <span className="block text-[11px] font-normal text-slate-400">Prévisions détaillées</span>
            </span>
          </h2>
          <span className="rounded-full border border-slate-500/45 bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-200">24h⌄</span>
        </div>
        {locationName && (
          <p className="text-[11px] text-primary/70 flex items-center gap-1 mt-0.5">
            <MapPin className="h-3 w-3" /> {locationName}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
          <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-4 rounded-full bg-orange-400 inline-block" /> Temp °C</span>
          <span className="flex items-center gap-1.5 text-blue-200"><span className="w-4 h-0 border-t-2 border-blue-300 inline-block" /> Ressenti</span>
          <span className="flex items-center gap-1.5 text-green-400"><span className="w-4 h-0 border-t-2 border-dashed border-green-400 inline-block" /> Vent km/h</span>
          <span className="flex items-center gap-1.5 text-blue-400"><span className="w-3 h-3.5 bg-blue-500/80 inline-block rounded-sm" /> Pluie mm</span>
        </div>
      </div>

      {/* Chart area */}
      <div className="overflow-hidden rounded-[16px] border border-slate-700/70 bg-[#05070a]" style={{ height: TOTAL_H }}>
        <div className="flex h-full">
          <HourlyScaleLabels totalHeight={TOTAL_H} tempTop={tempZoneTop} tempBottom={tempZoneBot} windTop={windZoneTop} windBottom={windZoneBot} precipTop={precipZoneTop} precipBottom={precipZoneBot} scaleTop={scaleTop} scaleBot={scaleBot} windMax={windScaleTop} precipMax={precipScaleTop} />
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto scrollbar-hide" style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
          <div className="relative" style={{ width: scrollableW, height: TOTAL_H }}>
            {/* En-tête de chaque créneau : heure + grande icône météo */}
            <div className="pointer-events-none absolute left-0 top-0 flex" style={{ height: 78, width: scrollableW }}>
              {hours.map((h, i) => {
                const cond = getConditionLabel(h.cloudCover, h.precipitation, h.condition);
                const isCurrent = i === nowHour;
                return (
                  <div key={h.hour} className="flex flex-col items-center justify-start pt-2" style={{ width: COL_W }}>
                    <span className={`text-[10px] font-semibold ${isCurrent ? "text-blue-100" : "text-slate-300"}`}>{h.hour}</span>
                    <span className="mt-1.5"><WeatherIconSVG condition={cond} size={31} /></span>
                  </div>
                );
              })}
            </div>
            <canvas ref={canvasRef} style={{ width: scrollableW, height: TOTAL_H, cursor: "pointer", display: "block" }} onClick={onClick} />
          </div>
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
              className="absolute h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-transform duration-150 group-hover:from-blue-500 group-hover:to-blue-300"
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
    </section>
  );
}
