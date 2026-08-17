import { useCallback, useEffect, useRef, useState } from "react";
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
  const reliability = station.reliabilityScore === null || station.reliabilityScore === undefined ? "—" : `${Math.round(station.reliabilityScore)} %`;
  const rows = [
    ["Température", stationMetric(latest?.temperature, " °C")],
    ["Humidité", stationMetric(latest?.humidity, " %", 0)],
    ["Vent", stationMetric(latest?.windSpeed, " km/h")],
    ["Rafales", stationMetric(latest?.windGust, " km/h")],
    ["Pluie", stationMetric(latest?.precipitation, " mm")],
  ];
  return `<div style="box-sizing:border-box;min-width:248px;max-width:280px;padding:12px;border:1px solid #38bdf8;border-radius:12px;background:#071018;color:#f8fafc;font-family:system-ui,sans-serif;line-height:1.35"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px"><strong style="font-size:15px;line-height:1.2;color:#ffffff">${escapeHtml(station.name)}</strong><span style="flex:none;border:1px solid #34d399;border-radius:999px;padding:3px 6px;color:#a7f3d0;font-size:10px;font-weight:700">${escapeHtml(reliability)}</span></div><p style="margin:6px 0 10px;color:#cbd5e1;font-size:11px;font-weight:500">${escapeHtml(station.source ?? "Station physique")} · ${station.distanceKm.toFixed(1)} km</p><div style="margin:0 0 10px;border-left:2px solid ${freshness.color};padding-left:7px;color:${freshness.color};font-size:11px;font-weight:700">Dernier relevé : ${escapeHtml(freshness.label)}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">${rows.map(([label, value]) => `<div style="background:#111c2e;border:1px solid #334155;border-radius:8px;padding:7px"><span style="display:block;margin-bottom:2px;color:#bae6fd;font-size:10px;font-weight:600">${label}</span><span style="color:#ffffff;font-size:13px;font-weight:700">${escapeHtml(value)}</span></div>`).join("")}</div><div style="margin-top:10px;border-top:1px solid #334155;padding-top:8px;color:#cbd5e1;font-size:11px">Fiabilité mesurée : <strong style="color:#a7f3d0">${escapeHtml(reliability)}</strong> · ${station.readings?.length ?? 0} relevé(s) conservé(s)</div></div>`;
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
  const fullscreenCloseControlRef = useRef<HTMLButtonElement | null>(null);
  const [mapReady, setMapReady] = useState(false);

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

  return (
    <div className="space-y-2">
      <div className="relative h-52 overflow-hidden rounded-xl border border-slate-800 bg-[#090b10]">
        <MapView
          className="h-full w-full"
          initialCenter={{ lat: center.lat, lng: center.lon }}
          initialZoom={stations.length > 0 ? 11 : 10}
          mapTypeId="satellite"
          mapTypeControl={false}
          fullscreenControl={true}
          zoomControl={false}
          streetViewControl={false}
          rotateControl={false}
          onMapReady={(map) => {
            mapRef.current = map;
            streetViewRef.current = map.getStreetView();
            const closeControl = document.createElement("button");
            closeControl.type = "button";
            closeControl.textContent = "✕ Fermer la carte";
            closeControl.setAttribute("aria-label", "Fermer la carte agrandie");
            closeControl.style.cssText = "display:none;margin:10px;padding:9px 12px;border:1px solid #7dd3fc;border-radius:8px;background:#071018;color:#e0f2fe;font:600 12px system-ui,sans-serif;cursor:pointer;";
            closeControl.onclick = () => {
              if (document.fullscreenElement) void document.exitFullscreen();
            };
            map.controls[google.maps.ControlPosition.TOP_LEFT].push(closeControl);
            fullscreenCloseControlRef.current = closeControl;
            renderMarkers(map);
            setMapReady(true);
          }}
          onFullscreenChange={(isFullscreen, map) => {
            map?.setOptions({
              mapTypeControl: isFullscreen,
              mapTypeControlOptions: isFullscreen ? {
                style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE],
              } : undefined,
              fullscreenControl: !isFullscreen,
              zoomControl: false,
              streetViewControl: isFullscreen,
              rotateControl: false,
            });
            if (fullscreenCloseControlRef.current) {
              fullscreenCloseControlRef.current.style.display = isFullscreen ? "flex" : "none";
            }
          }}
        />
        {!mapReady && (
          <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.16),transparent_34%),linear-gradient(rgba(30,41,59,0.32)_1px,transparent_1px),linear-gradient(90deg,rgba(30,41,59,0.32)_1px,transparent_1px)] bg-[size:auto,24px_24px,24px_24px]">
            <div className="absolute h-36 w-36 rounded-full border border-blue-500/20" />
            <div className="absolute h-24 w-24 rounded-full border border-blue-500/30" />
            <div className="relative flex flex-col items-center"><span className="grid h-10 w-10 place-items-center rounded-full border-2 border-blue-200 bg-blue-600 text-base text-white">●</span><span className="mt-2 rounded-full border border-slate-700 bg-[#10131a] px-2 py-1 text-[10px] text-slate-300">Lieu de référence</span></div>
            <p className="absolute bottom-3 text-[10px] text-slate-500">Repère local — fond cartographique en chargement</p>
          </div>
        )}
      </div>
      {mapReady && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#090b10] px-2.5 py-1.5">
          <p className="text-[10px] text-slate-400">Satellite · touchez un point pour la vue réelle</p>
          <button
            type="button"
            aria-label="Vue réelle du lieu"
            onClick={() => showStreetViewAt({ lat: center.lat, lng: center.lon }, "Lieu de référence")}
            className="min-h-9 shrink-0 rounded-md border border-sky-300/70 bg-sky-500/10 px-2.5 text-[11px] font-semibold text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            Vue réelle ici
          </button>
        </div>
      )}
    </div>
  );
}
