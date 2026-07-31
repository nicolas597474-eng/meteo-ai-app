/**
 * AlertBadge — Badge d'alerte visuel animé (pulsation) pour les régimes météo dangereux.
 * Affiche un badge coloré avec icône lucide-react quand un régime dangereux est détecté.
 */
import { CloudLightning, Wind, Flame, Snowflake, CloudRain, Tornado } from "lucide-react";

export type DangerousRegimeId = "thunderstorm" | "storm" | "summer_heat" | "cold_wave" | "freezing_rain" | "windy";

interface DangerousRegimeConfig {
  colorClass: string;
  bgClass: string;
  borderClass: string;
  pulseClass: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const DANGEROUS_REGIMES: Record<DangerousRegimeId, DangerousRegimeConfig> = {
  thunderstorm: {
    colorClass: "text-red-300",
    bgClass: "bg-red-500/20",
    borderClass: "border-red-500/50",
    pulseClass: "animate-pulse",
    icon: CloudLightning,
    label: "Alerte Orage",
  },
  storm: {
    colorClass: "text-red-300",
    bgClass: "bg-red-500/20",
    borderClass: "border-red-500/50",
    pulseClass: "animate-pulse",
    icon: Tornado,
    label: "Alerte Tempête",
  },
  summer_heat: {
    colorClass: "text-orange-300",
    bgClass: "bg-orange-500/20",
    borderClass: "border-orange-500/50",
    pulseClass: "animate-pulse",
    icon: Flame,
    label: "Alerte Canicule",
  },
  cold_wave: {
    colorClass: "text-blue-300",
    bgClass: "bg-blue-500/20",
    borderClass: "border-blue-500/50",
    pulseClass: "animate-pulse",
    icon: Snowflake,
    label: "Alerte Vague de froid",
  },
  freezing_rain: {
    colorClass: "text-cyan-300",
    bgClass: "bg-cyan-500/20",
    borderClass: "border-cyan-500/50",
    pulseClass: "animate-pulse",
    icon: CloudRain,
    label: "Alerte Verglas",
  },
  windy: {
    colorClass: "text-teal-300",
    bgClass: "bg-teal-500/20",
    borderClass: "border-teal-500/50",
    pulseClass: "animate-pulse",
    icon: Wind,
    label: "Alerte Vent fort",
  },
};

const DANGEROUS_REGIME_IDS = new Set<string>(Object.keys(DANGEROUS_REGIMES));

interface AlertBadgeProps {
  /** ID du régime actif principal */
  regimeId: string;
  /** Confiance du régime (0-100). Le badge ne s'affiche que si > seuil */
  confidence?: number;
  /** Seuil de confiance minimum pour afficher le badge (défaut: 60) */
  confidenceThreshold?: number;
  /** Taille compacte (pour les pills) ou normale */
  compact?: boolean;
}

export function isDangerousRegime(regimeId: string): regimeId is DangerousRegimeId {
  return DANGEROUS_REGIME_IDS.has(regimeId);
}

export function AlertBadge({ regimeId, confidence = 100, confidenceThreshold = 60, compact = false }: AlertBadgeProps) {
  if (!isDangerousRegime(regimeId)) return null;
  if (confidence < confidenceThreshold) return null;

  const config = DANGEROUS_REGIMES[regimeId];
  const Icon = config.icon;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border ${config.bgClass} ${config.borderClass} ${config.colorClass} ${config.pulseClass}`}
      >
        <Icon className="h-3 w-3" />
        <span>{config.label}</span>
      </span>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${config.bgClass} ${config.borderClass} ${config.pulseClass}`}
    >
      <div className={`flex items-center justify-center rounded-full p-1.5 ${config.bgClass}`}>
        <Icon className={`h-4 w-4 ${config.colorClass}`} />
      </div>
      <div>
        <p className={`text-xs font-bold ${config.colorClass}`}>{config.label}</p>
        <p className="text-xs text-muted-foreground">
          Confiance : {confidence}%
        </p>
      </div>
    </div>
  );
}

export default AlertBadge;
