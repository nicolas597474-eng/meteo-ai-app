import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import {
  FlaskConical, Brain, Zap, Shield, Eye, RefreshCw,
  ChevronDown, ChevronUp, CheckCircle, AlertTriangle,
  TrendingUp, Info, Play, BarChart3,
  Thermometer, Droplets, Wind, Cloud, Clock, Database
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type ModelDetail = {
  name: string;
  label: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  cloudCover: number | null;
  condition: string | null;
};

type ReplayStep = {
  step: number;
  title: string;
  description: string;
  icon: string;
};

// ─── Score badge ─────────────────────────────────────────────────────────────

function ScoreBadge({ score, label }: { score: number; label: string }) {
  const color =
    score >= 80 ? "text-green-400 border-green-400/30 bg-green-400/10" :
    score >= 60 ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/10" :
    "text-red-400 border-red-400/30 bg-red-400/10";
  return (
    <div className={`flex flex-col items-center p-3 rounded-xl border ${color}`}>
      <span className="text-2xl font-bold">{score}</span>
      <span className="text-xs opacity-80 mt-0.5">{label}</span>
    </div>
  );
}

// ─── Weight pill ─────────────────────────────────────────────────────────────

function WeightPill({ icon, label, weight, color }: { icon: React.ReactNode; label: string; weight: number; color: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${color}`}>
      {icon}
      <span className="text-xs font-medium">{label}</span>
      <span className="text-xs font-bold ml-1">{Math.round(weight * 100)}%</span>
    </div>
  );
}

// ─── Divergence bar ───────────────────────────────────────────────────────────

function DivergenceBar({ label, value, max, unit, color }: { label: string; value: number; max: number; unit: string; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const level = pct < 30 ? "Faible" : pct < 60 ? "Modéré" : "Élevé";
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold">{value} {unit} — <span className={pct < 30 ? "text-green-400" : pct < 60 ? "text-yellow-400" : "text-red-400"}>{level}</span></span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WeatherAILab() {
  const { data, isLoading, error, refetch } = trpc.weather.getAILab.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const [replayActive, setReplayActive] = useState(false);
  const [replayStep, setReplayStep] = useState(0);
  const [showAllRegimes, setShowAllRegimes] = useState(false);
  const [showFormula, setShowFormula] = useState(false);

  // Replay animation
  useEffect(() => {
    if (!replayActive) return;
    if (!data?.replaySteps) return;
    if (replayStep >= data.replaySteps.length) {
      setReplayActive(false);
      return;
    }
    const t = setTimeout(() => setReplayStep(s => s + 1), 900);
    return () => clearTimeout(t);
  }, [replayActive, replayStep, data]);

  const startReplay = () => {
    setReplayStep(0);
    setReplayActive(true);
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-3 sm:px-6 py-6 space-y-4">
        <div className="animate-pulse h-10 bg-muted rounded-xl w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse h-28 bg-muted rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto px-3 sm:px-6 py-6">
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 text-center">
          <AlertTriangle className="h-6 w-6 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-300">Impossible de charger le Weather AI Lab.</p>
          <button onClick={() => refetch()} className="mt-3 text-xs text-primary underline">Réessayer</button>
        </div>
      </div>
    );
  }

  const MODEL_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-6 py-4 space-y-4 pb-20 sm:pb-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
            <FlaskConical className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold">Weather AI Lab</h1>
            <p className="text-xs text-muted-foreground">Transparence totale · {data.date}</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
          title="Actualiser"
        >
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* ── 3 Score badges ── */}
      <div className="grid grid-cols-3 gap-3">
        <ScoreBadge score={data.confidenceScore} label="Confiance" />
        <ScoreBadge score={data.stabilityScore} label="Stabilité" />
        <ScoreBadge score={data.transparencyScore} label="Transparence" />
      </div>

      {/* ── AI Analysis ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">Analyse IA</span>
          <span className="text-xs text-muted-foreground ml-auto">{data.engineVersion}</span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{data.aiAnalysis}</p>
      </div>

      {/* ── Régime actif + poids ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-yellow-400" />
          <span className="text-sm font-semibold">Régime détecté</span>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">{data.regimeEmoji}</span>
          <div>
            <div className="text-sm font-bold">{data.regimeLabel}</div>
            <div className="text-xs text-muted-foreground">{data.regimeDescription}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <WeightPill icon={<Thermometer className="h-3 w-3" />} label="Temp" weight={data.weights.temp} color="text-orange-400 border-orange-400/30 bg-orange-400/10" />
          <WeightPill icon={<Droplets className="h-3 w-3" />} label="Précip" weight={data.weights.precip} color="text-blue-400 border-blue-400/30 bg-blue-400/10" />
          <WeightPill icon={<Wind className="h-3 w-3" />} label="Vent" weight={data.weights.wind} color="text-cyan-400 border-cyan-400/30 bg-cyan-400/10" />
          <WeightPill icon={<Cloud className="h-3 w-3" />} label="Cond" weight={data.weights.condition} color="text-gray-400 border-gray-400/30 bg-gray-400/10" />
        </div>

        {/* All regimes accordion */}
        <button
          onClick={() => setShowAllRegimes(v => !v)}
          className="mt-3 flex items-center gap-1 text-xs text-primary"
        >
          {showAllRegimes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showAllRegimes ? "Masquer" : "Voir"} tous les régimes
        </button>
        {showAllRegimes && data.allRegimes && (
          <div className="mt-3 space-y-2">
            {Object.entries(data.allRegimes).map(([key, def]: [string, any]) => (
              <div key={key} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${key === data.regime ? "bg-primary/10 border border-primary/30" : "bg-muted/30"}`}>
                <span className="text-base flex-shrink-0">{def.emoji}</span>
                <div>
                  <div className="font-semibold">{def.label}</div>
                  <div className="text-muted-foreground">{def.description}</div>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <span>T°: {Math.round(def.weights.temp * 100)}%</span>
                    <span>Précip: {Math.round(def.weights.precip * 100)}%</span>
                    <span>Vent: {Math.round(def.weights.wind * 100)}%</span>
                    <span>Cond: {Math.round(def.weights.condition * 100)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Divergence inter-modèles ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold">Divergence inter-modèles</span>
        </div>
        <div className="space-y-3">
          <DivergenceBar label="Température" value={data.divergence.tempRange} max={10} unit="°C" color="bg-orange-400" />
          <DivergenceBar label="Précipitations" value={data.divergence.precipRange} max={20} unit="mm" color="bg-blue-400" />
          <DivergenceBar label="Vent" value={data.divergence.windRange} max={40} unit="km/h" color="bg-cyan-400" />
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Moyenne modèles : {data.divergence.tempMean}°C · {data.divergence.precipMean} mm
        </p>
      </div>

      {/* ── Tableau des modèles ── */}
      {data.modelDetails && data.modelDetails.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="h-4 w-4 text-green-400" />
            <span className="text-sm font-semibold">Données brutes par modèle</span>
          </div>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs min-w-[340px]">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left py-1.5 px-1 font-medium">Modèle</th>
                  <th className="text-right py-1.5 px-1 font-medium">Max</th>
                  <th className="text-right py-1.5 px-1 font-medium">Min</th>
                  <th className="text-right py-1.5 px-1 font-medium">Précip</th>
                  <th className="text-right py-1.5 px-1 font-medium">Vent</th>
                </tr>
              </thead>
              <tbody>
                {data.modelDetails.map((m: ModelDetail, i: number) => (
                  <tr key={m.name} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 px-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                        <span className="font-medium truncate max-w-[80px]">{m.label}</span>
                      </div>
                    </td>
                    <td className="text-right py-1.5 px-1 text-orange-300">{m.tempMax != null ? `${m.tempMax}°` : "—"}</td>
                    <td className="text-right py-1.5 px-1 text-blue-300">{m.tempMin != null ? `${m.tempMin}°` : "—"}</td>
                    <td className="text-right py-1.5 px-1 text-cyan-300">{m.precipitation != null ? `${m.precipitation}mm` : "—"}</td>
                    <td className="text-right py-1.5 px-1 text-gray-300">{m.windSpeed != null ? `${m.windSpeed}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Formule mathématique ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <button
          onClick={() => setShowFormula(v => !v)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-semibold">Formule de calcul</span>
          </div>
          {showFormula ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {showFormula && data.formula && (
          <div className="mt-3 space-y-3">
            <div className="bg-muted/40 rounded-lg p-3 font-mono text-xs text-center text-primary">
              {data.formula.description}
            </div>
            <div className="space-y-2">
              {data.formula.components.map((c: any) => (
                <div key={c.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round(c.weight * 100)}%` }} />
                    </div>
                    <span className="font-medium">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{c.description}</span>
                    <span className="font-bold text-foreground">{Math.round(c.weight * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Replay IA animé ── */}
      {data.replaySteps && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-green-400" />
              <span className="text-sm font-semibold">Replay IA — synthèse étape par étape</span>
            </div>
            <button
              onClick={startReplay}
              disabled={replayActive}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              <Play className="h-3 w-3" />
              {replayActive ? "En cours…" : "Lancer"}
            </button>
          </div>
          <div className="space-y-2">
            {data.replaySteps.map((step: ReplayStep) => {
              const visible = replayActive ? step.step <= replayStep : true;
              const active = replayActive && step.step === replayStep;
              return (
                <div
                  key={step.step}
                  className={`flex items-start gap-3 p-2.5 rounded-lg transition-all duration-500 ${
                    visible
                      ? active
                        ? "bg-primary/15 border border-primary/40"
                        : "bg-muted/30"
                      : "opacity-20"
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-sm">
                    {step.icon}
                  </div>
                  <div>
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      {step.title}
                      {visible && !active && <CheckCircle className="h-3 w-3 text-green-400" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{step.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Historique des performances ── */}
      {data.historicalTimeSeries && data.historicalTimeSeries.length > 1 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-green-400" />
            <span className="text-sm font-semibold">Historique des performances — {data.historicalTimeSeries.length} jours</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Score MeteoAI (/100) par modèle sur les {data.historicalTimeSeries.length} derniers jours.</p>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.historicalTimeSeries} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                  labelFormatter={(v: string) => `Date : ${v}`}
                  formatter={(value: number, name: string) => [value != null ? `${Math.round(value)}/100` : "—", name]}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {(data.historicalServices ?? []).map((service: string, i: number) => (
                  <Line
                    key={service}
                    type="monotone"
                    dataKey={service}
                    stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Sources utilisées ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-semibold">Sources utilisées</span>
        </div>
        <div className="space-y-3">
          {data.sources.map((src: any) => (
            <div key={src.name} className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold">{src.name}</div>
                <div className="text-xs text-muted-foreground">{src.type} · Mise à jour : {src.updateFrequency}</div>
                {src.models.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {src.models.map((m: string) => (
                      <span key={m} className="text-xs bg-muted/50 px-1.5 py-0.5 rounded">{m}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xs font-medium text-green-400">{src.quality}</div>
                {src.lastSync && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end mt-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(src.lastSync).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="text-center text-xs text-muted-foreground py-2">
        <Shield className="h-3 w-3 inline mr-1" />
        {data.engineVersion} · Calculé à {new Date(data.calculatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {data.modelsUsed} modèles
      </div>

    </div>
  );
}
