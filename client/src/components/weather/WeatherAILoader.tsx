import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WeatherAILoaderGraphic } from "./EarthLoaderVisual";

export interface WeatherAILoaderProps {
  /** État réel du chargement */
  loading: boolean;
  /** Texte dynamique ou accessible personnalisé */
  message?: string;
  /** Variante visuelle */
  variant?: "full" | "light" | "compact";
  /** Classes CSS additionnelles */
  className?: string;
  /** Callback exécuté lorsque la transition de sortie est achevée et le composant libéré */
  onTransitionEnd?: () => void;
  /** Forcer le mode animations réduites pour les tests ou besoins spécifiques */
  reducedMotion?: boolean;
}

type LoaderPhase = "init" | "collect" | "fuse" | "ready";

const PHASE_CONFIG: Record<
  LoaderPhase,
  { badge: string; defaultMessage: string; subtitle: string }
> = {
  init: {
    badge: "Phase 1/3 · Initialisation",
    defaultMessage: "Initialisation de MeteoAI…",
    subtitle: "Activation du moteur météo et synchronisation",
  },
  collect: {
    badge: "Phase 2/3 · Collecte multi-sources",
    defaultMessage: "Préparation des données météo…",
    subtitle: "Modèles atmosphériques · Réseaux de stations physiques",
  },
  fuse: {
    badge: "Phase 3/3 · Fusion IA & radar",
    defaultMessage: "Analyse et fusion des données météo…",
    subtitle: "Analyse radar · Fusion des observations · Synthèse IA",
  },
  ready: {
    badge: "Données prêtes",
    defaultMessage: "Affichage des prévisions…",
    subtitle: "Transition immédiate vers vos données météo",
  },
};

export function WeatherAILoader({
  loading,
  message,
  variant = "full",
  className,
  onTransitionEnd,
  reducedMotion: forcedReducedMotion,
}: WeatherAILoaderProps) {
  const [phase, setPhase] = useState<LoaderPhase>("init");
  const [isVisible, setIsVisible] = useState(loading);
  const [isExiting, setIsExiting] = useState(false);
  const wasLoadingRef = useRef(loading);
  const [systemReducedMotion, setSystemReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  const onTransitionEndRef = useRef(onTransitionEnd);
  onTransitionEndRef.current = onTransitionEnd;

  // Détection prefers-reduced-motion
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystemReducedMotion(mediaQuery.matches);
    const onChange = (e: MediaQueryListEvent) =>
      setSystemReducedMotion(e.matches);
    mediaQuery.addEventListener?.("change", onChange);
    return () => mediaQuery.removeEventListener?.("change", onChange);
  }, []);

  const prefersReduced = forcedReducedMotion ?? systemReducedMotion;

  // Gestion des phases continues (sans bloquer ni retarder la fin réelle du chargement)
  useEffect(() => {
    if (!loading) {
      if (!wasLoadingRef.current) return;
      wasLoadingRef.current = false;
      // Dès que loading passe à false, transition immédiate vers la fin
      setPhase("ready");
      setIsExiting(true);
      const exitTimer = window.setTimeout(() => {
        setIsVisible(false);
        onTransitionEndRef.current?.();
      }, 340);
      return () => window.clearTimeout(exitTimer);
    }

    wasLoadingRef.current = true;
    // Chargement en cours : progression visuelle douce des phases
    setIsVisible(true);
    setIsExiting(false);
    setPhase("init");

    let isDocumentVisible =
      typeof document === "undefined" ? true : !document.hidden;
    const onVisibilityChange = () => {
      isDocumentVisible = !document.hidden;
    };
    document.addEventListener?.("visibilitychange", onVisibilityChange);

    const timerB = window.setTimeout(() => {
      if (isDocumentVisible) setPhase("collect");
    }, 1100);

    const timerC = window.setTimeout(() => {
      if (isDocumentVisible) setPhase("fuse");
    }, 2600);

    return () => {
      window.clearTimeout(timerB);
      window.clearTimeout(timerC);
      document.removeEventListener?.("visibilitychange", onVisibilityChange);
    };
  }, [loading]);

  if (!isVisible) return null;

  const currentConfig = PHASE_CONFIG[phase];
  const displayMessage = message || currentConfig.defaultMessage;
  const isReady = phase === "ready";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-variant={variant}
      aria-busy={!isReady}
      aria-label={message || "Chargement de la météo en cours"}
      className={cn(
        "weather-ai-loader relative flex flex-col items-center justify-center select-none overflow-hidden text-center",
        variant === "full" &&
          "min-h-[calc(100svh-4rem)] w-full px-2 py-5 sm:min-h-[calc(100svh-3.5rem)] sm:py-7",
        variant === "light" && "min-h-[44vh] w-full px-3 py-6",
        variant === "compact" && "min-h-[220px] w-full p-4",
        prefersReduced && "weather-ai-loader--reduced-motion",
        isExiting &&
          "weather-ai-loader--exiting opacity-0 scale-[0.985] pointer-events-none",
        "transition-all duration-300 ease-out",
        className
      )}
    >
      {/* Scène décorative fidèle à la référence, sans bloquer les données. */}
      <WeatherAILoaderGraphic
        phase={phase}
        variant={variant}
        reducedMotion={prefersReduced}
        isReady={isReady}
      />

      {/* Section informative accessible et typographie */}
      <div className="weather-ai-loader__information relative z-10 flex w-full max-w-sm flex-col items-center gap-2 px-3">
        {/* Badge d'étape */}
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-medium tracking-[0.12em] uppercase transition-colors duration-300",
            isReady
              ? "border border-emerald-400/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
              : "text-sky-300/85"
          )}
        >
          {isReady ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full bg-cyan-400",
                !prefersReduced && "animate-pulse"
              )}
            />
          )}
          <span>{currentConfig.badge}</span>
        </div>

        {/* Titre principal */}
        <h2 className="text-base font-medium tracking-tight text-slate-100 sm:text-lg">
          {displayMessage}
        </h2>

        {/* Sous-titre rassurant */}
        <p className="weather-ai-loader__subtitle max-w-xs text-xs leading-relaxed text-slate-400">
          {currentConfig.subtitle}
        </p>

        {/* Indicateur indéterminé : ce n'est pas un pourcentage de données. */}
        <div
          aria-hidden="true"
          className="weather-ai-loader__progress"
          data-ready={isReady}
        >
          <span />
        </div>

        {/* Indicateur de progression des trois phases (si non réduit) */}
        {!prefersReduced && (
          <div aria-hidden="true" className="mt-2 flex items-center gap-2">
            <span
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                phase === "init" ? "w-6 bg-cyan-400" : "w-2 bg-cyan-800"
              )}
            />
            <span
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                phase === "collect" ? "w-6 bg-cyan-400" : "w-2 bg-cyan-800"
              )}
            />
            <span
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                phase === "fuse" || isReady
                  ? "w-6 bg-cyan-400"
                  : "w-2 bg-cyan-800"
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}
