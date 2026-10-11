import { useEffect, useRef, useState } from "react";
import { Activity, Check, Sparkles } from "lucide-react";
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

const PHASE_CONFIG: Record<LoaderPhase, { badge: string; defaultMessage: string; subtitle: string }> = {
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
    subtitle: "Balayage radar · Nuages volumétriques · Synthèse IA",
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
    const onChange = (e: MediaQueryListEvent) => setSystemReducedMotion(e.matches);
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

    let isDocumentVisible = typeof document === "undefined" ? true : !document.hidden;
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
        variant === "full" && "min-h-[64vh] w-full px-4 py-8 sm:min-h-[72vh] sm:py-12",
        variant === "light" && "min-h-[44vh] w-full px-3 py-6",
        variant === "compact" && "min-h-[220px] w-full p-4",
        isExiting && "weather-ai-loader--exiting opacity-0 scale-[0.985] pointer-events-none",
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

      {/* Scène vectorielle 3D + Holographique + Radar */}
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
          <div
            aria-hidden="true"
            className="mt-2 flex items-center gap-2"
          >
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
                phase === "fuse" || isReady ? "w-6 bg-cyan-400" : "w-2 bg-cyan-800"
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

function WeatherAILoaderGraphic({ phase, variant, reducedMotion, isReady }: GraphicProps) {
  const size = variant === "compact" ? 180 : 260;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 300 300"
      className={cn(
        "weather-ai-loader__svg overflow-visible",
        reducedMotion && "weather-ai-loader--reduced-motion"
      )}
      aria-hidden="true"
    >
      <defs>
        {/* Dégradé sphérique pour le globe 3D avec éclairage venant du haut à droite */}
        <radialGradient id="wai-globe-sphere" cx="68%" cy="32%" r="68%">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#1d4ed8" stopOpacity="0.85" />
          <stop offset="70%" stopColor="#0f172a" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#020617" stopOpacity="1" />
        </radialGradient>

        {/* Lueur atmosphérique cyan sur le pourtour du globe */}
        <radialGradient id="wai-atmosphere-glow" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="#00f0ff" stopOpacity="0" />
          <stop offset="88%" stopColor="#00f0ff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.85" />
        </radialGradient>

        {/* Rayonnement solaire doré sur le quadrant supérieur droit */}
        <radialGradient id="wai-solar-warmth" cx="80%" cy="25%" r="45%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="35%" stopColor="#f59e0b" stopOpacity="0.4" />
          <stop offset="70%" stopColor="#f97316" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </radialGradient>

        {/* Faisceau radar conique balayant */}
        <linearGradient id="wai-radar-beam" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#0284c7" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
        </linearGradient>

        {/* Dégradé du noyau central IA */}
        <radialGradient id="wai-core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="30%" stopColor="#00f0ff" stopOpacity="0.9" />
          <stop offset="75%" stopColor="#0284c7" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#0369a1" stopOpacity="0" />
        </radialGradient>

        {/* Découpe sphérique du globe pour masquer méridiens et nuages à l'intérieur */}
        <clipPath id="wai-globe-mask">
          <circle cx="150" cy="150" r="48" />
        </clipPath>
      </defs>

      {/* ──────────────────────────────────────────────────────────
          1. RADAR HOLOGRAPHIQUE & GRILLES DE COORDONNÉES
         ────────────────────────────────────────────────────────── */}
      <g className="weather-ai-loader__radar-grid">
        {/* Anneau extérieur gradué */}
        <circle
          cx="150"
          cy="150"
          r="132"
          fill="none"
          stroke="#00f0ff"
          strokeOpacity="0.15"
          strokeWidth="1"
          strokeDasharray="2 6"
        />

        {/* Anneau intermédiaire de portée 100km */}
        <circle
          cx="150"
          cy="150"
          r="104"
          fill="none"
          stroke="#00f0ff"
          strokeOpacity="0.22"
          strokeWidth="1.2"
          strokeDasharray="4 8"
        />

        {/* Anneau intérieur de portée 50km */}
        <circle
          cx="150"
          cy="150"
          r="76"
          fill="none"
          stroke="#38bdf8"
          strokeOpacity="0.3"
          strokeWidth="1"
        />

        {/* Réticules et axes cardinaux N/S/E/O */}
        <line x1="150" y1="12" x2="150" y2="40" stroke="#00f0ff" strokeOpacity="0.45" strokeWidth="1.5" />
        <line x1="150" y1="260" x2="150" y2="288" stroke="#00f0ff" strokeOpacity="0.45" strokeWidth="1.5" />
        <line x1="12" y1="150" x2="40" y2="150" stroke="#00f0ff" strokeOpacity="0.45" strokeWidth="1.5" />
        <line x1="260" y1="150" x2="288" y2="150" stroke="#00f0ff" strokeOpacity="0.45" strokeWidth="1.5" />

        {/* Ticks angulaires à 45° */}
        <line x1="56" y1="56" x2="68" y2="68" stroke="#38bdf8" strokeOpacity="0.3" strokeWidth="1" />
        <line x1="244" y1="56" x2="232" y2="68" stroke="#38bdf8" strokeOpacity="0.3" strokeWidth="1" />
        <line x1="56" y1="244" x2="68" y2="232" stroke="#38bdf8" strokeOpacity="0.3" strokeWidth="1" />
        <line x1="244" y1="244" x2="232" y2="232" stroke="#38bdf8" strokeOpacity="0.3" strokeWidth="1" />

        {/* Repères cardinaux discrets */}
        <text x="150" y="26" textAnchor="middle" fill="#00f0ff" fillOpacity="0.75" fontSize="7" fontFamily="monospace" fontWeight="700">000°</text>
        <text x="276" y="153" textAnchor="middle" fill="#00f0ff" fillOpacity="0.75" fontSize="7" fontFamily="monospace" fontWeight="700">090°</text>
        <text x="150" y="280" textAnchor="middle" fill="#00f0ff" fillOpacity="0.75" fontSize="7" fontFamily="monospace" fontWeight="700">180°</text>
        <text x="24" y="153" textAnchor="middle" fill="#00f0ff" fillOpacity="0.75" fontSize="7" fontFamily="monospace" fontWeight="700">270°</text>
      </g>

      {/* ──────────────────────────────────────────────────────────
          2. BALAYAGE RADAR ROTATIF (PHASE B, C)
         ────────────────────────────────────────────────────────── */}
      {phase !== "init" && !reducedMotion && (
        <g
          className="weather-ai-loader__radar-sweep origin-center"
          style={{ transformOrigin: "150px 150px" }}
        >
          {/* Faisceau conique d'un quart de cercle */}
          <path
            d="M 150 150 L 150 20 A 130 130 0 0 1 242 58 Z"
            fill="url(#wai-radar-beam)"
          />
          {/* Ligne frontale du balayage */}
          <line
            x1="150"
            y1="150"
            x2="242"
            y2="58"
            stroke="#00f0ff"
            strokeWidth="1.8"
            strokeOpacity="0.8"
          />
        </g>
      )}

      {/* ──────────────────────────────────────────────────────────
          3. ARCS ORBITAUX MULTI-MODELES
         ────────────────────────────────────────────────────────── */}
      <g className="weather-ai-loader__orbital-arcs">
        {/* Orbite 1 (inclinée -25°) */}
        <ellipse
          cx="150"
          cy="150"
          rx="115"
          ry="38"
          fill="none"
          stroke="#00f0ff"
          strokeOpacity="0.4"
          strokeWidth="1.2"
          strokeDasharray="6 14"
          transform="rotate(-25 150 150)"
          className={!reducedMotion ? "weather-ai-loader__orbit-dash-1" : undefined}
        />

        {/* Orbite 2 (inclinée +35°) */}
        <ellipse
          cx="150"
          cy="150"
          rx="110"
          ry="34"
          fill="none"
          stroke="#38bdf8"
          strokeOpacity="0.3"
          strokeWidth="1"
          strokeDasharray="4 16"
          transform="rotate(35 150 150)"
          className={!reducedMotion ? "weather-ai-loader__orbit-dash-2" : undefined}
        />

        {/* Balises satellites/stations lumineuses sur les orbites */}
        <g transform="rotate(-25 150 150)">
          <circle cx="50" cy="142" r="3" fill="#00f0ff" className={!reducedMotion ? "animate-pulse" : undefined} />
          <circle cx="50" cy="142" r="6" fill="none" stroke="#00f0ff" strokeOpacity="0.5" strokeWidth="0.8" />
        </g>
        <g transform="rotate(35 150 150)">
          <circle cx="235" cy="155" r="2.5" fill="#38bdf8" className={!reducedMotion ? "animate-pulse" : undefined} />
          <circle cx="235" cy="155" r="5" fill="none" stroke="#38bdf8" strokeOpacity="0.4" strokeWidth="0.8" />
        </g>
      </g>

      {/* ──────────────────────────────────────────────────────────
          4. GLOBE TERRESTRE 3D MINIATURE AVEC ATMOSPHÈRE
         ────────────────────────────────────────────────────────── */}
      <g className="weather-ai-loader__globe">
        {/* Sphère de base */}
        <circle cx="150" cy="150" r="48" fill="url(#wai-globe-sphere)" />

        {/* Éléments internes masqués par la courbure du globe */}
        <g clipPath="url(#wai-globe-mask)">
          {/* Méridiens et parallèles sphériques stylisés */}
          <ellipse cx="150" cy="150" rx="36" ry="48" fill="none" stroke="#38bdf8" strokeOpacity="0.22" strokeWidth="0.8" />
          <ellipse cx="150" cy="150" rx="20" ry="48" fill="none" stroke="#38bdf8" strokeOpacity="0.2" strokeWidth="0.8" />
          <line x1="102" y1="150" x2="198" y2="150" stroke="#38bdf8" strokeOpacity="0.25" strokeWidth="0.8" />
          <line x1="110" y1="126" x2="190" y2="126" stroke="#38bdf8" strokeOpacity="0.18" strokeWidth="0.8" strokeDasharray="3 3" />
          <line x1="110" y1="174" x2="190" y2="174" stroke="#38bdf8" strokeOpacity="0.18" strokeWidth="0.8" strokeDasharray="3 3" />

          {/* Continents stylisés avec translation continue pour simuler la rotation 3D */}
          <g className={!reducedMotion ? "weather-ai-loader__continents" : undefined}>
            {/* Continent Eurasie/Afrique simplifié */}
            <path
              d="M 130 130 Q 140 120 155 125 T 168 140 T 162 165 T 145 170 T 132 155 Z"
              fill="#38bdf8"
              fillOpacity="0.3"
            />
            {/* Dérivé Amérique simplifié */}
            <path
              d="M 180 132 Q 192 122 202 135 T 195 160 T 182 165 Z"
              fill="#38bdf8"
              fillOpacity="0.28"
            />
            {/* Duplication pour transition de boucle continue */}
            <path
              d="M 60 130 Q 70 120 85 125 T 98 140 T 92 165 T 75 170 T 62 155 Z"
              fill="#38bdf8"
              fillOpacity="0.3"
            />
          </g>

          {/* Nuages volumétriques flottants (Phase C et plein affichage) */}
          <g className={!reducedMotion ? "weather-ai-loader__clouds" : undefined}>
            <ellipse cx="140" cy="132" rx="16" ry="6" fill="#ffffff" fillOpacity="0.35" />
            <ellipse cx="148" cy="130" rx="12" ry="7" fill="#ffffff" fillOpacity="0.4" />
            <ellipse cx="165" cy="142" rx="18" ry="6" fill="#ffffff" fillOpacity="0.3" />
          </g>

          {/* Précipitations stylisées (fines lignes obliques) */}
          <g className={!reducedMotion ? "weather-ai-loader__rain" : undefined} opacity="0.65">
            <line x1="135" y1="156" x2="132" y2="164" stroke="#38bdf8" strokeWidth="1" strokeDasharray="2 2" />
            <line x1="142" y1="158" x2="139" y2="167" stroke="#38bdf8" strokeWidth="1" strokeDasharray="2 2" />
            <line x1="148" y1="157" x2="145" y2="165" stroke="#38bdf8" strokeWidth="1" strokeDasharray="2 2" />
          </g>

          {/* Lignes de vent fluide */}
          <path
            d="M 112 144 Q 130 148 148 144 T 188 146"
            fill="none"
            stroke="#7dd3fc"
            strokeWidth="0.9"
            strokeOpacity="0.45"
            strokeDasharray="6 4"
            className={!reducedMotion ? "weather-ai-loader__wind" : undefined}
          />
        </g>

        {/* Halo atmosphérique cyan extérieur */}
        <circle
          cx="150"
          cy="150"
          r="49"
          fill="none"
          stroke="#00f0ff"
          strokeWidth="2.5"
          strokeOpacity="0.65"
          className={!reducedMotion ? "weather-ai-loader__atmosphere-ring" : undefined}
        />
        <circle cx="150" cy="150" r="54" fill="url(#wai-atmosphere-glow)" pointerEvents="none" />

        {/* Touche solaire dorée sur le quadrant supérieur droit */}
        <circle cx="150" cy="150" r="48" fill="url(#wai-solar-warmth)" pointerEvents="none" />
      </g>

      {/* ──────────────────────────────────────────────────────────
          5. PARTICULES CONVERGEANT VERS LE NOYAU IA
         ────────────────────────────────────────────────────────── */}
      {!reducedMotion && (
        <g className="weather-ai-loader__data-particles">
          {/* Particules en trajectoire de convergence */}
          <circle cx="85" cy="95" r="2" fill="#00f0ff" className="weather-ai-particle p-1" />
          <circle cx="215" cy="95" r="2" fill="#38bdf8" className="weather-ai-particle p-2" />
          <circle cx="225" cy="195" r="2.2" fill="#00f0ff" className="weather-ai-particle p-3" />
          <circle cx="85" cy="205" r="1.8" fill="#7dd3fc" className="weather-ai-particle p-4" />
          <circle cx="150" cy="65" r="2.2" fill="#38bdf8" className="weather-ai-particle p-5" />
          <circle cx="150" cy="235" r="2" fill="#00f0ff" className="weather-ai-particle p-6" />
        </g>
      )}

      {/* ──────────────────────────────────────────────────────────
          6. NOYAU CENTRAL D'INTELLIGENCE ARTIFICIELLE « IA »
         ────────────────────────────────────────────────────────── */}
      <g
        className={cn(
          "weather-ai-loader__core",
          !reducedMotion && "weather-ai-loader__core--breathe"
        )}
      >
        {/* Halo d'énergie du noyau */}
        <circle cx="150" cy="150" r="20" fill="url(#wai-core-glow)" />

        {/* Pastille centrale protectrice hexagonale / circulaire */}
        <circle
          cx="150"
          cy="150"
          r="13"
          fill="#030b18"
          stroke={isReady ? "#10b981" : "#00f0ff"}
          strokeWidth="1.6"
          strokeOpacity="0.9"
          className="transition-colors duration-300"
        />

        {/* Logo / Sigle IA central */}
        <text
          x="150"
          y="154.5"
          textAnchor="middle"
          fill={isReady ? "#34d399" : "#ffffff"}
          fontSize="11"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="800"
          letterSpacing="0.05em"
          className="transition-colors duration-300 select-none"
        >
          {isReady ? "✓" : "IA"}
        </text>
      </g>
    </svg>
  );
}

export default WeatherAILoader;
