/**
 * LocationContext — propagates the active location (lat/lon/name) to all pages
 * so that Ranking, History, AI Lab, and Stations all show data for the selected location.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface ActiveLocation {
  lat: number;
  lon: number;
  name: string;
  /** If this is a saved favorite, its DB id */
  favoriteId?: number;
  /** Station search radius selected for this location */
  radiusKm?: number;
  /** Local mode for this location */
  localMode?: "standard" | "local" | "ultra-local";
}

interface LocationContextValue {
  activeLocation: ActiveLocation | null;
  setActiveLocation: (loc: ActiveLocation | null) => void;
  /** true while the browser geolocation API is resolving */
  isLocating: boolean;
  requestGeolocation: () => void;
}

const LocationContext = createContext<LocationContextValue>({
  activeLocation: null,
  setActiveLocation: () => {},
  isLocating: false,
  requestGeolocation: () => {},
});

const STORAGE_KEY = "meteoai_active_location";
const LEGACY_DASHBOARD_LOCATION_KEY = "meteoai_last_location";

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [activeLocation, setActiveLocationState] = useState<ActiveLocation | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_DASHBOARD_LOCATION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [isLocating, setIsLocating] = useState(false);

  const setActiveLocation = useCallback((loc: ActiveLocation | null) => {
    setActiveLocationState(loc);
    try {
      if (loc) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }, []);

  const requestGeolocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setActiveLocation({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          name: "Position actuelle",
        });
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  }, [setActiveLocation]);

  return (
    <LocationContext.Provider value={{ activeLocation, setActiveLocation, isLocating, requestGeolocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  return useContext(LocationContext);
}
