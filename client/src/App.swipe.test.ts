import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MAIN_PAGE_PATHS, getSwipeNavigationTarget, isQualifiedPageSwipe, PAGE_SWIPE_IGNORE_SELECTOR } from "./lib/pageNavigation";

describe("navigation entre pages par glissement", () => {
  it("ordonne les cinq pages principales", () => {
    expect(MAIN_PAGE_PATHS).toEqual(["/", "/laboratoire", "/ranking", "/history", "/ai-lab"]);
  });

  it("navigue dans les deux sens sans dépasser les extrémités", () => {
    expect(getSwipeNavigationTarget("/", -120)).toBe("/laboratoire");
    expect(getSwipeNavigationTarget("/laboratoire", 120)).toBe("/");
    expect(getSwipeNavigationTarget("/ai-lab", -120)).toBeNull();
    expect(getSwipeNavigationTarget("/", 120)).toBeNull();
  });

  it("ignore les routes secondaires", () => {
    expect(getSwipeNavigationTarget("/details", -120)).toBeNull();
  });

  it("ne qualifie que les gestes rapides, horizontaux et suffisamment amples", () => {
    expect(isQualifiedPageSwipe(-90, 12, 220)).toBe(true);
    expect(isQualifiedPageSwipe(-50, 4, 220)).toBe(false);
    expect(isQualifiedPageSwipe(-100, 90, 220)).toBe(false);
    expect(isQualifiedPageSwipe(-100, 8, 1_100)).toBe(false);
  });

  it("protège les contrôles et contenus susceptibles de défiler horizontalement", () => {
    expect(PAGE_SWIPE_IGNORE_SELECTOR).toContain("button");
    expect(PAGE_SWIPE_IGNORE_SELECTOR).toContain(".overflow-x-auto");
    expect(PAGE_SWIPE_IGNORE_SELECTOR).toContain("canvas");
  });

  it("anime la page cible selon le sens du geste sans animer les préférences de mouvement réduit", () => {
    const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("./index.css", import.meta.url), "utf8");
    expect(appSource).toContain("page-swipe-transition--${transition.direction}");
    expect(appSource).toContain('deltaX < 0 ? "forward" : "backward"');
    expect(styles).toContain("page-swipe-enter-from-right");
    expect(styles).toContain("page-swipe-enter-from-left");
    expect(styles).toContain("prefers-reduced-motion: no-preference");
  });

  it("précharge les pages principales après l’affichage initial et allège la durée de transition", () => {
    const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("./index.css", import.meta.url), "utf8");
    expect(appSource).toContain("function useMainPagePreload");
    expect(appSource).toContain("window.setTimeout(preload, 250)");
    expect(appSource).toContain("loadWeatherAILab()");
    expect(appSource).toContain("setTransition(null), 170");
    expect(styles).toContain("150ms cubic-bezier(0.23, 1, 0.32, 1)");
  });
});
