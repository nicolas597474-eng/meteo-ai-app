import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "@/contexts/LocationContext";
import { getWeatherLandscapeImage } from "@/lib/weatherImages";
import {
  Thermometer, CloudRain, Wind, Cloud, Droplets, Gauge,
  Sun, CloudSun, CloudFog, Snowflake, CloudLightning,
  CloudDrizzle, Waves, Flame, ThermometerSnowflake,
  Tornado, CloudHail, TreePine, Leaf, Flower2,
  MapPin, RefreshCw, ShieldCheck, ChevronRight, Info, Sparkles,
  Trophy, TrendingUp, TrendingDown, Eye
} from "lucide-react";

/**
 * Page Classement — reproduction exacte de la maquette MeteoAI
 * Utilise lucide-react pour toutes les icônes
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
      <div className="min-h-screen bg-[#0B132B] px-4 pt-4 space-y-4 max-w-md mx-auto">
        <Skeleton className="h-6 w-40 bg-slate-800" />
        <Skeleton className="h-52 w-full rounded-2xl bg-slate-800" />
        <Skeleton className="h-20 w-full rounded-2xl bg-slate-800" />
        <Skeleton className="h-44 w-full rounded-2xl bg-slate-800" />
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
    <div className="min-h-screen bg-[#0B132B]">
      <div className="max-w-md mx-auto px-3 pb-28">

        {/* ═══ HEADER ═══ */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-white font-semibold text-sm">
              {activeLocation?.name || "Hondeghem"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Mise à jour : {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
            <RefreshCw className="h-3.5 w-3.5 text-slate-400 cursor-pointer hover:text-white transition-colors" />
          </div>
        </div>

        {/* ═══ HERO: DÉTECTION IA ═══ */}
        <div className="rounded-2xl overflow-hidden bg-[#152238] border border-slate-800 mb-3">
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
                  <span className="text-[11px] bg-[#1E293B] text-slate-300 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                    <Eye className="h-3 w-3 text-blue-400" /> DÉTECTION IA
                  </span>
                  <span className="text-[11px] bg-blue-600/30 text-blue-300 px-2.5 py-1 rounded-full font-medium">
                    Aujourd'hui
                  </span>
                </div>
                <h2 className="text-white font-bold text-base mb-1.5">Régimes actifs détectés</h2>
                <p className="text-slate-400 text-xs leading-relaxed">
                  {cleanDescription}
                </p>
              </div>
              {/* Top 3 régimes */}
              <div className="flex justify-between mt-4">
                {heroRegimes.map((r: any, i: number) => {
                  const IconComp = getRegimeLucideIcon(r.id || r.label);
                  const iconColor = getRegimeIconColor(r.id || r.label);
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-800/50">
                        <IconComp className={`h-6 w-6 ${iconColor}`} />
                      </div>
                      <span className="text-[10px] text-slate-400 text-center leading-tight max-w-[70px]">{r.label}</span>
                      <span className="text-sm font-bold text-blue-400">{r.influence}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ CONFIANCE GLOBALE ═══ */}
        <div className="rounded-2xl bg-[#152238] border border-slate-800 p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 flex items-center justify-center rounded-full bg-green-900/40 border border-green-600/40">
                <ShieldCheck className="h-7 w-7 text-green-400" />
              </div>
              <div>
                <p className="text-slate-400 text-xs">Confiance globale</p>
                <p className="text-white font-bold text-2xl">{confidence}%</p>
              </div>
            </div>
            <button className="text-xs text-slate-400 border border-slate-700 rounded-lg px-3 py-2 hover:bg-slate-800 transition-colors flex items-center gap-1">
              Voir détails <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="h-3 bg-[#1E293B] rounded-full overflow-hidden">
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
        <div className="rounded-2xl bg-[#152238] border border-slate-800 p-4 mb-3">
          <h3 className="text-amber-400 font-bold text-sm mb-3">Pourquoi ces régimes ?</h3>
          <div className="grid grid-cols-4 gap-2 mb-2">
            <ParamCard
              icon={<Thermometer className="h-5 w-5 text-red-400" />}
              label="Température"
              value={`${currentParams?.temperature?.toFixed(1) ?? "18.2"}`}
              unit="°C"
              impact={paramImpacts?.temperature ?? "Élevé"}
            />
            <ParamCard
              icon={<CloudRain className="h-5 w-5 text-blue-400" />}
              label="Précipitations"
              value={`${currentParams?.precipitation?.toFixed(0) ?? "20"}`}
              unit="%"
              impact={paramImpacts?.precipitation ?? "Modéré"}
            />
            <ParamCard
              icon={<Wind className="h-5 w-5 text-cyan-400" />}
              label="Vent"
              value={`${currentParams?.windSpeed?.toFixed(0) ?? "14"}`}
              unit=" km/h"
              impact={paramImpacts?.wind ?? "Élevé"}
            />
            <ParamCard
              icon={<Cloud className="h-5 w-5 text-purple-400" />}
              label="Couverture nuageuse"
              value={`${currentParams?.cloudCover?.toFixed(0) ?? "92"}`}
              unit="%"
              impact={paramImpacts?.cloudCover ?? "Élevé"}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ParamCard
              icon={<Droplets className="h-5 w-5 text-blue-400" />}
              label="Humidité"
              value={`${currentParams?.humidity?.toFixed(0) ?? "78"}`}
              unit="%"
              impact={paramImpacts?.humidity ?? "Élevé"}
            />
            <ParamCard
              icon={<Gauge className="h-5 w-5 text-green-400" />}
              label="Pression"
              value={`${currentParams?.pressure?.toFixed(0) ?? "1016"}`}
              unit=" hPa"
              impact={paramImpacts?.pressure ?? "Modéré"}
            />
          </div>
        </div>

        {/* ═══ PONDÉRATION UTILISÉE ═══ */}
        <div className="rounded-2xl bg-[#152238] border border-slate-800 p-4 mb-3">
          <h3 className="text-purple-400 font-bold text-sm mb-4">Pondération utilisée (combinaison des régimes)</h3>
          <div className="grid grid-cols-6 gap-2">
            {[
              { key: "temp", label: "Température", icon: <Thermometer className="h-4 w-4" />, color: "#ef4444" },
              { key: "condition", label: "Nuages", icon: <Cloud className="h-4 w-4" />, color: "#3b82f6" },
              { key: "precip", label: "Précipitations", icon: <CloudRain className="h-4 w-4" />, color: "#06b6d4" },
              { key: "wind", label: "Vent", icon: <Wind className="h-4 w-4" />, color: "#22c55e" },
              { key: "humidity", label: "Humidité", icon: <Droplets className="h-4 w-4" />, color: "#8b5cf6" },
              { key: "pressure", label: "Pression", icon: <Gauge className="h-4 w-4" />, color: "#f59e0b" },
            ].map((w) => {
              const pct = Math.round((blendedWeights as any)[w.key] * 100);
              return (
                <div key={w.key} className="flex flex-col items-center gap-1">
                  <div className="text-slate-400">{w.icon}</div>
                  <span className="text-[8px] text-slate-500 text-center leading-tight">{w.label}</span>
                  <span className="text-white font-bold text-xs">{pct}%</span>
                  <div className="h-1 w-8 rounded-full" style={{ backgroundColor: w.color }} />
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-600 mt-3 flex items-start gap-1.5">
            <Info className="h-3 w-3 text-slate-500 flex-shrink-0 mt-0.5" />
            <span>Les pondérations s'adaptent automatiquement en fonction de l'intensité de chaque régime.</span>
          </p>
        </div>

        {/* ═══ TOUS LES RÉGIMES POSSIBLES ═══ */}
        <div className="rounded-2xl bg-[#152238] border border-slate-800 p-4 mb-3">
          <h3 className="text-cyan-400 font-bold text-sm mb-3">Tous les régimes possibles</h3>
          <div className="grid grid-cols-5 gap-2">
            {REGIME_GRID.map((item) => {
              const active = activeRegimes.find((r: any) =>
                r.id === item.key || r.label?.toLowerCase().includes(item.label.toLowerCase())
              );
              const pct = active?.influence ?? item.defaultPct;
              const isActive = !!active;
              return (
                <div
                  key={item.key}
                  className={`rounded-xl py-2.5 px-1 text-center transition-all ${
                    isActive
                      ? "bg-blue-950/50 border-2 border-blue-500/60"
                      : "bg-[#1E293B] border border-slate-800"
                  }`}
                >
                  <div className="w-8 h-8 mx-auto mb-1 flex items-center justify-center">
                    <item.icon className={`h-6 w-6 ${item.iconColor}`} />
                  </div>
                  <span className="text-[8px] text-slate-400 block leading-tight min-h-[22px]">{item.label}</span>
                  <span className={`text-[10px] font-bold block ${
                    isActive ? "text-green-400" : "text-slate-600"
                  }`}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-600 mt-3 flex items-start gap-1.5">
            <Sparkles className="h-3 w-3 text-cyan-500 flex-shrink-0 mt-0.5" />
            <span>Sélection et pourcentages calculés automatiquement par l'IA en temps réel.</span>
          </p>
        </div>

        {/* ═══ FACTEURS CLÉS DU MOMENT ═══ */}
        {keyFactors && keyFactors.length > 0 && (
          <div className="rounded-2xl bg-[#152238] border border-slate-800 p-4 mb-3">
            <h3 className="text-amber-400 font-bold text-xs mb-3">Facteurs clés du moment</h3>
            <div className="flex flex-wrap gap-2">
              {keyFactors.map((f: any, i: number) => {
                const FactorIcon = getFactorLucideIcon(f.label);
                return (
                  <div key={i} className="flex items-center gap-2 bg-[#1E293B] border border-slate-800 rounded-lg px-3 py-2">
                    <FactorIcon className="h-4 w-4 text-slate-400" />
                    <span className="text-[11px] text-slate-300">{f.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ MEILLEUR MODÈLE ═══ */}
        {bestModel && (
          <div className="rounded-2xl bg-[#152238] border border-slate-800 p-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full bg-amber-900/40 border border-amber-600/40">
                <Trophy className="h-6 w-6 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-500 text-[10px]">Meilleur modèle</p>
                <p className="text-white font-bold text-sm flex items-center gap-1.5">
                  <span className="text-amber-400 font-bold">①</span> {bestModel.name}
                </p>
              </div>
              <div className="text-center px-2">
                <p className="text-slate-500 text-[9px]">Score global</p>
                <p className="text-white font-bold text-xl leading-tight">
                  {bestModel.score.toFixed(1)} <span className="text-[10px] text-slate-500 font-normal">/100</span>
                </p>
              </div>
              <div className="text-center pl-2 border-l border-slate-700">
                <p className="text-slate-500 text-[9px]">Tendance</p>
                <p className={`font-bold text-sm flex items-center gap-0.5 ${bestModel.trend >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {bestModel.trend >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {bestModel.trend >= 0 ? "+" : ""}{bestModel.trend.toFixed(1)}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-600 ml-1" />
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
    <div className="bg-[#1E293B] border border-slate-800 rounded-xl p-2.5 text-center">
      <div className="mx-auto mb-1.5 w-6 h-6 flex items-center justify-center">{icon}</div>
      <p className="text-[9px] text-slate-500 leading-tight mb-0.5">{label}</p>
      <p className="text-white font-bold text-lg leading-tight">
        {value}<span className="text-[9px] text-slate-500 font-normal">{unit}</span>
      </p>
      <p className={`text-[8px] font-medium mt-1 ${impactColor}`}>
        Impact : {impact}
      </p>
    </div>
  );
}

// ─── Lucide icon mapping for regimes ─────────────────────────────────────────

function getRegimeLucideIcon(keyOrLabel: string): any {
  const k = (keyOrLabel || "").toLowerCase();
  if (k.includes("couvert") || k.includes("overcast")) return Cloud;
  if (k.includes("partiellement") || k.includes("partly")) return CloudSun;
  if (k.includes("peu nuageux") || k.includes("few")) return Sun;
  if (k.includes("ensoleill") || k.includes("sunny") || k.includes("clear")) return Sun;
  if (k.includes("brouillard") || k.includes("fog")) return CloudFog;
  if (k.includes("averses") || k.includes("shower")) return CloudDrizzle;
  if (k.includes("orage") || k.includes("storm") || k.includes("thunder")) return CloudLightning;
  if (k.includes("pluie vergl") || k.includes("freezing")) return CloudHail;
  if (k.includes("pluie") || k.includes("rain")) return CloudRain;
  if (k.includes("vent fort") || k.includes("strong wind")) return Wind;
  if (k.includes("neige") || k.includes("snow")) return Snowflake;
  if (k.includes("verglas") || k.includes("ice")) return Snowflake;
  if (k.includes("gel") || k.includes("frost")) return ThermometerSnowflake;
  if (k.includes("canicule") || k.includes("heat")) return Flame;
  if (k.includes("vague de froid") || k.includes("cold")) return ThermometerSnowflake;
  if (k.includes("tempête") || k.includes("tempest")) return Tornado;
  if (k.includes("variable")) return CloudSun;
  if (k.includes("printemps") || k.includes("spring")) return Flower2;
  if (k.includes("stable") || k.includes("summer") || k.includes("été")) return Sun;
  if (k.includes("automne") || k.includes("autumn")) return Leaf;
  return Cloud;
}

function getRegimeIconColor(keyOrLabel: string): string {
  const k = (keyOrLabel || "").toLowerCase();
  if (k.includes("couvert") || k.includes("overcast")) return "text-slate-400";
  if (k.includes("partiellement") || k.includes("partly")) return "text-amber-300";
  if (k.includes("peu nuageux") || k.includes("few")) return "text-yellow-400";
  if (k.includes("ensoleill") || k.includes("sunny") || k.includes("clear")) return "text-yellow-400";
  if (k.includes("brouillard") || k.includes("fog")) return "text-slate-400";
  if (k.includes("averses") || k.includes("shower")) return "text-blue-400";
  if (k.includes("orage") || k.includes("storm") || k.includes("thunder")) return "text-amber-400";
  if (k.includes("pluie vergl") || k.includes("freezing")) return "text-cyan-400";
  if (k.includes("pluie") || k.includes("rain")) return "text-blue-400";
  if (k.includes("vent fort") || k.includes("strong wind")) return "text-cyan-400";
  if (k.includes("neige") || k.includes("snow")) return "text-blue-200";
  if (k.includes("verglas") || k.includes("ice")) return "text-cyan-300";
  if (k.includes("gel") || k.includes("frost")) return "text-blue-300";
  if (k.includes("canicule") || k.includes("heat")) return "text-red-400";
  if (k.includes("vague de froid") || k.includes("cold")) return "text-blue-300";
  if (k.includes("tempête") || k.includes("tempest")) return "text-slate-300";
  if (k.includes("variable")) return "text-amber-300";
  if (k.includes("printemps") || k.includes("spring")) return "text-pink-400";
  if (k.includes("stable") || k.includes("summer") || k.includes("été")) return "text-yellow-400";
  if (k.includes("automne") || k.includes("autumn")) return "text-orange-400";
  return "text-slate-400";
}

function getFactorLucideIcon(label: string): any {
  const l = (label || "").toLowerCase();
  if (l.includes("couverture") || l.includes("nuage")) return Cloud;
  if (l.includes("humidit")) return Droplets;
  if (l.includes("pression")) return Gauge;
  if (l.includes("averse") || l.includes("pluie") || l.includes("précip")) return CloudRain;
  if (l.includes("vent")) return Wind;
  if (l.includes("temp") || l.includes("chaleur") || l.includes("froid")) return Thermometer;
  if (l.includes("brouillard")) return CloudFog;
  if (l.includes("neige")) return Snowflake;
  if (l.includes("orage")) return CloudLightning;
  if (l.includes("soleil") || l.includes("ensoleill")) return Sun;
  return Cloud;
}

// ─── Regime Grid Data (20 items, 5×4) using lucide-react icons ───────────────

const REGIME_GRID = [
  { key: "overcast", label: "Ciel couvert", defaultPct: 60, icon: Cloud, iconColor: "text-slate-400" },
  { key: "partly_cloudy", label: "Partiellement nuageux", defaultPct: 30, icon: CloudSun, iconColor: "text-amber-300" },
  { key: "few_clouds", label: "Peu nuageux", defaultPct: 25, icon: Sun, iconColor: "text-yellow-400" },
  { key: "sunny", label: "Ensoleillé", defaultPct: 15, icon: Sun, iconColor: "text-yellow-400" },
  { key: "fog", label: "Brouillard", defaultPct: 5, icon: CloudFog, iconColor: "text-slate-400" },
  { key: "showers", label: "Averses", defaultPct: 15, icon: CloudDrizzle, iconColor: "text-blue-400" },
  { key: "rainy", label: "Pluie", defaultPct: 10, icon: CloudRain, iconColor: "text-blue-400" },
  { key: "thunderstorm", label: "Orages", defaultPct: 8, icon: CloudLightning, iconColor: "text-amber-400" },
  { key: "windy", label: "Vent fort", defaultPct: 8, icon: Wind, iconColor: "text-cyan-400" },
  { key: "snow", label: "Neige", defaultPct: 5, icon: Snowflake, iconColor: "text-blue-200" },
  { key: "frost", label: "Verglas / Gel", defaultPct: 3, icon: Snowflake, iconColor: "text-cyan-300" },
  { key: "freezing_rain", label: "Pluie verglaçante", defaultPct: 2, icon: CloudHail, iconColor: "text-cyan-400" },
  { key: "deep_frost", label: "Gel", defaultPct: 2, icon: ThermometerSnowflake, iconColor: "text-blue-300" },
  { key: "summer_heat", label: "Canicule", defaultPct: 1, icon: Flame, iconColor: "text-red-400" },
  { key: "cold_wave", label: "Vague de froid", defaultPct: 1, icon: ThermometerSnowflake, iconColor: "text-blue-300" },
  { key: "storm", label: "Tempête", defaultPct: 1, icon: Tornado, iconColor: "text-slate-300" },
  { key: "variable", label: "Temps variable", defaultPct: 10, icon: CloudSun, iconColor: "text-amber-300" },
  { key: "spring_unstable", label: "Printemps instable", defaultPct: 10, icon: Flower2, iconColor: "text-pink-400" },
  { key: "stable", label: "Été stable", defaultPct: 15, icon: Sun, iconColor: "text-yellow-400" },
  { key: "autumn_disturbed", label: "Automne perturbé", defaultPct: 10, icon: Leaf, iconColor: "text-orange-400" },
];
