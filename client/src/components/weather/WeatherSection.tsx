import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { WeatherSurface, type WeatherSurfaceDepth } from "./WeatherSurface";

interface WeatherSectionProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  depth?: WeatherSurfaceDepth;
  className?: string;
}

/** Cadre de section réutilisable qui préserve le contenu et les données de chaque page. */
export function WeatherSection({ title, subtitle, icon, actions, children, depth = "base", className }: WeatherSectionProps) {
  return (
    <WeatherSurface depth={depth} className={cn("rounded-2xl", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="min-w-0">
            {title && <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100">{icon}{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </WeatherSurface>
  );
}
