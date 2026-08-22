import { useState, useCallback } from "react";
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
  const params = new URLSearchParams({
    v: "2",
    zoom: String(zoom),
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
    detailLat: lat.toFixed(4),
    detailLon: lon.toFixed(4),
    detail: "true",
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

export function WindyMap({ lat, lon, locationName }: WindyMapProps) {
  const [activeLayer, setActiveLayer] = useState<string>("rain");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const handleLayerChange = useCallback((layerId: string) => {
    setActiveLayer(layerId);
    setIframeKey((prev) => prev + 1);
  }, []);

  const activeLayerInfo = WINDY_LAYERS.find((l) => l.id === activeLayer) ?? WINDY_LAYERS[0];
  const windyUrl = buildWindyUrl(lat, lon, activeLayerInfo.windyParam);

  const mapContent = (
    <div className={`relative flex flex-col ${isFullscreen ? "h-full" : ""}`}>
      {/* Sélecteur de couches */}
      <div className="flex flex-wrap gap-1.5 px-1 pb-2">
        {WINDY_LAYERS.map((layer) => (
          <button
            key={layer.id}
            type="button"
            onClick={() => handleLayerChange(layer.id)}
            aria-pressed={activeLayer === layer.id}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
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

      {/* Iframe Windy */}
      <div className={`relative overflow-hidden rounded-2xl border border-white/10 ${isFullscreen ? "flex-1" : "h-[340px]"}`}>
        <iframe
          key={iframeKey}
          src={windyUrl}
          title={`Carte météo Windy — ${activeLayerInfo.label} — ${locationName ?? "lieu actif"}`}
          className="h-full w-full border-0"
          loading="lazy"
          allow="geolocation"
          referrerPolicy="no-referrer-when-downgrade"
        />
        {/* Bouton plein écran */}
        <button
          type="button"
          onClick={() => setIsFullscreen((prev) => !prev)}
          aria-label={isFullscreen ? "Réduire la carte" : "Agrandir la carte"}
          className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-xl border border-white/20 bg-[#0d1117]/80 text-slate-200 shadow-lg backdrop-blur-sm transition-colors hover:bg-[#0d1117] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      <p className="mt-1.5 px-1 text-[9px] text-slate-500">
        Données animées fournies par{" "}
        <a href="https://www.windy.com" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-slate-300">
          Windy.com
        </a>
        {" "}· centré sur {locationName ?? "votre lieu actif"}.
      </p>
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#080a0f] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🌍</span>
            <h2 className="text-sm font-semibold text-slate-100">Carte météo · {activeLayerInfo.label}</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsFullscreen(false)}
            aria-label="Fermer la carte plein écran"
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/20 bg-slate-800/80 text-slate-200 hover:bg-slate-700"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
        {mapContent}
      </div>
    );
  }

  return mapContent;
}
