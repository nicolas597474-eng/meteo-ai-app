import { trpc } from "@/lib/trpc";
import {
  Cloud,
  Droplets,
  Wind,
  Thermometer,
  TrendingUp,
  Activity,
  MapPin,
  Clock,
} from "lucide-react";

export default function Dashboard() {
  const { data, isLoading } = trpc.weather.getDashboard.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="container">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-64 bg-muted rounded" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-muted rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const meteoAI = data?.meteoAI;
  const topServices = data?.topServices ?? [];
  const recentForecasts = data?.recentForecasts ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              MeteoAI
            </h1>
            <div className="flex items-center gap-2 mt-1 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Hondeghem, Nord (50.76°N, 2.52°E)</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{data?.today}</span>
          </div>
        </div>

        {/* Main Forecast Card */}
        {meteoAI ? (
          <div className="bg-gradient-to-br from-primary/20 via-card to-card border border-border rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Prévision MeteoAI</h2>
                <p className="text-sm text-muted-foreground">
                  Synthèse intelligente de {data?.forecastCount ?? 0} modèles
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Thermometer className="h-4 w-4" />
                  <span>Température</span>
                </div>
                <p className="text-2xl font-bold">
                  {meteoAI.tempMin}° / {meteoAI.tempMax}°C
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Droplets className="h-4 w-4" />
                  <span>Précipitations</span>
                </div>
                <p className="text-2xl font-bold">{meteoAI.precipitation} mm</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Wind className="h-4 w-4" />
                  <span>Vent</span>
                </div>
                <p className="text-2xl font-bold">{meteoAI.windSpeed} km/h</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Cloud className="h-4 w-4" />
                  <span>Conditions</span>
                </div>
                <p className="text-2xl font-bold">{meteoAI.condition ?? "—"}</p>
              </div>
            </div>

            {/* Stability Index */}
            <div className="bg-background/50 rounded-xl p-4 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground">
                    Weather Stability Index™
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-3xl font-bold">
                      {meteoAI.stabilityIndex}/100
                    </span>
                    <span
                      className={`text-lg ${
                        meteoAI.stabilityLabel === "stable"
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {meteoAI.stabilityLabel === "stable"
                        ? "🟢 Stable"
                        : "🔴 Instable"}
                    </span>
                  </div>
                </div>
                <div className="w-24 h-24 relative">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-muted"
                      strokeDasharray="100, 100"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                    <path
                      className={
                        meteoAI.stabilityLabel === "stable"
                          ? "text-green-400"
                          : "text-red-400"
                      }
                      strokeDasharray={`${meteoAI.stabilityIndex}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* AI Explanation */}
            {meteoAI.explanation && (
              <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                <p className="text-sm text-foreground/80 italic">
                  {meteoAI.explanation}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              Aucune prévision disponible
            </h2>
            <p className="text-muted-foreground">
              La collecte automatique débutera à 07h30. Les données historiques
              sont disponibles dans l'onglet Historique.
            </p>
          </div>
        )}

        {/* Bottom Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Services */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Top Services</h3>
            </div>
            {topServices.length > 0 ? (
              <div className="space-y-3">
                {topServices.map((service, i) => (
                  <div
                    key={service.serviceName}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-sm font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                          i === 0
                            ? "bg-yellow-500/20 text-yellow-400"
                            : i === 1
                            ? "bg-gray-400/20 text-gray-300"
                            : i === 2
                            ? "bg-orange-500/20 text-orange-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium">
                        {service.serviceName}
                      </span>
                    </div>
                    <span className="text-sm font-mono text-primary">
                      {(service.avgScore ?? 0).toFixed(1)}/100
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Les scores seront disponibles après la première collecte d'observations.
              </p>
            )}
          </div>

          {/* Recent Forecasts */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Prévisions récentes</h3>
            </div>
            {recentForecasts.length > 0 ? (
              <div className="space-y-3">
                {recentForecasts.slice(0, 5).map((f) => (
                  <div
                    key={f.date}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">{f.date}</span>
                    <div className="flex items-center gap-4">
                      <span>
                        {f.tempMin}°/{f.tempMax}°C
                      </span>
                      <span
                        className={
                          f.stabilityLabel === "stable"
                            ? "text-green-400"
                            : "text-red-400"
                        }
                      >
                        {f.stabilityLabel === "stable" ? "🟢" : "🔴"}{" "}
                        {f.stabilityIndex}/100
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune donnée historique disponible.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
