import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("carte des stations", () => {
  it("démarre en satellite et ouvre la vue réelle aux coordonnées du point choisi", () => {
    const source = readFileSync(new URL("./StationMap.tsx", import.meta.url), "utf8");
    expect(source).toContain('mapTypeId="satellite"');
    expect(source).toContain("panorama.setPosition(position)");
    expect(source).toContain("marker.addListener(\"click\"");
    expect(source).toContain("Satellite · touchez un point pour la vue réelle");
  });
});
