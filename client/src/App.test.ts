import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("navigation MeteoAI", () => {
  it("masque l’en-tête de marque sur mobile sans que la barre basse masque le contenu", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain('hidden border-b border-border bg-background sm:block');
    expect(source).toContain("function BottomNav()");
    expect(source).toContain('aria-label="Navigation principale"');
    expect(source).toContain('bg-[#0d1117]');
    expect(source).toContain("pb-[calc(4rem+env(safe-area-inset-bottom))]");
    expect(source).not.toContain("backdrop-blur-xl");
  });

  it("réinitialise la position et affiche un vrai squelette pendant le chargement d’une page", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain("ScrollToTopOnRouteChange");
    expect(source).toContain("window.scrollTo(0, 0)");
    expect(source).toContain("RouteLoadingFallback");
    expect(source).toContain('aria-label="Chargement de la page"');
    expect(source).toContain("min-h-[60vh]");
  });
});
