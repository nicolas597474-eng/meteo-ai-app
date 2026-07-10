import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import {
  FlaskConical, Brain, Zap, Shield, Eye, RefreshCw,
  ChevronDown, ChevronUp, CheckCircle, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Info, Play, BarChart3,
  Thermometer, Droplets, Wind, Cloud, Clock, Database
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ModelDetail = {
  serviceName: string;
  serviceCategory: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  humidity: number | null;
  cloudCover: number | null;
  condition: string | null;
  historicScore: number;
  weight: number;
  contribution: string;
  reasons: string[];
  daysTracked: number;
  tempScore: number | null;
  precipScore: number | null;
  windScore: number | null;
  condScore: number | null;
  precipCsi: number | null;
  tempBias: number | null;
  tempMaxError: number | null;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreGauge({ value, label, color }: { value: number; label: string; color: string }) {
  const colorClass =
    color === "green" ? "text-green-400 stroke-green-400" :
    color === "yellow" ? "text-yellow-400 stroke-yellow-400" :
    color === "orange" ? "text-orange-400 stroke-orange-400" :
    "text-red-400 stroke-red-400";
  const bgClass =
    color === "green" ? "bg-green-400/10 border-green-400/30" :
    color === "yellow" ? "bg-yellow-400/10 border-yellow-400/30" :
    color === "orange" ? "bg-orange-400/10 border-orange-400/30" :
    "bg-red-400/10 border-red-400/30";

  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;

  return (
    <div className={`flex flex-col items-center justify-center p-3 rounded-xl border ${bgClass}`}>
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/30" />
          <circle cx="32" cy="32" r={r} fill="none" strokeWidth="4" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" className={colorClass} />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${colorClass.split(" ")[0]}`}>{value}</span>
      </div>
      <span className="text-xs text-muted-foreground mt-1 text-center">{label}</span>
    </div>
  );
}

function DivergenceBadge({ level }: { level: string }) {
  const cfg: Record<string, { color: string; bg: string }> = {
    "Très faible": { color: "text-green-400", bg: "bg-green-400/10 border-green-400/30" },
    "Faible": { color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/30" },
    "Moyenne": { color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30" },
    "Forte": { color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/30" },
    "Très forte": { color: "text-red-400", bg: "bg-red-400/10 border-red-400/30" },
  };
  const c = cfg[level] ?? cfg["Moyenne"];
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${c.bg} ${c.color}`}>{level}</span>;
}

function WeightBar({ weight, service }: { weight: number; service: string }) {
  const color = weight >= 25 ? "bg-primary" : weight >= 15 ? "bg-blue-400" : "bg-muted-foreground/50";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-24 truncate">{service}</span>
      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${weight}%` }} />
      </div>
      <span className="text-xs font-mono font-bold w-8 text-right">{weight}%</span>
    </div>
  );
}

function ModelCard({ model, rank }: { model: ModelDetail; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const contribColor = model.contribution === "Élevée" ? "text-green-400" : model.contribution === "Moyenne" ? "text-yellow-400" : "text-muted-foreground";
  const scoreColor = model.historicScore >= 80 ? "text-green-400" : model.historicScore >= 60 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xs font-bold w-5 h-5 rounded-full bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0">{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{model.serviceName}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded bg-muted/50 ${contribColor}`}>{model.contribution}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            {model.tempMax != null && <span>🌡 {model.tempMax}°C</span>}
            {model.precipitation != null && <span>🌧 {model.precipitation}mm</span>}
            {model.windSpeed != null && <span>💨 {model.windSpeed}km/h</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <div className={`text-sm font-bold font-mono ${scoreColor}`}>{model.historicScore}/100</div>
            <div className="text-xs text-muted-foreground">{model.weight}% poids</div>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-3 space-y-3 bg-muted/5">
          {/* Dimension mini-scores */}
          {(model.tempScore != null || model.precipScore != null) && (
            <div className="grid grid-cols-4 gap-2">
              {[
                { e: "🌡", label: "Temp", v: model.tempScore },
                { e: "🌧", label: "Précip", v: model.precipScore },
                { e: "💨", label: "Vent", v: model.windScore },
                { e: "☁", label: "Cond.", v: model.condScore },
              ].map(({ e, label, v }) => {
                const s = v ?? 0;
                const c = s >= 80 ? "text-green-400" : s >= 60 ? "text-yellow-400" : "text-red-400";
                return (
                  <div key={label} className="text-center bg-background/50 rounded-lg p-2">
                    <div className="text-base">{e}</div>
                    <div className={`text-xs font-bold font-mono ${c}`}>{s.toFixed(0)}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Why this model */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Pourquoi ce modèle ?</p>
            <ul className="space-y-1">
              {model.reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <CheckCircle className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Bias indicator */}
          {model.tempBias != null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Biais thermique</span>
              <span className={`font-mono font-bold ${Math.abs(model.tempBias) < 0.3 ? "text-green-400" : Math.abs(model.tempBias) < 1 ? "text-yellow-400" : "text-red-400"}`}>
                {model.tempBias > 0 ? "+" : ""}{model.tempBias.toFixed(2)}°C
              </span>
            </div>
          )}
          {model.daysTracked > 0 && (
            <div className="text-xs text-muted-foreground">Suivi sur {model.daysTracked} jours</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Replay Animation ─────────────────────────────────────────────────────────

const REPLAY_STEPS = [
  { icon: Database, label: "Collecte des données", desc: "Interrogation des 6 modèles numériques via Open-Meteo API", color: "text-blue-400" },
  { icon: Shield, label: "Nettoyage", desc: "Validation des plages de valeurs, suppression des données aberrantes", color: "text-cyan-400" },
  { icon: AlertTriangle, label: "Détection des anomalies", desc: "Identification des valeurs statistiquement improbables (±3σ)", color: "text-yellow-400" },
  { icon: BarChart3, label: "Performances historiques", desc: "Calcul des 4 dimensions d'erreur sur l'historique disponible", color: "text-orange-400" },
  { icon: Brain, label: "Calcul des pondérations", desc: "Application des poids contextuels selon le régime météo détecté", color: "text-purple-400" },
  { icon: Zap, label: "Fusion des modèles", desc: "Moyenne pondérée par fiabilité historique de chaque modèle", color: "text-pink-400" },
  { icon: CheckCircle, label: "Prévision IA finale", desc: "Génération de la prévision MeteoAI avec indices de confiance", color: "text-green-400" },
];

function ReplayAnimation() {
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [completed, setCompleted] = useState(false);

  const startReplay = () => {
    setRunning(true);
    setCompleted(false);
    setCurrentStep(0);
  };

  useEffect(() => {
    if (!running || currentStep < 0) return;
    if (currentStep >= REPLAY_STEPS.length) {
      setRunning(false);
      setCompleted(true);
      return;
    }
    const t = setTimeout(() => setCurrentStep(s => s + 1), 600);
    return () => clearTimeout(t);
  }, [running, currentStep]);

  return (
    <div className="space-y-3">
      <button
        onClick={startReplay}
        disabled={running}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        <Play className="h-4 w-4" />
        {running ? "Calcul en cours…" : completed ? "Rejouer le calcul" : "▶ Rejouer le calcul"}
      </button>

      <div className="space-y-2">
        {REPLAY_STEPS.map((step, i) => {
          const Icon = step.icon;
          const isActive = currentStep === i;
          const isDone = currentStep > i || completed;
          const isPending = currentStep < i && !completed;

          return (
            <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg border transition-all duration-300 ${
              isActive ? "border-primary/50 bg-primary/10 scale-[1.01]" :
              isDone ? "border-border/50 bg-muted/20" :
              "border-border/20 opacity-40"
            }`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                isDone ? "bg-green-400/20" : isActive ? "bg-primary/20" : "bg-muted/20"
              }`}>
                {isDone ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Icon className={`h-4 w-4 ${isActive ? "text-primary" : step.color}`} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{step.label}</span>
                  {isActive && <span className="text-xs text-primary animate-pulse">En cours…</span>}
                </div>
                {(isActive || isDone) && <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>}
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">{i + 1}/{REPLAY_STEPS.length}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WeatherAILab() {
  const [date] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }));
  const { data, isLoading, error } = trpc.weather.getAILab.useQuery({ date });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto space-y-3 pt-4">
          <div className="flex items-center gap-3 mb-6">
            <FlaskConical className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Weather AI Lab</h1>
          </div>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <FlaskConical className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Données insuffisantes</h2>
          <p className="text-sm text-muted-foreground max-w-xs">Les données du Weather AI Lab seront disponibles après la première collecte de prévisions (05h00).</p>
        </div>
      </div>
    );
  }

  const confidenceEmoji = data.confidenceColor === "green" ? "🟢" : data.confidenceColor === "yellow" ? "🟡" : data.confidenceColor === "orange" ? "🟠" : "🔴";

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-lg font-bold">Weather AI Lab</h1>
              <p className="text-xs text-muted-foreground">Transparence totale sur les calculs IA</p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>{data.engineVersion}</div>
            <div>{new Date(data.calculatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
        </div>

        {/* ── Résumé IA ── */}
        <div className="bg-gradient-to-br from-primary/10 to-blue-900/20 border border-primary/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Résumé IA — {date}</span>
          </div>
          {data.meteoAI ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{data.meteoAI.tempMax?.toFixed(1) ?? "—"}°</span>
                  <span className="text-sm text-muted-foreground">max</span>
                </div>
                <div className="text-sm text-muted-foreground">Min : {data.meteoAI.tempMin?.toFixed(1) ?? "—"}°C</div>
                <div className="text-sm mt-1">{data.meteoAI.condition ?? "—"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  🌧 {data.meteoAI.precipitation?.toFixed(1) ?? "0"} mm · 💨 {data.meteoAI.windSpeed?.toFixed(0) ?? "—"} km/h
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ScoreGauge value={data.confidenceScore} label="Confiance" color={data.confidenceColor} />
                <ScoreGauge value={data.aiScore} label="AI Score" color={data.aiScore >= 75 ? "green" : data.aiScore >= 55 ? "yellow" : "orange"} />
                <ScoreGauge value={data.stabilityScore} label="Stabilité" color={data.stabilityScore >= 70 ? "green" : "yellow"} />
                <ScoreGauge value={data.transparencyScore} label="Transparence" color="green" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Prévision MeteoAI non disponible pour cette date.</p>
          )}

          {/* Regime badge */}
          <div className="mt-3 flex items-center gap-2 p-2 bg-background/30 rounded-lg">
            <span className="text-base">{data.regime.emoji}</span>
            <div>
              <span className="text-xs font-semibold">{data.regime.label}</span>
              <p className="text-xs text-muted-foreground">{data.regime.description}</p>
            </div>
          </div>
        </div>

        {/* ── Scores summary row ── */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span>{confidenceEmoji}</span>
              <span className="font-semibold">Weather Confidence Score</span>
            </div>
            <div className="text-2xl font-bold font-mono text-primary">{data.confidenceScore}<span className="text-sm text-muted-foreground">/100</span></div>
            <div className="text-muted-foreground">{data.confidenceLabel}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Eye className="h-3 w-3 text-primary" />
              <span className="font-semibold">Weather AI Transparency</span>
            </div>
            <div className="text-2xl font-bold font-mono text-primary">{data.transparencyScore}<span className="text-sm text-muted-foreground">%</span></div>
            <div className="text-muted-foreground">{data.modelsUsed} modèles documentés</div>
          </div>
        </div>

        {/* ── Analyse IA ── */}
        <div className="bg-card border border-primary/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Analyse IA</span>
          </div>
          <p className="text-sm text-muted-foreground italic leading-relaxed">"{data.aiAnalysis}"</p>
        </div>

        {/* ── Formule mathématique ── */}
        {data.formula.length > 0 && data.meteoAI && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-yellow-400" />
              <span className="text-sm font-semibold">Calcul mathématique — Température max</span>
            </div>
            <div className="space-y-1.5 font-mono text-sm">
              <div className="text-xs text-muted-foreground mb-2">Prévision IA =</div>
              {data.formula.map((f, i) => (
                <div key={f.service} className="flex items-center gap-2">
                  <span className="text-muted-foreground w-4">{i > 0 ? "+" : " "}</span>
                  <span className="text-primary font-bold w-24 truncate">{f.service}</span>
                  <span className="text-muted-foreground">×</span>
                  <span className="font-bold">{f.weight}%</span>
                  {f.tempMax != null && <span className="text-muted-foreground text-xs">({f.tempMax}°C)</span>}
                </div>
              ))}
              <div className="border-t border-border mt-2 pt-2 flex items-center gap-2">
                <span className="text-muted-foreground w-4">=</span>
                <span className="text-xl font-bold text-primary">{data.meteoAI.tempMax?.toFixed(1)}°C</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Pondération des modèles ── */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-semibold">Pondération des modèles</span>
          </div>
          <div className="space-y-2">
            {data.modelDetails
              .slice()
              .sort((a, b) => b.weight - a.weight)
              .map(m => <WeightBar key={m.serviceName} weight={m.weight} service={m.serviceName} />)}
          </div>
        </div>

        {/* ── Tableau comparatif des modèles ── */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Détail par modèle</span>
            <span className="text-xs text-muted-foreground ml-auto">Cliquer pour développer</span>
          </div>
          <div className="space-y-2">
            {data.modelDetails
              .slice()
              .sort((a, b) => b.weight - a.weight)
              .map((m, i) => <ModelCard key={m.serviceName} model={m} rank={i + 1} />)}
          </div>
        </div>

        {/* ── Divergence des modèles ── */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-semibold">Divergence des modèles</span>
          </div>
          <div className="space-y-3">
            {[
              { label: "🌡 Température", div: data.divergence.temperature, unit: "°C" },
              { label: "🌧 Précipitations", div: data.divergence.precipitation, unit: "mm" },
              { label: "💨 Vent", div: data.divergence.wind, unit: "km/h" },
            ].map(({ label, div, unit }) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <span className="text-sm w-32 flex-shrink-0">{label}</span>
                <div className="flex-1 text-xs text-muted-foreground">
                  Écart max : <span className="font-mono text-foreground">{div.max}{unit}</span>
                  {" · "}σ : <span className="font-mono text-foreground">{div.std}{unit}</span>
                </div>
                <DivergenceBadge level={div.level} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Sources utilisées ── */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-semibold">Sources utilisées</span>
          </div>
          <div className="space-y-3">
            {data.sources.map(s => (
              <div key={s.name} className="border border-border/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">{s.name}</span>
                  <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{s.type}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <div>Mise à jour : <span className="text-foreground">{s.updateFrequency}</span></div>
                  <div>Qualité : <span className="text-green-400">{s.quality}</span></div>
                  <div className="col-span-2">
                    Dernière synchro : <span className="text-foreground">
                      {s.lastSync ? new Date(s.lastSync).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </span>
                  </div>
                </div>
                {s.models.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {s.models.map(m => <span key={m} className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{m}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Explication du calcul (étapes) ── */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-semibold">Explication du calcul</span>
          </div>
          <div className="space-y-2">
            {REPLAY_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-muted/10">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-7 h-7 rounded-full bg-muted/30 flex items-center justify-center`}>
                      <Icon className={`h-3.5 w-3.5 ${step.color}`} />
                    </div>
                    {i < REPLAY_STEPS.length - 1 && <div className="w-px h-3 bg-border" />}
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="text-xs font-semibold">Étape {i + 1} — {step.label}</div>
                    <div className="text-xs text-muted-foreground">{step.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Replay IA ── */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Play className="h-4 w-4 text-green-400" />
            <span className="text-sm font-semibold">Replay IA — Visualiser le calcul</span>
          </div>
          <ReplayAnimation />
        </div>

        {/* ── Footer info ── */}
        <div className="text-center text-xs text-muted-foreground pb-4">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Info className="h-3 w-3" />
            <span>Aucune donnée inventée. Tous les calculs sont basés sur des données réelles.</span>
          </div>
          <div>{data.engineVersion} · Hondeghem (50.76°N, 2.52°E) · {data.modelsUsed} modèles actifs</div>
        </div>
      </div>
    </div>
  );
}
