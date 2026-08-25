import { useState, useCallback, useEffect, useRef } from "react";
import { Maximize2 } from "lucide-react";

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

function buildWindyUrl(lat: number, lon: number, layer: string, zoom: number = 8): string {
  return buildWindyUrlWithDetail(lat, lon, layer, zoom, false);
}

function buildWindyUrlWithDetail(
  lat: number,
  lon: number,
  layer: string,
  zoom: number = 8,
  detail: boolean = false,
  baseMap?: "streets" | "satellite",
): string {
  const params = new URLSearchParams({
    v: "2",
    zoom: String(zoom),
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
    detailLat: lat.toFixed(4),
    detailLon: lon.toFixed(4),
    detail: detail ? "true" : "false",
    overlay: layer,
    product: "ecmwf",
    level: "surface",
    acTime: "now",
    message: "true",
  });
  if (baseMap) params.set("map", baseMap);
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

function LocationMarker() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
    >
      <span className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-sky-300/35" />
      <span className="relative grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.9)]">
        <span className="h-2 w-2 rounded-full bg-white" />
      </span>
    </div>
  );
}

export function WindyMap({ lat, lon, locationName }: WindyMapProps) {
  const [activeLayer, setActiveLayer] = useState<string>("rain");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [fullscreenHeight, setFullscreenHeight] = useState<number | null>(null);
  const [fullscreenZoom, setFullscreenZoom] = useState(8);
  const [fullscreenBaseMap, setFullscreenBaseMap] = useState<"streets" | "satellite">("streets");
  const fullscreenHistoryPushed = useRef(false);

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
    setIsFullscreen(true);
  }, [isFullscreen]);

  const adjustFullscreenZoom = useCallback((delta: number) => {
    setFullscreenZoom((current) => Math.max(3, Math.min(14, current + delta)));
    setIframeKey((current) => current + 1);
  }, []);

  const recenterFullscreenMap = useCallback(() => {
    setFullscreenZoom(8);
    setIframeKey((current) => current + 1);
  }, []);

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false);
    if (
      typeof window !== "undefined" &&
      fullscreenHistoryPushed.current &&
      window.history.state?.windyMapFullscreen
    ) {
      fullscreenHistoryPushed.current = false;
      window.history.back();
    }
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
  const windyUrlCompact = buildWindyUrlWithDetail(lat, lon, activeLayerInfo.windyParam, 8, false);
  // En plein écran, on conserve la barre temporelle native et son bouton lecture,
  // mais on désactive le panneau détaillé Windy qui affiche le tableau horaire.
  const windyUrlFullscreen = buildWindyUrlWithDetail(
    lat,
    lon,
    activeLayerInfo.windyParam,
    fullscreenZoom,
    false,
    fullscreenBaseMap,
  );

  if (isFullscreen) {
    return (
      <div
        className="fixed left-0 top-0 z-[200] flex w-screen flex-col overflow-hidden bg-[#080a0f] px-1.5 pt-1.5"
        style={{
          height: fullscreenHeight ? `${fullscreenHeight}px` : "100dvh",
          maxHeight: fullscreenHeight ? `${fullscreenHeight}px` : "100dvh",
          paddingBottom: "max(8px, env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* Carte plein écran */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10">
          <iframe
            key={iframeKey}
            src={windyUrlFullscreen}
            title={`Carte météo Windy — ${activeLayerInfo.label} — ${locationName ?? "lieu actif"}`}
            className="h-full w-full border-0"
            loading="lazy"
            allow="geolocation"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <LocationMarker />
          <div className="absolute left-3 top-3 z-20 flex overflow-hidden rounded-lg border border-[#d8e1e8] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.18)]" aria-label="Type de fond de carte">
            <button
              type="button"
              onClick={() => {
                setFullscreenBaseMap("streets");
                setIframeKey((current) => current + 1);
              }}
              aria-pressed={fullscreenBaseMap === "streets"}
              className={`min-h-12 min-w-24 px-4 text-sm font-semibold transition-colors ${fullscreenBaseMap === "streets" ? "bg-white text-[#606060]" : "bg-slate-50 text-slate-500 hover:bg-white"}`}
            >
              Plan
            </button>
            <button
              type="button"
              onClick={() => {
                setFullscreenBaseMap("satellite");
                setIframeKey((current) => current + 1);
              }}
              aria-pressed={fullscreenBaseMap === "satellite"}
              className={`min-h-12 min-w-28 border-l border-[#e8e8e8] px-4 text-sm font-semibold transition-colors ${fullscreenBaseMap === "satellite" ? "bg-white text-[#202020]" : "bg-slate-50 text-slate-500 hover:bg-white"}`}
            >
              Satellite
            </button>
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
          <div className="absolute right-3 top-[28%] z-20 flex flex-col items-center gap-4" aria-label="Commandes de la carte">
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
    <div className="flex flex-col gap-0">
      {/* Carte compacte */}
      <div className="relative h-[340px] touch-pan-y overflow-hidden rounded-2xl border border-white/10">
        <iframe
          key={iframeKey}
          src={windyUrlCompact}
          title={`Carte météo Windy — ${activeLayerInfo.label} — ${locationName ?? "lieu actif"}`}
          className="h-full w-full border-0"
          loading="lazy"
          allow="geolocation"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 z-10 touch-pan-y"
          style={{ bottom: "72px" }}
        />
        <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-full border border-white/15 bg-[#0d1117]/80 px-2 py-1 text-[9px] font-semibold text-slate-200 shadow-lg backdrop-blur-sm">
          Carte fixe · lecture horaire accessible
        </div>
        <LocationMarker />
        {/* Bouton plein écran */}
        <button
          type="button"
          onClick={openFullscreen}
          aria-label="Agrandir la carte"
          className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-xl border border-white/20 bg-[#0d1117]/80 text-slate-200 shadow-lg backdrop-blur-sm transition-colors hover:bg-[#0d1117] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Sélecteur de couches sous la carte */}
      <div className="mt-2 px-0.5">
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
