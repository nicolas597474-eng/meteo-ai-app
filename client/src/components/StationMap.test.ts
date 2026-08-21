import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("carte des stations", () => {
  it("démarre en satellite et conserve la vue réelle uniquement sur le marqueur de référence", () => {
    const source = readFileSync(new URL("./StationMap.tsx", import.meta.url), "utf8");
    expect(source).toContain('mapTypeId="satellite"');
    expect(source).toContain("panorama.setPosition(position)");
    expect(source).toContain("marker.addListener(\"click\"");
    expect(source).not.toContain("Satellite · touchez un point pour la vue réelle");
    expect(source).not.toContain("Vue réelle ici");
    expect(source).toContain('fixed inset-0 z-[200] bg-[#070b13]');
    expect(source).toContain('h-72 rounded-xl border border-slate-800 sm:h-80');
    expect(source).toContain('mt-2 flex min-h-11 w-full items-center justify-center');
    expect(source).toContain("streetViewControl={false}");
    expect(source).toContain("rotateControl={false}");
    expect(source).toContain("mapTypeControl: isExpanded");
    expect(source).toContain("fullscreenControl: false");
    expect(source).toContain("zoomControl: false");
    expect(source).toContain("streetViewControl: isExpanded");
    expect(source).toContain("rotateControl: false");
    expect(source).toContain("Fermer la carte");
    expect(source).toContain("MapTypeControlStyle.HORIZONTAL_BAR");
    expect(source).toContain("setIsExpanded(true)");
    expect(source).toContain("background:#071018");
    expect(source).toContain("border:1px solid #38bdf8");
    expect(source).toContain("function stationFreshness");
    expect(source).toContain("Dernier relevé");
    expect(source).toContain("#34d399");
    expect(source).toContain("#fbbf24");
    expect(source).toContain("#fb7185");
    expect(source).toContain("function stationInfoHtml");
    expect(source).toContain("new google.maps.InfoWindow()");
    expect(source).toContain("Fiabilité mesurée");
  });
});
