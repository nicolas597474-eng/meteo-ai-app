import { describe, expect, it } from "vitest";
import { MAP_UNAVAILABLE_MESSAGE } from "./Map";

describe("repli de cartographie", () => {
  it("informe que la liste de stations reste disponible lorsque la carte échoue", () => {
    expect(MAP_UNAVAILABLE_MESSAGE).toContain("stations restent accessibles");
  });

  it("permet de contrôler Street View et de signaler le passage en plein écran", async () => {
    const source = await import("node:fs").then(({ readFileSync }) => readFileSync(new URL("./Map.tsx", import.meta.url), "utf8"));
    expect(source).toContain("streetViewControl?: boolean");
    expect(source).toContain("onFullscreenChange?:");
    expect(source).toContain('document.addEventListener("fullscreenchange", reportFullscreen)');
  });
});
