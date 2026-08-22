import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./WindyMap.tsx", import.meta.url), "utf8");

describe("WindyMap", () => {
  it("garde la carte compacte fixe au toucher simple et active l'interaction carte avec deux doigts", () => {
    expect(source).toContain("isCompactMapInteractive");
    expect(source).toContain("handleCompactTouchStart");
    expect(source).toContain("event.touches.length >= 2");
    expect(source).toContain("pointer-events-none");
    expect(source).toContain("pointer-events-auto");
    expect(source).toContain("Carte fixe · 2 doigts pour déplacer");
    expect(source).toContain("Interaction carte active");
  });

  it("masque le tableau détaillé Windy tout en conservant la vue plein écran", () => {
    expect(source).toContain("windyUrlFullscreen");
    expect(source).toContain("barre temporelle native et son bouton lecture");
    expect(source).toContain("buildWindyUrlWithDetail(lat, lon, activeLayerInfo.windyParam, 8, false)");
    expect(source).toContain("windyUrlCompact");
    expect(source).toContain("buildWindyUrlWithDetail(lat, lon, activeLayerInfo.windyParam, 8, false)");
  });
});
