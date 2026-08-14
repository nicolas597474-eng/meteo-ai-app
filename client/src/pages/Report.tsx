import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { FileText, Thermometer, Droplets, Wind, Cloud, ChevronDown, ChevronUp } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";

type DimScore = {
  serviceName: string;
  weightedScore: number;
  regime: string;
  regimeEmoji: string;
  regimeLabel: string;
  dimensions: {
    temperature: { mae: number; bias: number; maxError: number; score: number };
    precipitation: { pod: number; far: number; csi: number; falsePositives: number; falseNegatives: number; maeQuantity: number; score: number };
    wind: { maeMean: number; maeGusts: number; biasMean: number; score: number };
    condition: { concordance: number; maeCloudCover: number; score: number };
  };
  weights: { temp: number; precip: number; wind: number; condition: number };
};

export default function Report() {
  const { activeLocation } = useLocation();
  const [date] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" })
  );
  const { data, isLoading } = trpc.weather.getReport.useQuery({
    date,
    ...(activeLocation ? { lat: activeLocation.lat, lon: activeLocation.lon } : {}),
  });
  const [expandedService, setExpandedService] = useState<string | null>(null);

  const servicesByCategory = useMemo(() => {
    if (!data) return { expert: [], public: [] };
    return {
      expert: data.forecasts.filter((f) => f.serviceCategory === "expert"),
      public: data.forecasts.filter((f) => f.serviceCategory === "public"),
    };
  }, [data]);

  const dimScores: DimScore[] = (data as any)?.dimensionScores ?? [];
  const activeRegime = dimScores[0];

  if (isLoading) {
    return (
      <div className="weather-page min-h-screen p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted rounded" />
            {[1, 2, 3].map(i => <div key={i} className="h-40 bg-muted rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="weather-page min-h-screen">
      <div className="weather-page-frame max-w-3xl mx-auto px-3 py-4 space-y-4 sm:px-6 sm:py-8 sm:space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            Rapport Détaillé
          </h1>
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
            Analyse complète pour le {data?.date ?? date} — {activeLocation?.name ?? "Position actuelle"}
          </p>
        </div>

        {/* MeteoAI Summary */}
        {data?.meteoAI && (
          <div className="weather-surface weather-surface-hero bg-gradient-to-r from-primary/10 to-card rounded-xl p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold mb-3">Synthèse MeteoAI</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
              <MetricCard icon={<Thermometer className="h-4 w-4" />} label="Temp. Max" value={`${data.meteoAI.tempMax}°C`} />
              <MetricCard icon={<Thermometer className="h-4 w-4" />} label="Temp. Min" value={`${data.meteoAI.tempMin}°C`} />
              <MetricCard icon={<Droplets className="h-4 w-4" />} label="Précip." value={`${data.meteoAI.precipitation} mm`} />
              <MetricCard icon={<Wind className="h-4 w-4" />} label="Vent" value={`${data.meteoAI.windSpeed} km/h`} />
              <MetricCard icon={<Cloud className="h-4 w-4" />} label="Stabilité" value={`${data.meteoAI.stabilityIndex}/100`} highlight={data.meteoAI.stabilityLabel === "stable"} />
            </div>
            {data.meteoAI.explanation && (
              <div className="weather-surface-inset rounded-lg p-3">
                <p className="text-xs sm:text-sm italic text-foreground/80">{data.meteoAI.explanation}</p>
              </div>
            )}
          </div>
        )}

        {/* Observations réelles */}
        {data?.observation && (
          <div className="weather-observation-surface rounded-xl p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold mb-3">Observations réelles</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <MetricCard icon={<Thermometer className="h-4 w-4" />} label="Temp. Max" value={`${data.observation.tempMax}°C`} />
              <MetricCard icon={<Thermometer className="h-4 w-4" />} label="Temp. Min" value={`${data.observation.tempMin}°C`} />
              <MetricCard icon={<Droplets className="h-4 w-4" />} label="Précip." value={`${data.observation.precipitation} mm`} />
              <MetricCard icon={<Wind className="h-4 w-4" />} label="Vent" value={`${data.observation.windSpeed} km/h`} />
              <MetricCard icon={<Cloud className="h-4 w-4" />} label="Source" value={data.observation.source ?? "Non documentée"} small />
            </div>
          </div>
        )}

        {/* ─── 4 DIMENSIONS D'ERREUR ─── */}
        {dimScores.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold">Analyse par dimension</h2>
              {activeRegime && (
                <span className="text-xs bg-primary/20 text-primary border border-primary/30 rounded-full px-2 py-0.5">
                  {activeRegime.regimeEmoji} {activeRegime.regimeLabel}
                </span>
              )}
            </div>

            {/* Dimension legend */}
            {activeRegime && (
              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  { label: "🌡 Temp", pct: Math.round(activeRegime.weights.temp * 100), color: "text-orange-400" },
                  { label: "🌧 Précip", pct: Math.round(activeRegime.weights.precip * 100), color: "text-blue-400" },
                  { label: "💨 Vent", pct: Math.round(activeRegime.weights.wind * 100), color: "text-cyan-400" },
                  { label: "☁ Cond", pct: Math.round(activeRegime.weights.condition * 100), color: "text-purple-400" },
                ].map(({ label, pct, color }) => (
                  <span key={label} className={`${color} bg-card border border-border rounded-full px-2 py-0.5`}>
                    {label} {pct}%
                  </span>
                ))}
              </div>
            )}

            {/* Per-service dimension cards */}
            {dimScores
              .sort((a, b) => b.weightedScore - a.weightedScore)
              .map((s, i) => (
                <div key={s.serviceName} className={`weather-surface rounded-xl overflow-hidden ${i < 3 ? "border-primary/30" : "border-border"}`}>
                  {/* Service header */}
                  <button
                    className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedService(expandedService === s.serviceName ? null : s.serviceName)}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        i === 0 ? "bg-yellow-500/20 text-yellow-400" :
                        i === 1 ? "bg-gray-400/20 text-gray-300" :
                        i === 2 ? "bg-orange-500/20 text-orange-400" :
                        "bg-muted text-muted-foreground"
                      }`}>{i + 1}</span>
                      <span className="font-semibold text-sm">{s.serviceName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Mini dimension scores */}
                      <div className="hidden sm:flex gap-2 text-xs">
                        <DimPill emoji="🌡" score={s.dimensions.temperature.score} />
                        <DimPill emoji="🌧" score={s.dimensions.precipitation.score} />
                        <DimPill emoji="💨" score={s.dimensions.wind.score} />
                        <DimPill emoji="☁" score={s.dimensions.condition.score} />
                      </div>
                      <span className="font-mono font-bold text-primary text-lg">{s.weightedScore.toFixed(1)}</span>
                      {expandedService === s.serviceName
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                  </button>

                  {/* Expanded dimension detail */}
                  {expandedService === s.serviceName && (
                    <div className="border-t border-border p-3 sm:p-4 space-y-3 bg-muted/10">
                      {/* Mobile mini pills */}
                      <div className="flex sm:hidden gap-2 text-xs flex-wrap">
                        <DimPill emoji="🌡" score={s.dimensions.temperature.score} label="Temp" />
                        <DimPill emoji="🌧" score={s.dimensions.precipitation.score} label="Précip" />
                        <DimPill emoji="💨" score={s.dimensions.wind.score} label="Vent" />
                        <DimPill emoji="☁" score={s.dimensions.condition.score} label="Cond" />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* 🌡️ Temperature */}
                        <DimensionBlock
                          emoji="🌡️"
                          title="Température"
                          score={s.dimensions.temperature.score}
                          weight={activeRegime?.weights.temp ?? 0.3}
                          rows={[
                            { label: "MAE", value: `${s.dimensions.temperature.mae.toFixed(2)} °C`, note: "erreur moyenne absolue" },
                            { label: "Biais", value: biasFmt(s.dimensions.temperature.bias, "°C"), note: s.dimensions.temperature.bias > 0.2 ? "surestimation" : s.dimensions.temperature.bias < -0.2 ? "sous-estimation" : "neutre" },
                            { label: "Erreur max", value: `${s.dimensions.temperature.maxError.toFixed(1)} °C`, note: "pire prévision" },
                          ]}
                        />

                        {/* 🌧️ Précipitations */}
                        <DimensionBlock
                          emoji="🌧️"
                          title="Précipitations"
                          score={s.dimensions.precipitation.score}
                          weight={activeRegime?.weights.precip ?? 0.3}
                          rows={[
                            { label: "CSI", value: `${(s.dimensions.precipitation.csi * 100).toFixed(0)}%`, note: "indice de succès critique" },
                            { label: "POD", value: `${(s.dimensions.precipitation.pod * 100).toFixed(0)}%`, note: "détection pluie" },
                            { label: "FAR", value: `${(s.dimensions.precipitation.far * 100).toFixed(0)}%`, note: "fausses alarmes" },
                            { label: "Faux +", value: `${s.dimensions.precipitation.falsePositives}j`, note: "pluie prévue, sec observé" },
                            { label: "Faux −", value: `${s.dimensions.precipitation.falseNegatives}j`, note: "pluie manquée" },
                            { label: "MAE qté", value: `${s.dimensions.precipitation.maeQuantity.toFixed(2)} mm`, note: "jours pluvieux seul." },
                          ]}
                        />

                        {/* 💨 Vent */}
                        <DimensionBlock
                          emoji="💨"
                          title="Vent"
                          score={s.dimensions.wind.score}
                          weight={activeRegime?.weights.wind ?? 0.2}
                          rows={[
                            { label: "MAE moyen", value: `${s.dimensions.wind.maeMean.toFixed(1)} km/h`, note: "vent moyen" },
                            { label: "MAE rafales", value: s.dimensions.wind.maeGusts > 0 ? `${s.dimensions.wind.maeGusts.toFixed(1)} km/h` : "—", note: "rafales" },
                            { label: "Biais", value: biasFmt(s.dimensions.wind.biasMean, "km/h"), note: s.dimensions.wind.biasMean > 2 ? "surestimation" : s.dimensions.wind.biasMean < -2 ? "sous-estimation" : "neutre" },
                          ]}
                        />

                        {/* ☁️ Conditions */}
                        <DimensionBlock
                          emoji="☁️"
                          title="Nébulosité / Conditions"
                          score={s.dimensions.condition.score}
                          weight={activeRegime?.weights.condition ?? 0.2}
                          rows={[
                            { label: "Concordance", value: `${s.dimensions.condition.concordance.toFixed(0)}%`, note: "catégorie correcte" },
                            { label: "MAE nuages", value: s.dimensions.condition.maeCloudCover > 0 ? `${s.dimensions.condition.maeCloudCover.toFixed(0)}%` : "—", note: "couverture nuageuse" },
                          ]}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        {/* Forecasts table (expert models) */}
        {servicesByCategory.expert.length > 0 && (
          <div className="weather-surface rounded-xl overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-border">
              <h3 className="font-semibold text-sm sm:text-base">Modèles Experts — Prévisions brutes ({servicesByCategory.expert.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-2 sm:p-3 font-medium">Modèle</th>
                    <th className="text-right p-2 sm:p-3 font-medium">Tmax</th>
                    <th className="text-right p-2 sm:p-3 font-medium">Tmin</th>
                    <th className="text-right p-2 sm:p-3 font-medium">Précip</th>
                    <th className="text-right p-2 sm:p-3 font-medium">Vent</th>
                    <th className="text-right p-2 sm:p-3 font-medium">Rafales</th>
                    <th className="text-right p-2 sm:p-3 font-medium">Hum.</th>
                    <th className="text-right p-2 sm:p-3 font-medium">Nébul.</th>
                  </tr>
                </thead>
                <tbody>
                  {servicesByCategory.expert.map((f) => (
                    <tr key={f.serviceName} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="p-2 sm:p-3 font-medium">{f.serviceName}</td>
                      <td className="p-2 sm:p-3 text-right font-mono">{f.tempMax != null ? `${f.tempMax}°` : "—"}</td>
                      <td className="p-2 sm:p-3 text-right font-mono">{f.tempMin != null ? `${f.tempMin}°` : "—"}</td>
                      <td className="p-2 sm:p-3 text-right font-mono">{f.precipitation != null ? `${f.precipitation}mm` : "—"}</td>
                      <td className="p-2 sm:p-3 text-right font-mono">{f.windSpeed != null ? `${f.windSpeed}` : "—"}</td>
                      <td className="p-2 sm:p-3 text-right font-mono">{f.windGust != null ? `${f.windGust}` : "—"}</td>
                      <td className="p-2 sm:p-3 text-right font-mono">{f.humidity != null ? `${f.humidity}%` : "—"}</td>
                      <td className="p-2 sm:p-3 text-right font-mono">{f.cloudCover != null ? `${f.cloudCover}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* No data state */}
        {(!data?.forecasts || data.forecasts.length === 0) && !data?.meteoAI && (
          <div className="weather-surface rounded-xl p-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Aucune donnée pour cette date</h2>
            <p className="text-muted-foreground">Les données seront disponibles après la collecte matinale (05h00).</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DimPill({ emoji, score, label }: { emoji: string; score: number; label?: string }) {
  const color = score >= 80 ? "text-green-400 bg-green-400/10 border-green-400/30"
    : score >= 60 ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"
    : "text-red-400 bg-red-400/10 border-red-400/30";
  return (
    <span className={`border rounded-full px-2 py-0.5 font-mono font-bold text-xs ${color}`}>
      {emoji}{label ? ` ${label}` : ""} {score.toFixed(0)}
    </span>
  );
}

function DimensionBlock({
  emoji, title, score, weight, rows,
}: {
  emoji: string;
  title: string;
  score: number;
  weight: number;
  rows: { label: string; value: string; note?: string }[];
}) {
  const scoreColor = score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : "text-red-400";
  const barColor = score >= 80 ? "bg-green-400" : score >= 60 ? "bg-yellow-400" : "bg-red-400";

  return (
    <div className="weather-surface-inset rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {emoji} {title}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">poids {Math.round(weight * 100)}%</span>
          <span className={`font-mono font-bold text-sm ${scoreColor}`}>{score.toFixed(0)}/100</span>
        </div>
      </div>
      {/* Score bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      {/* Metrics */}
      <div className="space-y-1">
        {rows.map(({ label, value, note }) => (
          <div key={label} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{label}</span>
            <div className="text-right">
              <span className="font-mono font-medium">{value}</span>
              {note && <span className="text-muted-foreground ml-1.5 text-[10px]">({note})</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function biasFmt(val: number, unit: string): string {
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(2)} ${unit}`;
}

function MetricCard({
  icon, label, value, highlight, small,
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
      <p className={`font-bold ${small ? "text-sm" : "text-lg"} ${highlight ? "text-green-400" : ""}`}>
        {value}
      </p>
    </div>
  );
}
