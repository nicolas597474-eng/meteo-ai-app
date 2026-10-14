import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
    defaultMessage: "Préparation de votre météo…",
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
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
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
      // Dès que loading passe à false, transition immédiate vers la fin
      setPhase("ready");
      setIsExiting(true);
      const exitTimer = window.setTimeout(() => {
        setIsVisible(false);
        onTransitionEndRef.current?.();
      }, 340);
      return () => window.clearTimeout(exitTimer);
    }

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
      aria-busy={!isReady}
      aria-label={message || "Chargement de la météo en cours"}
      className={cn(
        "weather-ai-loader relative flex flex-col items-center justify-center select-none overflow-hidden text-center",
        variant === "full" &&
          "min-h-[64vh] w-full px-4 py-8 sm:min-h-[72vh] sm:py-12",
        variant === "light" && "min-h-[44vh] w-full px-3 py-6",
        variant === "compact" && "min-h-[220px] w-full p-4",
        isExiting &&
          "weather-ai-loader--exiting opacity-0 scale-[0.985] pointer-events-none",
        "transition-all duration-300 ease-out",
        className
      )}
      style={{
        background:
          variant === "full"
            ? "radial-gradient(ellipse at 50% 40%, #06152d 0%, #030a17 55%, #02050e 100%)"
            : undefined,
      }}
    >
      {/* Halo holographique d’ambiance en arrière-plan */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
          "w-72 h-72 sm:w-96 sm:h-96",
          "bg-gradient-to-tr from-cyan-500/10 via-sky-500/15 to-transparent blur-3xl",
          !prefersReduced && "weather-ai-loader__ambient-glow",
          isReady && "from-emerald-500/15 via-teal-500/10"
        )}
      />

      {/* Planète et orbites dessinées en CSS pur : aucune image, aucun WebGL */}
      <div className="relative mx-auto flex items-center justify-center">
        <WeatherAILoaderGraphic
          phase={phase}
          variant={variant}
          reducedMotion={prefersReduced}
          isReady={isReady}
        />
      </div>

      {/* Section informative accessible et typographie */}
      <div className="relative z-10 mt-6 flex max-w-sm flex-col items-center gap-2 px-2">
        {/* Badge d'étape */}
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase transition-colors duration-300",
            isReady
              ? "border border-emerald-400/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
              : "border border-cyan-400/30 bg-cyan-950/60 text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.2)]"
          )}
        >
          {isReady ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full bg-cyan-400",
                !prefersReduced && "animate-ping"
              )}
            />
          )}
          <span>{currentConfig.badge}</span>
        </div>

        {/* Titre principal */}
        <h2 className="text-base font-bold tracking-tight text-white sm:text-lg">
          {displayMessage}
        </h2>

        {/* Sous-titre rassurant */}
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
          {currentConfig.subtitle}
        </p>

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

interface GraphicProps {
  phase: LoaderPhase;
  variant: "full" | "light" | "compact";
  reducedMotion: boolean;
  isReady: boolean;
}

/**
 * Visuel de chargement entièrement CSS.
 *
 * Il remplace la scène WebGL Three.js qui chargeait, sur l'écran d'attente de
 * toutes les routes, 118 ko gzip de moteur et 1,6 Mo de textures — exactement
 * pendant que les requêtes de données se disputaient la même bande passante.
 * Ce visuel ne télécharge aucun octet : disque, halo, orbites et soleil sont
 * des dégradés et des bordures animés en CSS. Les classes sont préfixées
 * `weather-loader-globe` pour qu'aucune règle d'image ne s'y applique.
 */
function WeatherAILoaderGraphic({
  phase,
  variant,
  reducedMotion,
  isReady,
}: GraphicProps) {
  return (
    <div
      className={cn(
        "weather-ai-loader__globe",
        reducedMotion && "weather-ai-loader--reduced-motion"
      )}
      data-variant={variant}
      data-phase={phase}
      data-ready={isReady}
      aria-hidden="true"
    >
      <span className="weather-loader-globe">
        <span className="weather-loader-globe__halo" />
        <span className="weather-loader-globe__orbit weather-loader-globe__orbit--back" />
        <span className="weather-loader-globe__disc" />
        <span className="weather-loader-globe__orbit" />
        <span className="weather-loader-globe__sun" />
      </span>
    </div>
  );
}
