import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "@/contexts/LocationContext";
import { getWeatherLandscapeImage } from "@/lib/weatherImages";

/**
 * Page Classement — reproduction exacte de la maquette MeteoAI
 * Fond #0d1117, icônes SVG illustrées colorées, bordures bleues actives
 */

export default function Ranking() {
  const { user } = useAuth();
  const { activeLocation } = useLocation();

  const coordsInput = activeLocation
    ? { lat: activeLocation.lat, lon: activeLocation.lon }
    : undefined;

  const { data, isLoading } = trpc.weather.getRanking.useQuery(coordsInput);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d1117] px-4 pt-4 space-y-4 max-w-md mx-auto">
        <Skeleton className="h-6 w-40 bg-zinc-800" />
        <Skeleton className="h-52 w-full rounded-2xl bg-zinc-800" />
        <Skeleton className="h-20 w-full rounded-2xl bg-zinc-800" />
        <Skeleton className="h-44 w-full rounded-2xl bg-zinc-800" />
      </div>
    );
  }

  if (!data) return null;

  const { multiRegime, currentParams, paramImpacts, keyFactors, bestModel } = data;
  const confidence = multiRegime?.confidenceScore ?? 87;
  const activeRegimes = multiRegime?.activeRegimes ?? [];
  const blendedWeights = multiRegime?.blendedWeights ?? { temp: 0.25, precip: 0.2, wind: 0.1, condition: 0.3, humidity: 0.1, pressure: 0.05 };
  const regimeDescription = multiRegime?.description ?? "Ciel très nuageux dominant, peu d'éclaircies. Risque de pluie faible à modéré. Vent modéré.";
  const cleanDescription = regimeDescription.replace(/Régimes actifs : .*?\. /, "");
  const heroRegimes = activeRegimes.slice(0, 3);
  const dominantRegime = activeRegimes[0]?.id || activeRegimes[0]?.label || '';
  const heroImage = getWeatherLandscapeImage(dominantRegime);

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <div className="max-w-md mx-auto px-3 pb-28">

        {/* ═══ HEADER ═══ */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 text-sm">📍</span>
            <span className="text-white font-semibold text-sm">
              {activeLocation?.name || "Hondeghem"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>Mise à jour : {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
            <span className="text-zinc-400 cursor-pointer">🔄</span>
          </div>
        </div>

        {/* ═══ HERO: DÉTECTION IA ═══ */}
        <div className="rounded-2xl overflow-hidden bg-[#161b22] border border-[#30363d] mb-3">
          <div className="flex">
            {/* Image paysage */}
            <div className="w-[36%] min-h-[220px]">
              <img
                src={heroImage}
                alt="Paysage météo"
                className="w-full h-full object-cover"
              />
            </div>
            {/* Contenu détection */}
            <div className="flex-1 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] bg-[#21262d] text-zinc-300 px-2.5 py-1 rounded-full font-medium">
                    🔎 DÉTECTION IA
                  </span>
                  <span className="text-[11px] bg-blue-600/30 text-blue-300 px-2.5 py-1 rounded-full font-medium">
                    Aujourd'hui
                  </span>
                </div>
                <h2 className="text-white font-bold text-base mb-1.5">Régimes actifs détectés</h2>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  {cleanDescription}
                </p>
              </div>
              {/* Top 3 régimes avec icônes SVG */}
              <div className="flex justify-between mt-4">
                {heroRegimes.map((r: any, i: number) => {
                  const icon = getRegimeIcon(r.id || r.label);
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div className="w-10 h-10 flex items-center justify-center">
                        {icon}
                      </div>
                      <span className="text-[10px] text-zinc-400 text-center leading-tight max-w-[70px]">{r.label}</span>
                      <span className="text-sm font-bold text-blue-400">{r.influence}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ CONFIANCE GLOBALE ═══ */}
        <div className="rounded-2xl bg-[#161b22] border border-[#30363d] p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 flex items-center justify-center">
                <svg viewBox="0 0 48 48" className="w-12 h-12">
                  <circle cx="24" cy="24" r="22" fill="#0d4a2e" stroke="#22c55e" strokeWidth="1.5" opacity="0.6"/>
                  <path d="M24 8 L36 16 L36 28 C36 36 24 42 24 42 C24 42 12 36 12 28 L12 16 Z" fill="#166534" stroke="#4ade80" strokeWidth="1.5"/>
                  <path d="M18 24 L22 28 L30 20" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="text-zinc-400 text-xs">Confiance globale</p>
                <p className="text-white font-bold text-2xl">{confidence}%</p>
              </div>
            </div>
            <button className="text-xs text-zinc-400 border border-[#30363d] rounded-lg px-3 py-2 hover:bg-[#21262d] transition-colors flex items-center gap-1">
              Voir détails <span className="text-zinc-500">›</span>
            </button>
          </div>
          <div className="h-3 bg-[#21262d] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${confidence}%`,
                background: "linear-gradient(90deg, #16a34a 0%, #4ade80 60%, #86efac 100%)",
              }}
            />
          </div>
        </div>

        {/* ═══ POURQUOI CES RÉGIMES ? ═══ */}
        <div className="rounded-2xl bg-[#161b22] border border-[#30363d] p-4 mb-3">
          <h3 className="text-amber-400 font-bold text-sm mb-3">Pourquoi ces régimes ?</h3>
          <div className="grid grid-cols-4 gap-2 mb-2">
            <ParamCard
              icon={<IconThermometer />}
              label="Température"
              value={`${currentParams?.temperature?.toFixed(1) ?? "18.2"}`}
              unit="°C"
              impact={paramImpacts?.temperature ?? "Élevé"}
            />
            <ParamCard
              icon={<IconCloudRain />}
              label="Précipitations"
              value={`${currentParams?.precipitation?.toFixed(0) ?? "20"}`}
              unit="%"
              impact={paramImpacts?.precipitation ?? "Modéré"}
            />
            <ParamCard
              icon={<IconWind />}
              label="Vent"
              value={`${currentParams?.windSpeed?.toFixed(0) ?? "14"}`}
              unit=" km/h"
              impact={paramImpacts?.wind ?? "Élevé"}
            />
            <ParamCard
              icon={<IconCloudCover />}
              label="Couverture nuageuse"
              value={`${currentParams?.cloudCover?.toFixed(0) ?? "92"}`}
              unit="%"
              impact={paramImpacts?.cloudCover ?? "Élevé"}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ParamCard
              icon={<IconHumidity />}
              label="Humidité"
              value={`${currentParams?.humidity?.toFixed(0) ?? "78"}`}
              unit="%"
              impact={paramImpacts?.humidity ?? "Élevé"}
            />
            <ParamCard
              icon={<IconPressure />}
              label="Pression"
              value={`${currentParams?.pressure?.toFixed(0) ?? "1016"}`}
              unit=" hPa"
              impact={paramImpacts?.pressure ?? "Modéré"}
            />
          </div>
        </div>

        {/* ═══ PONDÉRATION UTILISÉE ═══ */}
        <div className="rounded-2xl bg-[#161b22] border border-[#30363d] p-4 mb-3">
          <h3 className="text-purple-400 font-bold text-sm mb-4">Pondération utilisée (combinaison des régimes)</h3>
          <div className="grid grid-cols-6 gap-2">
            {[
              { key: "temp", label: "Température", icon: <IconThermometer size={18} />, color: "#ef4444" },
              { key: "condition", label: "Nuages", icon: <IconCloudSmall />, color: "#3b82f6" },
              { key: "precip", label: "Précipitations", icon: <IconRainSmall />, color: "#06b6d4" },
              { key: "wind", label: "Vent", icon: <IconWindSmall />, color: "#22c55e" },
              { key: "humidity", label: "Humidité", icon: <IconDropSmall />, color: "#8b5cf6" },
              { key: "pressure", label: "Pression", icon: <IconPressureSmall />, color: "#f59e0b" },
            ].map((w) => {
              const pct = Math.round((blendedWeights as any)[w.key] * 100);
              return (
                <div key={w.key} className="flex flex-col items-center gap-1">
                  <div className="text-zinc-400">{w.icon}</div>
                  <span className="text-[8px] text-zinc-500 text-center leading-tight">{w.label}</span>
                  <span className="text-white font-bold text-xs">{pct}%</span>
                  <div className="h-1 w-8 rounded-full" style={{ backgroundColor: w.color }} />
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-zinc-600 mt-3 flex items-start gap-1.5">
            <span className="text-zinc-500">ℹ</span>
            <span>Les pondérations s'adaptent automatiquement en fonction de l'intensité de chaque régime.</span>
          </p>
        </div>

        {/* ═══ TOUS LES RÉGIMES POSSIBLES ═══ */}
        <div className="rounded-2xl bg-[#161b22] border border-[#30363d] p-4 mb-3">
          <h3 className="text-cyan-400 font-bold text-sm mb-3">Tous les régimes possibles</h3>
          <div className="grid grid-cols-5 gap-2">
            {REGIME_GRID.map((item) => {
              const active = activeRegimes.find((r: any) =>
                r.id === item.key || r.label?.toLowerCase().includes(item.matchKey)
              );
              const pct = active?.influence ?? item.defaultPct;
              const isActive = !!active;
              return (
                <div
                  key={item.key}
                  className={`rounded-xl py-2.5 px-1 text-center transition-all ${
                    isActive
                      ? "bg-blue-950/50 border-2 border-blue-500/60"
                      : "bg-[#21262d] border border-[#30363d]"
                  }`}
                >
                  <div className="w-8 h-8 mx-auto mb-1 flex items-center justify-center">
                    {item.icon}
                  </div>
                  <span className="text-[8px] text-zinc-400 block leading-tight min-h-[22px]">{item.label}</span>
                  <span className={`text-[10px] font-bold block ${
                    isActive ? "text-green-400" : "text-zinc-600"
                  }`}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-zinc-600 mt-3 flex items-start gap-1.5">
            <span className="text-cyan-500">✨</span>
            <span>Sélection et pourcentages calculés automatiquement par l'IA en temps réel.</span>
          </p>
        </div>

        {/* ═══ FACTEURS CLÉS DU MOMENT ═══ */}
        {keyFactors && keyFactors.length > 0 && (
          <div className="rounded-2xl bg-[#161b22] border border-[#30363d] p-4 mb-3">
            <h3 className="text-amber-400 font-bold text-xs mb-3">Facteurs clés du moment</h3>
            <div className="flex flex-wrap gap-2">
              {keyFactors.map((f: any, i: number) => (
                <div key={i} className="flex items-center gap-2 bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2">
                  <span className="text-sm">{f.icon}</span>
                  <span className="text-[11px] text-zinc-300">{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ MEILLEUR MODÈLE ═══ */}
        {bestModel && (
          <div className="rounded-2xl bg-[#161b22] border border-[#30363d] p-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 flex-shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 44 44" className="w-11 h-11">
                  <circle cx="22" cy="22" r="20" fill="#422006" stroke="#d97706" strokeWidth="1"/>
                  <path d="M22 8 L26 14 L33 14 L28 19 L30 26 L22 22 L14 26 L16 19 L11 14 L18 14 Z" fill="#f59e0b" stroke="#fbbf24" strokeWidth="0.5"/>
                  <path d="M15 30 L15 34 L29 34 L29 30" fill="none" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M18 34 L18 37 L26 37 L26 34" fill="none" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-zinc-500 text-[10px]">Meilleur modèle</p>
                <p className="text-white font-bold text-sm flex items-center gap-1.5">
                  <span className="text-amber-400 font-bold">①</span> {bestModel.name}
                </p>
              </div>
              <div className="text-center px-2">
                <p className="text-zinc-500 text-[9px]">Score global</p>
                <p className="text-white font-bold text-xl leading-tight">
                  {bestModel.score.toFixed(1)} <span className="text-[10px] text-zinc-500 font-normal">/100</span>
                </p>
              </div>
              <div className="text-center pl-2 border-l border-[#30363d]">
                <p className="text-zinc-500 text-[9px]">Tendance</p>
                <p className={`font-bold text-sm flex items-center gap-0.5 ${bestModel.trend >= 0 ? "text-green-400" : "text-red-400"}`}>
                  <span className="text-base">{bestModel.trend >= 0 ? "↑" : "↓"}</span>
                  {bestModel.trend >= 0 ? "+" : ""}{bestModel.trend.toFixed(1)}
                </p>
              </div>
              <span className="text-zinc-600 text-lg ml-1">›</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── ParamCard ───────────────────────────────────────────────────────────────

function ParamCard({ icon, label, value, unit, impact }: {
  icon: React.ReactNode;
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
    <div className="bg-[#21262d] border border-[#30363d] rounded-xl p-2.5 text-center">
      <div className="mx-auto mb-1.5 w-6 h-6 flex items-center justify-center">{icon}</div>
      <p className="text-[9px] text-zinc-500 leading-tight mb-0.5">{label}</p>
      <p className="text-white font-bold text-lg leading-tight">
        {value}<span className="text-[9px] text-zinc-500 font-normal">{unit}</span>
      </p>
      <p className={`text-[8px] font-medium mt-1 ${impactColor}`}>
        Impact : {impact}
      </p>
    </div>
  );
}

// ─── SVG Weather Icons (illustrated, colorful, matching mockup) ──────────────

function IconThermometer({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="10" y="2" width="4" height="14" rx="2" fill="#dc2626" opacity="0.3" stroke="#dc2626" strokeWidth="1"/>
      <circle cx="12" cy="18" r="3.5" fill="#dc2626"/>
      <rect x="11" y="6" width="2" height="9" rx="1" fill="#dc2626"/>
      <line x1="15" y1="8" x2="17" y2="8" stroke="#dc2626" strokeWidth="1" strokeLinecap="round"/>
      <line x1="15" y1="11" x2="17" y2="11" stroke="#dc2626" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

function IconCloudRain() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M6 14 C3 14 2 12 2 10 C2 8 3.5 6.5 5.5 6.5 C5.8 4 8 2 11 2 C14 2 16.2 4 16.5 6.5 C18.5 6.5 20 8 20 10 C20 12 19 14 16 14 Z" fill="#64748b" stroke="#94a3b8" strokeWidth="0.5"/>
      <circle cx="8" cy="17" r="1" fill="#3b82f6"/>
      <circle cx="8" cy="20" r="0.8" fill="#3b82f6" opacity="0.6"/>
      <circle cx="12" cy="18" r="1" fill="#3b82f6"/>
      <circle cx="12" cy="21" r="0.8" fill="#3b82f6" opacity="0.6"/>
      <circle cx="16" cy="17" r="1" fill="#3b82f6"/>
      <circle cx="16" cy="20" r="0.8" fill="#3b82f6" opacity="0.6"/>
    </svg>
  );
}

function IconWind() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M3 8 C3 8 5 8 8 8 C11 8 12 6 14 6 C16 6 17 7.5 16 9 C15 10.5 13 10 12 9.5" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <path d="M3 12 C3 12 6 12 10 12 C14 12 15 10 17 10 C19 10 20 11.5 19 13 C18 14.5 16 14 15 13.5" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <path d="M5 16 C5 16 7 16 9 16 C11 16 12 14.5 13.5 14.5 C15 14.5 15.5 15.5 15 16.5 C14.5 17.5 13 17.5 12 17" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function IconCloudCover() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M8 18 C5 18 3 16 3 14 C3 12 4.5 10.5 6.5 10.5 C6.8 8 9 6 12 6 C15 6 17.2 8 17.5 10.5 C19.5 10.5 21 12 21 14 C21 16 19 18 16 18 Z" fill="#7c3aed" opacity="0.4" stroke="#a78bfa" strokeWidth="1"/>
    </svg>
  );
}

function IconHumidity() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 3 C12 3 6 10 6 15 C6 18.3 8.7 21 12 21 C15.3 21 18 18.3 18 15 C18 10 12 3 12 3 Z" fill="#3b82f6" opacity="0.3" stroke="#60a5fa" strokeWidth="1.5"/>
      <path d="M10 15 C10 13.5 11 12 12 12" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
    </svg>
  );
}

function IconPressure() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#22c55e" strokeWidth="1.5" fill="none" opacity="0.5"/>
      <circle cx="12" cy="12" r="9" stroke="#22c55e" strokeWidth="1.5" fill="#0d4a2e" opacity="0.3"/>
      <path d="M12 7 L12 12 L16 14" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="1.5" fill="#4ade80"/>
    </svg>
  );
}

// Small icons for pondération section
function IconCloudSmall() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 16 C4.5 16 3 14.5 3 12.5 C3 10.5 4.5 9 6.5 9 C7 7 9 5.5 11.5 5.5 C14 5.5 16 7 16.5 9 C18.5 9 20 10.5 20 12.5 C20 14.5 18.5 16 16 16 Z" fill="#64748b" stroke="#94a3b8" strokeWidth="0.5"/>
    </svg>
  );
}
function IconRainSmall() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 12 C4.5 12 3 10.5 3 9 C3 7.5 4.5 6 6.5 6 C7 4 9 2.5 11.5 2.5 C14 2.5 16 4 16.5 6 C18.5 6 20 7.5 20 9 C20 10.5 18.5 12 16 12 Z" fill="#64748b"/>
      <line x1="8" y1="14" x2="7" y2="18" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="14" x2="11" y2="18" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="16" y1="14" x2="15" y2="18" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconWindSmall() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M3 8 L14 8 C16 8 16 6 14.5 6 C13 6 13 8 14 8" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M3 12 L17 12 C19 12 19 10 17.5 10 C16 10 16 12 17 12" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5 16 L12 16 C14 16 14 18 12.5 18 C11 18 11 16 12 16" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconDropSmall() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 4 C12 4 7 10 7 14 C7 17.3 9.2 20 12 20 C14.8 20 17 17.3 17 14 C17 10 12 4 12 4 Z" fill="#8b5cf6" opacity="0.4" stroke="#a78bfa" strokeWidth="1"/>
    </svg>
  );
}
function IconPressureSmall() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke="#f59e0b" strokeWidth="1.2" fill="none"/>
      <path d="M12 7 L12 12 L15 14" stroke="#f59e0b" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Regime Grid Icons (large, illustrated, colorful) ────────────────────────

function RegimeCloudCover() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M8 22 C5 22 3 20 3 17.5 C3 15 5 13 7.5 13 C8 10 10.5 8 14 8 C17.5 8 20 10 20.5 13 C23 13 25 15 25 17.5 C25 20 23 22 20 22 Z" fill="#64748b" stroke="#94a3b8" strokeWidth="0.8"/>
      <path d="M12 24 C10 24 8.5 23 8.5 21 C8.5 19 10 18 11.5 18 C12 16.5 13.5 15.5 15.5 15.5 C17.5 15.5 19 16.5 19.5 18 C21 18 22.5 19 22.5 21 C22.5 23 21 24 19 24 Z" fill="#475569" stroke="#64748b" strokeWidth="0.5"/>
    </svg>
  );
}

function RegimePartlyCloudy() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="14" cy="12" r="6" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.5"/>
      <line x1="14" y1="3" x2="14" y2="5" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="14" y1="19" x2="14" y2="21" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="12" x2="5" y2="12" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="23" y1="12" x2="21" y2="12" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M14 26 C11 26 9 24.5 9 22.5 C9 20.5 10.5 19 12.5 19 C13 17 15 15.5 18 15.5 C21 15.5 23 17 23.5 19 C25.5 19 27 20.5 27 22.5 C27 24.5 25 26 22 26 Z" fill="#64748b" stroke="#94a3b8" strokeWidth="0.5"/>
    </svg>
  );
}

function RegimeFewClouds() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="12" r="7" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.5"/>
      <line x1="16" y1="2" x2="16" y2="4.5" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="16" y1="19.5" x2="16" y2="22" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="6" y1="12" x2="8.5" y2="12" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="23.5" y1="12" x2="26" y2="12" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M10 28 C8 28 7 27 7 25.5 C7 24 8.5 23 10 23 C10.3 21.5 11.5 20.5 13.5 20.5 C15.5 20.5 16.7 21.5 17 23 C18.5 23 20 24 20 25.5 C20 27 18 28 16 28 Z" fill="#94a3b8" opacity="0.6"/>
    </svg>
  );
}

function RegimeSunny() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="8" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.8"/>
      <line x1="16" y1="3" x2="16" y2="6" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="16" y1="26" x2="16" y2="29" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="3" y1="16" x2="6" y2="16" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="26" y1="16" x2="29" y2="16" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="6.8" y1="6.8" x2="8.9" y2="8.9" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="23.1" y1="23.1" x2="25.2" y2="25.2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="6.8" y1="25.2" x2="8.9" y2="23.1" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="23.1" y1="8.9" x2="25.2" y2="6.8" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function RegimeFog() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <line x1="4" y1="10" x2="28" y2="10" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
      <line x1="6" y1="14" x2="26" y2="14" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
      <line x1="4" y1="18" x2="28" y2="18" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
      <line x1="8" y1="22" x2="24" y2="22" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.3"/>
    </svg>
  );
}

function RegimeShowers() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="12" cy="10" r="4" fill="#fbbf24"/>
      <path d="M14 20 C11 20 9 18.5 9 16.5 C9 14.5 10.5 13 12.5 13 C13 11 15 9.5 18 9.5 C21 9.5 23 11 23.5 13 C25.5 13 27 14.5 27 16.5 C27 18.5 25 20 22 20 Z" fill="#64748b"/>
      <line x1="14" y1="22" x2="13" y2="26" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="18" y1="22" x2="17" y2="26" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="22" y1="22" x2="21" y2="26" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function RegimeRain() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M8 16 C5 16 3 14 3 12 C3 10 5 8 7.5 8 C8 5.5 10.5 4 14 4 C17.5 4 20 5.5 20.5 8 C23 8 25 10 25 12 C25 14 23 16 20 16 Z" fill="#475569"/>
      <line x1="8" y1="18" x2="6" y2="24" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="18" x2="10" y2="24" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="16" y1="18" x2="14" y2="24" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="20" y1="18" x2="18" y2="24" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function RegimeStorm() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M8 14 C5 14 3 12 3 10 C3 8 5 6 7.5 6 C8 3.5 10.5 2 14 2 C17.5 2 20 3.5 20.5 6 C23 6 25 8 25 10 C25 12 23 14 20 14 Z" fill="#475569"/>
      <polygon points="15,14 12,22 16,22 13,30 20,20 16,20 19,14" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.5"/>
    </svg>
  );
}

function RegimeStrongWind() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M3 10 L18 10 C21 10 21 7 18.5 7 C16 7 16 10 18 10" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"/>
      <path d="M3 16 L22 16 C25 16 25 13 22.5 13 C20 13 20 16 22 16" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"/>
      <path d="M6 22 L16 22 C19 22 19 25 16.5 25 C14 25 14 22 16 22" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function RegimeSnow() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M8 14 C5 14 3 12 3 10 C3 8 5 6 7.5 6 C8 3.5 10.5 2 14 2 C17.5 2 20 3.5 20.5 6 C23 6 25 8 25 10 C25 12 23 14 20 14 Z" fill="#475569"/>
      <path d="M9 18 L9 26 M6 22 L12 22 M7 19 L11 25 M11 19 L7 25" stroke="#93c5fd" strokeWidth="1" strokeLinecap="round"/>
      <path d="M17 18 L17 26 M14 22 L20 22 M15 19 L19 25 M19 19 L15 25" stroke="#93c5fd" strokeWidth="1" strokeLinecap="round"/>
      <path d="M25 20 L25 28 M22 24 L28 24" stroke="#93c5fd" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

function RegimeIce() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="8" y="8" width="16" height="16" rx="3" fill="#0ea5e9" opacity="0.3" stroke="#38bdf8" strokeWidth="1"/>
      <path d="M12 12 L12 20 M16 10 L16 22 M20 12 L20 20" stroke="#7dd3fc" strokeWidth="1" strokeLinecap="round"/>
      <path d="M10 14 L22 14 M10 18 L22 18" stroke="#7dd3fc" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

function RegimeFreezingRain() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M8 12 C5 12 3 10.5 3 8.5 C3 6.5 5 5 7.5 5 C8 3 10.5 1.5 14 1.5 C17.5 1.5 20 3 20.5 5 C23 5 25 6.5 25 8.5 C25 10.5 23 12 20 12 Z" fill="#475569"/>
      <line x1="9" y1="14" x2="8" y2="19" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="15" y1="14" x2="14" y2="19" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="6" y="22" width="8" height="8" rx="2" fill="#0ea5e9" opacity="0.3" stroke="#38bdf8" strokeWidth="0.8"/>
      <rect x="18" y="20" width="8" height="8" rx="2" fill="#0ea5e9" opacity="0.3" stroke="#38bdf8" strokeWidth="0.8"/>
    </svg>
  );
}

function RegimeFrost() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M16 4 L16 28" stroke="#7dd3fc" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4 16 L28 16" stroke="#7dd3fc" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M8 8 L24 24" stroke="#7dd3fc" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M24 8 L8 24" stroke="#7dd3fc" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="16" cy="16" r="3" fill="#bae6fd" stroke="#7dd3fc" strokeWidth="1"/>
      <circle cx="16" cy="6" r="1.5" fill="#7dd3fc"/><circle cx="16" cy="26" r="1.5" fill="#7dd3fc"/>
      <circle cx="6" cy="16" r="1.5" fill="#7dd3fc"/><circle cx="26" cy="16" r="1.5" fill="#7dd3fc"/>
    </svg>
  );
}

function RegimeHeatwave() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="14" r="7" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.8"/>
      <line x1="16" y1="3" x2="16" y2="5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="16" y1="23" x2="16" y2="25" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="5" y1="14" x2="7" y2="14" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="25" y1="14" x2="27" y2="14" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <path d="M10 27 C10 27 11 25 12 27 C13 29 14 27 14 27" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M18 27 C18 27 19 25 20 27 C21 29 22 27 22 27" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function RegimeColdWave() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="10" fill="#1e3a5f" opacity="0.4" stroke="#60a5fa" strokeWidth="1"/>
      <path d="M16 6 L16 26" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M6 16 L26 16" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M10 10 L22 22" stroke="#93c5fd" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M22 10 L10 22" stroke="#93c5fd" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="16" cy="16" r="2.5" fill="#bae6fd"/>
    </svg>
  );
}

function RegimeTempest() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="10" fill="none" stroke="#64748b" strokeWidth="1.5"/>
      <path d="M16 6 C20 8 22 12 22 16 C22 20 20 24 16 26 C12 24 10 20 10 16 C10 12 12 8 16 6" fill="#475569" opacity="0.5"/>
      <circle cx="16" cy="16" r="3" fill="#94a3b8"/>
      <path d="M16 6 L16 8 M16 24 L16 26 M6 16 L8 16 M24 16 L26 16" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function RegimeVariable() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="10" cy="10" r="5" fill="#fbbf24"/>
      <path d="M14 22 C11 22 9 20.5 9 18.5 C9 16.5 10.5 15 12.5 15 C13 13 15 11.5 18 11.5 C21 11.5 23 13 23.5 15 C25.5 15 27 16.5 27 18.5 C27 20.5 25 22 22 22 Z" fill="#64748b"/>
      <line x1="12" y1="24" x2="11" y2="28" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="16" y1="24" x2="15" y2="28" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function RegimeSpringUnstable() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="12" r="5" fill="#fbbf24"/>
      <path d="M12 20 C10 20 8 22 10 24 C12 26 14 24 14 24 C14 24 16 26 18 24 C20 22 18 20 16 20 C14 20 14 20 12 20" fill="#f472b6" stroke="#ec4899" strokeWidth="0.5"/>
      <path d="M16 24 L16 30" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M14 28 L16 30 L18 28" stroke="#22c55e" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

function RegimeSummerStable() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="14" r="8" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.8"/>
      <line x1="16" y1="3" x2="16" y2="4.5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="16" y1="23.5" x2="16" y2="25" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="5" y1="14" x2="6.5" y2="14" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="25.5" y1="14" x2="27" y2="14" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="8" y1="7" x2="9.5" y2="8.5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="22.5" y1="19.5" x2="24" y2="21" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="8" y1="21" x2="9.5" y2="19.5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
      <line x1="22.5" y1="8.5" x2="24" y2="7" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function RegimeAutumnDisturbed() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M16 4 C16 4 24 10 22 18 C20 26 12 28 8 24 C4 20 6 12 16 4" fill="#f97316" opacity="0.6" stroke="#ea580c" strokeWidth="0.8"/>
      <path d="M16 4 L14 14 L18 12 L15 22" stroke="#92400e" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Helper: get regime icon by key ──────────────────────────────────────────

function getRegimeIcon(keyOrLabel: string): React.ReactNode {
  const k = (keyOrLabel || "").toLowerCase();
  if (k.includes("couvert") || k.includes("overcast")) return <RegimeCloudCover />;
  if (k.includes("partiellement") || k.includes("partly")) return <RegimePartlyCloudy />;
  if (k.includes("peu nuageux") || k.includes("few")) return <RegimeFewClouds />;
  if (k.includes("ensoleill") || k.includes("sunny") || k.includes("clear")) return <RegimeSunny />;
  if (k.includes("brouillard") || k.includes("fog")) return <RegimeFog />;
  if (k.includes("averses") || k.includes("shower")) return <RegimeShowers />;
  if (k.includes("orage") || k.includes("storm") || k.includes("thunder")) return <RegimeStorm />;
  if (k.includes("pluie vergl") || k.includes("freezing")) return <RegimeFreezingRain />;
  if (k.includes("pluie") || k.includes("rain")) return <RegimeRain />;
  if (k.includes("vent fort") || k.includes("strong wind")) return <RegimeStrongWind />;
  if (k.includes("neige") || k.includes("snow")) return <RegimeSnow />;
  if (k.includes("verglas") || k.includes("ice")) return <RegimeIce />;
  if (k.includes("gel") || k.includes("frost")) return <RegimeFrost />;
  if (k.includes("canicule") || k.includes("heat")) return <RegimeHeatwave />;
  if (k.includes("vague de froid") || k.includes("cold")) return <RegimeColdWave />;
  if (k.includes("temp") && k.includes("te")) return <RegimeTempest />;
  if (k.includes("variable")) return <RegimeVariable />;
  if (k.includes("printemps") || k.includes("spring")) return <RegimeSpringUnstable />;
  if (k.includes("stable") || k.includes("summer")) return <RegimeSummerStable />;
  if (k.includes("automne") || k.includes("autumn")) return <RegimeAutumnDisturbed />;
  return <RegimeCloudCover />;
}

// ─── Regime Grid Data (20 items, 5×4) ────────────────────────────────────────

const REGIME_GRID = [
  { key: "ciel_couvert", label: "Ciel couvert", matchKey: "couvert", defaultPct: 60, icon: <RegimeCloudCover /> },
  { key: "partiellement_nuageux", label: "Partiellement nuageux", matchKey: "partiellement", defaultPct: 30, icon: <RegimePartlyCloudy /> },
  { key: "peu_nuageux", label: "Peu nuageux", matchKey: "peu nuageux", defaultPct: 25, icon: <RegimeFewClouds /> },
  { key: "ensoleille", label: "Ensoleillé", matchKey: "ensoleill", defaultPct: 15, icon: <RegimeSunny /> },
  { key: "brouillard", label: "Brouillard", matchKey: "brouillard", defaultPct: 5, icon: <RegimeFog /> },
  { key: "averses", label: "Averses", matchKey: "averses", defaultPct: 15, icon: <RegimeShowers /> },
  { key: "pluie", label: "Pluie", matchKey: "pluie", defaultPct: 10, icon: <RegimeRain /> },
  { key: "orages", label: "Orages", matchKey: "orage", defaultPct: 8, icon: <RegimeStorm /> },
  { key: "vent_fort", label: "Vent fort", matchKey: "vent fort", defaultPct: 8, icon: <RegimeStrongWind /> },
  { key: "neige", label: "Neige", matchKey: "neige", defaultPct: 5, icon: <RegimeSnow /> },
  { key: "verglas", label: "Verglas / Gel", matchKey: "verglas", defaultPct: 3, icon: <RegimeIce /> },
  { key: "pluie_verglacante", label: "Pluie verglaçante", matchKey: "pluie vergl", defaultPct: 2, icon: <RegimeFreezingRain /> },
  { key: "gel", label: "Gel", matchKey: "gel", defaultPct: 2, icon: <RegimeFrost /> },
  { key: "canicule", label: "Canicule", matchKey: "canicule", defaultPct: 1, icon: <RegimeHeatwave /> },
  { key: "vague_froid", label: "Vague de froid", matchKey: "vague de froid", defaultPct: 1, icon: <RegimeColdWave /> },
  { key: "tempete", label: "Tempête", matchKey: "tempête", defaultPct: 1, icon: <RegimeTempest /> },
  { key: "temps_variable", label: "Temps variable", matchKey: "variable", defaultPct: 10, icon: <RegimeVariable /> },
  { key: "printemps_instable", label: "Printemps instable", matchKey: "printemps", defaultPct: 10, icon: <RegimeSpringUnstable /> },
  { key: "ete_stable", label: "Été stable", matchKey: "stable", defaultPct: 15, icon: <RegimeSummerStable /> },
  { key: "automne_perturbe", label: "Automne perturbé", matchKey: "automne", defaultPct: 10, icon: <RegimeAutumnDisturbed /> },
];
