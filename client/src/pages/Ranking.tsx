import { useState } from "react";
import { Trophy, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, MapPin, Shield, Info } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";
import { trpc } from "@/lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type ActiveRegime = {
  id: string;
  label: string;
  emoji: string;
  influence: number;
};

type MultiRegime = {
  primaryRegime: { id: string; label: string; emoji: string; description: string; weights: Record<string, number> };
  activeRegimes: ActiveRegime[];
  blendedWeights: { temp: number; precip: number; wind: number; condition: number; humidity: number; pressure: number };
  confidenceScore: number;
  description: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Dynamic Weather Illustration ─────────────────────────────────────────────

function WeatherIllustration({ regimeId, size = 64 }: { regimeId: string; size?: number }) {
  const s = size;
  switch (regimeId) {
    case "storm":
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" fill="rgba(30,20,60,0.6)" />
          <path d="M12 28c0-5 4-9 9-9 1-5 5-9 11-9s10 4 11 9c4 1 7 5 7 9 0 5-4 9-9 9H21c-5 0-9-4-9-9z" fill="#374151"/>
          <path d="M28 34l-5 10h4l-3 10 12-14h-5l4-6z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.5"/>
          <path d="M8 40 Q16 36 24 40 Q32 44 40 40 Q48 36 56 40" stroke="#60a5fa" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <path d="M10 46 Q18 42 26 46 Q34 50 42 46 Q50 42 58 46" stroke="#60a5fa" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6"/>
        </svg>
      );
    case "thunderstorm":
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" fill="rgba(20,20,50,0.5)" />
          <path d="M10 26c0-6 5-10 11-10 1-5 6-10 13-10s12 5 13 10c5 1 9 6 9 10 0 6-5 10-11 10H21c-6 0-11-4-11-10z" fill="#475569"/>
          <polygon points="30,30 24,44 29,44 26,56 38,40 32,40 36,30" fill="#fbbf24"/>
          <line x1="16" y1="50" x2="15" y2="56" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round"/>
          <line x1="24" y1="52" x2="23" y2="58" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round"/>
          <line x1="44" y1="50" x2="43" y2="56" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      );
    case "heavy_rain":
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" fill="rgba(15,30,60,0.4)" />
          <path d="M12 28c0-6 5-10 11-10 1-5 6-9 13-9s12 4 13 9c5 1 9 5 9 10 0 6-5 10-11 10H23c-6 0-11-4-11-10z" fill="#64748b"/>
          {[14,22,30,38,46,18,26,34,42,50].map((x, i) => (
            <line key={i} x1={x} y1={44 + (i % 2) * 2} x2={x - 2} y2={54 + (i % 2) * 2} stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"/>
          ))}
        </svg>
      );
    case "rainy":
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" fill="rgba(20,40,80,0.3)" />
          <path d="M14 26c0-5 4-9 10-9 1-4 5-8 12-8s11 4 12 8c4 1 8 5 8 9 0 5-4 9-10 9H24c-5 0-10-4-10-9z" fill="#64748b"/>
          <line x1="18" y1="44" x2="16" y2="52" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"/>
          <line x1="28" y1="46" x2="26" y2="54" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"/>
          <line x1="38" y1="44" x2="36" y2="52" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"/>
          <line x1="48" y1="46" x2="46" y2="54" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      );
    case "snow":
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" fill="rgba(200,220,255,0.15)" />
          <path d="M14 26c0-5 4-9 10-9 1-4 5-8 12-8s11 4 12 8c4 1 8 5 8 9 0 5-4 9-10 9H24c-5 0-10-4-10-9z" fill="#94a3b8"/>
          {[16,26,36,46,21,31,41].map((x, i) => (
            <g key={i}>
              <circle cx={x} cy={46 + (i % 2) * 4} r="2" fill="white" opacity="0.8"/>
              <line x1={x} y1={43 + (i % 2) * 4} x2={x} y2={49 + (i % 2) * 4} stroke="white" strokeWidth="1" opacity="0.6"/>
              <line x1={x - 3} y1={46 + (i % 2) * 4} x2={x + 3} y2={46 + (i % 2) * 4} stroke="white" strokeWidth="1" opacity="0.6"/>
            </g>
          ))}
        </svg>
      );
    case "frost":
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" fill="rgba(180,220,255,0.15)" />
          <text x="32" y="38" textAnchor="middle" fontSize="28" fill="#bfdbfe">🧊</text>
          <text x="14" y="22" textAnchor="middle" fontSize="12" fill="#93c5fd" opacity="0.7">❄</text>
          <text x="50" y="22" textAnchor="middle" fontSize="12" fill="#93c5fd" opacity="0.7">❄</text>
          <text x="10" y="50" textAnchor="middle" fontSize="10" fill="#93c5fd" opacity="0.5">❄</text>
          <text x="54" y="50" textAnchor="middle" fontSize="10" fill="#93c5fd" opacity="0.5">❄</text>
        </svg>
      );
    case "fog":
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" fill="rgba(148,163,184,0.15)" />
          {[20, 28, 36, 44].map((y, i) => (
            <line key={i} x1={8 + i * 2} y1={y} x2={56 - i * 2} y2={y} stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" opacity={0.4 + i * 0.15}/>
          ))}
          <circle cx="32" cy="18" r="8" fill="#fbbf24" opacity="0.3"/>
        </svg>
      );
    case "windy":
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" fill="rgba(100,200,255,0.1)" />
          <path d="M8 22 Q20 18 32 22 Q44 26 56 22" stroke="#7dd3fc" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <path d="M8 32 Q20 28 36 32 Q48 36 60 32" stroke="#38bdf8" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <path d="M8 42 Q18 38 30 42 Q42 46 52 42" stroke="#0ea5e9" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <circle cx="50" cy="18" r="6" fill="#fbbf24" opacity="0.5"/>
          <circle cx="50" cy="18" r="3" fill="#fbbf24" opacity="0.8"/>
        </svg>
      );
    case "summer_heat":
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" fill="rgba(255,200,50,0.1)" />
          <circle cx="32" cy="28" r="12" fill="#fbbf24"/>
          <circle cx="32" cy="28" r="8" fill="#f59e0b"/>
          {[0,45,90,135,180,225,270,315].map((angle, i) => {
            const rad = angle * Math.PI / 180;
            return <line key={i} x1={32 + Math.cos(rad) * 15} y1={28 + Math.sin(rad) * 15} x2={32 + Math.cos(rad) * 20} y2={28 + Math.sin(rad) * 20} stroke="#fbbf24" strokeWidth="2" strokeLinecap="round"/>;
          })}
          <text x="32" y="54" textAnchor="middle" fontSize="10" fill="#f97316" fontWeight="bold">+30°C</text>
        </svg>
      );
    case "cold_winter":
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" fill="rgba(150,200,255,0.1)" />
          <circle cx="32" cy="24" r="10" fill="#bfdbfe" opacity="0.8"/>
          <text x="32" y="48" textAnchor="middle" fontSize="18" fill="#93c5fd">❄️</text>
          <text x="14" y="26" textAnchor="middle" fontSize="10" fill="#bfdbfe" opacity="0.6">❄</text>
          <text x="50" y="26" textAnchor="middle" fontSize="10" fill="#bfdbfe" opacity="0.6">❄</text>
        </svg>
      );
    case "stable":
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" fill="rgba(100,200,255,0.1)" />
          <circle cx="32" cy="26" r="10" fill="#fbbf24"/>
          <circle cx="32" cy="26" r="7" fill="#f59e0b"/>
          <path d="M20 38c-2 0-4-2-4-4s2-4 4-4c0-3 3-5 6-5 2 0 4 1 5 3 0 0 1 0 1 0 3 0 5 2 5 5s-2 5-5 5H20z" fill="#94a3b8" opacity="0.7"/>
          {[0,45,90,135,180,225,270,315].map((angle, i) => {
            const rad = angle * Math.PI / 180;
            return <line key={i} x1={32 + Math.cos(rad) * 13} y1={26 + Math.sin(rad) * 13} x2={32 + Math.cos(rad) * 17} y2={26 + Math.sin(rad) * 17} stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>;
          })}
        </svg>
      );
    default: // standard
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" fill="rgba(100,150,200,0.1)" />
          <circle cx="36" cy="22" r="9" fill="#fbbf24" opacity="0.9"/>
          <path d="M14 36c-2 0-4-2-4-4s2-4 4-4c0-3 3-5 6-5 2 0 4 1 5 3 1 0 1 0 2 0 3 0 5 2 5 5s-2 5-5 5H14z" fill="#94a3b8"/>
        </svg>
      );
  }
}

// ─── Confidence Badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-green-400 border-green-400/40 bg-green-400/10"
    : score >= 60 ? "text-yellow-400 border-yellow-400/40 bg-yellow-400/10"
    : "text-orange-400 border-orange-400/40 bg-orange-400/10";
  const label = score >= 80 ? "Élevée" : score >= 60 ? "Modérée" : "Faible";
  return (
    <div className={`flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>
      <Shield className="h-3 w-3" />
      <span>Confiance {label} · {score}%</span>
    </div>
  );
}

// ─── Multi-Regime Panel ────────────────────────────────────────────────────────

function MultiRegimePanel({ multiRegime, allRegimes }: { multiRegime: MultiRegime; allRegimes: any[] }) {
  const [showAll, setShowAll] = useState(false);
  const primary = multiRegime.primaryRegime;
  const active = multiRegime.activeRegimes;
  const weights = multiRegime.blendedWeights;

  return (
    <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-600/40 rounded-2xl overflow-hidden">
      {/* Header with illustration */}
      <div className="relative p-4 pb-3">
        <div className="flex items-start gap-4">
          {/* Dynamic illustration */}
          <div className="flex-shrink-0 bg-slate-700/50 rounded-xl p-2 border border-slate-600/30">
            <WeatherIllustration regimeId={primary.id} size={64} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-bold uppercase tracking-widest text-primary/70 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
                DÉTECTION IA
              </span>
              <span className="text-xs bg-primary/15 text-primary border border-primary/25 rounded-full px-2 py-0.5">Aujourd'hui</span>
            </div>
            <h3 className="font-bold text-base text-white leading-tight">Régimes actifs détectés</h3>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed line-clamp-2">
              {primary.description}
            </p>
          </div>
        </div>

        {/* Active regimes pills */}
        <div className="flex flex-wrap gap-2 mt-3">
          {active.map((r, i) => (
            <div
              key={r.id}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium ${
                i === 0
                  ? "bg-primary/15 border-primary/40 text-white"
                  : "bg-slate-700/50 border-slate-600/40 text-slate-300"
              }`}
            >
              <span className="text-sm">{r.emoji}</span>
              <span>{r.label}</span>
              <span className={`font-bold ${i === 0 ? "text-primary" : "text-slate-400"}`}>{r.influence}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Confidence badge */}
      <div className="px-4 pb-3">
        <ConfidenceBadge score={multiRegime.confidenceScore} />
      </div>

      {/* Why these regimes? */}
      <div className="border-t border-slate-700/50 px-4 py-3">
        <p className="text-xs font-semibold text-primary mb-2">Pourquoi ces régimes ?</p>
        <div className="grid grid-cols-2 gap-2">
          {active.slice(0, 4).map(r => (
            <div key={r.id} className="flex items-center gap-2 bg-slate-700/30 rounded-lg px-2.5 py-2">
              <span className="text-lg">{r.emoji}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-white truncate">{r.label}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="flex-1 bg-slate-600 rounded-full h-1 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-blue-400 rounded-full"
                      style={{ width: `${r.influence}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-primary font-bold">{r.influence}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Blended weights */}
      <div className="border-t border-slate-700/50 px-4 py-3">
        <p className="text-xs font-semibold text-primary mb-2">Pondération utilisée (combinaison des régimes)</p>
        <div className="grid grid-cols-3 gap-x-3 gap-y-2">
          {[
            { label: "Température", key: "temp" as const, color: "bg-orange-400", emoji: "🌡" },
            { label: "Nuages", key: "condition" as const, color: "bg-purple-400", emoji: "☁" },
            { label: "Précipitations", key: "precip" as const, color: "bg-blue-400", emoji: "🌧" },
            { label: "Vent", key: "wind" as const, color: "bg-cyan-400", emoji: "💨" },
            { label: "Humidité", key: "humidity" as const, color: "bg-teal-400", emoji: "💧" },
            { label: "Pression", key: "pressure" as const, color: "bg-green-400", emoji: "🔵" },
          ].map(({ label, key, color, emoji }) => {
            const val = Math.round((weights[key] ?? 0) * 100);
            return (
              <div key={key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                    <span>{emoji}</span>
                    <span className="truncate">{label}</span>
                  </span>
                  <span className="text-[10px] font-bold text-white">{val}%</span>
                </div>
                <div className="bg-slate-700 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full ${color} rounded-full`} style={{ width: `${val}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1">
          <Info className="h-3 w-3 flex-shrink-0" />
          Les pondérations s'adaptent automatiquement en fonction de l'intensité de chaque régime.
        </p>
      </div>

      {/* All 12 regimes */}
      {allRegimes.length > 0 && (
        <div className="border-t border-slate-700/50 px-4 py-3">
          <button
            className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1 select-none"
            onClick={() => setShowAll(v => !v)}
          >
            Tous les régimes possibles
            {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showAll && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {allRegimes.map(r => {
                const activeR = active.find(a => a.id === r.id);
                return (
                  <div
                    key={r.id}
                    className={`rounded-lg border px-2.5 py-2 text-xs ${
                      r.id === primary.id
                        ? "border-primary/50 bg-primary/10"
                        : activeR
                        ? "border-slate-500/50 bg-slate-700/40"
                        : "border-slate-700/50 bg-slate-800/30"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{r.emoji}</span>
                      <span className={`font-medium truncate ${r.id === primary.id ? "text-white" : "text-slate-300"}`}>{r.label}</span>
                      {r.id === primary.id && <span className="text-primary ml-auto text-[10px] font-bold">✓</span>}
                      {activeR && r.id !== primary.id && (
                        <span className="text-slate-400 ml-auto text-[10px]">{activeR.influence}%</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Service Card ─────────────────────────────────────────────────────────────

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
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🌡️ Température</span>
                <ScoreBar score={service.avgTempScore} color="orange" />
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">MAE moy.</span><span className="font-mono">{(service.avgTempMae ?? 0).toFixed(2)} °C</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Biais moy.</span><span className={`font-mono ${(service.avgTempBias ?? 0) > 0.2 ? "text-orange-400" : (service.avgTempBias ?? 0) < -0.2 ? "text-blue-400" : "text-green-400"}`}>{(service.avgTempBias ?? 0) > 0 ? "+" : ""}{(service.avgTempBias ?? 0).toFixed(2)} °C</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Erreur max</span><span className="font-mono">{(service.avgTempMaxError ?? 0).toFixed(1)} °C</span></div>
                </div>
              </div>

              {/* 🌧️ Précipitations */}
              <div className="bg-background/50 border border-border/50 rounded-lg p-3 space-y-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🌧️ Précipitations</span>
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
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">💨 Vent</span>
                <ScoreBar score={service.avgWindScore} color="cyan" />
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">MAE vent moy.</span><span className="font-mono">{(service.avgMaeWind ?? 0).toFixed(1)} km/h</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">MAE rafales</span><span className="font-mono">{service.avgWindMaeGusts != null && service.avgWindMaeGusts > 0 ? `${service.avgWindMaeGusts.toFixed(1)} km/h` : "—"}</span></div>
                </div>
              </div>

              {/* ☁️ Conditions */}
              <div className="bg-background/50 border border-border/50 rounded-lg p-3 space-y-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">☁️ Conditions</span>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Ranking() {
  const { activeLocation } = useLocation();
  const { data, isLoading } = trpc.weather.getRanking.useQuery(
    activeLocation ? { lat: activeLocation.lat, lon: activeLocation.lon } : undefined
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-64 bg-muted rounded-2xl" />
            <div className="h-96 bg-muted rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const ranking = data?.ranking ?? [];
  const multiRegime = data?.multiRegime;
  const allRegimes = data?.allRegimes ?? [];

  // Best model for footer
  const topService = ranking[0];

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

        {/* Multi-Regime Panel */}
        {multiRegime ? (
          <MultiRegimePanel multiRegime={multiRegime} allRegimes={allRegimes} />
        ) : (
          /* Fallback: legacy single-regime display */
          data?.regime && (
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-600/50 rounded-xl p-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{data.regime.emoji}</span>
                <div>
                  <h3 className="font-semibold text-sm text-white">Régime actif : {data.regime.label}</h3>
                  <p className="text-xs text-muted-foreground">{data.regime.description}</p>
                </div>
              </div>
            </div>
          )
        )}

        {/* Ranking Cards */}
        {ranking.length > 0 ? (
          <div className="space-y-2">
            {ranking.map((service, i) => (
              <ServiceDimCard key={service.serviceName} service={service} rank={i + 1} />
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Classement en cours de construction</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Les scores de fiabilité seront calculés après la première collecte
              d'observations (20h00). Les données historiques de l'analyse
              26 juin – 2 juillet sont disponibles.
            </p>
          </div>
        )}

        {/* Footer: best model summary */}
        {topService && (
          <div className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏆</span>
              <div>
                <p className="text-xs text-muted-foreground">Meilleur modèle</p>
                <p className="font-bold text-sm">① {topService.serviceName}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Score global</p>
              <p className="font-mono font-bold text-primary text-xl">{(topService.avgScore ?? 0).toFixed(1)} <span className="text-xs text-muted-foreground">/100</span></p>
            </div>
            {ranking.length >= 2 && (
              <div className="text-right hidden sm:block">
                <p className="text-xs text-muted-foreground">Tendance</p>
                <p className="font-mono font-bold text-green-400 text-sm flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {((topService.avgScore ?? 0) - (ranking[1]?.avgScore ?? 0)).toFixed(1)} pts
                </p>
              </div>
            )}
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
      {formatted} {unit}
    </span>
  );
}
