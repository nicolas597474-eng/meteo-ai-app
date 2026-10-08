import { useEffect, useState } from "react";
import { LocateFixed, LoaderCircle, MapPin, Search } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";

type City = {
  name: string;
  lat: number;
  lon: number;
};

type SearchResult = City & {
  country: string;
};

const QUICK_CITIES: City[] = [
  { name: "Lille", lat: 50.6292, lon: 3.0573 },
  { name: "Paris", lat: 48.8566, lon: 2.3522 },
  { name: "Lyon", lat: 45.764, lon: 4.8357 },
  { name: "Marseille", lat: 43.2965, lon: 5.3698 },
  { name: "Toulouse", lat: 43.6045, lon: 1.444 },
  { name: "Bordeaux", lat: 44.8378, lon: -0.5792 },
];

function isSamePlace(left: City | null | undefined, right: City) {
  return Boolean(
    left &&
      Math.abs(left.lat - right.lat) < 0.02 &&
      Math.abs(left.lon - right.lon) < 0.02
  );
}

export function ReliabilityLocationPicker({
  locationName,
}: {
  locationName: string;
}) {
  const { activeLocation, setActiveLocation, isLocating, requestGeolocation } =
    useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setResults([]);
      setIsSearching(false);
      setSearchMessage("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchMessage("");
      try {
        const response = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmedQuery)}&count=6&language=fr&format=json`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error("La recherche n’a pas abouti.");
        const payload = (await response.json()) as {
          results?: Array<{
            name?: string;
            latitude?: number;
            longitude?: number;
            admin1?: string;
            country?: string;
          }>;
        };
        const cities = (payload.results ?? []).flatMap(result => {
          if (
            typeof result.name !== "string" ||
            typeof result.latitude !== "number" ||
            typeof result.longitude !== "number"
          )
            return [];
          const region = result.admin1 ? ` · ${result.admin1}` : "";
          return [
            {
              name: `${result.name}${region}`,
              lat: result.latitude,
              lon: result.longitude,
              country: result.country ?? "",
            },
          ];
        });
        setResults(cities);
        if (cities.length === 0)
          setSearchMessage("Aucune ville trouvée. Essaie un autre nom.");
      } catch (error) {
        if (controller.signal.aborted) return;
        setResults([]);
        setSearchMessage(
          "La recherche de ville est momentanément indisponible."
        );
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const selectCity = (city: City) => {
    setActiveLocation({
      lat: city.lat,
      lon: city.lon,
      name: city.name,
      radiusKm: activeLocation?.radiusKm,
    });
    setQuery("");
    setResults([]);
    setSearchMessage("");
  };

  const currentLocation = activeLocation ?? {
    lat: 50.7567,
    lon: 2.5204,
    name: locationName,
  };

  return (
    <section
      className="mt-5 border-t border-white/8 pt-4"
      aria-label="Choisir le lieu de l’audit"
    >
      <div className="flex gap-2">
        <label className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-slate-700/80 bg-slate-950/45 px-3.5 transition-colors focus-within:border-sky-400/50 focus-within:ring-2 focus-within:ring-sky-400/10">
          <Search
            className="h-4 w-4 shrink-0 text-slate-400"
            aria-hidden="true"
          />
          <span className="sr-only">Rechercher une ville</span>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Escape") {
                setQuery("");
                setResults([]);
                setSearchMessage("");
              }
            }}
            placeholder="Rechercher une ville"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          {isSearching ? (
            <LoaderCircle
              className="h-4 w-4 shrink-0 animate-spin text-sky-300"
              aria-label="Recherche en cours"
            />
          ) : null}
        </label>
        <button
          type="button"
          onClick={requestGeolocation}
          disabled={isLocating}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-slate-700/80 bg-slate-950/45 text-slate-200 transition hover:border-sky-400/40 hover:bg-sky-400/10 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          aria-label="Utiliser ma position actuelle"
          title="Utiliser ma position actuelle"
        >
          {isLocating ? (
            <LoaderCircle className="h-5 w-5 animate-spin" />
          ) : (
            <LocateFixed className="h-5 w-5" />
          )}
        </button>
      </div>

      {query.trim().length >= 2 ? (
        <div
          className="mt-2 overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0c131d] shadow-xl"
          role="region"
          aria-label="Résultats de recherche de ville"
        >
          {results.length > 0 ? (
            <ul className="divide-y divide-slate-800/80">
              {results.map(city => (
                <li key={`${city.name}:${city.lat}:${city.lon}`}>
                  <button
                    type="button"
                    onClick={() => selectCity(city)}
                    className="flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left text-xs text-slate-200 transition hover:bg-sky-400/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-300" />
                    <span className="min-w-0 truncate">
                      {city.name}
                      {city.country ? ` · ${city.country}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3.5 py-3 text-xs text-slate-400">
              {isSearching
                ? "Recherche des villes…"
                : searchMessage || "Recherche des villes…"}
            </p>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex min-w-0 items-center gap-2 text-xs text-slate-300">
        <MapPin className="h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
        <span className="truncate font-medium">{locationName}</span>
        <span className="shrink-0 text-slate-600">·</span>
        <span className="shrink-0 text-slate-500">Europe/Paris</span>
      </div>

      <div
        className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide"
        aria-label="Villes rapides"
      >
        {QUICK_CITIES.map(city => {
          const selected = isSamePlace(currentLocation, city);
          return (
            <button
              type="button"
              key={city.name}
              onClick={() => selectCity(city)}
              aria-pressed={selected}
              className={`min-h-10 shrink-0 rounded-full border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
                selected
                  ? "border-sky-300/50 bg-sky-200 text-slate-950"
                  : "border-slate-700/80 bg-slate-900/70 text-slate-400 hover:border-slate-500 hover:text-slate-100"
              }`}
            >
              {city.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
