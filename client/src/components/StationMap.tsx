import { useCallback, useEffect, useRef, useState } from "react";
import { MapView } from "@/components/Map";

type StationMarker = {
  stationId: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  ageMinutes: number | null;
};

export function StationMap({
  center,
  stations,
}: {
  center: { lat: number; lon: number };
  stations: StationMarker[];
}) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

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

    stations.forEach((station) => {
      const freshness = station.ageMinutes !== null && station.ageMinutes <= 90 ? "#34d399" : "#fbbf24";
      const marker = new google.maps.Marker({
        map,
        position: { lat: station.lat, lng: station.lon },
        title: `${station.name} · ${station.distanceKm.toFixed(1)} km`,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: freshness, fillOpacity: 1, strokeColor: "#071018", strokeWeight: 2 },
      });
      markersRef.current.push(marker);
    });
  }, [center, stations]);

  useEffect(() => {
    if (mapRef.current) renderMarkers(mapRef.current);
  }, [renderMarkers]);

  return (
    <div className="relative h-56 overflow-hidden rounded-xl border border-slate-800 bg-[#090b10]">
      <MapView
        className="h-full w-full"
        initialCenter={{ lat: center.lat, lng: center.lon }}
        initialZoom={stations.length > 0 ? 11 : 10}
        onMapReady={(map) => {
          mapRef.current = map;
          renderMarkers(map);
          setMapReady(true);
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
  );
}
