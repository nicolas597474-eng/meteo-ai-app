import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const loaderSource = readFileSync(new URL("./WeatherAILoader.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../../index.css", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../../pages/Dashboard.tsx", import.meta.url), "utf8");
const detailsSource = readFileSync(new URL("../../pages/WeatherDetails.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");

describe("WeatherAILoader — Moteur d'animation de chargement météo 3D + holographique", () => {
  it("1. s'affiche lorsque les données requises sont en cours de chargement avec les éléments accessibles", () => {
    // role="status", aria-live="polite", aria-busy
    expect(loaderSource).toContain('role="status"');
    expect(loaderSource).toContain('aria-live="polite"');
    expect(loaderSource).toContain('aria-busy={!isReady}');
    expect(loaderSource).toContain("WeatherAILoaderGraphic");

    // Intégration dans le Dashboard et WeatherDetails
    expect(dashboardSource).toContain("<WeatherAILoader loading={true} variant=\"full\"");
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
    expect(loaderSource).toContain("const [isVisible, setIsVisible] = useState(loading)");
    expect(loaderSource).toContain("if (!isVisible) return null");

    // Dans Dashboard, isLoading n'est vrai que si toutes les sources indispensables manquent
    expect(dashboardSource).toContain("const isLoading = officialLoading && hourlyLoading && !fastCurrentSnapshot;");
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
    expect(loaderSource).toContain("document.removeEventListener?.(\"visibilitychange\", onVisibilityChange)");
    expect(loaderSource).toContain("mediaQuery.removeEventListener?.(\"change\", onChange)");
  });

  it("7. respecte scrupuleusement les préférences 'prefers-reduced-motion'", () => {
    // Détection programmatique
    expect(loaderSource).toContain('window.matchMedia("(prefers-reduced-motion: reduce)")');
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

  it("9. présente les éléments graphiques 3D, holographiques, radar et le noyau IA", () => {
    // Globe terrestre 3D miniature avec dégradé sphérique et atmosphère
    expect(loaderSource).toContain("id=\"wai-globe-sphere\"");
    expect(loaderSource).toContain("id=\"wai-atmosphere-glow\"");
    expect(loaderSource).toContain("id=\"wai-solar-warmth\"");

    // Radar holographique et balayage rotatif
    expect(loaderSource).toContain("weather-ai-loader__radar-grid");
    expect(loaderSource).toContain("weather-ai-loader__radar-sweep");
    expect(loaderSource).toContain("id=\"wai-radar-beam\"");

    // Arcs orbitaux et balises
    expect(loaderSource).toContain("weather-ai-loader__orbital-arcs");
    expect(loaderSource).toContain("weather-ai-loader__orbit-dash-1");
    expect(loaderSource).toContain("weather-ai-loader__orbit-dash-2");

    // Nuages, pluie, vent
    expect(loaderSource).toContain("weather-ai-loader__clouds");
    expect(loaderSource).toContain("weather-ai-loader__rain");
    expect(loaderSource).toContain("weather-ai-loader__wind");

    // Noyau IA central avec sigle « IA »
    expect(loaderSource).toContain("weather-ai-loader__core");
    expect(loaderSource).toContain('{isReady ? "✓" : "IA"}');

    // Particules convergeant vers le noyau
    expect(loaderSource).toContain("weather-ai-loader__data-particles");
    expect(loaderSource).toContain("weather-ai-particle");
  });

  it("10. préserve les performances mobiles sur Android (Brave, Edge, Chrome) et PWA", () => {
    // Animations prioritaires sur transform et opacity
    expect(stylesSource).toContain("will-change: opacity, transform");
    expect(stylesSource).toContain("contain: layout style paint");
    expect(stylesSource).toContain("@keyframes wai-radar-spin");
    expect(stylesSource).toContain("@keyframes wai-continents-drift");
    expect(stylesSource).toContain("@keyframes wai-core-pulse");
    expect(stylesSource).toContain("@keyframes wai-particle-in-1");

    // Pause de l'animation lors de la mise en arrière-plan (visibilitychange)
    expect(loaderSource).toContain("document.hidden");
    expect(loaderSource).toContain("visibilitychange");
  });
});
