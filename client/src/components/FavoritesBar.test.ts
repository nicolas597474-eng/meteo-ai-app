import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./FavoritesBar.tsx", import.meta.url), "utf8");

describe("FavoritesBar", () => {
  it("affiche l’ajout de lieu en plein écran, défilable et accessible sur mobile", () => {
    expect(source).toContain('z-[100] flex min-h-[100dvh] items-stretch');
    expect(source).toContain('h-[100dvh] w-full min-h-0 flex-col');
    expect(source).toContain('min-h-0 flex-1 space-y-3 overflow-y-auto');
    expect(source).toContain('role="dialog" aria-modal="true"');
    expect(source).toContain('aria-label="Fermer l’ajout de lieu"');
  });
});
