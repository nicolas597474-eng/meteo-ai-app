import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const loaderSource = readFileSync(
  new URL("./WeatherAILoader.tsx", import.meta.url),
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
    expect(loaderSource).toContain("Préparation de votre météo…");

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

  it("9. dessine le visuel de chargement en CSS, sans moteur 3D ni texture", () => {
    // Le visuel existe toujours et garde sa structure/aria
    expect(loaderSource).toContain("WeatherAILoaderGraphic");
    expect(loaderSource).toContain("weather-loader-globe__disc");
    expect(loaderSource).toContain("weather-loader-globe__orbit");
    expect(loaderSource).toContain('aria-hidden="true"');
    // Plus aucune dépendance 3D, ni image, ni SVG
    expect(loaderSource).not.toContain("EarthGlobe");
    expect(loaderSource).not.toContain("earthScene");
    expect(loaderSource).not.toContain('from "three"');
    expect(loaderSource).not.toContain("<img");
    expect(loaderSource).not.toContain("<svg");
    // Les fichiers du moteur 3D et les textures ont bien été retirés
    expect(existsSync(new URL("./EarthGlobe.tsx", import.meta.url))).toBe(false);
    expect(existsSync(new URL("./earthScene.ts", import.meta.url))).toBe(false);
    expect(
      existsSync(new URL("../../../public/textures/earth/earth_atmos_2048.jpg", import.meta.url))
    ).toBe(false);
  });

  it("10. garde l'isolation de rendu et supprime toute occurrence WebGL du projet", () => {
    expect(stylesSource).toContain("contain: layout style paint");
    expect(stylesSource).toContain(".weather-loader-globe__disc");
    // Aucune règle CSS ne référence une texture du globe
    expect(stylesSource).not.toContain("textures/earth");
  });

  it("11. n'anime qu'en CSS et n'ajoute aucun octet au chargement", () => {
    // Animations purement déclaratives, désactivées hors préférence de mouvement
    expect(stylesSource).toContain("@keyframes wai-orbit-tilt");
    expect(stylesSource).toContain("@keyframes wai-sun-pulse");
    expect(stylesSource).toContain(".weather-loader-globe__orbit { animation: wai-orbit-tilt");
    expect(stylesSource).toContain(".weather-ai-loader--reduced-motion * { animation: none !important; transition: none !important; }");
    expect(stylesSource).toContain("@media (prefers-reduced-motion: reduce)");
    // Aucune ressource externe ni image distante dans le loader
    expect(loaderSource).not.toContain("manus-storage");
    expect(loaderSource).not.toContain("http://");
    expect(loaderSource).not.toContain("https://");
  });
});
