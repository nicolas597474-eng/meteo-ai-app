import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MeteoIcon.tsx", import.meta.url), "utf8");

describe("MeteoIcon", () => {
  it("remplace le rendu par des glyphes météo en verre dépoli partagés", () => {
    expect(source).toContain("FuturisticGlyph");
    expect(source).toContain("FuturisticCloud");
    expect(source).toContain("FuturisticSun");
    expect(source).toContain("FuturisticRain");
    expect(source).toContain('key === "location"');
    expect(source).toContain('key === "stations"');
    expect(source).toContain("showGlass");
    expect(source).toContain("glassGradientId");
  });

  it("conserve une description accessible à chaque icône météo", () => {
    expect(source).toContain("role=\"img\"");
    expect(source).toContain("Icône météo");
  });
});
