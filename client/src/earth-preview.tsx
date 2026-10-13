// Standalone development preview; not part of the production application entry.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { WeatherAILoader } from "./components/weather/WeatherAILoader";
import "./index.css";

function Preview() {
  const [loading, setLoading] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [variant, setVariant] = useState<"full" | "light" | "compact">("full");
  return (
    <main className="min-h-screen bg-[#02050e] text-slate-200">
      <header className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-5">
        <div>
          <p className="text-sm font-semibold tracking-widest text-cyan-300">
            METEOAI · GLOBE 3D
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Aperçu de l’animation de chargement
          </p>
        </div>
        <span className="rounded-full border border-cyan-400/20 px-3 py-1 text-xs text-cyan-200">
          Rendu 3D en direct
        </span>
      </header>
      <div className="mx-auto max-w-3xl">
        <WeatherAILoader
          loading={loading}
          reducedMotion={reduced || undefined}
          variant={variant}
        />
        {!loading && (
          <p role="status" className="py-20 text-center text-emerald-300">
            Données prêtes : le globe laisse place aux prévisions.
          </p>
        )}
      </div>
      <section
        aria-label="Contrôles de l’aperçu"
        className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3 px-5 pb-8 text-xs"
      >
        <button
          className="rounded-xl border border-cyan-400/30 bg-cyan-950/40 px-4 py-3"
          onClick={() => setLoading(!loading)}
        >
          {loading ? "Simuler la fin du chargement" : "Relancer l’animation"}
        </button>
        <button
          aria-pressed={reduced}
          className="rounded-xl border border-slate-700 px-4 py-3"
          onClick={() => setReduced(!reduced)}
        >
          {reduced ? "Activer la rotation" : "Voir la version fixe"}
        </button>
        <select
          aria-label="Format du globe"
          value={variant}
          onChange={event => setVariant(event.target.value as typeof variant)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
        >
          <option value="full">Format complet</option>
          <option value="light">Format léger</option>
          <option value="compact">Format compact</option>
        </select>
        <p className="w-full text-center leading-relaxed text-slate-500">
          La rotation s’arrête en arrière-plan. Dans l’application, cet écran
          disparaît dès que les données sont disponibles.
        </p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
);
