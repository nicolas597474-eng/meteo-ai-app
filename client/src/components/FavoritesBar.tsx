import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, Star, Plus, X, Search, Navigation, Settings, LogIn } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";

// ─── Types ──────────────────────────────────────────────────────────────────
type FavoriteLocation = {
  id: number;
  name: string;
  customName: string | null;
  lat: number;
  lon: number;
  isDefault: number | null;
  radiusKm: number | null;
  position: number;
};

type LocationItem = {
  type: "current" | "favorite" | "local";
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
  isDefault?: boolean;
  temp?: number | null;
  condition?: string | null;
  confidenceScore?: number | null;
};

// ─── LocalStorage favorites (for non-logged-in users) ───────────────────────
type LocalFavorite = { id: string; name: string; lat: number; lon: number; radiusKm: number };

function getLocalFavorites(): LocalFavorite[] {
  try {
    const stored = localStorage.getItem("meteoai_local_favorites");
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveLocalFavorites(favs: LocalFavorite[]) {
  try { localStorage.setItem("meteoai_local_favorites", JSON.stringify(favs)); } catch {}
}

function addLocalFavorite(fav: Omit<LocalFavorite, "id">): LocalFavorite[] {
  const current = getLocalFavorites();
  if (current.length >= 5) return current;
  const newFav = { ...fav, id: `local-${Date.now()}` };
  const updated = [...current, newFav];
  saveLocalFavorites(updated);
  return updated;
}

function removeLocalFavorite(id: string): LocalFavorite[] {
  const updated = getLocalFavorites().filter(f => f.id !== id);
  saveLocalFavorites(updated);
  return updated;
}

// ─── Hook: useCurrentLocation ───────────────────────────────────────────────
function useCurrentLocation() {
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setPosition({ lat: 50.76, lon: 2.52 });
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLoading(false);
      },
      () => {
        setPosition({ lat: 50.76, lon: 2.52 });
        setLoading(false);
      },
      { timeout: 5000 }
    );
  }, []);

  return { position, loading };
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function FavoritesBar({
  activeLocation,
  onLocationChange,
  prefetchedWeather,
}: {
  activeLocation: { lat: number; lon: number; name: string } | null;
  onLocationChange: (loc: { lat: number; lon: number; name: string; radiusKm: number }) => void;
  prefetchedWeather?: Map<string, { temp: number | null; condition: string | null; confidenceScore: number | null }>;
}) {
  const { user } = useAuth();
  const { position: currentPos } = useCurrentLocation();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [localFavorites, setLocalFavorites] = useState<LocalFavorite[]>(getLocalFavorites);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch user's server-side favorites (only if logged in)
  const { data: serverFavorites = [], refetch: refetchFavorites } = trpc.favorites.list.useQuery(
    undefined,
    { enabled: !!user }
  );

  // Determine which favorites to show: server-side if logged in, localStorage otherwise
  const favorites: FavoriteLocation[] = user
    ? serverFavorites
    : localFavorites.map((lf, i) => ({
        id: i + 1,
        name: lf.name,
        customName: null,
        lat: lf.lat,
        lon: lf.lon,
        isDefault: null,
        radiusKm: lf.radiusKm,
        position: i,
      }));

  const totalFavCount = user ? serverFavorites.length : localFavorites.length;

  // Build location items list
  const locations: LocationItem[] = [];

  // Current position first
  if (currentPos) {
    locations.push({
      type: "current",
      id: "current",
      name: "Position actuelle",
      lat: currentPos.lat,
      lon: currentPos.lon,
      radiusKm: 10,
    });
  }

  // Then favorites (server or local)
  if (user) {
    serverFavorites.forEach((fav: FavoriteLocation) => {
      locations.push({
        type: "favorite",
        id: `fav-${fav.id}`,
        name: fav.customName || fav.name,
        lat: fav.lat,
        lon: fav.lon,
        radiusKm: fav.radiusKm ?? 10,
        isDefault: fav.isDefault === 1,
      });
    });
  } else {
    localFavorites.forEach((fav) => {
      locations.push({
        type: "local",
        id: fav.id,
        name: fav.name,
        lat: fav.lat,
        lon: fav.lon,
        radiusKm: fav.radiusKm,
      });
    });
  }

  // Set default on first load
  useEffect(() => {
    if (!activeLocation && locations.length > 0) {
      const defaultLoc = locations.find(l => l.isDefault) ?? locations[0];
      onLocationChange({
        lat: defaultLoc.lat,
        lon: defaultLoc.lon,
        name: defaultLoc.name,
        radiusKm: defaultLoc.radiusKm,
      });
    }
  }, [activeLocation, locations.length]);

  const isActive = (loc: LocationItem) => {
    if (!activeLocation) return false;
    return Math.abs(loc.lat - activeLocation.lat) < 0.001 && Math.abs(loc.lon - activeLocation.lon) < 0.001;
  };

  const handleAddFavorite = (fav: { name: string; lat: number; lon: number; radiusKm?: number }) => {
    if (user) {
      // Will be handled by the dialog's mutation
      return;
    }
    // Local storage for non-logged users
    const updated = addLocalFavorite({ name: fav.name, lat: fav.lat, lon: fav.lon, radiusKm: fav.radiusKm ?? 10 });
    setLocalFavorites(updated);
  };

  const handleRemoveLocal = (id: string) => {
    const updated = removeLocalFavorite(id);
    setLocalFavorites(updated);
  };

  return (
    <>
      {/* Favorites strip */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
          style={{ scrollBehavior: "smooth", WebkitOverflowScrolling: "touch" }}
        >
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => onLocationChange({ lat: loc.lat, lon: loc.lon, name: loc.name, radiusKm: loc.radiusKm })}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full border whitespace-nowrap text-xs font-medium transition-all flex-shrink-0 ${
                isActive(loc)
                  ? "bg-primary/20 border-primary text-primary shadow-sm shadow-primary/20"
                  : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {loc.type === "current" ? (
                <Navigation className="h-3 w-3" />
              ) : (
                <Star className={`h-3 w-3 ${isActive(loc) ? "fill-primary" : ""}`} />
              )}
              <span className="max-w-[100px] truncate">{loc.name}</span>
              {prefetchedWeather?.get(loc.id)?.temp != null && (
                <span className="text-xs font-bold ml-0.5">{Math.round(prefetchedWeather.get(loc.id)!.temp!)}°</span>
              )}
            </button>
          ))}

          {/* Add button — always visible if under 5 favorites */}
          {totalFavCount < 5 && (
            <button
              onClick={() => setShowAddDialog(true)}
              className="flex items-center gap-1 px-3 py-2 rounded-full border-2 border-dashed border-primary/40 text-primary hover:border-primary hover:bg-primary/10 text-xs font-semibold transition-all flex-shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Ajouter un lieu</span>
            </button>
          )}

          {/* Settings link — only if there are favorites */}
          {totalFavCount > 0 && user && (
            <Link
              href="/favorites"
              className="flex items-center gap-1 px-2.5 py-2 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 text-xs transition-all flex-shrink-0"
            >
              <Settings className="h-3 w-3" />
            </Link>
          )}
        </div>

        {/* Dot indicators */}
        {locations.length > 1 && (
          <div className="flex justify-center gap-1 mt-1.5">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  isActive(loc) ? "bg-primary w-4" : "bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add favorite dialog */}
      {showAddDialog && (
        <AddFavoriteDialog
          isLoggedIn={!!user}
          onClose={() => setShowAddDialog(false)}
          onAdded={(fav) => {
            if (!user) {
              handleAddFavorite(fav);
            }
            refetchFavorites();
            setShowAddDialog(false);
            // Auto-select the new location
            onLocationChange({ lat: fav.lat, lon: fav.lon, name: fav.name, radiusKm: fav.radiusKm ?? 10 });
          }}
        />
      )}
    </>
  );
}

// ─── Add Favorite Dialog ────────────────────────────────────────────────────
function AddFavoriteDialog({
  isLoggedIn,
  onClose,
  onAdded,
}: {
  isLoggedIn: boolean;
  onClose: () => void;
  onAdded: (fav: { name: string; lat: number; lon: number; radiusKm?: number }) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ name: string; lat: number; lon: number; country: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [customName, setCustomName] = useState("");
  const [selected, setSelected] = useState<{ name: string; lat: number; lon: number } | null>(null);

  const addMutation = trpc.favorites.add.useMutation({
    onSuccess: (_data, variables) => {
      onAdded({ name: variables.name, lat: variables.lat, lon: variables.lon });
    },
  });

  const searchCity = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setNoResults(false); setSearchError(false); return; }
    setSearching(true);
    setSearchError(false);
    setNoResults(false);
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=fr&format=json`);
      const data = await res.json();
      const mapped = (data.results ?? []).map((r: any) => ({
        name: `${r.name}${r.admin1 ? `, ${r.admin1}` : ""}`,
        lat: r.latitude,
        lon: r.longitude,
        country: r.country ?? "",
      }));
      setResults(mapped);
      if (mapped.length === 0) setNoResults(true);
    } catch {
      setResults([]);
      setSearchError(true);
    }
    setSearching(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchCity(query), 300);
    return () => clearTimeout(timer);
  }, [query, searchCity]);

  const handleConfirm = () => {
    if (!selected) return;
    const name = customName || selected.name;
    if (isLoggedIn) {
      addMutation.mutate({ name, lat: selected.lat, lon: selected.lon });
    } else {
      onAdded({ name, lat: selected.lat, lon: selected.lon, radiusKm: 10 });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Ajouter un lieu</h3>
              <p className="text-xs text-muted-foreground">Recherchez une ville ou utilisez votre GPS</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
              placeholder="Rechercher une ville..."
              className="w-full pl-9 pr-3 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
          </div>

          {/* Results */}
          {searching && <p className="text-xs text-muted-foreground text-center py-2">Recherche...</p>}
          {searchError && !searching && (
            <p className="text-xs text-red-400 text-center py-2">Erreur réseau. Vérifiez votre connexion et réessayez.</p>
          )}
          {noResults && !searching && !searchError && (
            <p className="text-xs text-muted-foreground text-center py-2">Aucun résultat pour "{query}". Essayez un autre nom.</p>
          )}
          {results.length > 0 && !selected && (
            <div className="space-y-1 max-h-52 overflow-y-auto rounded-xl border border-border bg-muted/30 p-1">
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSelected(r);
                    setCustomName(r.name.split(",")[0]);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-primary/10 text-left transition-colors"
                >
                  <MapPin className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.country} · {r.lat.toFixed(2)}°N, {r.lon.toFixed(2)}°E</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Selected — name input + confirm */}
          {selected && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-xl">
                <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="text-xs min-w-0">
                  <p className="font-medium truncate">{selected.name}</p>
                  <p className="text-muted-foreground">{selected.lat.toFixed(4)}°N, {selected.lon.toFixed(4)}°E</p>
                </div>
              </div>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Nom personnalisé (optionnel)"
                className="w-full px-3 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                onClick={handleConfirm}
                disabled={addMutation.isPending}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Star className="h-4 w-4" />
                {addMutation.isPending ? "Ajout..." : "Ajouter aux favoris"}
              </button>
              {!isLoggedIn && (
                <p className="text-xs text-muted-foreground text-center">
                  <a href={getLoginUrl()} className="text-primary hover:underline inline-flex items-center gap-1">
                    <LogIn className="h-3 w-3" />
                    Connectez-vous
                  </a>
                  {" "}pour synchroniser vos favoris sur tous vos appareils
                </p>
              )}
            </div>
          )}

          {/* Use current position */}
          {!selected && (
            <button
              onClick={() => {
                setGeoError("");
                if (!navigator.geolocation) {
                  setGeoError("La géolocalisation n'est pas disponible sur cet appareil.");
                  return;
                }
                navigator.geolocation.getCurrentPosition((pos) => {
                  setSelected({
                    name: "Ma position",
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                  });
                  setCustomName("Ma position");
                }, (err) => {
                  if (err.code === 1) {
                    setGeoError("Accès à la position refusé. Autorisez la géolocalisation dans les paramètres.");
                  } else {
                    setGeoError("Impossible d'obtenir votre position. Utilisez la recherche.");
                  }
                }, { timeout: 8000 });
              }}
              className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl border border-border hover:bg-muted text-sm transition-colors"
            >
              <Navigation className="h-4 w-4 text-primary" />
              <span>Utiliser ma position actuelle</span>
            </button>
          )}
          {geoError && (
            <p className="text-xs text-red-400 text-center py-1">{geoError}</p>
          )}

          {/* Quick popular locations */}
          {!selected && query.length < 2 && (
            <div className="pt-1">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Villes populaires</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { name: "Paris", lat: 48.86, lon: 2.35 },
                  { name: "Lyon", lat: 45.76, lon: 4.84 },
                  { name: "Lille", lat: 50.63, lon: 3.06 },
                  { name: "Marseille", lat: 43.30, lon: 5.37 },
                  { name: "Bordeaux", lat: 44.84, lon: -0.58 },
                ].map((city) => (
                  <button
                    key={city.name}
                    onClick={() => {
                      setSelected(city);
                      setCustomName(city.name);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-muted border border-border text-xs font-medium hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors"
                  >
                    {city.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
