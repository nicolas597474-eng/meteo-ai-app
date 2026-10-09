import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  FAVORITE_WEATHER_PRELOAD_CONCURRENCY,
  getUniqueFavoriteWeatherCoordinates,
  preloadFavoriteWeatherLocations,
} from "@/lib/favoriteWeatherPreload";

const DASHBOARD_STALE_TIME_MS = 60_000;
const DAILY_FORECAST_STALE_TIME_MS = 5 * 60_000;

/**
 * Warms the query cache for every saved location as soon as an authenticated
 * session and its favorites are available. Mounted at App level so this also
 * runs when a user opens a route other than the Dashboard.
 */
export function FavoriteWeatherPreloader() {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const favoritesQuery = trpc.favorites.list.useQuery(undefined, {
    enabled: Boolean(user) && !loading,
    staleTime: DAILY_FORECAST_STALE_TIME_MS,
  });
  const favoriteCoordinates = useMemo(
    () => getUniqueFavoriteWeatherCoordinates(favoritesQuery.data ?? []),
    [favoritesQuery.data]
  );
  const favoriteCoordinatesRef = useRef(favoriteCoordinates);
  favoriteCoordinatesRef.current = favoriteCoordinates;
  const favoriteSignature = favoriteCoordinates
    .map(({ lat, lon }) => `${lat},${lon}`)
    .join("|");
  const scheduledSessionRef = useRef<string | null>(null);

  const preloadLocation = useCallback(
    async ({ lat, lon }: { lat: number; lon: number }) => {
      await Promise.all([
        utils.weather.getDashboard.prefetch(
          { lat, lon },
          { staleTime: DASHBOARD_STALE_TIME_MS }
        ),
        utils.weather.getDetailedForecast.prefetch(
          { lat, lon, includeExtendedPeriods: false },
          { staleTime: DASHBOARD_STALE_TIME_MS }
        ),
        utils.weather.getDashboardDailyForecast.prefetch(
          { lat, lon },
          { staleTime: DAILY_FORECAST_STALE_TIME_MS }
        ),
      ]);
    },
    [utils]
  );

  useEffect(() => {
    if (loading || !user) {
      scheduledSessionRef.current = null;
      return;
    }
    if (!favoritesQuery.isFetched || favoriteSignature.length === 0) return;

    const sessionKey = `${user.id}:${favoriteSignature}`;
    if (scheduledSessionRef.current === sessionKey) return;
    scheduledSessionRef.current = sessionKey;

    let cancelled = false;
    // This protected read-model already contains the latest scheduled forecast
    // for every favorite; it also feeds the compact weather in the favorites bar.
    void utils.favorites.getPreloadedForecasts
      .prefetch(undefined, { staleTime: DAILY_FORECAST_STALE_TIME_MS })
      .catch(() => undefined);

    void preloadFavoriteWeatherLocations(
      favoriteCoordinatesRef.current,
      preloadLocation,
      {
        concurrency: FAVORITE_WEATHER_PRELOAD_CONCURRENCY,
        shouldCancel: () => cancelled,
      }
    );

    return () => {
      cancelled = true;
    };
  }, [
    favoriteSignature,
    favoritesQuery.isFetched,
    loading,
    preloadLocation,
    user?.id,
    utils,
  ]);

  return null;
}
