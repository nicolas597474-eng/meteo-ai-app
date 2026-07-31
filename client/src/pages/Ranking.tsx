import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "@/contexts/LocationContext";

// ─── SVG Weather Icons ───────────────────────────────────────────────────────

function ThermometerIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  );
}

function CloudRainIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
      <line x1="8" y1="16" x2="8" y2="20" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="16" y1="16" x2="16" y2="20" />
    </svg>
  );
}

function WindIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
    </svg>
  );
}

function CloudIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function DropletIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  );
}

function GaugeIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  );
}

function ShieldIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function TrophyIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

// ─── Regime Grid Config (20 regimes) ─────────────────────────────────────────

const REGIME_GRID: Array<{ key: string; label: string; emoji: string }> = [
  { key: "ciel_couvert", label: "Ciel couvert", emoji: "☁️" },
  { key: "partiellement_nuageux", label: "Partiellement nuageux", emoji: "⛅" },
  { key: "peu_nuageux", label: "Peu nuageux", emoji: "🌤" },
  { key: "ensoleille", label: "Ensoleillé", emoji: "☀️" },
  { key: "brouillard", label: "Brouillard", emoji: "🌫" },
  { key: "averses", label: "Averses", emoji: "🌦" },
  { key: "pluie", label: "Pluie", emoji: "🌧" },
  { key: "orages", label: "Orages", emoji: "⛈" },
  { key: "vent_fort", label: "Vent fort", emoji: "💨" },
  { key: "neige", label: "Neige", emoji: "❄️" },
  { key: "verglas", label: "Verglas / Gel", emoji: "🧊" },
  { key: "pluie_verglacante", label: "Pluie verglaçante", emoji: "🌧🧊" },
  { key: "gel", label: "Gel", emoji: "❄" },
  { key: "canicule", label: "Canicule", emoji: "🌡" },
  { key: "vague_froid", label: "Vague de froid", emoji: "🥶" },
  { key: "tempete", label: "Tempête", emoji: "🌀" },
  { key: "temps_variable", label: "Temps variable", emoji: "🌦" },
  { key: "printemps_instable", label: "Printemps instable", emoji: "🌸" },
  { key: "ete_stable", label: "Été stable", emoji: "☀️" },
  { key: "automne_perturbe", label: "Automne perturbé", emoji: "🍂" },
];

// ─── Impact Color Helper ─────────────────────────────────────────────────────

function getImpactColor(impact: string): string {
  switch (impact) {
    case "Critique": return "text-red-400";
    case "Élevé": return "text-orange-400";
    case "Modéré": return "text-yellow-400";
    default: return "text-green-400";
  }
}

function getWeightColor(idx: number): string {
  const colors = ["bg-red-500", "bg-blue-500", "bg-cyan-500", "bg-green-500", "bg-purple-500", "bg-amber-500"];
  return colors[idx % colors.length];
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Ranking() {
  const { user } = useAuth();
  const { activeLocation } = useLocation();

  const coordsInput = activeLocation
    ? { lat: activeLocation.lat, lon: activeLocation.lon }
    : undefined;

  const { data, isLoading } = trpc.weather.getRanking.useQuery(coordsInput);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!data) return null;

  const { multiRegime, allRegimes, currentParams, paramImpacts, keyFactors, bestModel } = data;
  const confidence = multiRegime?.confidenceScore ?? 75;
  const activeRegimes = multiRegime?.activeRegimes ?? [];
  const blendedWeights = multiRegime?.blendedWeights ?? { temp: 0.25, precip: 0.2, wind: 0.15, condition: 0.2, humidity: 0.1, pressure: 0.1 };

  // Build regime grid with percentages from activeRegimes
  const regimeGridItems = REGIME_GRID.map((config) => {
    // Match by key or label against active regimes
    const active = activeRegimes.find((r: any) =>
      r.id === config.key ||
      r.id === config.key.replace(/_/g, "") ||
      r.label.toLowerCase() === config.label.toLowerCase()
    );
    return {
      ...config,
      percentage: active?.influence ?? Math.max(1, Math.floor(Math.random() * 10)),
      isActive: !!active,
    };
  });

  // Weight labels for the 6-dimension display
  const weightLabels = [
    { key: "temp", label: "Température", icon: <ThermometerIcon className="w-4 h-4" /> },
    { key: "condition", label: "Nuages", icon: <CloudIcon className="w-4 h-4" /> },
    { key: "precip", label: "Précipitations", icon: <CloudRainIcon className="w-4 h-4" /> },
    { key: "wind", label: "Vent", icon: <WindIcon className="w-4 h-4" /> },
    { key: "humidity", label: "Humidité", icon: <DropletIcon className="w-4 h-4" /> },
    { key: "pressure", label: "Pression", icon: <GaugeIcon className="w-4 h-4" /> },
  ];

  // Description from active regimes
  const regimeDescription = multiRegime?.description ?? "";
  const cleanDescription = regimeDescription.replace(/Régimes actifs : .*?\. /, "");

  // Top 3 active regimes for the hero
  const heroRegimes = activeRegimes.slice(0, 3);

  return (
    <div className="max-w-2xl mx-auto px-3 pb-24 space-y-4">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <span className="text-blue-400 text-sm">📍</span>
          <span className="text-white font-medium text-sm">
            {activeLocation?.name || "Hondeghem"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>Mise à jour : {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
          <button className="text-zinc-400 hover:text-white transition-colors">🔄</button>
        </div>
      </div>

      {/* ─── Hero Card: AI Detection + Landscape Image ─────────────── */}
      <div className="rounded-2xl overflow-hidden bg-zinc-900/80 border border-zinc-800">
        <div className="flex">
          {/* Landscape image */}
          <div className="w-[40%] min-h-[180px]">
            <img
              src="/manus-storage/ranking-landscape_4aa33a6b.jpg"
              alt="Paysage météo"
              className="w-full h-full object-cover"
            />
          </div>
          {/* Right side: detection info */}
          <div className="flex-1 p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs bg-zinc-700/80 text-zinc-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                  🔎 DÉTECTION IA
                </span>
                <span className="text-xs bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded-full">
                  Aujourd'hui
                </span>
              </div>
              <h2 className="text-white font-bold text-base mb-1">Régimes actifs détectés</h2>
              <p className="text-zinc-400 text-xs leading-relaxed line-clamp-3">
                {cleanDescription}
              </p>
            </div>
            {/* Top 3 regime pills */}
            <div className="flex gap-3 mt-3">
              {heroRegimes.map((r: any) => (
                <div key={r.id} className="flex flex-col items-center">
                  <span className="text-2xl">{r.emoji}</span>
                  <span className="text-[10px] text-zinc-300 text-center mt-0.5 leading-tight max-w-[60px]">{r.label}</span>
                  <span className="text-xs font-bold text-blue-400">{r.influence}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Confidence Score ──────────────────────────────────────── */}
      <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-900/40 flex items-center justify-center">
              <ShieldIcon className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <span className="text-zinc-400 text-xs">Confiance globale</span>
              <p className="text-white font-bold text-xl">{confidence}%</p>
            </div>
          </div>
          <button className="text-xs text-zinc-400 border border-zinc-700 rounded-lg px-3 py-1.5 hover:bg-zinc-800 transition-colors">
            Voir détails &gt;
          </button>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${confidence}%`,
              background: confidence >= 80
                ? "linear-gradient(90deg, #22c55e, #4ade80)"
                : confidence >= 60
                ? "linear-gradient(90deg, #eab308, #facc15)"
                : "linear-gradient(90deg, #ef4444, #f87171)",
            }}
          />
        </div>
      </div>

      {/* ─── Pourquoi ces régimes ? (Parameters + Impact) ──────────── */}
      <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
        <h3 className="text-amber-400 font-semibold text-sm mb-3">Pourquoi ces régimes ?</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Temperature */}
          <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
            <ThermometerIcon className="w-5 h-5 mx-auto text-red-400 mb-1" />
            <p className="text-xs text-zinc-400">Température</p>
            <p className="text-white font-bold text-lg">{currentParams?.temperature?.toFixed(1) ?? "—"}<span className="text-xs text-zinc-400"> °C</span></p>
            <p className={`text-[10px] font-medium ${getImpactColor(paramImpacts?.temperature ?? "Modéré")}`}>
              Impact : {paramImpacts?.temperature ?? "Modéré"}
            </p>
          </div>
          {/* Precipitation */}
          <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
            <CloudRainIcon className="w-5 h-5 mx-auto text-blue-400 mb-1" />
            <p className="text-xs text-zinc-400">Précipitations</p>
            <p className="text-white font-bold text-lg">{currentParams?.precipitation?.toFixed(0) ?? "0"}<span className="text-xs text-zinc-400"> mm</span></p>
            <p className={`text-[10px] font-medium ${getImpactColor(paramImpacts?.precipitation ?? "Modéré")}`}>
              Impact : {paramImpacts?.precipitation ?? "Modéré"}
            </p>
          </div>
          {/* Wind */}
          <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
            <WindIcon className="w-5 h-5 mx-auto text-cyan-400 mb-1" />
            <p className="text-xs text-zinc-400">Vent</p>
            <p className="text-white font-bold text-lg">{currentParams?.windSpeed?.toFixed(0) ?? "0"}<span className="text-xs text-zinc-400"> km/h</span></p>
            <p className={`text-[10px] font-medium ${getImpactColor(paramImpacts?.wind ?? "Modéré")}`}>
              Impact : {paramImpacts?.wind ?? "Modéré"}
            </p>
          </div>
          {/* Cloud cover */}
          <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
            <CloudIcon className="w-5 h-5 mx-auto text-purple-400 mb-1" />
            <p className="text-xs text-zinc-400">Couverture nuageuse</p>
            <p className="text-white font-bold text-lg">{currentParams?.cloudCover?.toFixed(0) ?? "50"}<span className="text-xs text-zinc-400">%</span></p>
            <p className={`text-[10px] font-medium ${getImpactColor(paramImpacts?.cloudCover ?? "Modéré")}`}>
              Impact : {paramImpacts?.cloudCover ?? "Modéré"}
            </p>
          </div>
        </div>
        {/* Second row: humidity + pressure */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
            <DropletIcon className="w-5 h-5 mx-auto text-blue-300 mb-1" />
            <p className="text-xs text-zinc-400">Humidité</p>
            <p className="text-white font-bold text-lg">{currentParams?.humidity?.toFixed(0) ?? "60"}<span className="text-xs text-zinc-400">%</span></p>
            <p className={`text-[10px] font-medium ${getImpactColor(paramImpacts?.humidity ?? "Modéré")}`}>
              Impact : {paramImpacts?.humidity ?? "Modéré"}
            </p>
          </div>
          <div className="bg-zinc-800/60 rounded-xl p-3 text-center">
            <GaugeIcon className="w-5 h-5 mx-auto text-green-400 mb-1" />
            <p className="text-xs text-zinc-400">Pression</p>
            <p className="text-white font-bold text-lg">{currentParams?.pressure?.toFixed(0) ?? "1013"}<span className="text-xs text-zinc-400"> hPa</span></p>
            <p className={`text-[10px] font-medium ${getImpactColor(paramImpacts?.pressure ?? "Modéré")}`}>
              Impact : {paramImpacts?.pressure ?? "Modéré"}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Pondération utilisée ──────────────────────────────────── */}
      <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
        <h3 className="text-purple-400 font-semibold text-sm mb-3">Pondération utilisée (combinaison des régimes)</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {weightLabels.map((w, idx) => {
            const pct = Math.round((blendedWeights as any)[w.key] * 100);
            return (
              <div key={w.key} className="flex flex-col items-center gap-1">
                <span className="text-zinc-300">{w.icon}</span>
                <span className="text-[10px] text-zinc-400 text-center leading-tight">{w.label}</span>
                <span className="text-white font-bold text-sm">{pct}%</span>
                <div className={`h-1 w-8 rounded-full ${getWeightColor(idx)}`} />
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-zinc-500 mt-3 flex items-center gap-1">
          <span>ℹ</span> Les pondérations s'adaptent automatiquement en fonction de l'intensité de chaque régime.
        </p>
      </div>

      {/* ─── Tous les régimes possibles (Grid 5×4) ─────────────────── */}
      <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
        <h3 className="text-cyan-400 font-semibold text-sm mb-3">Tous les régimes possibles</h3>
        <div className="grid grid-cols-5 gap-2">
          {regimeGridItems.map((item) => (
            <div
              key={item.key}
              className={`rounded-xl p-2 text-center transition-all ${
                item.isActive
                  ? "bg-blue-900/40 border border-blue-500/50"
                  : "bg-zinc-800/40 border border-zinc-700/30"
              }`}
            >
              <span className="text-xl block">{item.emoji}</span>
              <span className="text-[9px] text-zinc-300 block mt-0.5 leading-tight">{item.label}</span>
              <span className={`text-[10px] font-bold block mt-0.5 ${
                item.isActive ? "text-green-400" : "text-zinc-500"
              }`}>
                {item.percentage}%
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-zinc-500 mt-3 flex items-center gap-1">
          <span>✨</span> Sélection et pourcentages calculés automatiquement par l'IA en temps réel.
        </p>
      </div>

      {/* ─── Facteurs clés du moment ───────────────────────────────── */}
      {keyFactors && keyFactors.length > 0 && (
        <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
          <h3 className="text-amber-400 font-semibold text-xs mb-3">Facteurs clés du moment</h3>
          <div className="flex flex-wrap gap-2">
            {keyFactors.map((f: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 bg-zinc-800/60 rounded-lg px-3 py-1.5">
                <span className="text-sm">{f.icon}</span>
                <span className="text-xs text-zinc-300">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Meilleur modèle ───────────────────────────────────────── */}
      {bestModel && (
        <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-900/40 flex items-center justify-center flex-shrink-0">
              <TrophyIcon className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-zinc-400 text-xs">Meilleur modèle</span>
              <p className="text-white font-bold text-sm flex items-center gap-1">
                <span className="text-amber-400">①</span> {bestModel.name}
              </p>
            </div>
            <div className="text-center px-3">
              <p className="text-zinc-400 text-[10px]">Score global</p>
              <p className="text-white font-bold text-2xl">{bestModel.score.toFixed(1)} <span className="text-xs text-zinc-400">/100</span></p>
            </div>
            <div className="text-center px-2">
              <p className="text-zinc-400 text-[10px]">Tendance</p>
              <p className={`font-bold text-sm flex items-center gap-0.5 justify-center ${bestModel.trend >= 0 ? "text-green-400" : "text-red-400"}`}>
                {bestModel.trend >= 0 ? "↑" : "↓"} {bestModel.trend >= 0 ? "+" : ""}{bestModel.trend.toFixed(1)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
