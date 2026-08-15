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
    container: "border-amber-200/60 bg-gradient-to-r from-amber-500/78 via-amber-500/40 to-amber-500/12 shadow-[0_0_16px_rgba(251,191,36,0.34)]",
    label: "text-amber-50 drop-shadow-[0_0_8px_rgba(251,191,36,0.75)]",
    value: "text-amber-50 drop-shadow-[0_0_14px_rgba(251,191,36,0.85)]",
  },
  warm: {
    level: "warm",
    container: "border-orange-200/70 bg-gradient-to-r from-orange-500/88 via-orange-500/48 to-orange-500/14 shadow-[0_0_20px_rgba(251,146,60,0.46)]",
    label: "text-orange-50 drop-shadow-[0_0_10px_rgba(251,146,60,0.85)]",
    value: "text-orange-50 drop-shadow-[0_0_16px_rgba(251,146,60,0.95)]",
  },
  hot: {
    level: "hot",
    container: "border-orange-100/80 bg-gradient-to-r from-red-600/94 via-orange-500/62 to-orange-500/18 shadow-[0_0_24px_rgba(249,115,22,0.62)]",
    label: "text-white drop-shadow-[0_0_10px_rgba(255,237,213,0.95)]",
    value: "text-white drop-shadow-[0_0_18px_rgba(255,237,213,1)]",
  },
  extremeHeat: {
    level: "extremeHeat",
    container: "border-red-100/90 bg-gradient-to-r from-red-700/96 via-red-600/70 to-orange-500/22 shadow-[0_0_30px_rgba(239,68,68,0.76)]",
    label: "text-white drop-shadow-[0_0_12px_rgba(255,255,255,1)]",
    value: "text-white drop-shadow-[0_0_22px_rgba(255,255,255,1)]",
  },
};

const MIN_TONES: Record<"cool" | "frostRisk" | "freezing" | "severeFreeze", ExtremeTemperatureTone> = {
  cool: {
    level: "cool",
    container: "border-cyan-200/70 bg-gradient-to-r from-blue-500/88 via-sky-500/48 to-sky-500/14 shadow-[0_0_20px_rgba(56,189,248,0.46)]",
    label: "text-cyan-50 drop-shadow-[0_0_10px_rgba(96,165,250,0.85)]",
    value: "text-cyan-50 drop-shadow-[0_0_16px_rgba(96,165,250,0.95)]",
  },
  frostRisk: {
    level: "frostRisk",
    container: "border-sky-100/80 bg-gradient-to-r from-sky-600/94 via-sky-500/62 to-sky-500/18 shadow-[0_0_24px_rgba(14,165,233,0.62)]",
    label: "text-white drop-shadow-[0_0_10px_rgba(224,242,254,0.95)]",
    value: "text-white drop-shadow-[0_0_18px_rgba(224,242,254,1)]",
  },
  freezing: {
    level: "freezing",
    container: "border-cyan-50/90 bg-gradient-to-r from-cyan-600/96 via-blue-500/70 to-blue-500/22 shadow-[0_0_30px_rgba(34,211,238,0.76)]",
    label: "text-white drop-shadow-[0_0_12px_rgba(255,255,255,1)]",
    value: "text-white drop-shadow-[0_0_22px_rgba(255,255,255,1)]",
  },
  severeFreeze: {
    level: "severeFreeze",
    container: "border-white/90 bg-gradient-to-r from-indigo-700/96 via-blue-600/72 to-cyan-400/24 shadow-[0_0_32px_rgba(129,140,248,0.82)]",
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
