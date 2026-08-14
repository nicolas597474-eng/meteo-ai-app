import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("navigation MeteoAI", () => {
  it("réserve la navigation basse aux sous-pages et laisse le Dashboard adopter le chrome de la maquette", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const dashboard = readFileSync(new URL("./pages/Dashboard.tsx", import.meta.url), "utf8");
    expect(app).toContain('weather-nav sticky top-0 z-50 hidden border-b backdrop-blur-xl sm:block');
    expect(app).toContain('if (location === "/") return null;');
    expect(app).toContain("weather-nav sm:hidden fixed bottom-0");
    expect(dashboard).toContain("reference-mobile-topbar");
    expect(dashboard).toContain("reference-trend-panel");
    expect(dashboard).toContain("reference-mode-switch");
  });
});
