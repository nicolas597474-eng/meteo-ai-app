import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("carte des stations", () => {
  it("démarre en satellite et ouvre la vue réelle aux coordonnées du point choisi", () => {
    const source = readFileSync(new URL("./StationMap.tsx", import.meta.url), "utf8");
    expect(source).toContain('mapTypeId="satellite"');
    expect(source).toContain("panorama.setPosition(position)");
    expect(source).toContain("marker.addListener(\"click\"");
    expect(source).toContain("Satellite · touchez un point pour la vue réelle");
    expect(source).toContain('className="space-y-2"');
    expect(source).not.toContain('absolute right-2 top-2 min-h-10');
    expect(source).toContain("streetViewControl={false}");
    expect(source).toContain("streetViewControl: isFullscreen");
    expect(source).toContain("function stationInfoHtml");
    expect(source).toContain("new google.maps.InfoWindow()");
    expect(source).toContain("Fiabilité mesurée");
  });
});
