import { useRef, useEffect, useState, useCallback } from "react";
import { TrendingUp, X, Thermometer, Wind, Droplets, Eye, Sun, Cloud } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DayData {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust: number | null;
  humidity: number | null;
  cloudCover: number | null;
  condition: string | null;
  stabilityIndex: number;
  stabilityLabel?: string;
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
  if (isToday) return { line1: "Auj.", line2: "" };
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

function getWeatherZone(condition: string | null, tempMax: number | null): { label: string; color: string } | null {
  const c = (condition ?? "").toLowerCase();
  if ((tempMax ?? 0) >= 30) return { label: "☀ Canicule", color: "rgba(251,146,60,0.18)" };
  if (c.includes("orage")) return { label: "⚡ Orage", color: "rgba(139,92,246,0.20)" };
  if (c.includes("neige")) return { label: "❄ Neige", color: "rgba(147,197,253,0.20)" };
  return null;
}

// ─── SVG Weather Icons ────────────────────────────────────────────────────────
function WeatherIconSVG({ condition, size = 28 }: { condition: string | null; size?: number }) {
  const c = (condition ?? "").toLowerCase();
  const s = size;

  if (c.includes("orage")) {
    return (
      <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
        <path d="M10 30c0-8 6-14 14-14 6 0 11 4 13 9 4 1 7 4 7 8 0 5-4 8-9 8H12c-5 0-8-3-8-7 0-3 2-5 6-4z" fill="#94a3b8" opacity="0.9"/>
        <path d="M22 34l-4 8h5l-3 6 10-10h-6l4-4z" fill="#fbbf24"/>
      </svg>
    );
  }
  if (c.includes("neige")) {
    return (
      <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
        <path d="M10 28c0-8 6-14 14-14 6 0 11 4 13 9 4 1 7 4 7 8 0 5-4 8-9 8H12c-5 0-8-3-8-7 0-3 2-5 6-4z" fill="#cbd5e1" opacity="0.9"/>
        <circle cx="16" cy="40" r="2" fill="#93c5fd"/>
        <circle cx="24" cy="42" r="2" fill="#93c5fd"/>
        <circle cx="32" cy="40" r="2" fill="#93c5fd"/>
      </svg>
    );
  }
  if (c.includes("pluie") || c.includes("averse") || c.includes("bruine")) {
    return (
      <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
        <path d="M10 26c0-8 6-14 14-14 6 0 11 4 13 9 4 1 7 4 7 8 0 5-4 8-9 8H12c-5 0-8-3-8-7 0-3 2-5 6-4z" fill="#64748b" opacity="0.9"/>
        <line x1="16" y1="36" x2="14" y2="44" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="24" y1="36" x2="22" y2="44" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="32" y1="36" x2="30" y2="44" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    );
  }
  if (c.includes("brouillard")) {
    return (
      <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
        <line x1="8" y1="20" x2="40" y2="20" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round"/>
        <line x1="12" y1="28" x2="36" y2="28" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round"/>
        <line x1="8" y1="36" x2="40" y2="36" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round"/>
      </svg>
    );
  }
  if (c.includes("couvert")) {
    return (
      <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
        <path d="M8 30c0-10 8-18 18-18 8 0 15 5 17 12 5 1 9 5 9 10 0 6-5 10-11 10H10c-6 0-10-4-10-9 0-4 3-7 7-8z" fill="#6b7280" opacity="0.9"/>
      </svg>
    );
  }
  if (c.includes("partiellement") || c.includes("nuageux")) {
    return (
      <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
        <circle cx="18" cy="20" r="10" fill="#fbbf24" opacity="0.9"/>
        <path d="M16 30c0-8 6-14 14-14 6 0 11 4 13 9 4 1 7 4 7 8 0 5-4 8-9 8H18c-5 0-8-3-8-7 0-3 2-5 6-4z" fill="#9ca3af" opacity="0.9"/>
      </svg>
    );
  }
  // Ensoleillé
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="10" fill="#fbbf24"/>
      {[0,45,90,135,180,225,270,315].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 24 + 14 * Math.cos(rad);
        const y1 = 24 + 14 * Math.sin(rad);
        const x2 = 24 + 20 * Math.cos(rad);
        const y2 = 24 + 20 * Math.sin(rad);
        return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>;
      })}
    </svg>
  );
}

// ─── Wind Arrow ───────────────────────────────────────────────────────────────
function WindArrow({ direction }: { direction?: number }) {
  // direction: 0=N, 90=E, 180=S, 270=W
  const deg = direction ?? 0;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ transform: `rotate(${deg}deg)`, display: "inline-block" }}>
      <path d="M7 1 L10 10 L7 8 L4 10 Z" fill="#4ade80"/>
    </svg>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function DayDetailPanel({ day, onClose }: { day: DayData; onClose: () => void }) {
  const condition = day.condition ?? wmoToCondition(null, day.cloudCover, day.precipitation);
  const { line1, line2 } = formatDate(day.date);

  const stabilityColor = day.stabilityIndex >= 80 ? "text-green-400"
    : day.stabilityIndex >= 60 ? "text-yellow-400"
    : day.stabilityIndex >= 40 ? "text-orange-400"
    : "text-red-400";

  // Derive morning/afternoon/evening from condition + cloudCover
  const morningCloud = Math.max(0, (day.cloudCover ?? 50) - 15);
  const afternoonCloud = day.cloudCover ?? 50;
  const eveningCloud = Math.min(100, (day.cloudCover ?? 50) + 10);
  const morningCond = wmoToCondition(null, morningCloud, 0);
  const afternoonCond = condition;
  const eveningCond = wmoToCondition(null, eveningCloud, (day.precipitation ?? 0) * 0.3);

  return (
    <div className="mt-2 rounded-xl border border-border bg-card/90 backdrop-blur-sm p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WeatherIconSVG condition={condition} size={32} />
          <div>
            <p className="font-semibold text-sm">{line1} {line2}</p>
            <p className="text-xs text-muted-foreground">{condition}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Températures */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-muted/40 rounded-lg p-2.5 flex items-center gap-2">
          <Thermometer className="h-4 w-4 text-orange-400 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Max / Min</p>
            <p className="text-sm font-bold"><span className="text-orange-400">{day.tempMax ?? "—"}°</span> / <span className="text-blue-400">{day.tempMin ?? "—"}°</span></p>
          </div>
        </div>
        <div className="bg-muted/40 rounded-lg p-2.5 flex items-center gap-2">
          <Droplets className="h-4 w-4 text-blue-400 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Précipitations</p>
            <p className="text-sm font-bold text-blue-400">{(day.precipitation ?? 0) > 0 ? `${day.precipitation} mm` : "0 mm"}</p>
          </div>
        </div>
        <div className="bg-muted/40 rounded-lg p-2.5 flex items-center gap-2">
          <Wind className="h-4 w-4 text-green-400 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Vent / Rafales</p>
            <p className="text-sm font-bold">{day.windSpeed ?? "—"} <span className="text-xs font-normal">km/h</span> {day.windGust ? <span className="text-orange-400">↑{day.windGust}</span> : ""}</p>
          </div>
        </div>
        <div className="bg-muted/40 rounded-lg p-2.5 flex items-center gap-2">
          <Eye className="h-4 w-4 text-cyan-400 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Humidité</p>
            <p className="text-sm font-bold text-cyan-400">{day.humidity != null ? `${Math.round(day.humidity)}%` : "—"}</p>
          </div>
        </div>
        <div className="bg-muted/40 rounded-lg p-2.5 flex items-center gap-2">
          <Cloud className="h-4 w-4 text-slate-400 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Couverture nuageuse</p>
            <p className="text-sm font-bold">{day.cloudCover != null ? `${Math.round(day.cloudCover)}%` : "—"}</p>
          </div>
        </div>
        <div className="bg-muted/40 rounded-lg p-2.5 flex items-center gap-2">
          <Sun className="h-4 w-4 text-yellow-400 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Confiance</p>
            <p className={`text-sm font-bold ${stabilityColor}`}>{day.stabilityIndex}%</p>
          </div>
        </div>
      </div>

      {/* Matin / Après-midi / Soir */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5 font-medium">Conditions dans la journée</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: "Matin", cond: morningCond, icon: morningCond },
            { label: "Après-midi", cond: afternoonCond, icon: afternoonCond },
            { label: "Soir", cond: eveningCond, icon: eveningCond },
          ].map(({ label, cond }) => (
            <div key={label} className="bg-muted/30 rounded-lg p-2 text-center">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <div className="flex justify-center mb-1">
                <WeatherIconSVG condition={cond} size={22} />
              </div>
              <p className="text-xs leading-tight">{cond}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Chart Component ─────────────────────────────────────────────────────
export default function FifteenDayChart({ days, locationName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);

  // Canvas dimensions
  const CHART_HEIGHT = 200; // area for temp curves + wind line
  const PRECIP_HEIGHT = 48; // precipitation bars
  const ICON_HEIGHT = 36;   // weather icons row
  const LABEL_HEIGHT = 36;  // date labels
  const TOTAL_HEIGHT = CHART_HEIGHT + PRECIP_HEIGHT + ICON_HEIGHT + LABEL_HEIGHT;
  const PADDING_LEFT = 36;
  const PADDING_RIGHT = 12;
  const PADDING_TOP = 28;
  const PADDING_BOTTOM = 8;

  const displayDays = days.slice(0, 15);
  const N = displayDays.length;

  // Compute column width
  const colWidth = N > 0 ? (canvasWidth - PADDING_LEFT - PADDING_RIGHT) / N : 0;

  // Temperature range
  const allMax = displayDays.map(d => d.tempMax ?? 0).filter(v => v != null);
  const allMin = displayDays.map(d => d.tempMin ?? 0).filter(v => v != null);
  const allWind = displayDays.map(d => d.windSpeed ?? 0).filter(v => v != null);
  const tMax = allMax.length > 0 ? Math.max(...allMax) : 35;
  const tMin = allMin.length > 0 ? Math.min(...allMin) : 5;
  const tRange = Math.max(tMax - tMin + 8, 20);
  const tPadded = tMin - 4;

  const maxPrecip = Math.max(...displayDays.map(d => d.precipitation ?? 0), 1);
  const maxWind = Math.max(...allWind, 10);

  // Map temperature to Y coordinate within chart area
  const tempToY = useCallback((temp: number) => {
    return PADDING_TOP + CHART_HEIGHT - PADDING_BOTTOM - ((temp - tPadded) / tRange) * (CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM);
  }, [tPadded, tRange, CHART_HEIGHT, PADDING_TOP, PADDING_BOTTOM]);

  // Map wind to Y coordinate (lower portion of chart area)
  const windToY = useCallback((wind: number) => {
    const windAreaTop = PADDING_TOP + (CHART_HEIGHT - PADDING_BOTTOM) * 0.55;
    const windAreaBottom = CHART_HEIGHT - PADDING_BOTTOM;
    return windAreaTop + (1 - wind / maxWind) * (windAreaBottom - windAreaTop);
  }, [maxWind, CHART_HEIGHT, PADDING_TOP, PADDING_BOTTOM]);

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

    // Background
    ctx.fillStyle = "transparent";
    ctx.clearRect(0, 0, canvasWidth, TOTAL_HEIGHT);

    // ── Contextual zone backgrounds ──────────────────────────────────────────
    let zoneStart = -1;
    let zoneColor = "";
    let zoneLabel = "";
    for (let i = 0; i <= N; i++) {
      const day = displayDays[i];
      const zone = day ? getWeatherZone(day.condition, day.tempMax) : null;
      const currentColor = zone?.color ?? "";
      if (currentColor !== zoneColor) {
        if (zoneColor && zoneStart >= 0) {
          const x1 = colX(zoneStart) - colWidth / 2;
          const x2 = colX(i - 1) + colWidth / 2;
          ctx.fillStyle = zoneColor;
          ctx.fillRect(x1, PADDING_TOP, x2 - x1, CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM);
          // Zone label
          if (zoneLabel) {
            ctx.fillStyle = zoneColor.includes("251,146") ? "#fb923c" : "#a78bfa";
            ctx.font = "bold 10px system-ui";
            ctx.fillText(zoneLabel, x1 + 4, PADDING_TOP + 12);
          }
        }
        zoneStart = i;
        zoneColor = currentColor;
        zoneLabel = zone?.label ?? "";
      }
    }

    // ── Grid lines ───────────────────────────────────────────────────────────
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let t = Math.ceil(tPadded / 4) * 4; t <= tMax + 4; t += 4) {
      const y = tempToY(t);
      if (y < PADDING_TOP || y > CHART_HEIGHT - PADDING_BOTTOM) continue;
      ctx.beginPath();
      ctx.moveTo(PADDING_LEFT, y);
      ctx.lineTo(canvasWidth - PADDING_RIGHT, y);
      ctx.stroke();
      // Y axis labels
      ctx.fillStyle = "rgba(156,163,175,0.8)";
      ctx.font = "10px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(`${t}°`, PADDING_LEFT - 3, y + 3);
    }

    // ── Selected day highlight ────────────────────────────────────────────────
    if (selectedDay !== null && selectedDay < N) {
      const x = colX(selectedDay);
      ctx.fillStyle = "rgba(99,102,241,0.12)";
      ctx.fillRect(x - colWidth / 2, 0, colWidth, TOTAL_HEIGHT);
    }

    // ── Max temperature area fill ─────────────────────────────────────────────
    const maxPoints = displayDays.map((d, i) => ({ x: colX(i), y: tempToY(d.tempMax ?? tPadded) }));
    const minPoints = displayDays.map((d, i) => ({ x: colX(i), y: tempToY(d.tempMin ?? tPadded) }));

    ctx.beginPath();
    ctx.moveTo(maxPoints[0].x, maxPoints[0].y);
    for (let i = 1; i < maxPoints.length; i++) {
      const cp = { x: (maxPoints[i - 1].x + maxPoints[i].x) / 2, y: (maxPoints[i - 1].y + maxPoints[i].y) / 2 };
      ctx.quadraticCurveTo(maxPoints[i - 1].x, maxPoints[i - 1].y, cp.x, cp.y);
    }
    ctx.lineTo(maxPoints[maxPoints.length - 1].x, maxPoints[maxPoints.length - 1].y);
    for (let i = minPoints.length - 1; i >= 0; i--) {
      ctx.lineTo(minPoints[i].x, minPoints[i].y);
    }
    ctx.closePath();
    const areaGrad = ctx.createLinearGradient(0, PADDING_TOP, 0, CHART_HEIGHT);
    areaGrad.addColorStop(0, "rgba(249,115,22,0.15)");
    areaGrad.addColorStop(0.5, "rgba(96,165,250,0.08)");
    areaGrad.addColorStop(1, "rgba(96,165,250,0.02)");
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // ── Max temperature curve ─────────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(maxPoints[0].x, maxPoints[0].y);
    for (let i = 1; i < maxPoints.length; i++) {
      const cp = { x: (maxPoints[i - 1].x + maxPoints[i].x) / 2, y: (maxPoints[i - 1].y + maxPoints[i].y) / 2 };
      ctx.quadraticCurveTo(maxPoints[i - 1].x, maxPoints[i - 1].y, cp.x, cp.y);
    }
    ctx.lineTo(maxPoints[maxPoints.length - 1].x, maxPoints[maxPoints.length - 1].y);
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Max dots + labels
    maxPoints.forEach((pt, i) => {
      const val = displayDays[i].tempMax;
      if (val == null) return;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, selectedDay === i ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#f97316";
      ctx.fill();
      ctx.fillStyle = "#f97316";
      ctx.font = `bold ${selectedDay === i ? 11 : 10}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(val)}`, pt.x, pt.y - 7);
    });

    // ── Min temperature curve ─────────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(minPoints[0].x, minPoints[0].y);
    for (let i = 1; i < minPoints.length; i++) {
      const cp = { x: (minPoints[i - 1].x + minPoints[i].x) / 2, y: (minPoints[i - 1].y + minPoints[i].y) / 2 };
      ctx.quadraticCurveTo(minPoints[i - 1].x, minPoints[i - 1].y, cp.x, cp.y);
    }
    ctx.lineTo(minPoints[minPoints.length - 1].x, minPoints[minPoints.length - 1].y);
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Min dots + labels
    minPoints.forEach((pt, i) => {
      const val = displayDays[i].tempMin;
      if (val == null) return;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, selectedDay === i ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = "#60a5fa";
      ctx.fill();
      ctx.fillStyle = "#93c5fd";
      ctx.font = `${selectedDay === i ? 10 : 9}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(val)}`, pt.x, pt.y + 14);
    });

    // ── Wind dashed line ──────────────────────────────────────────────────────
    const windPoints = displayDays.map((d, i) => ({ x: colX(i), y: windToY(d.windSpeed ?? 0) }));
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.moveTo(windPoints[0].x, windPoints[0].y);
    for (let i = 1; i < windPoints.length; i++) {
      ctx.lineTo(windPoints[i].x, windPoints[i].y);
    }
    ctx.strokeStyle = "#4ade80";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // Wind values + arrows
    windPoints.forEach((pt, i) => {
      const val = displayDays[i].windSpeed;
      if (val == null) return;
      ctx.fillStyle = "#4ade80";
      ctx.font = "9px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(val)}`, pt.x, pt.y - 5);
      // Arrow →
      ctx.fillStyle = "#4ade80";
      ctx.font = "10px system-ui";
      ctx.fillText("→", pt.x, pt.y + 8);
    });

    // ── Precipitation bars ────────────────────────────────────────────────────
    const precipY = CHART_HEIGHT;
    const precipBarMaxH = PRECIP_HEIGHT - 12;
    displayDays.forEach((d, i) => {
      const precip = d.precipitation ?? 0;
      const barH = precip > 0 ? Math.max(4, (precip / maxPrecip) * precipBarMaxH) : 0;
      const x = colX(i);
      const barW = Math.min(colWidth * 0.55, 18);

      if (barH > 0) {
        ctx.fillStyle = selectedDay === i ? "#93c5fd" : "#60a5fa";
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.roundRect(x - barW / 2, precipY + PRECIP_HEIGHT - barH - 12, barW, barH, [2, 2, 0, 0]);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = "#93c5fd";
        ctx.font = "9px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(`${precip}`, x, precipY + PRECIP_HEIGHT - barH - 14);
      } else {
        // Show 0 faintly
        ctx.fillStyle = "rgba(156,163,175,0.4)";
        ctx.font = "9px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("0", x, precipY + PRECIP_HEIGHT - 14);
      }
    });

    // ── Date labels ───────────────────────────────────────────────────────────
    const labelY = CHART_HEIGHT + PRECIP_HEIGHT + ICON_HEIGHT;
    displayDays.forEach((d, i) => {
      const { line1, line2 } = formatDate(d.date);
      const x = colX(i);
      const isToday = d.date === new Date().toISOString().slice(0, 10);
      ctx.fillStyle = isToday ? "#818cf8" : selectedDay === i ? "#e2e8f0" : "rgba(156,163,175,0.9)";
      ctx.font = `${isToday ? "bold " : ""}10px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(line1, x, labelY + 12);
      if (line2) {
        ctx.font = "9px system-ui";
        ctx.fillStyle = isToday ? "#818cf8" : "rgba(107,114,128,0.8)";
        ctx.fillText(line2, x, labelY + 23);
      }
    });

  }, [canvasWidth, displayDays, selectedDay, N, colX, colWidth, tempToY, windToY, tPadded, tMax, tRange, maxPrecip, maxWind, CHART_HEIGHT, PRECIP_HEIGHT, ICON_HEIGHT, LABEL_HEIGHT, TOTAL_HEIGHT, PADDING_LEFT, PADDING_RIGHT, PADDING_TOP, PADDING_BOTTOM]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      setCanvasWidth(w);
    });
    ro.observe(container);
    setCanvasWidth(container.clientWidth);
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
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block rounded" /> Max °C</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block rounded" /> Min °C</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 border-t-2 border-dashed border-green-400 inline-block" /> Vent</span>
        </div>
      </div>

      {/* Canvas wrapper */}
      <div ref={containerRef} className="w-full relative" style={{ minHeight: TOTAL_HEIGHT }}>
        {/* Weather icons row — rendered as HTML over canvas */}
        {canvasWidth > 0 && N > 0 && (
          <div
            className="absolute left-0 right-0 flex"
            style={{ top: CHART_HEIGHT + PRECIP_HEIGHT, height: ICON_HEIGHT, paddingLeft: PADDING_LEFT, paddingRight: PADDING_RIGHT }}
          >
            {displayDays.map((d, i) => {
              const cond = d.condition ?? wmoToCondition(null, d.cloudCover, d.precipitation);
              return (
                <div
                  key={d.date}
                  className="flex items-center justify-center cursor-pointer"
                  style={{ width: colWidth, flexShrink: 0 }}
                  onClick={() => setSelectedDay(prev => prev === i ? null : i)}
                >
                  <WeatherIconSVG condition={cond} size={Math.min(28, colWidth * 0.7)} />
                </div>
              );
            })}
          </div>
        )}

        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: TOTAL_HEIGHT, cursor: "pointer", display: "block" }}
          onClick={handleCanvasClick}
        />
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
