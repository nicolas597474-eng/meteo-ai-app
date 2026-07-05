import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { FileText, Thermometer, Droplets, Wind, Cloud } from "lucide-react";

export default function Report() {
  const [date] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" })
  );
  const { data, isLoading } = trpc.weather.getReport.useQuery({ date });

  const servicesByCategory = useMemo(() => {
    if (!data) return { expert: [], public: [] };
    return {
      expert: data.forecasts.filter((f) => f.serviceCategory === "expert"),
      public: data.forecasts.filter((f) => f.serviceCategory === "public"),
    };
  }, [data]);

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

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            Rapport Détaillé
          </h1>
          <p className="text-muted-foreground mt-1">
            Analyse complète pour le {data?.date ?? date} — Hondeghem
          </p>
        </div>

        {/* MeteoAI Summary */}
        {data?.meteoAI && (
          <div className="bg-gradient-to-r from-primary/10 to-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Synthèse MeteoAI</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <MetricCard
                icon={<Thermometer className="h-4 w-4" />}
                label="Temp. Max"
                value={`${data.meteoAI.tempMax}°C`}
              />
              <MetricCard
                icon={<Thermometer className="h-4 w-4" />}
                label="Temp. Min"
                value={`${data.meteoAI.tempMin}°C`}
              />
              <MetricCard
                icon={<Droplets className="h-4 w-4" />}
                label="Précip."
                value={`${data.meteoAI.precipitation} mm`}
              />
              <MetricCard
                icon={<Wind className="h-4 w-4" />}
                label="Vent"
                value={`${data.meteoAI.windSpeed} km/h`}
              />
              <MetricCard
                icon={<Cloud className="h-4 w-4" />}
                label="Stabilité"
                value={`${data.meteoAI.stabilityIndex}/100`}
                highlight={data.meteoAI.stabilityLabel === "stable"}
              />
            </div>
            {data.meteoAI.explanation && (
              <div className="bg-background/50 rounded-lg p-4 border border-border">
                <p className="text-sm italic text-foreground/80">
                  {data.meteoAI.explanation}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Observation */}
        {data?.observation && (
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">
              Observations réelles
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <MetricCard
                icon={<Thermometer className="h-4 w-4" />}
                label="Temp. Max"
                value={`${data.observation.tempMax}°C`}
              />
              <MetricCard
                icon={<Thermometer className="h-4 w-4" />}
                label="Temp. Min"
                value={`${data.observation.tempMin}°C`}
              />
              <MetricCard
                icon={<Droplets className="h-4 w-4" />}
                label="Précip."
                value={`${data.observation.precipitation} mm`}
              />
              <MetricCard
                icon={<Wind className="h-4 w-4" />}
                label="Vent"
                value={`${data.observation.windSpeed} km/h`}
              />
              <MetricCard
                icon={<Cloud className="h-4 w-4" />}
                label="Source"
                value={data.observation.source ?? "Open-Meteo"}
                small
              />
            </div>
          </div>
        )}

        {/* Expert Models */}
        {servicesByCategory.expert.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">
                Modèles Experts ({servicesByCategory.expert.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 font-medium">Modèle</th>
                    <th className="text-right p-3 font-medium">Temp Max</th>
                    <th className="text-right p-3 font-medium">Temp Min</th>
                    <th className="text-right p-3 font-medium">Précip</th>
                    <th className="text-right p-3 font-medium">Vent</th>
                    <th className="text-right p-3 font-medium">Rafales</th>
                    <th className="text-right p-3 font-medium">Humidité</th>
                    <th className="text-right p-3 font-medium">Nébulosité</th>
                  </tr>
                </thead>
                <tbody>
                  {servicesByCategory.expert.map((f) => (
                    <tr
                      key={f.serviceName}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
                      <td className="p-3 font-medium">{f.serviceName}</td>
                      <td className="p-3 text-right font-mono">
                        {f.tempMax != null ? `${f.tempMax}°C` : "—"}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {f.tempMin != null ? `${f.tempMin}°C` : "—"}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {f.precipitation != null ? `${f.precipitation} mm` : "—"}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {f.windSpeed != null ? `${f.windSpeed} km/h` : "—"}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {f.windGust != null ? `${f.windGust} km/h` : "—"}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {f.humidity != null ? `${f.humidity}%` : "—"}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {f.cloudCover != null ? `${f.cloudCover}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Public Services */}
        {servicesByCategory.public.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">
                Services Publics ({servicesByCategory.public.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 font-medium">Service</th>
                    <th className="text-right p-3 font-medium">Temp Max</th>
                    <th className="text-right p-3 font-medium">Temp Min</th>
                    <th className="text-right p-3 font-medium">Précip</th>
                    <th className="text-right p-3 font-medium">Vent</th>
                  </tr>
                </thead>
                <tbody>
                  {servicesByCategory.public.map((f) => (
                    <tr
                      key={f.serviceName}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
                      <td className="p-3 font-medium">{f.serviceName}</td>
                      <td className="p-3 text-right font-mono">
                        {f.tempMax != null ? `${f.tempMax}°C` : "—"}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {f.tempMin != null ? `${f.tempMin}°C` : "—"}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {f.precipitation != null ? `${f.precipitation} mm` : "—"}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {f.windSpeed != null ? `${f.windSpeed} km/h` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Ranking */}
        {data?.ranking && data.ranking.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">
              Classement cumulé
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.ranking.slice(0, 6).map((s, i) => (
                <div
                  key={s.serviceName}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex items-center gap-2">
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
                    <span className="text-sm font-medium">{s.serviceName}</span>
                  </div>
                  <span className="text-sm font-mono text-primary">
                    {(s.avgScore ?? 0).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No data state */}
        {(!data?.forecasts || data.forecasts.length === 0) && !data?.meteoAI && (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              Aucune donnée pour cette date
            </h2>
            <p className="text-muted-foreground">
              Les données seront disponibles après la collecte matinale (07h30).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  highlight,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <p
        className={`font-bold ${small ? "text-sm" : "text-lg"} ${
          highlight ? "text-green-400" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
