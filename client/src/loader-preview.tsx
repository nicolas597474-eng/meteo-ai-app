/** Development-only review entry. Not imported by the application or production build. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  WeatherAILoader,
  type WeatherAILoaderProps,
} from "./components/weather/WeatherAILoader";
import "./index.css";

function LoaderPreview() {
  const [loading, setLoading] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [variant, setVariant] =
    useState<WeatherAILoaderProps["variant"]>("full");
  const [finished, setFinished] = useState(false);
  const capture = new URLSearchParams(window.location.search).has("capture");

  return (
    <main className="min-h-svh bg-[#020610] text-slate-100">
      {!capture && (
        <header className="relative z-10 flex flex-wrap items-center justify-center gap-3 border-b border-slate-800/60 px-4 py-3 text-xs">
          <span className="mr-2 font-semibold tracking-wide text-sky-200">
            MeteoAI · Aperçu du loader
          </span>
          <select
            aria-label="Taille du loader"
            value={variant}
            onChange={event =>
              setVariant(event.target.value as WeatherAILoaderProps["variant"])
            }
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-2"
          >
            <option value="full">Plein écran</option>
            <option value="light">Léger</option>
            <option value="compact">Compact</option>
          </select>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={event => setReducedMotion(event.target.checked)}
            />
            Mouvements réduits
          </label>
          <button
            className="rounded-md border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sky-200"
            onClick={() => {
              setLoading(value => !value);
              setFinished(false);
            }}
          >
            {loading ? "Simuler la fin" : "Relancer"}
          </button>
        </header>
      )}
      <WeatherAILoader
        loading={loading}
        variant={variant}
        reducedMotion={reducedMotion ? true : undefined}
        onTransitionEnd={() => setFinished(true)}
      />
      {finished && (
        <p role="status" className="p-12 text-center text-sky-100">
          Chargement terminé. Le loader a libéré ses ressources.
        </p>
      )}
    </main>
  );
}

if (import.meta.env.DEV)
  createRoot(document.getElementById("root")!).render(<LoaderPreview />);
