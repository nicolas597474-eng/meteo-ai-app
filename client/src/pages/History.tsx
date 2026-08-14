import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Calendar, BarChart3, MapPin, Wind, CloudRain, Thermometer, Clock, TrendingUp } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";
import { BackToTopButton } from "@/components/BackToTopButton";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

// Color palette for models
const MODEL_COLORS: Record<string, string> = {
  AROME: "#f97316",
  ARPEGE: "#8b5cf6",
  ECMWF: "#3b82f6",
  GFS: "#10b981",
  ICON: "#ef4444",
  UKMET: "#06b6d4",
  GEM: "#f59e0b",
  JMA: "#ec4899",
  MeteoAI: "#60a5fa",
};

const BUCKET_LABELS: Record<string, string> = {
  "0-6h": "0-6h",
  "6-24h": "6-24h",
  "1-3d": "1-3j",
  "4-7d": "4-7j",
  "8-15d": "8-15j",
};

function getModelColor(name: string): string {
  return MODEL_COLORS[name] || `hsl(${(name.charCodeAt(0) * 37) % 360}, 70%, 55%)`;
}

function ChartLegend({ entries }: { entries: Array<{ label: string; color: string }> }) {
  return (
    <div className="mt-3 flex max-w-full gap-3 overflow-x-auto pb-1 text-[10px] text-muted-foreground scrollbar-hide" aria-label="Légende du graphique">
      {entries.map((entry) => (
        <span key={entry.label} className="flex shrink-0 items-center gap-1 whitespace-nowrap">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.label}
        </span>
      ))}
    </div>
  );
}

export default function History() {
  const [days, setDays] = useState(14);
  const [activeTab, setActiveTab] = useState<"temperature" | "precip" | "wind" | "scores" | "leadtime">("temperature");
  const { activeLocation } = useLocation();
  const { data, isLoading } = trpc.weather.getHistory.useQuery(
    activeLocation ? { days, lat: activeLocation.lat, lon: activeLocation.lon } : { days }
  );

  // Chart data: observations + MeteoAI + per-model forecasts
  const chartData = useMemo(() => {
    if (!data) return [];
    const dateMap = new Map<string, any>();

    // Add observations
    data.observations.forEach((obs) => {
      if (!dateMap.has(obs.date)) dateMap.set(obs.date, { date: obs.date });
      const entry = dateMap.get(obs.date)!;
      entry.obsMax = obs.tempMax;
      entry.obsMin = obs.tempMin;
      entry.obsPrecip = obs.precipitation;
      entry.obsWind = obs.windSpeed;
      entry.obsGust = obs.windGust;
    });

    // Add MeteoAI forecasts
    data.meteoAIForecasts.forEach((f) => {
      if (!dateMap.has(f.date)) dateMap.set(f.date, { date: f.date });
      const entry = dateMap.get(f.date)!;
      entry.meteoAIMax = f.tempMax;
      entry.meteoAIMin = f.tempMin;
      entry.meteoAIPrecip = f.precipitation;
      entry.stability = f.stabilityIndex;
    });

    // Add per-model forecasts
    data.forecasts.forEach((f) => {
      if (!dateMap.has(f.date)) dateMap.set(f.date, { date: f.date });
      const entry = dateMap.get(f.date)!;
      entry[`${f.serviceName}_max`] = f.tempMax;
      entry[`${f.serviceName}_min`] = f.tempMin;
      entry[`${f.serviceName}_precip`] = f.precipitation;
      entry[`${f.serviceName}_wind`] = f.windSpeed;
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  // Unique model names from forecasts
  const modelNames = useMemo(() => {
    if (!data) return [];
    const names = new Set<string>();
    data.forecasts.forEach((f) => names.add(f.serviceName));
    return Array.from(names).sort();
  }, [data]);

  // Score time series grouped by date
  const scoreChartData = useMemo(() => {
    if (!data?.scoreTimeSeries) return [];
    const dateMap = new Map<string, any>();
    data.scoreTimeSeries.forEach((row: any) => {
      if (!dateMap.has(row.date)) dateMap.set(row.date, { date: row.date });
      const entry = dateMap.get(row.date)!;
      entry[row.serviceName] = row.weightedScore;
    });
    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  // Lead-time data grouped by bucket
  const leadTimeData = useMemo(() => {
    if (!data?.leadTimeScores || data.leadTimeScores.length === 0) return [];
    const bucketOrder = ["0-6h", "6-24h", "1-3d", "4-7d", "8-15d"];
    const bucketMap = new Map<string, any>();
    bucketOrder.forEach((b) => bucketMap.set(b, { bucket: BUCKET_LABELS[b] || b }));

    data.leadTimeScores.forEach((row: any) => {
      const entry = bucketMap.get(row.bucket);
      if (entry) {
        entry[`${row.serviceName}_mae`] = row.avgMaeTemp;
      }
    });
    return Array.from(bucketMap.values());
  }, [data]);

  // Models present in lead-time data
  const leadTimeModels = useMemo(() => {
    if (!data?.leadTimeScores) return [];
    const names = new Set<string>();
    data.leadTimeScores.forEach((row: any) => names.add(row.serviceName));
    return Array.from(names).sort();
  }, [data]);

  if (isLoading) {
    return (
      <div className="weather-page min-h-screen px-3 pb-24 pt-3 sm:p-6">
        <div className="mx-auto max-w-2xl">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-64 bg-muted rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    color: "hsl(var(--foreground))",
  };

  return (
    <div className="weather-page min-h-screen">
      <div className="weather-page-frame mx-auto max-w-2xl space-y-4 px-3 pb-24 pt-3 sm:space-y-6 sm:px-5 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Calendar className="h-8 w-8 text-primary" />
              Historique
            </h1>
            <p className="text-muted-foreground mt-1">
              Comparaison multi-modèles vs observations sur {days} jours
            </p>
            {activeLocation && (
              <div className="flex items-center gap-1 mt-1 text-xs text-primary">
                <MapPin className="h-3 w-3" />
                <span>{activeLocation.name}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  days === d
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {d}j
              </button>
            ))}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="weather-surface-inset flex w-fit flex-wrap gap-1 rounded-lg p-1">
          {[
            { id: "temperature" as const, label: "Température", icon: Thermometer },
            { id: "precip" as const, label: "Précipitations", icon: CloudRain },
            { id: "wind" as const, label: "Vent", icon: Wind },
            { id: "scores" as const, label: "Scores", icon: TrendingUp },
            { id: "leadtime" as const, label: "Par échéance", icon: Clock },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Temperature Tab */}
        {activeTab === "temperature" && chartData.length > 0 && (
          <div className="space-y-6">
            <div className="weather-surface weather-chart-surface rounded-xl p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Thermometer className="h-5 w-5 text-primary" />
                Températures Max — Modèles vs Observations
              </h3>
              <ChartLegend entries={[
                { label: "Obs. Max", color: "#34d399" },
                { label: "MeteoAI", color: "#60a5fa" },
                ...modelNames.map((name) => ({ label: name, color: getModelColor(name) })),
              ]} />
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} unit="°C" />
                    <Tooltip contentStyle={tooltipStyle} />
                    {/* Observation line (thick, dashed) */}
                    <Line type="monotone" dataKey="obsMax" name="Obs. Max" stroke="#34d399" strokeWidth={3} strokeDasharray="6 3" dot={{ r: 4 }} />
                    {/* MeteoAI line (thick, solid) */}
                    <Line type="monotone" dataKey="meteoAIMax" name="MeteoAI" stroke="#60a5fa" strokeWidth={3} dot={{ r: 3 }} />
                    {/* Per-model lines (thin) */}
                    {modelNames.map((name) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={`${name}_max`}
                        name={name}
                        stroke={getModelColor(name)}
                        strokeWidth={1.5}
                        strokeOpacity={0.6}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="weather-surface weather-chart-surface rounded-xl p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Thermometer className="h-5 w-5 text-blue-400" />
                Températures Min — Modèles vs Observations
              </h3>
              <ChartLegend entries={[
                { label: "Obs. Min", color: "#6ee7b7" },
                { label: "MeteoAI", color: "#93c5fd" },
                ...modelNames.map((name) => ({ label: name, color: getModelColor(name) })),
              ]} />
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} unit="°C" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="obsMin" name="Obs. Min" stroke="#6ee7b7" strokeWidth={3} strokeDasharray="6 3" dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="meteoAIMin" name="MeteoAI" stroke="#93c5fd" strokeWidth={3} dot={{ r: 3 }} />
                    {modelNames.map((name) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={`${name}_min`}
                        name={name}
                        stroke={getModelColor(name)}
                        strokeWidth={1.5}
                        strokeOpacity={0.6}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Precipitation Tab */}
        {activeTab === "precip" && chartData.length > 0 && (
          <div className="weather-surface weather-chart-surface rounded-xl p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <CloudRain className="h-5 w-5 text-blue-400" />
              Précipitations — Modèles vs Observations
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} unit=" mm" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="obsPrecip" name="Obs." fill="#34d399" opacity={0.9} />
                  <Bar dataKey="meteoAIPrecip" name="MeteoAI" fill="#60a5fa" opacity={0.8} />
                  {modelNames.slice(0, 4).map((name) => (
                    <Bar
                      key={name}
                      dataKey={`${name}_precip`}
                      name={name}
                      fill={getModelColor(name)}
                      opacity={0.5}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Wind Tab */}
        {activeTab === "wind" && chartData.length > 0 && (
          <div className="weather-surface weather-chart-surface rounded-xl p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Wind className="h-5 w-5 text-cyan-400" />
              Vent moyen — Modèles vs Observations
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} unit=" km/h" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="obsWind" name="Obs. Vent" stroke="#34d399" fill="#34d399" fillOpacity={0.15} strokeWidth={3} strokeDasharray="6 3" />
                  <Area type="monotone" dataKey="obsGust" name="Obs. Rafales" stroke="#f97316" fill="#f97316" fillOpacity={0.1} strokeWidth={2} strokeDasharray="4 2" />
                  {modelNames.map((name) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={`${name}_wind`}
                      name={name}
                      stroke={getModelColor(name)}
                      strokeWidth={1.5}
                      strokeOpacity={0.6}
                      dot={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Scores Tab */}
        {activeTab === "scores" && scoreChartData.length > 0 && (
          <div className="weather-surface weather-chart-surface rounded-xl p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Évolution des scores de fiabilité par modèle
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} unit="/100" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {modelNames.map((name) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      name={name}
                      stroke={getModelColor(name)}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Lead-time Tab */}
        {activeTab === "leadtime" && (
          <div className="space-y-6">
            {leadTimeData.length > 0 ? (
              <div className="weather-surface weather-chart-surface rounded-xl p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  MAE Température par échéance de prévision
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Plus la barre est courte, plus le modèle est précis à cette échéance.
                </p>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={leadTimeData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} unit="°C" />
                      <YAxis type="category" dataKey="bucket" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} width={60} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {leadTimeModels.map((name) => (
                        <Bar
                          key={name}
                          dataKey={`${name}_mae`}
                          name={name}
                          fill={getModelColor(name)}
                          opacity={0.8}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="weather-surface rounded-xl p-12 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Scoring par échéance</h2>
                <p className="text-muted-foreground">
                  Les données de scoring par échéance seront disponibles après les prochaines collectes d'observations.
                </p>
              </div>
            )}

            {/* Lead-time detail table */}
            {data?.leadTimeScores && data.leadTimeScores.length > 0 && (
              <div className="weather-surface overflow-hidden rounded-xl">
                <div className="p-4 border-b border-border">
                  <h3 className="font-semibold">Détail par modèle et échéance</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left p-3 font-medium">Modèle</th>
                        <th className="text-center p-3 font-medium">Échéance</th>
                        <th className="text-right p-3 font-medium">MAE T°</th>
                        <th className="text-right p-3 font-medium">RMSE T°</th>
                        <th className="text-right p-3 font-medium">Biais T°</th>
                        <th className="text-right p-3 font-medium">MAE Précip</th>
                        <th className="text-right p-3 font-medium">MAE Vent</th>
                        <th className="text-right p-3 font-medium">Échantillons</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leadTimeScores.map((row: any, i: number) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="p-3 font-medium">
                            <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: getModelColor(row.serviceName) }} />
                            {row.serviceName}
                          </td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 rounded bg-muted text-xs font-mono">
                              {BUCKET_LABELS[row.bucket] || row.bucket}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono">
                            {row.avgMaeTemp != null ? `${Number(row.avgMaeTemp).toFixed(2)}°C` : "—"}
                          </td>
                          <td className="p-3 text-right font-mono">
                            {row.avgRmseTemp != null ? `${Number(row.avgRmseTemp).toFixed(2)}°C` : "—"}
                          </td>
                          <td className="p-3 text-right font-mono">
                            {row.avgBiasTemp != null ? (
                              <span className={Number(row.avgBiasTemp) > 0 ? "text-red-400" : "text-blue-400"}>
                                {Number(row.avgBiasTemp) > 0 ? "+" : ""}{Number(row.avgBiasTemp).toFixed(2)}°C
                              </span>
                            ) : "—"}
                          </td>
                          <td className="p-3 text-right font-mono">
                            {row.avgMaePrecip != null ? `${Number(row.avgMaePrecip).toFixed(1)} mm` : "—"}
                          </td>
                          <td className="p-3 text-right font-mono">
                            {row.avgMaeWind != null ? `${Number(row.avgMaeWind).toFixed(1)} km/h` : "—"}
                          </td>
                          <td className="p-3 text-right text-muted-foreground">
                            {row.totalSamples ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Detailed Table (always visible) */}
        {data && data.observations.length > 0 && activeTab === "temperature" && (
          <div className="weather-surface overflow-hidden rounded-xl">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">Données détaillées</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-right p-3 font-medium">Obs. Max</th>
                    <th className="text-right p-3 font-medium">Obs. Min</th>
                    <th className="text-right p-3 font-medium">Obs. Précip</th>
                    <th className="text-right p-3 font-medium">MeteoAI Max</th>
                    <th className="text-right p-3 font-medium">MeteoAI Min</th>
                    <th className="text-right p-3 font-medium">Erreur Max</th>
                    <th className="text-right p-3 font-medium">Stabilité</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((row) => {
                    const errMax = (row.obsMax != null && row.meteoAIMax != null)
                      ? Math.abs(row.meteoAIMax - row.obsMax)
                      : null;
                    return (
                      <tr key={row.date} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="p-3 font-medium">{row.date}</td>
                        <td className="p-3 text-right font-mono">
                          {row.obsMax != null ? `${row.obsMax}°C` : "—"}
                        </td>
                        <td className="p-3 text-right font-mono">
                          {row.obsMin != null ? `${row.obsMin}°C` : "—"}
                        </td>
                        <td className="p-3 text-right font-mono">
                          {row.obsPrecip != null ? `${row.obsPrecip} mm` : "—"}
                        </td>
                        <td className="p-3 text-right font-mono text-primary">
                          {row.meteoAIMax != null ? `${row.meteoAIMax}°C` : "—"}
                        </td>
                        <td className="p-3 text-right font-mono text-primary">
                          {row.meteoAIMin != null ? `${row.meteoAIMin}°C` : "—"}
                        </td>
                        <td className="p-3 text-right font-mono">
                          {errMax != null ? (
                            <span className={errMax <= 1 ? "text-green-400" : errMax <= 2 ? "text-yellow-400" : "text-red-400"}>
                              {errMax.toFixed(1)}°C
                            </span>
                          ) : "—"}
                        </td>
                        <td className="p-3 text-right">
                          {row.stability != null ? (
                            <span className={row.stability >= 60 ? "text-green-400" : "text-red-400"}>
                              {row.stability >= 60 ? "🟢" : "🔴"} {row.stability}
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {chartData.length === 0 && (
          <div className="weather-surface rounded-xl p-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Aucun historique</h2>
            <p className="text-muted-foreground">
              Les données historiques seront disponibles après les premières collectes.
            </p>
          </div>
        )}
      </div>
      <BackToTopButton />
    </div>
  );
}
