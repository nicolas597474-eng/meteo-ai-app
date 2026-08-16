import { useMemo, type CSSProperties } from "react";
import { useLocation } from "@/contexts/LocationContext";
import { getDashboardWeatherImage } from "@/lib/weatherImages";
import { trpc } from "@/lib/trpc";

type SkyInput = {
  condition?: string | null;
  regime?: string | null;
  temperature?: number | null;
  cloudCover?: number | null;
  precipitation?: number | null;
  windSpeed?: number | null;
};

/** Sélectionne le même ciel que le Dashboard, à partir du snapshot officiel. */
export function selectPageWeatherSky(input: SkyInput): string {
  return getDashboardWeatherImage({
    condition: input.condition,
    regime: input.regime,
    temperature: input.temperature ?? undefined,
    cloudCover: input.cloudCover ?? undefined,
    precipitation: input.precipitation ?? undefined,
    windSpeed: input.windSpeed ?? undefined,
  });
}

export function usePageWeatherSky() {
  const { activeLocation } = useLocation();
  const coordsInput = useMemo(() => ({
    lat: activeLocation?.lat ?? 50.76,
    lon: activeLocation?.lon ?? 2.52,
  }), [activeLocation?.lat, activeLocation?.lon]);
  const { data } = trpc.weather.getDetailedForecast.useQuery(coordsInput, {
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const image = useMemo(() => {
    const hours = (data?.hours ?? []) as Array<any>;
    const parisHour = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).slice(0, 2) + ":00";
    const current = hours.find((hour) => hour.hour === parisHour) ?? hours[0] ?? null;
    const today = (data?.days ?? [])[0] as any;
    return selectPageWeatherSky({
      condition: current?.condition ?? today?.condition,
      regime: (data?.regime as any)?.primary?.label,
      temperature: current?.temp ?? today?.tempMax,
      cloudCover: current?.cloudCover ?? today?.cloudCover,
      precipitation: current?.precipitation ?? today?.precipitation,
      windSpeed: current?.windSpeed ?? today?.windSpeed,
    });
  }, [data]);

  const style = useMemo(() => ({ "--page-weather-sky-image": `url("${image}")` } as CSSProperties), [image]);
  return { style, image };
}
