import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Trophy, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";

type RankingService = {
  serviceName: string;
  avgScore: number | null;
  avgMaeTemp: number | null;
  avgMaePrecip: number | null;
  avgMaeWind: number | null;
  avgRmseTemp: number | null;
  avgBiasTemp: number | null;
  daysTracked: number;
  avgTempScore: number | null;
  avgTempMae: number | null;
  avgTempBias: number | null;
  avgTempMaxError: number | null;
  avgPrecipScore: number | null;
  avgPrecipPod: number | null;
  avgPrecipFar: number | null;
  avgPrecipCsi: number | null;
  totalPrecipFalsePos: number | null;
  totalPrecipFalseNeg: number | null;
  avgWindScore: number | null;
  avgWindMaeGusts: number | null;
  avgCondScore: number | null;
  avgCondConcordance: number | null;
  avgCondMaeCloud: number | null;
};

function ScoreBar({ score, color }: { score: number | null; color: string }) {
  const s = score ?? 0;
  const barColor = s >= 80 ? "bg-green-400" : s >= 60 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${s}%` }} />
      </div>
      <span className={`text-xs font-mono font-bold w-8 text-right ${s >= 80 ? "text-green-400" : s >= 60 ? "text-yellow-400" : "text-red-400"}`}>{s.toFixed(0)}</span>
    </div>
  );
}

function ServiceDimCard({ service, rank }: { service: RankingService; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const medalColor = rank === 1 ? "bg-yellow-500/20 text-yellow-400" : rank === 2 ? "bg-gray-400/20 text-gray-300" : rank === 3 ? "bg-orange-500/20 text-orange-400" : "bg-muted text-muted-foreground";
  const borderClass = rank <= 3 ? "border-primary/30" : "border-border";
  const hasDimData = service.avgTempScore != null;

  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${borderClass}`}>
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${medalColor}`}>{rank}</span>
          <span className="font-semibold text-sm">{service.serviceName}</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">({service.daysTracked}j)</span>
        </div>
        <div className="flex items-center gap-3">
          {hasDimData && (
            <div className="hidden sm:flex gap-1.5 text-xs">
              {[{ e: "🌡", s: service.avgTempScore }, { e: "🌧", s: service.avgPrecipScore }, { e: "💨", s: service.avgWindScore }, { e: "☁", s: service.avgCondScore }].map(({ e, s }) => {
                const score = s ?? 0;
                const c = score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : "text-red-400";
                return <span key={e} className={`font-mono font-bold ${c}`}>{e}{score.toFixed(0)}</span>;
              })}
            </div>
          )}
          <span className="font-mono font-bold text-primary text-lg">{(service.avgScore ?? 0).toFixed(1)}</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-3 space-y-3 bg-muted/10">
          {hasDimData ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 🌡️ Temperature */}
              <div className="bg-background/50 border border-border/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🌡️ Température</span>
                </div>
                <ScoreBar score={service.avgTempScore} color="orange" />
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">MAE moy.</span><span className="font-mono">{(service.avgTempMae ?? 0).toFixed(2)} °C</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Biais moy.</span><span className={`font-mono ${(service.avgTempBias ?? 0) > 0.2 ? "text-orange-400" : (service.avgTempBias ?? 0) < -0.2 ? "text-blue-400" : "text-green-400"}`}>{(service.avgTempBias ?? 0) > 0 ? "+" : ""}{(service.avgTempBias ?? 0).toFixed(2)} °C</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Erreur max</span><span className="font-mono">{(service.avgTempMaxError ?? 0).toFixed(1)} °C</span></div>
                </div>
              </div>

              {/* 🌧️ Précipitations */}
              <div className="bg-background/50 border border-border/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🌧️ Précipitations</span>
                </div>
                <ScoreBar score={service.avgPrecipScore} color="blue" />
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">CSI moy.</span><span className="font-mono">{((service.avgPrecipCsi ?? 0) * 100).toFixed(0)}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">POD moy.</span><span className="font-mono">{((service.avgPrecipPod ?? 0) * 100).toFixed(0)}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">FAR moy.</span><span className="font-mono">{((service.avgPrecipFar ?? 0) * 100).toFixed(0)}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Faux + / −</span><span className="font-mono">{service.totalPrecipFalsePos ?? 0}j / {service.totalPrecipFalseNeg ?? 0}j</span></div>
                </div>
              </div>

              {/* 💨 Vent */}
              <div className="bg-background/50 border border-border/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">💨 Vent</span>
                </div>
                <ScoreBar score={service.avgWindScore} color="cyan" />
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">MAE vent moy.</span><span className="font-mono">{(service.avgMaeWind ?? 0).toFixed(1)} km/h</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">MAE rafales</span><span className="font-mono">{service.avgWindMaeGusts != null && service.avgWindMaeGusts > 0 ? `${service.avgWindMaeGusts.toFixed(1)} km/h` : "—"}</span></div>
                </div>
              </div>

              {/* ☁️ Conditions */}
              <div className="bg-background/50 border border-border/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">☁️ Conditions</span>
                </div>
                <ScoreBar score={service.avgCondScore} color="purple" />
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Concordance</span><span className="font-mono">{(service.avgCondConcordance ?? 0).toFixed(0)}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">MAE nuages</span><span className="font-mono">{service.avgCondMaeCloud != null && service.avgCondMaeCloud > 0 ? `${service.avgCondMaeCloud.toFixed(0)}%` : "—"}</span></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">
              Données par dimension disponibles après la prochaine collecte d'observations (23h50).
            </div>
          )}
          {/* Legacy flat metrics */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1 border-t border-border/30">
            <span>MAE T: <span className="font-mono text-foreground">{(service.avgMaeTemp ?? 0).toFixed(2)}°C</span></span>
            <span>MAE P: <span className="font-mono text-foreground">{(service.avgMaePrecip ?? 0).toFixed(2)}mm</span></span>
            <span>RMSE T: <span className="font-mono text-foreground">{(service.avgRmseTemp ?? 0).toFixed(2)}°C</span></span>
            <span>Jours: <span className="font-mono text-foreground">{service.daysTracked}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Ranking() {
  const { activeLocation } = useLocation();
  const { data, isLoading } = trpc.weather.getRanking.useQuery(
    activeLocation ? { lat: activeLocation.lat, lon: activeLocation.lon } : undefined
  );

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
          {activeLocation && (
            <div className="flex items-center gap-1 mt-1 text-xs text-primary">
              <MapPin className="h-3 w-3" />
              <span>{activeLocation.name}</span>
            </div>
          )}
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

        {/* Ranking Cards with dimension breakdown */}
        {ranking.length > 0 ? (
          <div className="space-y-2">
            {ranking.map((service, i) => (
              <ServiceDimCard key={service.serviceName} service={service} rank={i + 1} />
            ))}
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
