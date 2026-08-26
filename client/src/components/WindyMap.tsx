import { useState, useCallback, useEffect, useRef } from "react";
import { Maximize2, Play } from "lucide-react";

type WindyLayer = {
  id: string;
  label: string;
  windyParam: string;
  emoji: string;
};

const WINDY_LAYERS: WindyLayer[] = [
  { id: "rain", label: "Pluie", windyParam: "rain", emoji: "🌧" },
  { id: "wind", label: "Vent", windyParam: "wind", emoji: "💨" },
  { id: "clouds", label: "Nuages", windyParam: "clouds", emoji: "☁️" },
  { id: "temp", label: "Température", windyParam: "temp", emoji: "🌡" },
  { id: "pressure", label: "Pression", windyParam: "pressure", emoji: "📊" },
  { id: "humidity", label: "Humidité", windyParam: "rh", emoji: "💧" },
];

// L’embed Windy est isolé dans une iframe externe : ses boutons ne peuvent pas
// être ciblés par le CSS de l’application. On décale sa gouttière de contrôles
// hors de la zone visible, sans toucher à la timeline en plein écran.
const FULLSCREEN_NATIVE_CONTROL_GUTTER_PX = 72;
// Le panneau natif Windy (pluie, vent, etc.) s’ouvre à droite du repère. On
// centre donc légèrement la carte à l’est du lieu pour garder ce panneau dans
// le cadre, sans déplacer le repère géographique de la position réelle.
const WEATHER_PANEL_CENTER_OFFSET_PX = 64;

function buildWindyUrl(lat: number, lon: number, layer: string, zoom: number = 8): string {
  return buildWindyUrlWithDetail(lat, lon, layer, zoom, false);
}

function buildWindyUrlWithDetail(
  lat: number,
  lon: number,
  layer: string,
  zoom: number = 8,
  detail: boolean = false,
): string {
  // Le calcul maintient le même décalage visuel quelle que soit l’échelle.
  const centerLonOffset =
    (WEATHER_PANEL_CENTER_OFFSET_PX * 360) / (256 * 2 ** zoom);

  const params = new URLSearchParams({
    v: "2",
    zoom: String(zoom),
    lat: lat.toFixed(4),
    lon: (lon + centerLonOffset).toFixed(4),
    detailLat: lat.toFixed(4),
    detailLon: lon.toFixed(4),
    detail: detail ? "true" : "false",
    overlay: layer,
    product: "ecmwf",
    level: "surface",
    acTime: "now",
    message: "true",
    // Windy conserve alors le repère aux coordonnées detailLat/detailLon même
    // après un déplacement de la carte ; il ne reste plus figé au centre visuel.
    marker: "true",
    // Valeur officielle de l'embed Windy pour afficher vent et rafales en km/h.
    metricWind: "km/h",
  });
  return `https://embed.windy.com/embed2.html?${params.toString()}`;
}

type WindyMapProps = {
  lat: number;
  lon: number;
  locationName?: string;
};

function LayerSelector({
  activeLayer,
  onSelect,
  compact = false,
}: {
  activeLayer: string;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "grid grid-cols-3 gap-1.5" : "flex flex-wrap gap-1.5"}>
      {WINDY_LAYERS.map((layer) => (
        <button
          key={layer.id}
          type="button"
          onClick={() => onSelect(layer.id)}
          aria-pressed={activeLayer === layer.id}
          className={`inline-flex min-w-0 shrink-0 items-center justify-center gap-1 rounded-full border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${compact ? "px-1.5 py-1 text-[9px]" : "px-2.5 py-1 text-[10px]"} ${
            activeLayer === layer.id
              ? "border-sky-400/60 bg-sky-400/20 text-sky-100"
              : "border-white/10 bg-slate-950/40 text-slate-400 hover:border-slate-600 hover:text-slate-200"
          }`}
        >
          <span>{layer.emoji}</span>
          <span>{layer.label}</span>
        </button>
      ))}
    </div>
  );
}

export function WindyMap({ lat, lon, locationName }: WindyMapProps) {
  const [activeLayer, setActiveLayer] = useState<string>("rain");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [fullscreenHeight, setFullscreenHeight] = useState<number | null>(null);
  const [fullscreenZoom, setFullscreenZoom] = useState(8);
  const [compactZoom, setCompactZoom] = useState(8);
  const fullscreenHistoryPushed = useRef(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFullscreenTransitioning, setIsFullscreenTransitioning] = useState(false);

  const handleLayerChange = useCallback((layerId: string) => {
    setActiveLayer(layerId);
    setIframeKey((prev) => prev + 1);
  }, []);

  const openFullscreen = useCallback(() => {
    if (typeof window !== "undefined" && !isFullscreen) {
      window.history.pushState(
        { ...(window.history.state ?? {}), windyMapFullscreen: true },
        "",
        window.location.href,
      );
      fullscreenHistoryPushed.current = true;
    }
    setFullscreenZoom(8);
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    setIsFullscreenTransitioning(true);
    setIsFullscreen(true);
    transitionTimer.current = setTimeout(() => setIsFullscreenTransitioning(false), 260);
  }, [isFullscreen]);

  const adjustFullscreenZoom = useCallback((delta: number) => {
    setFullscreenZoom((current) => Math.max(3, Math.min(14, current + delta)));
    setIframeKey((current) => current + 1);
  }, []);

  const adjustCompactZoom = useCallback((delta: number) => {
    setCompactZoom((current) => Math.max(5, Math.min(11, current + delta)));
    setIframeKey((current) => current + 1);
  }, []);

  const recenterFullscreenMap = useCallback(() => {
    setFullscreenZoom(8);
    setIframeKey((current) => current + 1);
  }, []);

  const closeFullscreen = useCallback(() => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    setIsFullscreenTransitioning(true);
    setIsFullscreen(false);
    transitionTimer.current = setTimeout(() => setIsFullscreenTransitioning(false), 260);
    if (
      typeof window !== "undefined" &&
      fullscreenHistoryPushed.current &&
      window.history.state?.windyMapFullscreen
    ) {
      fullscreenHistoryPushed.current = false;
      window.history.back();
    }
  }, []);

  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
  }, []);

  useEffect(() => {
    if (!isFullscreen || typeof window === "undefined") return;

    const updateViewportHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      setFullscreenHeight(Math.max(420, Math.floor(height)));
    };

    const handlePopState = () => {
      fullscreenHistoryPushed.current = false;
      setIsFullscreen(false);
    };

    updateViewportHeight();
    window.addEventListener("popstate", handlePopState);
    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("scroll", updateViewportHeight);
    window.addEventListener("orientationchange", updateViewportHeight);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("scroll", updateViewportHeight);
      window.removeEventListener("orientationchange", updateViewportHeight);
    };
  }, [isFullscreen]);

  const activeLayerInfo = WINDY_LAYERS.find((l) => l.id === activeLayer) ?? WINDY_LAYERS[0];
  const windyUrlCompact = buildWindyUrlWithDetail(lat, lon, activeLayerInfo.windyParam, compactZoom, false);
  // En plein écran, on conserve la barre temporelle native et son bouton lecture,
  // mais on désactive le panneau détaillé Windy qui affiche le tableau horaire.
  const windyUrlFullscreen = buildWindyUrlWithDetail(
    lat,
    lon,
    activeLayerInfo.windyParam,
    fullscreenZoom,
    false,
  );

  if (isFullscreen) {
    return (
      <div
        className={`fixed left-0 top-0 z-[200] flex w-screen flex-col overflow-hidden bg-[#080a0f] px-1.5 pt-1.5 transition-[opacity,transform] duration-250 ease-out motion-reduce:transition-none ${isFullscreenTransitioning ? "scale-[0.985] opacity-0" : "scale-100 opacity-100"}`}
        style={{
          height: fullscreenHeight ? `${fullscreenHeight}px` : "100dvh",
          maxHeight: fullscreenHeight ? `${fullscreenHeight}px` : "100dvh",
          paddingBottom: "max(8px, env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* Carte plein écran */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10">
          <div
            className="absolute inset-y-0 left-0 overflow-hidden"
            style={{ right: `-${FULLSCREEN_NATIVE_CONTROL_GUTTER_PX}px` }}
          >
            <iframe
              key={iframeKey}
              src={windyUrlFullscreen}
              title={`Carte météo Windy — ${activeLayerInfo.label} — ${locationName ?? "lieu actif"}`}
              className="h-full border-0"
              style={{ width: `calc(100% + ${FULLSCREEN_NATIVE_CONTROL_GUTTER_PX}px)` }}
              loading="lazy"
              allow="geolocation"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <button
            type="button"
            onClick={closeFullscreen}
            aria-label="Fermer la carte plein écran"
            className="absolute right-3 top-3 z-20 grid h-12 w-12 place-items-center rounded-full border border-[#d8e1e8] bg-white text-[#606060] shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition-transform hover:bg-[#f7f7f7] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.9" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <div className="absolute bottom-[142px] right-3 z-20 flex flex-col items-center gap-4" aria-label="Commandes de la carte">
            <button
              type="button"
              onClick={recenterFullscreenMap}
              aria-label="Centrer la carte sur le lieu actif"
              className="grid h-12 w-12 place-items-center rounded-full border border-[#d8e1e8] bg-white text-[#0c74bc] shadow-[0_2px_8px_rgba(15,23,42,0.22)] transition-transform hover:bg-slate-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="2.6">
                <circle cx="12" cy="12" r="6.2" />
                <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
                <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3" strokeLinecap="round" />
              </svg>
            </button>
            <div className="overflow-hidden rounded-none border border-[#d8e1e8] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.22)]" aria-label="Zoom manuel de la carte">
              <button type="button" onClick={() => adjustFullscreenZoom(1)} aria-label="Zoomer" className="grid h-14 w-12 place-items-center border-b border-[#e8e8e8] text-[#606060] transition-colors hover:bg-[#f7f7f7] active:bg-[#eeeeee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current" strokeWidth="1.55" strokeLinecap="round"><path d="M12 3.5v17M3.5 12h17" /></svg>
              </button>
              <button type="button" onClick={() => adjustFullscreenZoom(-1)} aria-label="Dézoomer" className="grid h-14 w-12 place-items-center text-[#606060] transition-colors hover:bg-[#f7f7f7] active:bg-[#eeeeee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current" strokeWidth="1.55" strokeLinecap="round"><path d="M3.5 12h17" /></svg>
              </button>
              <span className="sr-only" aria-live="polite">Niveau de zoom : {fullscreenZoom}</span>
            </div>
          </div>
        </div>

        {/* Sélecteur sous la carte en plein écran */}
        <div className="mt-1.5 shrink-0 rounded-2xl border border-white/10 bg-[#080a0f]/95 p-1.5 shadow-[0_-10px_30px_rgba(0,0,0,0.28)]">
          <LayerSelector activeLayer={activeLayer} onSelect={handleLayerChange} compact />
        </div>
      </div>
    );
  }

  return (
      <div className={`flex flex-col gap-0 transition-[opacity,transform] duration-250 ease-out motion-reduce:transition-none ${isFullscreenTransitioning ? "scale-[0.99] opacity-0" : "scale-100 opacity-100"}`}>
      {/* Carte compacte */}
      <div className="relative h-[340px] touch-pan-y overflow-hidden rounded-2xl border border-white/10" aria-label="Aperçu météo fixe en mode compact">
        {/* L’iframe est strictement visuelle ici : son contenu ne reçoit aucun geste.
            Les commandes compactes sont rendues par l’application, hors iframe. */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
          style={{ right: `-${FULLSCREEN_NATIVE_CONTROL_GUTTER_PX}px` }}
          aria-hidden="true"
        >
          <iframe
            key={iframeKey}
            src={windyUrlCompact}
            title={`Aperçu fixe Windy — ${activeLayerInfo.label} — ${locationName ?? "lieu actif"}`}
            className="pointer-events-none h-full border-0"
            style={{ width: `calc(100% + ${FULLSCREEN_NATIVE_CONTROL_GUTTER_PX}px)` }}
            tabIndex={-1}
            loading="lazy"
            allow="geolocation"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center overflow-hidden rounded-xl border border-white/20 bg-[#0d1117]/85 shadow-lg backdrop-blur-sm" aria-label="Zoom de l’aperçu fixe">
          <button type="button" onClick={() => adjustCompactZoom(1)} aria-label="Zoomer l’aperçu" className="grid h-9 w-9 place-items-center border-r border-white/10 text-slate-100 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300">
            <span aria-hidden="true" className="text-xl leading-none">+</span>
          </button>
          <button type="button" onClick={() => adjustCompactZoom(-1)} aria-label="Dézoomer l’aperçu" className="grid h-9 w-9 place-items-center text-slate-100 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300">
            <span aria-hidden="true" className="text-xl leading-none">−</span>
          </button>
        </div>
        {/* Bouton plein écran */}
        <button
          type="button"
          onClick={openFullscreen}
          aria-label="Agrandir la carte"
          className="absolute bottom-3 right-3 z-20 grid h-9 w-9 place-items-center rounded-xl border border-white/20 bg-[#0d1117]/80 text-slate-200 shadow-lg backdrop-blur-sm transition-colors hover:bg-[#0d1117] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2 px-0.5">
        <button
          type="button"
          onClick={openFullscreen}
          className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          aria-label="Ouvrir l’animation météo Windy en plein écran"
        >
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          Voir l’animation
        </button>
        <span className="text-right text-[9px] leading-tight text-slate-500">Lecture et timeline<br />en plein écran</span>
      </div>

      {/* Sélecteur de couches sous la carte */}
      <div className="mt-2 px-0.5" aria-label="Boutons de couches météo">
        <LayerSelector activeLayer={activeLayer} onSelect={handleLayerChange} />
      </div>

      <p className="mt-1.5 px-0.5 text-[9px] text-slate-500">
        Données animées fournies par{" "}
        <a
          href="https://www.windy.com"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-slate-300"
        >
          Windy.com
        </a>
        {" "}· centré sur {locationName ?? "votre lieu actif"}.
      </p>
    </div>
  );
}
