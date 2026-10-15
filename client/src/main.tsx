import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { LocationProvider } from "./contexts/LocationContext";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const FAST_BATCHED_QUERY_PATHS = new Set([
  // Small metadata/read-model requests that often mount together. Keep this
  // allow-list deliberately narrow: forecast, snapshot and station searches
  // may wait on providers and must never create head-of-line blocking here.
  "weather.getRegimeCatalogue",
  "weather.getForecastProvenance",
  "weather.getStationRankingCriteria",
  "favorites.list",
  "favorites.getPreloadedForecasts",
]);

const transportOptions = {
  url: "/api/trpc",
  transformer: superjson,
  headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
  },
  fetch(input: RequestInfo | URL, init?: RequestInit) {
    return globalThis.fetch(input, {
      ...(init ?? {}),
      credentials: "include",
    });
  },
};

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition(op) {
        return op.type === "query" && FAST_BATCHED_QUERY_PATHS.has(op.path);
      },
      // Independent lightweight reads share a small bounded batch.
      true: httpBatchLink({ ...transportOptions, maxItems: 6 }),
      // Forecasts, provider-backed snapshots, searches and all mutations stay
      // on individual requests to avoid global batch head-of-line blocking.
      false: httpLink(transportOptions),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <LocationProvider>
        <App />
      </LocationProvider>
    </QueryClientProvider>
  </trpc.Provider>
);

// PWA : enregistrement du service worker de coquille, uniquement en
// production. Échec silencieux : sans SW, l'application reste fonctionnelle.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non bloquant : pas de mode hors ligne, rien de cassé.
    });
  });
}
