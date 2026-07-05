import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Calendar, BarChart3 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function History() {
  const [days, setDays] = useState(7);
  const { data, isLoading } = trpc.weather.getHistory.useQuery({ days });

  const chartData = useMemo(() => {
    if (!data) return [];

    // Group by date
    const dateMap = new Map<string, any>();

    // Add observations
    data.observations.forEach((obs) => {
      if (!dateMap.has(obs.date)) dateMap.set(obs.date, { date: obs.date });
      const entry = dateMap.get(obs.date)!;
      entry.obsMax = obs.tempMax;
      entry.obsMin = obs.tempMin;
      entry.obsPrecip = obs.precipitation;
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

    return Array.from(dateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [data]);

  // Group forecasts by service for comparison table
  const serviceComparison = useMemo(() => {
    if (!data) return [];

    const serviceMap = new Map<string, any[]>();
    data.forecasts.forEach((f) => {
      if (!serviceMap.has(f.serviceName)) serviceMap.set(f.serviceName, []);
      serviceMap.get(f.serviceName)!.push(f);
    });

    return Array.from(serviceMap.entries()).map(([name, forecasts]) => ({
      name,
      forecasts: forecasts.sort((a, b) => a.date.localeCompare(b.date)),
    }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="container">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-64 bg-muted rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Calendar className="h-8 w-8 text-primary" />
              Historique
            </h1>
            <p className="text-muted-foreground mt-1">
              Comparaison prévisions vs observations sur {days} jours
            </p>
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

        {/* Temperature Chart */}
        {chartData.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Températures: MeteoAI vs Observations
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    unit="°C"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="meteoAIMax"
                    name="MeteoAI Max"
                    stroke="#60a5fa"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="obsMax"
                    name="Obs. Max"
                    stroke="#34d399"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="meteoAIMin"
                    name="MeteoAI Min"
                    stroke="#93c5fd"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="obsMin"
                    name="Obs. Min"
                    stroke="#6ee7b7"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Stability Index Chart */}
        {chartData.some((d) => d.stability != null) && (
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="font-semibold mb-4">
              Weather Stability Index™ — Évolution
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="stability"
                    name="Stabilité"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Detailed Table */}
        {data && data.observations.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
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
                    <th className="text-right p-3 font-medium">Stabilité</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((row) => (
                    <tr
                      key={row.date}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
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
                      <td className="p-3 text-right">
                        {row.stability != null ? (
                          <span
                            className={
                              row.stability >= 60
                                ? "text-green-400"
                                : "text-red-400"
                            }
                          >
                            {row.stability >= 60 ? "🟢" : "🔴"} {row.stability}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {chartData.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Aucun historique</h2>
            <p className="text-muted-foreground">
              Les données historiques seront disponibles après les premières collectes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
