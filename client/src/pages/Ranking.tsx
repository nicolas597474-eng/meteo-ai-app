import { trpc } from "@/lib/trpc";
import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function Ranking() {
  const { data, isLoading } = trpc.weather.getRanking.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="container">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-96 bg-muted rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const ranking = data?.ranking ?? [];
  const regime = data?.regime;
  const allRegimes = data?.allRegimes ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-3 py-4 space-y-4 sm:px-6 sm:py-8 sm:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-400" />
            Classement de Fiabilité
          </h1>
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
            {data?.totalServices ?? 16} services · Pondération contextuelle dynamique
          </p>
        </div>

        {/* Active regime + contextual weights */}
        {regime && (
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-600/50 rounded-xl p-4 space-y-3">
            {/* Active regime */}
            <div className="flex items-start gap-3">
              <span className="text-2xl">{regime.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm text-white">Régime actif : {regime.label}</h3>
                  <span className="text-xs bg-primary/20 text-primary border border-primary/30 rounded-full px-2 py-0.5">Aujourd'hui</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{regime.description}</p>
              </div>
            </div>

            {/* Weight bars */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Poids du scoring</p>
              {[
                { label: "🌡 Température", value: regime.weights.temp, color: "bg-orange-400" },
                { label: "🌧 Précipitations", value: regime.weights.precip, color: "bg-blue-400" },
                { label: "💨 Vent", value: regime.weights.wind, color: "bg-cyan-400" },
                { label: "☁ Conditions", value: regime.weights.condition, color: "bg-purple-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-28 flex-shrink-0">{label}</span>
                  <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.round(value * 100)}%` }} />
                  </div>
                  <span className="text-xs font-bold text-white w-8 text-right">{Math.round(value * 100)}%</span>
                </div>
              ))}
            </div>

            {/* All regimes reference */}
            {allRegimes.length > 0 && (
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-white transition-colors select-none">
                  Voir tous les régimes ▾
                </summary>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {allRegimes.map(r => (
                    <div key={r.id} className={`rounded-lg border px-3 py-2 text-xs ${
                      r.id === regime.id
                        ? "border-primary/50 bg-primary/10"
                        : "border-slate-700 bg-slate-800/50"
                    }`}>
                      <div className="flex items-center gap-1.5 font-medium">
                        <span>{r.emoji}</span>
                        <span className="text-white">{r.label}</span>
                        {r.id === regime.id && <span className="text-primary ml-auto">✓ actif</span>}
                      </div>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <span className="text-orange-300">🌡 {Math.round(r.weights.temp * 100)}%</span>
                        <span className="text-blue-300">🌧 {Math.round(r.weights.precip * 100)}%</span>
                        <span className="text-cyan-300">💨 {Math.round(r.weights.wind * 100)}%</span>
                        <span className="text-purple-300">☁ {Math.round(r.weights.condition * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Ranking Table */}
        {ranking.length > 0 ? (
          <div className="space-y-2">
            {/* Desktop table (hidden on mobile) */}
            <div className="hidden sm:block bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left p-3 font-medium">#</th>
                      <th className="text-left p-3 font-medium">Service</th>
                      <th className="text-right p-3 font-medium">Score</th>
                      <th className="text-right p-3 font-medium">MAE Temp</th>
                      <th className="text-right p-3 font-medium">MAE Précip</th>
                      <th className="text-right p-3 font-medium">MAE Vent</th>
                      <th className="text-right p-3 font-medium">RMSE Temp</th>
                      <th className="text-right p-3 font-medium">Biais Temp</th>
                      <th className="text-right p-3 font-medium">Jours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((service, i) => (
                      <tr key={service.serviceName} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${i < 3 ? "bg-primary/5" : ""}`}>
                        <td className="p-3"><span className={`font-bold ${i===0?"text-yellow-400":i===1?"text-gray-300":i===2?"text-orange-400":"text-muted-foreground"}`}>{i+1}</span></td>
                        <td className="p-3 font-medium">{service.serviceName}</td>
                        <td className="p-3 text-right"><span className="font-mono font-bold text-primary">{(service.avgScore??0).toFixed(1)}</span></td>
                        <td className="p-3 text-right font-mono">{(service.avgMaeTemp??0).toFixed(2)}°C</td>
                        <td className="p-3 text-right font-mono">{(service.avgMaePrecip??0).toFixed(2)}mm</td>
                        <td className="p-3 text-right font-mono">{(service.avgMaeWind??0).toFixed(1)}km/h</td>
                        <td className="p-3 text-right font-mono">{(service.avgRmseTemp??0).toFixed(2)}°C</td>
                        <td className="p-3 text-right"><BiasIndicator value={service.avgBiasTemp??0} unit="°C" /></td>
                        <td className="p-3 text-right text-muted-foreground">{service.daysTracked}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {ranking.map((service, i) => (
                <div key={service.serviceName} className={`bg-card border rounded-xl p-3 ${i < 3 ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold w-6 h-6 rounded-full flex items-center justify-center ${i===0?"bg-yellow-500/20 text-yellow-400":i===1?"bg-gray-400/20 text-gray-300":i===2?"bg-orange-600/20 text-orange-400":"bg-muted text-muted-foreground"}`}>{i+1}</span>
                      <span className="font-semibold text-sm">{service.serviceName}</span>
                    </div>
                    <span className="font-mono font-bold text-primary text-lg">{(service.avgScore??0).toFixed(1)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center">
                      <p className="text-muted-foreground">MAE Temp</p>
                      <p className="font-mono font-medium">{(service.avgMaeTemp??0).toFixed(2)}°C</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">MAE Précip</p>
                      <p className="font-mono font-medium">{(service.avgMaePrecip??0).toFixed(2)}mm</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">MAE Vent</p>
                      <p className="font-mono font-medium">{(service.avgMaeWind??0).toFixed(1)}km/h</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              Classement en cours de construction
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Les scores de fiabilité seront calculés après la première collecte
              d'observations (20h00). Les données historiques de l'analyse
              26 juin – 2 juillet sont disponibles.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function BiasIndicator({ value, unit }: { value: number; unit: string }) {
  const absVal = Math.abs(value);
  const formatted = absVal.toFixed(2);

  if (absVal < 0.1) {
    return (
      <span className="flex items-center justify-end gap-1 text-green-400 font-mono">
        <Minus className="h-3 w-3" />
        {formatted} {unit}
      </span>
    );
  }

  if (value > 0) {
    return (
      <span className="flex items-center justify-end gap-1 text-orange-400 font-mono">
        <TrendingUp className="h-3 w-3" />
        +{formatted} {unit}
      </span>
    );
  }

  return (
    <span className="flex items-center justify-end gap-1 text-blue-400 font-mono">
      <TrendingDown className="h-3 w-3" />
      -{formatted} {unit}
    </span>
  );
}
