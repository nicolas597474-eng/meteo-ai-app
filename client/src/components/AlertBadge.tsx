/**
 * AlertBadge — Badge d'alerte visuel animé (pulsation) pour les régimes météo dangereux.
 * Affiche un badge coloré avec icône MeteoAI quand un régime dangereux est détecté.
 */
import { MeteoIcon } from "@/components/MeteoIcon";

export type DangerousRegimeId = "thunderstorm" | "storm" | "summer_heat" | "cold_wave" | "freezing_rain" | "windy";

interface DangerousRegimeConfig {
  colorClass: string;
  bgClass: string;
  borderClass: string;
  pulseClass: string;
  meteoIconName: string;
  label: string;
}

const DANGEROUS_REGIMES: Record<DangerousRegimeId, DangerousRegimeConfig> = {
  thunderstorm: {
    colorClass: "text-red-300",
    bgClass: "bg-red-500/20",
    borderClass: "border-red-500/50",
    pulseClass: "animate-pulse",
    meteoIconName: "thunderstorm",
    label: "Alerte Orage",
  },
  storm: {
    colorClass: "text-red-300",
    bgClass: "bg-red-500/20",
    borderClass: "border-red-500/50",
    pulseClass: "animate-pulse",
    meteoIconName: "storm",
    label: "Alerte Tempête",
  },
  summer_heat: {
    colorClass: "text-orange-300",
    bgClass: "bg-orange-500/20",
    borderClass: "border-orange-500/50",
    pulseClass: "animate-pulse",
    meteoIconName: "summer_heat",
    label: "Alerte Canicule",
  },
  cold_wave: {
    colorClass: "text-blue-300",
    bgClass: "bg-blue-500/20",
    borderClass: "border-blue-500/50",
    pulseClass: "animate-pulse",
    meteoIconName: "deep_frost",
    label: "Alerte Vague de froid",
  },
  freezing_rain: {
    colorClass: "text-cyan-300",
    bgClass: "bg-cyan-500/20",
    borderClass: "border-cyan-500/50",
    pulseClass: "animate-pulse",
    meteoIconName: "freezing_rain",
    label: "Alerte Verglas",
  },
  windy: {
    colorClass: "text-teal-300",
    bgClass: "bg-teal-500/20",
    borderClass: "border-teal-500/50",
    pulseClass: "animate-pulse",
    meteoIconName: "windy",
    label: "Alerte Vent fort",
  },
};

const DANGEROUS_REGIME_IDS = new Set<string>(Object.keys(DANGEROUS_REGIMES));

interface AlertBadgeProps {
  /** ID du régime actif principal */
  regimeId: string;
  /** Signal interne de classification du régime; une valeur absente masque le badge. */
  confidence?: number | null;
  /** Seuil de confiance minimum pour afficher le badge (défaut: 60) */
  confidenceThreshold?: number;
  /** À fournir seulement si une source a explicitement typé la pluie verglaçante. */
  freezingRainPhaseConfirmed?: boolean;
  /** Taille compacte (pour les pills) ou normale */
  compact?: boolean;
}

export function isDangerousRegime(regimeId: string, freezingRainPhaseConfirmed = false): regimeId is DangerousRegimeId {
  if (regimeId === "freezing_rain") return freezingRainPhaseConfirmed;
  return DANGEROUS_REGIME_IDS.has(regimeId);
}

export function AlertBadge({ regimeId, confidence, confidenceThreshold = 60, freezingRainPhaseConfirmed = false, compact = false }: AlertBadgeProps) {
  if (!isDangerousRegime(regimeId, freezingRainPhaseConfirmed) || confidence == null) return null;
  if (confidence < confidenceThreshold) return null;

  const config = DANGEROUS_REGIMES[regimeId];

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border ${config.bgClass} ${config.borderClass} ${config.colorClass} ${config.pulseClass}`}
      >
        <MeteoIcon name={config.meteoIconName} size={14} />
        <span>{config.label}</span>
      </span>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${config.bgClass} ${config.borderClass} ${config.pulseClass}`}
    >
      <div className={`flex items-center justify-center rounded-full p-1.5 ${config.bgClass}`}>
        <MeteoIcon name={config.meteoIconName} size={20} />
      </div>
      <div>
        <p className={`text-xs font-bold ${config.colorClass}`}>{config.label}</p>
        <p className="text-xs text-muted-foreground">
          Signal de régime détecté · seuil interne atteint
        </p>
      </div>
    </div>
  );
}

export default AlertBadge;
