import { describe, expect, it } from "vitest";
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
});
