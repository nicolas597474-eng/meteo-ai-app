import { useState, useCallback, useEffect, useRef, type TouchEvent } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

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

function buildWindyUrlWithDetail(lat: number, lon: number, layer: string, zoom: number = 8, detail: boolean = false): string {
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
  const [isCompactMapInteractive, setIsCompactMapInteractive] = useState(false);
  const fullscreenHistoryPushed = useRef(false);
  const compactInteractionTimeout = useRef<number | null>(null);

  const handleLayerChange = useCallback((layerId: string) => {
    setActiveLayer(layerId);
    setIframeKey((prev) => prev + 1);
  }, []);

  const enableCompactMapInteraction = useCallback(() => {
    setIsCompactMapInteractive(true);
    if (typeof window === "undefined") return;
    if (compactInteractionTimeout.current !== null) window.clearTimeout(compactInteractionTimeout.current);
    compactInteractionTimeout.current = window.setTimeout(() => {
      setIsCompactMapInteractive(false);
      compactInteractionTimeout.current = null;
    }, 3_500);
  }, []);

  const handleCompactTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length >= 2) enableCompactMapInteraction();
  }, [enableCompactMapInteraction]);

  useEffect(() => () => {
    if (typeof window !== "undefined" && compactInteractionTimeout.current !== null) {
      window.clearTimeout(compactInteractionTimeout.current);
    }
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
    setIsFullscreen(true);
  }, [isFullscreen]);

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
  const windyUrlFullscreen = buildWindyUrlWithDetail(lat, lon, activeLayerInfo.windyParam, 8, true);

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
        {/* En-tête plein écran */}
        <div className="mb-1 flex h-8 shrink-0 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">🌍</span>
            <h2 className="text-xs font-semibold text-slate-100">
              Carte · {activeLayerInfo.label}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeFullscreen}
            aria-label="Fermer la carte plein écran"
            className="grid h-8 w-8 place-items-center rounded-xl border border-white/20 bg-slate-800/80 text-slate-200 hover:bg-slate-700"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>

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
      <div
        className="relative h-[340px] touch-pan-y overflow-hidden rounded-2xl border border-white/10"
        onTouchStart={handleCompactTouchStart}
      >
        <iframe
          key={iframeKey}
          src={windyUrlCompact}
          title={`Carte météo Windy — ${activeLayerInfo.label} — ${locationName ?? "lieu actif"}`}
          className={`h-full w-full border-0 ${isCompactMapInteractive ? "pointer-events-auto" : "pointer-events-none"}`}
          loading="lazy"
          allow="geolocation"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-full border border-white/15 bg-[#0d1117]/80 px-2 py-1 text-[9px] font-semibold text-slate-200 shadow-lg backdrop-blur-sm">
          {isCompactMapInteractive ? "Interaction carte active" : "Carte fixe · 2 doigts pour déplacer"}
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <span className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-sky-300/35" />
          <span className="relative grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.9)]">
            <span className="h-2 w-2 rounded-full bg-white" />
          </span>
        </div>
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
