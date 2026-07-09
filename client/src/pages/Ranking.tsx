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
            {data?.totalServices ?? 16} services · Score pondéré 30% Temp + 30% Précip + 20% Vent + 20% Conditions
          </p>
        </div>

        {/* Scoring explanation */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-medium text-sm mb-2">Méthodologie de scoring</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-chart-1" />
              <span>Température: 30%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-chart-2" />
              <span>Précipitations: 30%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-chart-3" />
              <span>Vent: 20%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-chart-4" />
              <span>Conditions: 20%</span>
            </div>
          </div>
        </div>

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
