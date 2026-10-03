import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LocateFixed, Maximize2, Undo2, X } from "lucide-react";
import { MapControlButton, MapTypeToggle, MapZoomControl, mapActionButtonClass } from "@/components/MapControls";
import { MapView } from "@/components/Map";

type StationMarker = {
  stationId: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  ageMinutes: number | null;
  source?: string | null;
  reliabilityScore?: number | null;
  readings?: unknown[];
  latest?: {
    temperature?: number | null;
    humidity?: number | null;
    windSpeed?: number | null;
    windGust?: number | null;
    precipitation?: number | null;
  } | null;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] ?? character));
}

function stationMetric(value: number | null | undefined, unit: string, decimals = 1) {
  return value === null || value === undefined ? "—" : `${value.toFixed(decimals)}${unit}`;
}

function stationFreshness(ageMinutes: number | null) {
  if (ageMinutes === null) return { label: "Horodatage indisponible", color: "#94a3b8" };
  if (ageMinutes < 2) return { label: "À l’instant", color: "#34d399" };
  if (ageMinutes <= 15) return { label: `Il y a ${ageMinutes} min`, color: "#34d399" };
  if (ageMinutes <= 90) return { label: `Il y a ${ageMinutes} min`, color: "#fbbf24" };
  return { label: `Il y a ${Math.floor(ageMinutes / 60)} h`, color: "#fb7185" };
}

function stationInfoHtml(station: StationMarker) {
  const latest = station.latest;
  const freshness = stationFreshness(station.ageMinutes);
  const sourcePriority = station.reliabilityScore === null || station.reliabilityScore === undefined ? "—" : `${Math.round(station.reliabilityScore)}/100`;
  const rows = [
    ["Température", stationMetric(latest?.temperature, " °C")],
    ["Humidité", stationMetric(latest?.humidity, " %", 0)],
    ["Vent", stationMetric(latest?.windSpeed, " km/h")],
    ["Rafales", stationMetric(latest?.windGust, " km/h")],
    ["Pluie", stationMetric(latest?.precipitation, " mm")],
  ];
  return `<div style="box-sizing:border-box;min-width:248px;max-width:280px;padding:12px;border:1px solid #38bdf8;border-radius:12px;background:#071018;color:#f8fafc;font-family:system-ui,sans-serif;line-height:1.35"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px"><strong style="font-size:15px;line-height:1.2;color:#ffffff">${escapeHtml(station.name)}</strong><span style="flex:none;border:1px solid #34d399;border-radius:999px;padding:3px 6px;color:#a7f3d0;font-size:10px;font-weight:700">${escapeHtml(sourcePriority)}</span></div><p style="margin:6px 0 10px;color:#cbd5e1;font-size:11px;font-weight:500">${escapeHtml(station.source ?? "Station physique")} · ${station.distanceKm.toFixed(1)} km</p><div style="margin:0 0 10px;border-left:2px solid ${freshness.color};padding-left:7px;color:${freshness.color};font-size:11px;font-weight:700">Dernier relevé : ${escapeHtml(freshness.label)}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">${rows.map(([label, value]) => `<div style="background:#111c2e;border:1px solid #334155;border-radius:8px;padding:7px"><span style="display:block;margin-bottom:2px;color:#bae6fd;font-size:10px;font-weight:600">${label}</span><span style="color:#ffffff;font-size:13px;font-weight:700">${escapeHtml(value)}</span></div>`).join("")}</div><div style="margin-top:10px;border-top:1px solid #334155;padding-top:8px;color:#cbd5e1;font-size:11px"><strong style="color:#a7f3d0">Priorité technique de réseau/source : ${escapeHtml(sourcePriority)}</strong> · utilisée par le classement, pas une performance météo individuelle mesurée · ${station.readings?.length ?? 0} relevé(s) conservé(s)</div></div>`;
}

export function StationMap({
  center,
  stations,
}: {
  center: { lat: number; lon: number };
  stations: StationMarker[];
}) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const streetViewRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFocusedOnLocation, setIsFocusedOnLocation] = useState(false);
  const normalZoom = stations.length > 0 ? 11 : 10;
  const [zoomLevel, setZoomLevel] = useState(normalZoom);
  const [mapType, setMapType] = useState<"satellite" | "roadmap">("satellite");

  const focusCurrentLocation = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.panTo({ lat: center.lat, lng: center.lon });
    map.setZoom(14);
    setIsFocusedOnLocation(true);
  }, [center.lat, center.lon]);

const restoreNormalView = useCallback(() => {
  const map = mapRef.current;
  if (!map) return;
  streetViewRef.current?.setVisible(false);
  map.panTo({ lat: center.lat, lng: center.lon });
  map.setZoom(normalZoom);
  setIsFocusedOnLocation(false);
}, [center.lat, center.lon, normalZoom]);

  const adjustExpandedZoom = useCallback((delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    streetViewRef.current?.setVisible(false);
    const currentZoom = map.getZoom() ?? normalZoom;
    map.setZoom(Math.max(2, Math.min(20, currentZoom + delta)));
    setIsFocusedOnLocation(false);
  }, [normalZoom]);

  const changeMapType = useCallback((nextType: "satellite" | "roadmap") => {
    mapRef.current?.setMapTypeId(nextType);
    setMapType(nextType);
  }, []);

  const openImmersiveMap = useCallback(() => {
    setIsExpanded(true);
    if (typeof document !== "undefined" && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }, []);

  const closeImmersiveMap = useCallback(() => {
    streetViewRef.current?.setVisible(false);
    if (typeof document !== "undefined" && document.fullscreenElement) void document.exitFullscreen();
    setIsExpanded(false);
  }, []);

const showStreetViewAt = useCallback((position: google.maps.LatLngLiteral, title: string) => {
    if (!mapRef.current) return;
    const panorama = streetViewRef.current ?? mapRef.current.getStreetView();
    streetViewRef.current = panorama;
    panorama.setPosition(position);
    panorama.setPov({ heading: 0, pitch: 0 });
    panorama.setVisible(true);
    window.setTimeout(() => panorama.setOptions({ addressControl: true, motionTracking: false }), 0);
    mapRef.current.setCenter(position);
    mapRef.current.setZoom(17);
    document.querySelector<HTMLElement>("[aria-label='Vue réelle du lieu']")?.focus();
    console.info(`[Stations] Vue réelle demandée pour ${title} (${position.lat.toFixed(5)}, ${position.lng.toFixed(5)})`);
  }, []);

  const renderMarkers = useCallback((map: google.maps.Map) => {
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    const reference = new google.maps.Marker({
      map,
      position: { lat: center.lat, lng: center.lon },
      title: "Lieu de référence",
      label: { text: "●", color: "#60a5fa", fontSize: "28px" },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#2563eb", fillOpacity: 1, strokeColor: "#dbeafe", strokeWeight: 2 },
    });
    markersRef.current.push(reference);
    reference.addListener("click", () => showStreetViewAt({ lat: center.lat, lng: center.lon }, "Lieu de référence"));

    stations.forEach((station) => {
      const freshness = station.ageMinutes !== null && station.ageMinutes <= 90 ? "#34d399" : "#fbbf24";
      const marker = new google.maps.Marker({
        map,
        position: { lat: station.lat, lng: station.lon },
        title: `${station.name} · ${station.distanceKm.toFixed(1)} km`,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: freshness, fillOpacity: 1, strokeColor: "#071018", strokeWeight: 2 },
      });
      marker.addListener("click", () => {
        const infoWindow = infoWindowRef.current ?? new google.maps.InfoWindow();
        infoWindowRef.current = infoWindow;
        infoWindow.setContent(stationInfoHtml(station));
        infoWindow.open({ map, anchor: marker, shouldFocus: false });
      });
      markersRef.current.push(marker);
    });
  }, [center, showStreetViewAt, stations]);

  useEffect(() => {
    if (mapRef.current) renderMarkers(mapRef.current);
  }, [renderMarkers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setOptions({
            mapTypeControl: false,
      fullscreenControl: false,

zoomControl: false,
streetViewControl: isExpanded,
      streetViewControlOptions: isExpanded ? { position: google.maps.ControlPosition.RIGHT_BOTTOM } : undefined,
rotateControl: false,
    });
    window.setTimeout(() => google.maps.event.trigger(map, "resize"), 0);
  }, [isExpanded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    setZoomLevel(map.getZoom() ?? normalZoom);
    const zoomListener = map.addListener("zoom_changed", () => setZoomLevel(map.getZoom() ?? normalZoom));
    const typeListener = map.addListener("maptypeid_changed", () => {
      const activeType = map.getMapTypeId();
      if (activeType === "satellite" || activeType === "roadmap") setMapType(activeType);
    });
    return () => {
      zoomListener.remove();
      typeListener.remove();
    };
  }, [mapReady, normalZoom]);

  useEffect(() => {
    if (!isExpanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        streetViewRef.current?.setVisible(false);
        setIsExpanded(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isExpanded]);

  const mapShell = (
    <div className={isExpanded ? "fixed inset-0 z-[200] bg-[#070b13]" : "space-y-2"}>
      <div className={`relative overflow-hidden bg-[#090b10] ${isExpanded ? "h-[100dvh] border-0" : "h-72 rounded-xl border border-slate-800 sm:h-80"}`}>
        <MapView
          className="h-full w-full"
          initialCenter={{ lat: center.lat, lng: center.lon }}
          initialZoom={normalZoom}
          mapTypeId={mapType}
          mapTypeControl={false}
          fullscreenControl={false}
          zoomControl={false}
          streetViewControl={false}
          rotateControl={false}
          onMapReady={(map) => {
            mapRef.current = map;
            streetViewRef.current = map.getStreetView();
            renderMarkers(map);
            setMapReady(true);
          }}
        />
        {isExpanded && mapReady && (
          <>
            <MapControlButton
              onClick={() => {
                closeImmersiveMap();
              }}
              aria-label="Fermer la carte agrandie"
              className="absolute right-3 top-3 z-10"
            >
              <X aria-hidden="true" className="h-6 w-6" strokeWidth={2.2} />
            </MapControlButton>
            <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
              <MapTypeToggle value={mapType} onChange={changeMapType} />
            </div>
            <div className="absolute right-3 top-[28%] z-10 flex flex-col items-center gap-4" aria-label="Commandes de la carte">
              <MapControlButton onClick={focusCurrentLocation} aria-label="Centrer la carte sur le lieu actif">
                <LocateFixed aria-hidden="true" className="h-6 w-6" strokeWidth={2.25} />
              </MapControlButton>
              <MapZoomControl onZoomIn={() => adjustExpandedZoom(1)} onZoomOut={() => adjustExpandedZoom(-1)} />
              <span className="sr-only" aria-live="polite">Niveau de zoom : {zoomLevel}</span>
            </div>
          </>
        )}
        {!mapReady && (
          <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.16),transparent_34%),linear-gradient(rgba(30,41,59,0.32)_1px,transparent_1px),linear-gradient(90deg,rgba(30,41,59,0.32)_1px,transparent_1px)] bg-[size:auto,24px_24px,24px_24px]">
            <div className="absolute h-36 w-36 rounded-full border border-blue-500/20" />
            <div className="absolute h-24 w-24 rounded-full border border-blue-500/30" />
            <div className="relative flex flex-col items-center"><span className="grid h-10 w-10 place-items-center rounded-full border-2 border-blue-200 bg-blue-600 text-base text-white">●</span><span className="mt-2 rounded-full border border-slate-700 bg-[#10131a] px-2 py-1 text-[10px] text-slate-300">Lieu de référence</span></div>
            <p className="absolute bottom-3 text-[10px] text-slate-500">Repère local — fond cartographique en chargement</p>
          </div>
        )}
      </div>
      {mapReady && !isExpanded && (
        <div className="mt-2 space-y-2">
          <div className="flex justify-center">
            <MapTypeToggle value={mapType} onChange={changeMapType} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={isFocusedOnLocation ? restoreNormalView : focusCurrentLocation}
              aria-label={isFocusedOnLocation ? "Revenir au cadrage normal de la carte" : "Recentrer et zoomer sur le lieu actuel"}
              className={`${mapActionButtonClass} ${isFocusedOnLocation ? "border-sky-300/80 bg-sky-400/20 text-sky-100" : "text-slate-100"}`}
            >
              {isFocusedOnLocation ? <Undo2 aria-hidden="true" className="h-4 w-4" /> : <LocateFixed aria-hidden="true" className="h-4 w-4 text-sky-300" />}
              {isFocusedOnLocation ? "Vue normale" : "Zoom sur le lieu"}
            </button>
            <button
              type="button"
              onClick={openImmersiveMap}
              aria-label="Agrandir la carte"
              className={`${mapActionButtonClass} border-sky-300/70 bg-sky-400/15 text-sky-100`}
            >
              <Maximize2 aria-hidden="true" className="h-4 w-4" />
              Agrandir la carte
            </button>
          </div>
          <details className="group rounded-xl border border-slate-700 bg-[#0b1524]">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-xs font-semibold text-slate-200 [&::-webkit-details-marker]:hidden">
              <span>Légende des marqueurs</span>
              <span aria-hidden="true" className="text-sky-300 transition-transform duration-200 group-open:rotate-180">⌄</span>
            </summary>
            <div className="grid gap-2 border-t border-slate-700 px-3 py-3 text-[11px] text-slate-300">
              <div className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-blue-100 bg-blue-600" /><span><strong className="text-slate-100">Bleu</strong> — lieu de référence.</span></div>
              <div className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-[#071018] bg-emerald-400" /><span><strong className="text-slate-100">Vert</strong> — station avec relevé de moins de 90 min.</span></div>
              <div className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-[#071018] bg-amber-400" /><span><strong className="text-slate-100">Ambre</strong> — station avec relevé de plus de 90 min.</span></div>
            </div>
          </details>
        </div>
      )}
    </div>
  );

  return isExpanded && typeof document !== "undefined"
    ? createPortal(mapShell, document.body)
    : mapShell;
}
