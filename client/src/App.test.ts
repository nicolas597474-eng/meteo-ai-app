import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("navigation MeteoAI", () => {
  it("masque l’en-tête de marque sur mobile tout en conservant la barre de navigation basse", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain('weather-nav sticky top-0 z-50 hidden border-b backdrop-blur-xl sm:block');
    expect(source).toContain("function BottomNav()");
    expect(source).toContain("weather-nav sm:hidden fixed bottom-0");
    expect(source).toContain("weather-nav-active");
  });
});
