export type ExtremeTemperatureKind = "max" | "min";

export type ExtremeTemperatureTone = {
  level: "mild" | "warm" | "hot" | "extremeHeat" | "cool" | "frostRisk" | "freezing" | "severeFreeze";
  container: string;
  label: string;
  value: string;
};

const MAX_TONES: Record<"mild" | "warm" | "hot" | "extremeHeat", ExtremeTemperatureTone> = {
  mild: {
    level: "mild",
    container: "border-amber-200/45 bg-gradient-to-r from-amber-500/52 via-orange-400/36 to-amber-950/42 shadow-[0_0_15px_rgba(251,191,36,0.26)]",
    label: "text-amber-50 drop-shadow-[0_0_8px_rgba(251,191,36,0.75)]",
    value: "text-amber-50 drop-shadow-[0_0_14px_rgba(251,191,36,0.85)]",
  },
  warm: {
    level: "warm",
    container: "border-orange-200/60 bg-gradient-to-r from-orange-500/70 via-amber-400/52 to-orange-950/45 shadow-[0_0_18px_rgba(251,146,60,0.38)]",
    label: "text-orange-50 drop-shadow-[0_0_10px_rgba(251,146,60,0.85)]",
    value: "text-orange-50 drop-shadow-[0_0_16px_rgba(251,146,60,0.95)]",
  },
  hot: {
    level: "hot",
    container: "border-orange-100/75 bg-gradient-to-r from-red-600/82 via-orange-500/72 to-amber-500/52 shadow-[0_0_22px_rgba(249,115,22,0.56)]",
    label: "text-white drop-shadow-[0_0_10px_rgba(255,237,213,0.95)]",
    value: "text-white drop-shadow-[0_0_18px_rgba(255,237,213,1)]",
  },
  extremeHeat: {
    level: "extremeHeat",
    container: "border-red-100/85 bg-gradient-to-r from-red-700/92 via-orange-600/86 to-yellow-500/64 shadow-[0_0_28px_rgba(239,68,68,0.7)]",
    label: "text-white drop-shadow-[0_0_12px_rgba(255,255,255,1)]",
    value: "text-white drop-shadow-[0_0_22px_rgba(255,255,255,1)]",
  },
};

const MIN_TONES: Record<"cool" | "frostRisk" | "freezing" | "severeFreeze", ExtremeTemperatureTone> = {
  cool: {
    level: "cool",
    container: "border-cyan-200/60 bg-gradient-to-r from-blue-500/70 via-cyan-400/52 to-blue-950/45 shadow-[0_0_18px_rgba(56,189,248,0.38)]",
    label: "text-cyan-50 drop-shadow-[0_0_10px_rgba(96,165,250,0.85)]",
    value: "text-cyan-50 drop-shadow-[0_0_16px_rgba(96,165,250,0.95)]",
  },
  frostRisk: {
    level: "frostRisk",
    container: "border-sky-100/75 bg-gradient-to-r from-sky-600/82 via-cyan-500/68 to-blue-800/60 shadow-[0_0_22px_rgba(14,165,233,0.56)]",
    label: "text-white drop-shadow-[0_0_10px_rgba(224,242,254,0.95)]",
    value: "text-white drop-shadow-[0_0_18px_rgba(224,242,254,1)]",
  },
  freezing: {
    level: "freezing",
    container: "border-cyan-50/85 bg-gradient-to-r from-cyan-600/92 via-sky-500/82 to-blue-700/68 shadow-[0_0_28px_rgba(34,211,238,0.7)]",
    label: "text-white drop-shadow-[0_0_12px_rgba(255,255,255,1)]",
    value: "text-white drop-shadow-[0_0_22px_rgba(255,255,255,1)]",
  },
  severeFreeze: {
    level: "severeFreeze",
    container: "border-white/90 bg-gradient-to-r from-indigo-700/95 via-blue-600/90 to-cyan-400/72 shadow-[0_0_30px_rgba(129,140,248,0.78)]",
    label: "text-white drop-shadow-[0_0_12px_rgba(255,255,255,1)]",
    value: "text-white drop-shadow-[0_0_24px_rgba(255,255,255,1)]",
  },
};

export function getExtremeTemperatureTone(kind: ExtremeTemperatureKind, temperature: number | string | null | undefined): ExtremeTemperatureTone {
  const value = typeof temperature === "number" ? temperature : Number(temperature);
  if (!Number.isFinite(value)) return kind === "max" ? MAX_TONES.mild : MIN_TONES.cool;

  if (kind === "max") {
    if (value > 33) return MAX_TONES.extremeHeat;
    if (value >= 30) return MAX_TONES.hot;
    if (value >= 25) return MAX_TONES.warm;
    return MAX_TONES.mild;
  }

  if (value < -5) return MIN_TONES.severeFreeze;
  if (value < 0) return MIN_TONES.freezing;
  if (value <= 5) return MIN_TONES.frostRisk;
  return MIN_TONES.cool;
}
