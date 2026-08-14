import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type MeteoSurfaceTone = "default" | "subtle" | "inset" | "accent";

export const meteoSurfaceClasses: Record<MeteoSurfaceTone, string> = {
  default: "border border-border bg-card text-card-foreground",
  subtle: "border border-border/70 bg-card/65 text-card-foreground",
  inset: "border border-border/70 bg-background/55 text-card-foreground",
  accent: "border border-primary/25 bg-primary/5 text-card-foreground",
};

export interface MeteoSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone?: MeteoSurfaceTone;
}

/**
 * Cadre visuel sans logique métier. Les pages restent propriétaires des données,
 * dimensions, bordures et interactions propres à leur rendu de référence.
 */
export function MeteoSurface({ tone = "default", className, ...props }: MeteoSurfaceProps) {
  return <div className={cn(meteoSurfaceClasses[tone], className)} {...props} />;
}
