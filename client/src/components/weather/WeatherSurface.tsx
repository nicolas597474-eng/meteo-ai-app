import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type WeatherSurfaceDepth = "base" | "raised" | "inset" | "observation" | "chart";

const depthClass: Record<WeatherSurfaceDepth, string> = {
  base: "weather-surface",
  raised: "weather-surface weather-surface-hero",
  inset: "weather-surface-inset",
  observation: "weather-observation-surface",
  chart: "weather-surface weather-chart-surface",
};

interface WeatherSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  depth?: WeatherSurfaceDepth;
}

/** Surface visuelle partagée. Ne contient aucune logique météo ni donnée métier. */
export function WeatherSurface({ children, depth = "base", className, ...props }: WeatherSurfaceProps) {
  return (
    <div className={cn(depthClass[depth], className)} {...props}>
      {children}
    </div>
  );
}
