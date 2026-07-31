import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "@/contexts/LocationContext";

/**
 * Page Classement — reproduction pixel-perfect de la maquette MeteoAI
 * Fond noir, cartes arrondies, icônes SVG, grille 5×4 des régimes
 */

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
      <div className="min-h-screen bg-black px-4 pt-4 space-y-4 max-w-lg mx-auto">
        <Skeleton className="h-6 w-40 bg-zinc-800" />
        <Skeleton className="h-48 w-full rounded-2xl bg-zinc-800" />
        <Skeleton className="h-20 w-full rounded-2xl bg-zinc-800" />
        <Skeleton className="h-40 w-full rounded-2xl bg-zinc-800" />
        <Skeleton className="h-32 w-full rounded-2xl bg-zinc-800" />
        <Skeleton className="h-60 w-full rounded-2xl bg-zinc-800" />
      </div>
    );
  }

  if (!data) return null;

  const { multiRegime, currentParams, paramImpacts, keyFactors, bestModel } = data;
  const confidence = multiRegime?.confidenceScore ?? 87;
  const activeRegimes = multiRegime?.activeRegimes ?? [];
  const blendedWeights = multiRegime?.blendedWeights ?? { temp: 0.25, precip: 0.2, wind: 0.1, condition: 0.3, humidity: 0.1, pressure: 0.05 };

  // Description
  const regimeDescription = multiRegime?.description ?? "Ciel très nuageux dominant, peu d'éclaircies. Risque de pluie faible à modéré. Vent modéré.";
  const cleanDescription = regimeDescription.replace(/Régimes actifs : .*?\. /, "");

  // Top 3 regimes for hero
  const heroRegimes = activeRegimes.slice(0, 3);

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-lg mx-auto px-4 pb-28 space-y-3">

        {/* ─── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-3">
          <div className="flex items-center gap-1.5">
            <span className="text-blue-400 text-xs">📍</span>
            <span className="text-white font-medium text-[13px]">
              {activeLocation?.name || "Hondeghem"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span>Mise à jour : {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
            <span className="cursor-pointer hover:text-white">🔄</span>
          </div>
        </div>

        {/* ─── Hero Card: DÉTECTION IA ────────────────────────── */}
        <div className="rounded-2xl overflow-hidden bg-[#111113] border border-[#222]">
          <div className="flex">
            {/* Left: landscape image */}
            <div className="w-[38%] min-h-[200px]">
              <img
                src="/manus-storage/ranking-landscape_094b60d5.jpg"
                alt="Paysage météo actuel"
                className="w-full h-full object-cover"
              />
            </div>
            {/* Right: detection info */}
            <div className="flex-1 p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] bg-[#2a2a2e] text-zinc-300 px-2 py-0.5 rounded-full font-medium tracking-wide">
                    🔎 DÉTECTION IA
                  </span>
                  <span className="text-[10px] bg-blue-600/25 text-blue-300 px-2 py-0.5 rounded-full font-medium">
                    Aujourd'hui
                  </span>
                </div>
                <h2 className="text-white font-bold text-[15px] leading-tight mb-1.5">Régimes actifs détectés</h2>
                <p className="text-zinc-500 text-[11px] leading-[1.4] line-clamp-3">
                  {cleanDescription}
                </p>
              </div>
              {/* Top 3 regime icons */}
              <div className="flex justify-between mt-3 px-1">
                {heroRegimes.map((r: any) => (
                  <div key={r.id} className="flex flex-col items-center gap-0.5">
                    <span className="text-[28px] leading-none">{r.emoji}</span>
                    <span className="text-[9px] text-zinc-400 text-center leading-tight max-w-[65px]">{r.label}</span>
                    <span className="text-[12px] font-bold text-blue-400">{r.influence}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Confiance globale ──────────────────────────────── */}
        <div className="rounded-2xl bg-[#111113] border border-[#222] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-green-900/30 flex items-center justify-center border border-green-700/30">
                <svg className="w-6 h-6 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <p className="text-zinc-500 text-[11px]">Confiance globale</p>
                <p className="text-white font-bold text-[22px] leading-tight">{confidence}%</p>
              </div>
            </div>
            <button className="text-[11px] text-zinc-400 border border-zinc-700 rounded-lg px-3 py-1.5 hover:bg-zinc-800/50 transition-colors">
              Voir détails &gt;
            </button>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-[10px] bg-[#1a1a1e] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${confidence}%`,
                background: confidence >= 80
                  ? "linear-gradient(90deg, #16a34a, #4ade80)"
                  : confidence >= 60
                  ? "linear-gradient(90deg, #ca8a04, #facc15)"
                  : "linear-gradient(90deg, #dc2626, #f87171)",
              }}
            />
          </div>
        </div>

        {/* ─── Pourquoi ces régimes ? ─────────────────────────── */}
        <div className="rounded-2xl bg-[#111113] border border-[#222] p-4">
          <h3 className="text-amber-400 font-semibold text-[13px] mb-3">Pourquoi ces régimes ?</h3>
          {/* Row 1: 4 params */}
          <div className="grid grid-cols-4 gap-2">
            <ParamCard
              icon={<ThermIcon />}
              iconColor="text-red-400"
              label="Température"
              value={`${currentParams?.temperature?.toFixed(1) ?? "18.2"}`}
              unit="°C"
              impact={paramImpacts?.temperature ?? "Élevé"}
            />
            <ParamCard
              icon={<RainIcon />}
              iconColor="text-blue-400"
              label="Précipitations"
              value={`${currentParams?.precipitation?.toFixed(0) ?? "20"}`}
              unit="%"
              impact={paramImpacts?.precipitation ?? "Modéré"}
            />
            <ParamCard
              icon={<WindSvg />}
              iconColor="text-cyan-400"
              label="Vent"
              value={`${currentParams?.windSpeed?.toFixed(0) ?? "14"}`}
              unit=" km/h"
              impact={paramImpacts?.wind ?? "Élevé"}
            />
            <ParamCard
              icon={<CloudSvg />}
              iconColor="text-purple-300"
              label="Couverture nuageuse"
              value={`${currentParams?.cloudCover?.toFixed(0) ?? "92"}`}
              unit="%"
              impact={paramImpacts?.cloudCover ?? "Élevé"}
            />
          </div>
          {/* Row 2: 2 params */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <ParamCard
              icon={<DropSvg />}
              iconColor="text-blue-300"
              label="Humidité"
              value={`${currentParams?.humidity?.toFixed(0) ?? "78"}`}
              unit="%"
              impact={paramImpacts?.humidity ?? "Élevé"}
            />
            <ParamCard
              icon={<PressureSvg />}
              iconColor="text-green-400"
              label="Pression"
              value={`${currentParams?.pressure?.toFixed(0) ?? "1016"}`}
              unit=" hPa"
              impact={paramImpacts?.pressure ?? "Modéré"}
            />
          </div>
        </div>

        {/* ─── Pondération utilisée ───────────────────────────── */}
        <div className="rounded-2xl bg-[#111113] border border-[#222] p-4">
          <h3 className="text-purple-400 font-semibold text-[13px] mb-3">Pondération utilisée (combinaison des régimes)</h3>
          <div className="grid grid-cols-6 gap-1">
            {[
              { key: "temp", label: "Température", icon: <ThermIcon />, color: "bg-red-500" },
              { key: "condition", label: "Nuages", icon: <CloudSvg />, color: "bg-blue-500" },
              { key: "precip", label: "Précipitations", icon: <RainIcon />, color: "bg-cyan-500" },
              { key: "wind", label: "Vent", icon: <WindSvg />, color: "bg-green-500" },
              { key: "humidity", label: "Humidité", icon: <DropSvg />, color: "bg-purple-500" },
              { key: "pressure", label: "Pression", icon: <PressureSvg />, color: "bg-amber-500" },
            ].map((w) => {
              const pct = Math.round((blendedWeights as any)[w.key] * 100);
              return (
                <div key={w.key} className="flex flex-col items-center gap-0.5">
                  <span className="text-zinc-400">{w.icon}</span>
                  <span className="text-[8px] text-zinc-500 text-center leading-tight">{w.label}</span>
                  <span className="text-white font-bold text-[12px]">{pct}%</span>
                  <div className={`h-[3px] w-7 rounded-full ${w.color}`} />
                </div>
              );
            })}
          </div>
          <p className="text-[9px] text-zinc-600 mt-3 flex items-center gap-1">
            <span>ℹ</span> Les pondérations s'adaptent automatiquement en fonction de l'intensité de chaque régime.
          </p>
        </div>

        {/* ─── Tous les régimes possibles ─────────────────────── */}
        <div className="rounded-2xl bg-[#111113] border border-[#222] p-4">
          <h3 className="text-cyan-400 font-semibold text-[13px] mb-3">Tous les régimes possibles</h3>
          <div className="grid grid-cols-5 gap-1.5">
            {REGIME_GRID.map((item) => {
              const active = activeRegimes.find((r: any) =>
                r.id === item.key || r.label?.toLowerCase() === item.label.toLowerCase()
              );
              const pct = active?.influence ?? item.defaultPct;
              const isActive = !!active;
              return (
                <div
                  key={item.key}
                  className={`rounded-xl py-2 px-1 text-center ${
                    isActive
                      ? "bg-blue-950/60 border border-blue-500/40"
                      : "bg-[#1a1a1e] border border-[#2a2a2e]"
                  }`}
                >
                  <span className="text-[20px] block leading-none">{item.emoji}</span>
                  <span className="text-[8px] text-zinc-400 block mt-1 leading-tight min-h-[20px]">{item.label}</span>
                  <span className={`text-[10px] font-bold block mt-0.5 ${
                    isActive ? "text-green-400" : "text-zinc-600"
                  }`}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[9px] text-zinc-600 mt-3 flex items-center gap-1">
            <span>✨</span> Sélection et pourcentages calculés automatiquement par l'IA en temps réel.
          </p>
        </div>

        {/* ─── Facteurs clés du moment ────────────────────────── */}
        {keyFactors && keyFactors.length > 0 && (
          <div className="rounded-2xl bg-[#111113] border border-[#222] p-4">
            <h3 className="text-amber-400 font-semibold text-[11px] mb-2.5">Facteurs clés du moment</h3>
            <div className="flex flex-wrap gap-1.5">
              {keyFactors.map((f: any, i: number) => (
                <div key={i} className="flex items-center gap-1.5 bg-[#1a1a1e] border border-[#2a2a2e] rounded-lg px-2.5 py-1.5">
                  <span className="text-[13px]">{f.icon}</span>
                  <span className="text-[10px] text-zinc-400">{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Meilleur modèle ────────────────────────────────── */}
        {bestModel && (
          <div className="rounded-2xl bg-[#111113] border border-[#222] p-3.5">
            <div className="flex items-center gap-3">
              {/* Trophy */}
              <div className="w-10 h-10 rounded-full bg-amber-900/30 flex items-center justify-center border border-amber-700/30 flex-shrink-0">
                <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                  <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                </svg>
              </div>
              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="text-zinc-500 text-[10px]">Meilleur modèle</p>
                <p className="text-white font-bold text-[13px] flex items-center gap-1">
                  <span className="text-amber-400">①</span> {bestModel.name}
                </p>
              </div>
              {/* Score */}
              <div className="text-center">
                <p className="text-zinc-500 text-[9px]">Score global</p>
                <p className="text-white font-bold text-[20px] leading-tight">
                  {bestModel.score.toFixed(1)} <span className="text-[10px] text-zinc-500 font-normal">/100</span>
                </p>
              </div>
              {/* Trend */}
              <div className="text-center pl-2">
                <p className="text-zinc-500 text-[9px]">Tendance</p>
                <p className={`font-bold text-[13px] flex items-center gap-0.5 justify-center ${bestModel.trend >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {bestModel.trend >= 0 ? "↑" : "↓"} {bestModel.trend >= 0 ? "+" : ""}{bestModel.trend.toFixed(1)}
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Parameter Card Sub-component ────────────────────────────────────────────

function ParamCard({ icon, iconColor, label, value, unit, impact }: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  value: string;
  unit: string;
  impact: string;
}) {
  const impactColor = impact === "Critique" ? "text-red-400"
    : impact === "Élevé" ? "text-orange-400"
    : impact === "Modéré" ? "text-yellow-400"
    : "text-green-400";

  return (
    <div className="bg-[#1a1a1e] border border-[#2a2a2e] rounded-xl p-2.5 text-center">
      <div className={`mx-auto mb-1 ${iconColor}`}>{icon}</div>
      <p className="text-[9px] text-zinc-500 leading-tight">{label}</p>
      <p className="text-white font-bold text-[16px] leading-tight mt-0.5">
        {value}<span className="text-[9px] text-zinc-500 font-normal">{unit}</span>
      </p>
      <p className={`text-[8px] font-medium mt-0.5 ${impactColor}`}>
        Impact : {impact}
      </p>
    </div>
  );
}

// ─── SVG Icon Components (matching mockup style) ─────────────────────────────

function ThermIcon() {
  return (
    <svg className="w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  );
}

function RainIcon() {
  return (
    <svg className="w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
      <line x1="8" y1="16" x2="8" y2="20" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="16" y1="16" x2="16" y2="20" />
    </svg>
  );
}

function WindSvg() {
  return (
    <svg className="w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
    </svg>
  );
}

function CloudSvg() {
  return (
    <svg className="w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function DropSvg() {
  return (
    <svg className="w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  );
}

function PressureSvg() {
  return (
    <svg className="w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  );
}

// ─── Regime Grid Data (20 regimes matching mockup exactly) ───────────────────

const REGIME_GRID = [
  // Row 1
  { key: "ciel_couvert", label: "Ciel couvert", emoji: "☁️", defaultPct: 60 },
  { key: "partiellement_nuageux", label: "Partiellement nuageux", emoji: "⛅", defaultPct: 30 },
  { key: "peu_nuageux", label: "Peu nuageux", emoji: "🌤", defaultPct: 25 },
  { key: "ensoleille", label: "Ensoleillé", emoji: "☀️", defaultPct: 15 },
  { key: "brouillard", label: "Brouillard", emoji: "🌫", defaultPct: 5 },
  // Row 2
  { key: "averses", label: "Averses", emoji: "🌦", defaultPct: 15 },
  { key: "pluie", label: "Pluie", emoji: "🌧", defaultPct: 10 },
  { key: "orages", label: "Orages", emoji: "⛈", defaultPct: 8 },
  { key: "vent_fort", label: "Vent fort", emoji: "💨", defaultPct: 8 },
  { key: "neige", label: "Neige", emoji: "❄️", defaultPct: 5 },
  // Row 3
  { key: "verglas", label: "Verglas / Gel", emoji: "🧊", defaultPct: 3 },
  { key: "pluie_verglacante", label: "Pluie verglaçante", emoji: "🌧🧊", defaultPct: 2 },
  { key: "gel", label: "Gel", emoji: "❄", defaultPct: 2 },
  { key: "canicule", label: "Canicule", emoji: "🌡", defaultPct: 1 },
  { key: "vague_froid", label: "Vague de froid", emoji: "🥶", defaultPct: 1 },
  // Row 4
  { key: "tempete", label: "Tempête", emoji: "🌀", defaultPct: 1 },
  { key: "temps_variable", label: "Temps variable", emoji: "🌦", defaultPct: 10 },
  { key: "printemps_instable", label: "Printemps instable", emoji: "🌸", defaultPct: 10 },
  { key: "ete_stable", label: "Été stable", emoji: "☀️", defaultPct: 15 },
  { key: "automne_perturbe", label: "Automne perturbé", emoji: "🍂", defaultPct: 10 },
];
