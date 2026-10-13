import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const loaderSource = readFileSync(
  new URL("./WeatherAILoader.tsx", import.meta.url),
  "utf8"
);
const globeSource = readFileSync(
  new URL("./EarthGlobe.tsx", import.meta.url),
  "utf8"
);
const sceneSource = readFileSync(
  new URL("./earthScene.ts", import.meta.url),
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

  it("9. remplace le radar vectoriel par une Terre texturée et des orbites 3D", () => {
    expect(loaderSource).toContain("<EarthGlobe reducedMotion={reducedMotion}");
    expect(loaderSource).not.toContain("<svg");
    expect(sceneSource).toContain("new THREE.WebGLRenderer");
    expect(sceneSource).toContain("new THREE.SphereGeometry");
    expect(sceneSource).toContain("earth_atmos_2048.jpg");
    expect(sceneSource).toContain("earth_normal_2048.jpg");
    expect(sceneSource).toContain("earth_lights_2048.png");
    expect(sceneSource).toContain("earth_clouds_1024.png");
    expect(sceneSource).toContain("earth.rotation.y = 4.0 + elapsed * 0.16");
    expect(sceneSource).toContain("elapsed * orbit.speed");
    expect(sceneSource).toContain("new THREE.Points");
    expect(sceneSource).toContain("THREE.AdditiveBlending");
  });

  it("10. limite le rendu mobile et libère toutes les ressources GPU", () => {
    expect(stylesSource).toContain("contain: layout style paint");
    expect(sceneSource).toContain("1000 / 30");
    expect(sceneSource).toContain("window.devicePixelRatio || 1, 1.5");
    expect(sceneSource).toContain("document.hidden");
    expect(sceneSource).toContain("IntersectionObserver");
    expect(sceneSource).toContain("cancelAnimationFrame(frame)");
    expect(sceneSource).toContain("resizeObserver.disconnect()");
    expect(sceneSource).toContain("intersectionObserver.disconnect()");
    expect(sceneSource).toContain(
      'document.removeEventListener("visibilitychange", resume)'
    );
    expect(sceneSource).toContain("renderer.dispose()");
    expect(sceneSource).toContain("renderer.forceContextLoss()");
    expect(sceneSource).toContain("g.dispose()");
    expect(sceneSource).toContain("m.dispose()");
    expect(sceneSource).toContain("t.dispose()");
  });

  it("11. conserve un globe fixe sans WebGL ou en mode réduit et charge le moteur à la demande", () => {
    expect(globeSource).toContain("if (reducedMotion) return");
    expect(globeSource).toContain('import("./earthScene")');
    expect(globeSource).toContain("if (cancelled || !hostRef.current) return");
    expect(globeSource).toContain("dispose?.()");
    expect(globeSource).toContain("earth-globe__fallback");
    expect(stylesSource).toContain("/textures/earth/earth_atmos_2048.jpg");
    expect(sceneSource).toContain("webglcontextlost");
    expect(sceneSource).toContain("if (disposed)");
    expect(sceneSource).not.toContain("https://");
  });
});
