/**
 * GOOGLE MAPS FRONTEND INTEGRATION - ESSENTIAL GUIDE
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<google.maps.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 40.7128, lng: -74.0060 }}
 *   initialZoom={15}
 *   onMapReady={(map) => {
 *     mapRef.current = map; // Store to control map from parent anytime, google map itself is in charge of the re-rendering, not react state.
 * </MapView>
 *
 * ======
 * Available Libraries and Core Features:
 * -------------------------------
 * 📍 MARKER (from `marker` library)
 * - Attaches to map using { map, position }
 * new google.maps.marker.AdvancedMarkerElement({
 *   map,
 *   position: { lat: 37.7749, lng: -122.4194 },
 *   title: "San Francisco",
 * });
 *
 * -------------------------------
 * 🏢 PLACES (from `places` library)
 * - Does not attach directly to map; use data with your map manually.
 * const place = new google.maps.places.Place({ id: PLACE_ID });
 * await place.fetchFields({ fields: ["displayName", "location"] });
 * map.setCenter(place.location);
 * new google.maps.marker.AdvancedMarkerElement({ map, position: place.location });
 *
 * -------------------------------
 * 🧭 GEOCODER (from `geocoding` library)
 * - Standalone service; manually apply results to map.
 * const geocoder = new google.maps.Geocoder();
 * geocoder.geocode({ address: "New York" }, (results, status) => {
 *   if (status === "OK" && results[0]) {
 *     map.setCenter(results[0].geometry.location);
 *     new google.maps.marker.AdvancedMarkerElement({
 *       map,
 *       position: results[0].geometry.location,
 *     });
 *   }
 * });
 *
 * -------------------------------
 * 📐 GEOMETRY (from `geometry` library)
 * - Pure utility functions; not attached to map.
 * const dist = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
 *
 * -------------------------------
 * 🛣️ ROUTES (from `routes` library)
 * - Combines DirectionsService (standalone) + DirectionsRenderer (map-attached)
 * const directionsService = new google.maps.DirectionsService();
 * const directionsRenderer = new google.maps.DirectionsRenderer({ map });
 * directionsService.route(
 *   { origin, destination, travelMode: "DRIVING" },
 *   (res, status) => status === "OK" && directionsRenderer.setDirections(res)
 * );
 *
 * -------------------------------
 * 🌦️ MAP LAYERS (attach directly to map)
 * - new google.maps.TrafficLayer().setMap(map);
 * - new google.maps.TransitLayer().setMap(map);
 * - new google.maps.BicyclingLayer().setMap(map);
 *
 * -------------------------------
 * ✅ SUMMARY
 * - “map-attached” → AdvancedMarkerElement, DirectionsRenderer, Layers.
 * - “standalone” → Geocoder, DirectionsService, DistanceMatrixService, ElevationService.
 * - “data-only” → Place, Geometry utilities.
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
  }
}

const API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
const FORGE_BASE_URL =
  import.meta.env.VITE_FRONTEND_FORGE_API_URL ||
  "https://forge.butterfly-effect.dev";
const MAPS_PROXY_URL = `${FORGE_BASE_URL}/v1/maps/proxy`;
export const MAP_UNAVAILABLE_MESSAGE = "Carte indisponible. Les stations restent accessibles dans la liste ci-dessous.";

let mapScriptPromise: Promise<void> | null = null;

function loadMapScript(): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (mapScriptPromise) return mapScriptPromise;

  mapScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${MAPS_PROXY_URL}/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      script.remove();
      mapScriptPromise = null;
      reject(new Error("Le service de cartographie est momentanément indisponible."));
    };
    document.head.appendChild(script);
  });

  return mapScriptPromise;
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  mapTypeId?: google.maps.MapTypeId | string;
  mapTypeControl?: boolean;
  fullscreenControl?: boolean;
  zoomControl?: boolean;
  streetViewControl?: boolean;
  rotateControl?: boolean;
  cameraControl?: boolean;
  isFractionalZoomEnabled?: boolean;
  children?: ReactNode;
  onMapReady?: (map: google.maps.Map) => void;
  onFullscreenChange?: (isFullscreen: boolean, map: google.maps.Map | null) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  mapTypeId = "roadmap",
  mapTypeControl = true,
  fullscreenControl = true,
  zoomControl = true,
  streetViewControl = true,
  rotateControl = true,
  cameraControl = false,
  isFractionalZoomEnabled = true,
  children,
  onMapReady,
  onFullscreenChange,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const touchGestureActive = useRef(false);
  const touchReleaseTimer = useRef<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const init = usePersistFn(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      await loadMapScript();
      if (!mapContainer.current || !window.google?.maps) {
        throw new Error("La carte ne peut pas être initialisée.");
      }
      const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      map.current = new window.google.maps.Map(mapContainer.current, {
        zoom: initialZoom,
        center: initialCenter,
        mapTypeId,
        mapTypeControl,
        fullscreenControl,
        zoomControl,
        streetViewControl,
        rotateControl,
        cameraControl,
        isFractionalZoomEnabled: isFractionalZoomEnabled && !prefersReducedMotion,
        mapId: "DEMO_MAP_ID",
      });
      onMapReady?.(map.current);
    } catch (error) {
      console.error("Failed to load Google Maps script", error);
      setLoadError(MAP_UNAVAILABLE_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!onFullscreenChange) return;
    const reportFullscreen = () => onFullscreenChange(Boolean(document.fullscreenElement), map.current);
    document.addEventListener("fullscreenchange", reportFullscreen);
    return () => document.removeEventListener("fullscreenchange", reportFullscreen);
  }, [onFullscreenChange]);

  useEffect(() => {
    if (isLoading || !mapContainer.current || !map.current) return;
    const resizeObserver = new ResizeObserver(() => {
      const mapInstance = map.current;
      if (!mapInstance || !window.google?.maps || touchGestureActive.current) return;
      window.google.maps.event.trigger(mapInstance, "resize");
    });
    resizeObserver.observe(mapContainer.current);
    return () => resizeObserver.disconnect();
  }, [isLoading]);

  if (loadError) {
    return (
      <div className={cn("flex h-[260px] flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/30 p-6 text-center", className)} role="alert">
        <p className="max-w-sm text-sm text-muted-foreground">{loadError}</p>
        <button type="button" onClick={() => void init()} className="min-h-11 rounded-md border border-primary/50 px-4 text-sm font-medium text-primary">
          Réessayer la carte
        </button>
      </div>
    );
  }

  return (
    <div className={cn("relative h-[500px] w-full", className)}>
      {isLoading && <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-muted/30 text-sm text-muted-foreground">Chargement de la carte…</div>}
      <div ref={mapContainer} className="h-full w-full touch-none [will-change:transform]" onTouchStart={() => { if (touchReleaseTimer.current != null) window.clearTimeout(touchReleaseTimer.current); touchGestureActive.current = true; }} onTouchEnd={() => { touchReleaseTimer.current = window.setTimeout(() => { touchGestureActive.current = false; }, 160); }} onTouchCancel={() => { touchGestureActive.current = false; }} />
      {children}
    </div>
  );
}
