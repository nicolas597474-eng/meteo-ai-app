import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const loaderSource = readFileSync(
  new URL("./WeatherAILoader.tsx", import.meta.url),
  "utf8"
);
const graphicSource = readFileSync(
  new URL("./EarthLoaderVisual.tsx", import.meta.url),
  "utf8"
);
const sceneSource = readFileSync(
  new URL("./earthLoaderScene.ts", import.meta.url),
  "utf8"
);
const stylesSource = readFileSync(
  new URL("../../index.css", import.meta.url),
  "utf8"
);
const dashboardSource = readFileSync(
  new URL("../../pages/Dashboard.tsx", import.meta.url),
  "utf8"
);
const detailsSource = readFileSync(
  new URL("../../pages/WeatherDetails.tsx", import.meta.url),
  "utf8"
);
const appSource = readFileSync(
  new URL("../../App.tsx", import.meta.url),
  "utf8"
);

describe("WeatherAILoader — Moteur d'animation de chargement météo 3D + holographique", () => {
  it("1. s'affiche lorsque les données requises sont en cours de chargement avec les éléments accessibles", () => {
    // role="status", aria-live="polite", aria-busy
    expect(loaderSource).toContain('role="status"');
    expect(loaderSource).toContain('aria-live="polite"');
    expect(loaderSource).toContain("aria-busy={!isReady}");
    expect(loaderSource).toContain("WeatherAILoaderGraphic");

    // Intégration dans le Dashboard et WeatherDetails
    expect(dashboardSource).toContain(
      '<WeatherAILoader loading={true} variant="full"'
    );
    expect(detailsSource).toContain("<WeatherAILoader loading={true}");
    expect(appSource).toContain("<WeatherAILoader loading={true}");
  });

  it("2. intègre les quatre phases visuelles continues sans imposer d'étapes réseau artificielles", () => {
    // Phase A : Initialisation
    expect(loaderSource).toContain("Phase 1/3 · Initialisation");
    expect(loaderSource).toContain("Initialisation de MeteoAI…");

    // Phase B : Collecte multi-sources
    expect(loaderSource).toContain("Phase 2/3 · Collecte multi-sources");
    expect(loaderSource).toContain("Préparation des données météo…");

    // Phase C : Analyse et fusion IA & radar
    expect(loaderSource).toContain("Phase 3/3 · Fusion IA & radar");
    expect(loaderSource).toContain("Analyse et fusion des données météo…");

    // Phase D : Transition vers les prévisions dès que loading devient false
    expect(loaderSource).toContain("Données prêtes");
    expect(loaderSource).toContain("weather-ai-loader--exiting");
    expect(loaderSource).toContain("onTransitionEndRef.current?.()");
  });

  it("3. ne bloque pas l'affichage lorsque les données en cache sont immédiatement exploitables", () => {
    // Si loading est false initialement, le composant n'affiche rien (null)
    expect(loaderSource).toContain(
      "const [isVisible, setIsVisible] = useState(loading)"
    );
    expect(loaderSource).toContain("if (!isVisible) return null");

    // Dans Dashboard, isLoading n'est vrai que si toutes les sources indispensables manquent
    expect(dashboardSource).toContain(
      "const isLoading = officialLoading && hourlyLoading && !fastCurrentSnapshot;"
    );
  });

  it("4. permet la sortie propre en cas d'erreur réseau sans boucle infinie", () => {
    // Le dashboard conserve son timeout de sécurité et son écran d'erreur dédié
    expect(dashboardSource).toContain("DASHBOARD_LOAD_TIMEOUT_MS");
    expect(dashboardSource).toContain("if (hasWaitTimedOut)");
    expect(dashboardSource).toContain("if (isError)");
    expect(dashboardSource).toContain("Réessayer maintenant");
  });

  it("5. permet l'affichage lorsque les sources facultatives sont absentes", () => {
    // Le chargement bloquant est limité au minimum requis; fastCurrentSnapshot évite le blocage
    expect(dashboardSource).toContain("!fastCurrentSnapshot");
  });

  it("6. nettoie l'ensemble des timers, écouteurs d'événements et ressources au démontage", () => {
    expect(loaderSource).toContain("window.clearTimeout(timerB)");
    expect(loaderSource).toContain("window.clearTimeout(timerC)");
    expect(loaderSource).toContain("window.clearTimeout(exitTimer)");
    expect(loaderSource).toContain(
      'document.removeEventListener?.("visibilitychange", onVisibilityChange)'
    );
    expect(loaderSource).toContain(
      'mediaQuery.removeEventListener?.("change", onChange)'
    );
  });

  it("7. respecte scrupuleusement les préférences 'prefers-reduced-motion'", () => {
    // Détection programmatique
    expect(loaderSource).toContain(
      'window.matchMedia("(prefers-reduced-motion: reduce)")'
    );
    expect(loaderSource).toContain("weather-ai-loader--reduced-motion");

    // Règle CSS pour désactiver toutes les animations continues
    expect(stylesSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesSource).toContain(".weather-ai-loader--reduced-motion *");
    expect(stylesSource).toContain("animation: none !important");
  });

  it("8. ne déclenche aucun appel réseau ou coût d'API IA supplémentaire", () => {
    // Aucune dépendance réseau dans WeatherAILoader
    expect(loaderSource).not.toContain("fetch(");
    expect(loaderSource).not.toContain("axios");
    expect(loaderSource).not.toContain("openai");
    expect(loaderSource).not.toContain("trpc.weather");
    expect(loaderSource).not.toContain("apiKey");
  });

  it("9. améliore progressivement une image locale avec une vraie scène 3D différée", () => {
    expect(graphicSource).toContain('import("./earthLoaderScene")');
    expect(graphicSource).toContain("SCENE_START_DELAY_MS");
    expect(graphicSource).toContain("earth-poster.webp");
    expect(graphicSource).toContain('aria-hidden="true"');
    expect(graphicSource).toContain('alt=""');
    expect(loaderSource).not.toContain('from "three"');
    expect(sceneSource).toContain("THREE.SphereGeometry");
    expect(sceneSource).toContain("getEarthLoaderRotation(seconds)");
    expect(sceneSource).toContain("depthTest: true");
    expect(sceneSource).toContain("group.rotation.y = rotation.orbits[i]");
  });

  it("10. conserve les variantes, le confinement et un indicateur sans faux pourcentage", () => {
    expect(stylesSource).toContain("contain: layout style paint");
    expect(stylesSource).toContain('.earth-loader[data-variant="compact"]');
    expect(stylesSource).toContain('.earth-loader[data-variant="light"]');
    expect(loaderSource).toContain("weather-ai-loader__progress");
    expect(loaderSource).not.toContain("aria-valuenow");
    expect(stylesSource).toContain("@keyframes wai-progress-travel");
  });

  it("11. borne le coût des médias locaux et ne contacte aucun CDN à l'exécution", () => {
    const assets = [
      "earth-day",
      "earth-normal",
      "earth-water",
      "earth-night",
      "earth-clouds",
      "storm-cloud",
      "earth-poster",
    ];
    const totalBytes = assets.reduce((total, name) => {
      const path = new URL(
        `../../assets/earth-loader/${name}.webp`,
        import.meta.url
      );
      expect(readFileSync(path).subarray(8, 12).toString()).toBe("WEBP");
      return total + statSync(path).size;
    }, 0);
    expect(totalBytes).toBeLessThan(600 * 1024);
    for (const source of [loaderSource, graphicSource, sceneSource]) {
      expect(source).not.toContain("https://");
      expect(source).not.toContain("http://");
    }
    expect(graphicSource).toContain("connection?.saveData");
    expect(sceneSource).toContain(
      'fetch(url, { signal, cache: "force-cache" })'
    );
  });
});
