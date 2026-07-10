import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, Star, Plus, X, Search, Navigation, Settings } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

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
  type: "current" | "favorite";
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

// ─── Hook: useCurrentLocation ───────────────────────────────────────────────
function useCurrentLocation() {
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      // Fallback to Hondeghem
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
        // Fallback to Hondeghem
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch user's favorites
  const { data: favorites = [], refetch: refetchFavorites } = trpc.favorites.list.useQuery(
    undefined,
    { enabled: !!user }
  );

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

  // Then favorites
  favorites.forEach((fav: FavoriteLocation) => {
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
              <span className="max-w-[80px] truncate">{loc.name}</span>
              {prefetchedWeather?.get(loc.id)?.temp != null && (
                <span className="text-xs font-bold ml-0.5">{Math.round(prefetchedWeather.get(loc.id)!.temp!)}°</span>
              )}
            </button>
          ))}

          {/* Add button (max 5 favorites) */}
          {user && favorites.length < 5 && (
            <button
              onClick={() => setShowAddDialog(true)}
              className="flex items-center gap-1 px-3 py-2 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary text-xs font-medium transition-all flex-shrink-0"
            >
              <Plus className="h-3 w-3" />
              <span>Ajouter</span>
            </button>
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
          onClose={() => setShowAddDialog(false)}
          onAdded={() => {
            refetchFavorites();
            setShowAddDialog(false);
          }}
        />
      )}
    </>
  );
}

// ─── Add Favorite Dialog ────────────────────────────────────────────────────
function AddFavoriteDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ name: string; lat: number; lon: number; country: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [customName, setCustomName] = useState("");
  const [selected, setSelected] = useState<{ name: string; lat: number; lon: number } | null>(null);

  const addMutation = trpc.favorites.add.useMutation({
    onSuccess: () => onAdded(),
  });

  const searchCity = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=fr&format=json`);
      const data = await res.json();
      setResults(
        (data.results ?? []).map((r: any) => ({
          name: `${r.name}${r.admin1 ? `, ${r.admin1}` : ""}`,
          lat: r.latitude,
          lon: r.longitude,
          country: r.country ?? "",
        }))
      );
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchCity(query), 300);
    return () => clearTimeout(timer);
  }, [query, searchCity]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-base font-semibold">Ajouter un favori</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une ville..."
              className="w-full pl-9 pr-3 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
          </div>

          {/* Results */}
          {searching && <p className="text-xs text-muted-foreground text-center py-2">Recherche...</p>}
          {results.length > 0 && !selected && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSelected(r);
                    setCustomName(r.name.split(",")[0]);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-left transition-colors"
                >
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.country} · {r.lat.toFixed(2)}°N, {r.lon.toFixed(2)}°E</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Selected — name input */}
          {selected && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2 bg-primary/10 border border-primary/20 rounded-lg">
                <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="text-xs">
                  <p className="font-medium">{selected.name}</p>
                  <p className="text-muted-foreground">{selected.lat.toFixed(4)}°N, {selected.lon.toFixed(4)}°E</p>
                </div>
              </div>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Nom personnalisé"
                className="w-full px-3 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                onClick={() => {
                  addMutation.mutate({
                    name: customName || selected.name,
                    lat: selected.lat,
                    lon: selected.lon,
                  });
                }}
                disabled={addMutation.isPending}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {addMutation.isPending ? "Ajout..." : "Ajouter aux favoris"}
              </button>
            </div>
          )}

          {/* Use current position */}
          {!selected && (
            <button
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition((pos) => {
                    setSelected({
                      name: "Ma position",
                      lat: pos.coords.latitude,
                      lon: pos.coords.longitude,
                    });
                    setCustomName("Ma position");
                  });
                }
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border hover:bg-muted text-sm transition-colors"
            >
              <Navigation className="h-4 w-4 text-primary" />
              <span>Utiliser ma position actuelle</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CSS for hiding scrollbar ───────────────────────────────────────────────
// Add to index.css: .scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
