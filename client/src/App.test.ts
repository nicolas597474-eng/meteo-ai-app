import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("navigation MeteoAI", () => {
  it("masque l’en-tête de marque sur mobile tout en conservant la barre de navigation basse", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(source).toContain('hidden border-b border-border bg-background/90 backdrop-blur-xl sm:block');
    expect(source).toContain("function BottomNav()");
    expect(source).toContain("sm:hidden fixed bottom-0");
  });
});
