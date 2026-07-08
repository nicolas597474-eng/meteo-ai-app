import { trpc } from "@/lib/trpc";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from "recharts";
import {
  Droplets, Wind, Thermometer, Activity, MapPin, Clock, TrendingUp, Eye
} from "lucide-react";

// ─── Weather condition icons (SVG inline) ────────────────────────────────────
function WeatherIcon({ condition, size = 32 }: { condition: string | null; size?: number }) {
  const c = (condition ?? "").toLowerCase();
  const s = size;

  if (c.includes("orage")) return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M12 28c0-10 8-18 18-18 8 0 15 5 17 12 5 1 9 5 9 10 0 6-5 10-11 10H14c-6 0-10-4-10-9 0-4 3-7 7-8z" fill="#6b7280" opacity="0.8"/>
      <path d="M36 34l-8 14h6l-4 10 14-18h-8l6-6z" fill="#fbbf24"/>
    </svg>
  );
  if (c.includes("pluie forte") || c.includes("averses")) return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M12 28c0-10 8-18 18-18 8 0 15 5 17 12 5 1 9 5 9 10 0 6-5 10-11 10H14c-6 0-10-4-10-9 0-4 3-7 7-8z" fill="#6b7280" opacity="0.8"/>
      <line x1="20" y1="48" x2="16" y2="58" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round"/>
      <line x1="30" y1="48" x2="26" y2="58" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round"/>
      <line x1="40" y1="48" x2="36" y2="58" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round"/>
      <line x1="50" y1="48" x2="46" y2="58" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
  if (c.includes("pluie légère") || c.includes("bruine")) return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M12 28c0-10 8-18 18-18 8 0 15 5 17 12 5 1 9 5 9 10 0 6-5 10-11 10H14c-6 0-10-4-10-9 0-4 3-7 7-8z" fill="#9ca3af" opacity="0.7"/>
      <line x1="24" y1="48" x2="22" y2="56" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="34" y1="48" x2="32" y2="56" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="44" y1="48" x2="42" y2="56" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
  if (c.includes("couvert")) return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M8 34c0-10 8-18 18-18 8 0 15 5 17 12 5 1 9 5 9 10 0 6-5 10-11 10H10c-6 0-10-4-10-9 0-4 3-7 8-5z" fill="#6b7280" opacity="0.9"/>
    </svg>
  );
  if (c.includes("nuageux") && !c.includes("partiellement")) return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="22" cy="26" r="8" fill="#fbbf24" opacity="0.6"/>
      <path d="M16 34c0-8 6-14 14-14 6 0 11 4 13 9 4 1 7 4 7 8 0 5-4 8-9 8H18c-5 0-8-3-8-7 0-3 2-5 6-4z" fill="#9ca3af" opacity="0.85"/>
    </svg>
  );
  if (c.includes("partiellement")) return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="20" cy="24" r="10" fill="#fbbf24" opacity="0.9"/>
      <path d="M22 36c0-7 5-13 12-13 5 0 10 3 11 8 3 0 6 3 6 7 0 4-3 7-8 7H24c-4 0-7-3-7-6 0-2 2-4 5-3z" fill="#d1d5db" opacity="0.9"/>
    </svg>
  );
  // Ensoleillé / default
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="12" fill="#fbbf24"/>
      {[0,45,90,135,180,225,270,315].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 32 + 16 * Math.cos(rad);
        const y1 = 32 + 16 * Math.sin(rad);
        const x2 = 32 + 22 * Math.cos(rad);
        const y2 = 32 + 22 * Math.sin(rad);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fbbf24" strokeWidth="3" strokeLinecap="round"/>;
      })}
    </svg>
  );
}

function getStabilityColor(index: number) {
  if (index >= 80) return "text-emerald-400";
  if (index >= 60) return "text-yellow-400";
  if (index >= 40) return "text-orange-400";
  return "text-red-400";
}

function getStabilityBg(index: number) {
  if (index >= 80) return "bg-emerald-500/10 border-emerald-500/20";
  if (index >= 60) return "bg-yellow-500/10 border-yellow-500/20";
  if (index >= 40) return "bg-orange-500/10 border-orange-500/20";
  return "bg-red-500/10 border-red-500/20";
}

function formatDayLabel(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00");
  const today = new Date().toLocaleDateString("en-CA");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString("en-CA");
  if (dateStr === today) return "Auj.";
  if (dateStr === tomorrowStr) return "Dem.";
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

function formatDayFull(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00");
  const today = new Date().toLocaleDateString("en-CA");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString("en-CA");
  if (dateStr === today) return "Aujourd'hui";
  if (dateStr === tomorrowStr) return "Demain";
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
}

// Custom tooltip for the 15-day chart
function TempTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-sm shadow-lg">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name === "Max" ? "↑" : "↓"} {p.value}°C
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data: dashData, isLoading: dashLoading, isError: dashError } = trpc.weather.getDashboard.useQuery();
  const { data: forecast15, isLoading: forecastLoading, isError: forecastError } = trpc.weather.get15DayForecast.useQuery();
  const { data: hourlyData, isLoading: hourlyLoading } = trpc.weather.getHourlyForecast.useQuery();

  if (dashLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="container">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-72 bg-muted rounded-xl" />
            <div className="h-52 bg-muted rounded-2xl" />
            <div className="h-40 bg-muted rounded-2xl" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-36 bg-muted rounded-xl" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (dashError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8 text-center max-w-md">
          <Activity className="h-12 w-12 mx-auto text-red-400 mb-4" />
          <h2 className="text-xl font-semibold text-red-400 mb-2">Erreur de chargement</h2>
          <p className="text-muted-foreground">Impossible de charger les prévisions. Veuillez rafraîchir la page.</p>
        </div>
      </div>
    );
  }

  const meteoAI = dashData?.meteoAI;
  const topServices = dashData?.topServices ?? [];
  const days = forecast15?.days ?? [];
  const todayForecast = days[0] ?? null;
  const futureDays = days.slice(1);
  const hours = hourlyData?.hours ?? [];

  // Chart data for 15-day temperature
  const chartData = days.map(d => ({
    name: formatDayLabel(d.date),
    Max: d.tempMax,
    Min: d.tempMin,
    Précip: d.precipitation,
  }));

  // Current hour highlight
  const nowHour = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const currentHourStr = nowHour.slice(0, 2) + ":00";

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 space-y-8">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
              MeteoAI
            </h1>
            <div className="flex items-center gap-2 mt-1.5 text-muted-foreground text-sm">
              <MapPin className="h-3.5 w-3.5" />
              <span>Hondeghem, Nord — 50.76°N, 2.52°E</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-lg px-3 py-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>{dashData?.today}</span>
          </div>
        </div>

        {/* ── Today's Hero Card ── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-6">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-blue-600/10 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-5">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Prévision MeteoAI — Aujourd'hui</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {forecast15?.modelsUsed?.length ?? 0} modèles · {forecast15?.modelsUsed?.join(", ")}
              </span>
            </div>

            <div className="flex items-center gap-8">
              {/* Big icon + temp */}
              <div className="flex flex-col items-center gap-2">
                <WeatherIcon condition={todayForecast?.condition ?? meteoAI?.condition ?? null} size={72} />
                <p className="text-5xl font-bold">
                  {todayForecast?.tempMax ?? meteoAI?.tempMax ?? "—"}°
                </p>
                <p className="text-lg text-muted-foreground">
                  min {todayForecast?.tempMin ?? meteoAI?.tempMin ?? "—"}°C
                </p>
              </div>

              {/* Divider */}
              <div className="h-28 w-px bg-border" />

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-x-10 gap-y-4 flex-1">
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-0.5">
                    <Droplets className="h-3.5 w-3.5" /> Précipitations
                  </p>
                  <p className="text-xl font-semibold">{todayForecast?.precipitation ?? meteoAI?.precipitation ?? 0} mm</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-0.5">
                    <Wind className="h-3.5 w-3.5" /> Vent max
                  </p>
                  <p className="text-xl font-semibold">{todayForecast?.windSpeed ?? meteoAI?.windSpeed ?? "—"} km/h</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-0.5">
                    <Wind className="h-3.5 w-3.5 opacity-60" /> Rafales
                  </p>
                  <p className="text-xl font-semibold">{todayForecast?.windGust ?? "—"} km/h</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-0.5">
                    <Droplets className="h-3.5 w-3.5 opacity-60" /> Humidité
                  </p>
                  <p className="text-xl font-semibold">{todayForecast?.humidity ?? "—"}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-0.5">
                    <Eye className="h-3.5 w-3.5" /> Nébulosité
                  </p>
                  <p className="text-xl font-semibold">{todayForecast?.cloudCover ?? "—"}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-0.5">
                    <Activity className="h-3.5 w-3.5" /> Fiabilité
                  </p>
                  <p className={`text-xl font-semibold ${getStabilityColor(todayForecast?.stabilityIndex ?? meteoAI?.stabilityIndex ?? 0)}`}>
                    {todayForecast?.stabilityIndex ?? meteoAI?.stabilityIndex ?? 0}/100
                  </p>
                </div>
              </div>

              {/* Condition label */}
              <div className="text-right">
                <p className="text-2xl font-semibold">{todayForecast?.condition ?? meteoAI?.condition ?? "—"}</p>
                {meteoAI?.explanation && (
                  <p className="text-xs text-muted-foreground mt-2 max-w-48">{meteoAI.explanation}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Hourly Forecast ── */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Prévisions heure par heure
          </h2>
          {hourlyLoading ? (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="animate-pulse flex-shrink-0 w-20 h-28 bg-muted rounded-xl" />
              ))}
            </div>
          ) : hours.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {hours.map((h) => {
                const isCurrent = h.hour === currentHourStr;
                return (
                  <div
                    key={h.hour}
                    className={`flex-shrink-0 w-20 rounded-xl p-3 text-center border transition-all ${
                      isCurrent
                        ? "bg-primary/20 border-primary/40 ring-1 ring-primary/30"
                        : "bg-card border-border hover:border-primary/30"
                    }`}
                  >
                    <p className={`text-xs font-medium mb-2 ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>
                      {h.hour}
                    </p>
                    <div className="flex justify-center mb-2">
                      <WeatherIcon condition={h.condition} size={28} />
                    </div>
                    <p className="text-sm font-bold">{h.temp != null ? `${h.temp}°` : "—"}</p>
                    {(h.precipitation ?? 0) > 0 && (
                      <p className="text-xs text-blue-400 mt-0.5">{h.precipitation}mm</p>
                    )}
                    {h.windSpeed != null && (
                      <p className="text-xs text-muted-foreground mt-0.5">{h.windSpeed}km/h</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Prévisions horaires indisponibles.</p>
          )}
        </div>

        {/* ── 15-day Temperature Chart ── */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Températures sur 15 jours
            </h2>
            {forecastError && <span className="text-xs text-red-400">Erreur de chargement</span>}
          </div>
          {forecastLoading ? (
            <div className="h-48 bg-muted rounded-xl animate-pulse" />
          ) : chartData.length > 0 ? (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="maxGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="minGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} unit="°" />
                  <Tooltip content={<TempTooltip />} />
                  <Area type="monotone" dataKey="Max" stroke="#f97316" strokeWidth={2} fill="url(#maxGrad)" dot={false} />
                  <Area type="monotone" dataKey="Min" stroke="#60a5fa" strokeWidth={2} fill="url(#minGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {/* Precipitation mini-bar */}
          {chartData.some(d => (d.Précip ?? 0) > 0) && (
            <div style={{ height: 60 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} unit="mm" />
                  <Tooltip formatter={(v: any) => [`${v} mm`, "Précip."]} />
                  <Bar dataKey="Précip" fill="#60a5fa" opacity={0.7} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── 15-day Cards ── */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Prévisions sur 15 jours
            <span className="text-xs text-muted-foreground font-normal ml-1">
              Sources : {forecast15?.modelsUsed?.join(", ")}
            </span>
          </h2>
          {forecastLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="animate-pulse h-44 bg-muted rounded-xl" />
              ))}
            </div>
          ) : futureDays.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {futureDays.map((day) => (
                <div
                  key={day.date}
                  className={`rounded-xl p-4 border transition-all hover:scale-[1.02] hover:shadow-lg ${getStabilityBg(day.stabilityIndex)}`}
                >
                  <p className="text-xs font-semibold text-muted-foreground mb-2">{formatDayFull(day.date)}</p>
                  <div className="flex items-center gap-2 mb-3">
                    <WeatherIcon condition={day.condition} size={36} />
                    <div>
                      <p className="text-lg font-bold leading-none">{day.tempMax}°</p>
                      <p className="text-xs text-muted-foreground">{day.tempMin}°C</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2 truncate">{day.condition}</p>
                  <div className="space-y-1 text-xs">
                    {(day.precipitation ?? 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-blue-400 flex items-center gap-1"><Droplets className="h-3 w-3" />Précip</span>
                        <span className="text-blue-400 font-medium">{day.precipitation}mm</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1"><Wind className="h-3 w-3" />Vent</span>
                      <span>{day.windSpeed}km/h</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-border/40">
                      <span className="text-muted-foreground">Fiabilité</span>
                      <span className={`font-bold ${getStabilityColor(day.stabilityIndex)}`}>{day.stabilityIndex}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <p className="text-muted-foreground text-sm">Prévisions en cours de chargement...</p>
            </div>
          )}
        </div>

        {/* ── Top Models ── */}
        {topServices.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Classement des modèles (fiabilité historique)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {topServices.map((service, i) => (
                <div key={service.serviceName} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-background/60 border border-border">
                  <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    i === 0 ? "bg-yellow-500/20 text-yellow-400" :
                    i === 1 ? "bg-gray-400/20 text-gray-300" :
                    i === 2 ? "bg-orange-600/20 text-orange-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{service.serviceName}</p>
                    <p className="text-xs font-mono text-primary">{(service.avgScore ?? 0).toFixed(1)}/100</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
