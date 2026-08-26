import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

const CONTROL_SURFACE = "border border-white/20 bg-[#0d1117]/90 text-slate-100 shadow-lg shadow-black/25 backdrop-blur-sm";
const CONTROL_FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300";

export function MapControlButton({
  children,
  shape = "circle",
  active = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  shape?: "circle" | "square";
  active?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`${shape === "circle" ? "rounded-full" : "rounded-2xl"} ${CONTROL_SURFACE} grid h-12 w-12 place-items-center transition-[transform,background-color,border-color] hover:border-sky-300/60 hover:bg-[#111c2b] active:scale-[0.97] disabled:cursor-wait disabled:opacity-70 ${CONTROL_FOCUS} ${active ? "border-sky-300/80 bg-sky-400/20 text-sky-100" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function MapZoomControl({
  onZoomIn,
  onZoomOut,
  className = "",
  ariaLabel = "Zoom manuel de la carte",
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={`${CONTROL_SURFACE} overflow-hidden rounded-2xl ${className}`} aria-label={ariaLabel}>
      <button
        type="button"
        onClick={onZoomIn}
        aria-label="Zoomer"
        className={`grid h-14 w-12 place-items-center border-b border-white/10 text-slate-100 transition-colors hover:bg-white/10 active:bg-white/15 ${CONTROL_FOCUS}`}
      >
        <Plus aria-hidden="true" className="h-7 w-7" strokeWidth={2.15} />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        aria-label="Dézoomer"
        className={`grid h-14 w-12 place-items-center text-slate-100 transition-colors hover:bg-white/10 active:bg-white/15 ${CONTROL_FOCUS}`}
      >
        <Minus aria-hidden="true" className="h-7 w-7" strokeWidth={2.15} />
      </button>
    </div>
  );
}

export function MapTypeToggle({
  value,
  onChange,
}: {
  value: "roadmap" | "satellite";
  onChange: (value: "roadmap" | "satellite") => void;
}) {
  return (
    <div className={`${CONTROL_SURFACE} inline-flex h-10 overflow-hidden rounded-xl`} aria-label="Type de carte">
      <button
        type="button"
        onClick={() => onChange("roadmap")}
        aria-pressed={value === "roadmap"}
        className={`min-w-[76px] px-3 text-xs font-semibold transition-colors ${value === "roadmap" ? "bg-sky-400/20 text-sky-100" : "text-slate-400 hover:bg-white/10 hover:text-slate-100"} ${CONTROL_FOCUS}`}
      >
        Plan
      </button>
      <button
        type="button"
        onClick={() => onChange("satellite")}
        aria-pressed={value === "satellite"}
        className={`min-w-[76px] border-l border-white/10 px-3 text-xs font-semibold transition-colors ${value === "satellite" ? "bg-sky-400/20 text-sky-100" : "text-slate-400 hover:bg-white/10 hover:text-slate-100"} ${CONTROL_FOCUS}`}
      >
        Satellite
      </button>
    </div>
  );
}

export const mapActionButtonClass = `${CONTROL_SURFACE} inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-3 text-xs font-semibold transition-[transform,background-color,border-color] hover:border-sky-300/60 hover:bg-[#111c2b] active:scale-[0.98] ${CONTROL_FOCUS}`;
