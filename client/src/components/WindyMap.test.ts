import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./WindyMap.tsx", import.meta.url), "utf8");

describe("WindyMap", () => {
  it("garde la carte compacte scrollable tout en laissant la lecture horaire accessible", () => {
    expect(source).not.toContain("isCompactMapInteractive");
    expect(source).not.toContain("event.touches.length >= 2");
    expect(source).toContain("bottom: \"72px\"");
    expect(source).toContain("Carte fixe · lecture horaire accessible");
  });

  it("masque le tableau détaillé Windy tout en conservant la vue plein écran", () => {
    expect(source).toContain("windyUrlFullscreen");
    expect(source).toContain("barre temporelle native et son bouton lecture");
    expect(source).toContain("buildWindyUrlWithDetail(lat, lon, activeLayerInfo.windyParam, 8, false)");
    expect(source).toContain("windyUrlCompact");
    expect(source).toContain("buildWindyUrlWithDetail(lat, lon, activeLayerInfo.windyParam, 8, false)");
  });

  it("ancre le repère de localisation aux coordonnées Windy plutôt qu’au centre visuel", () => {
    expect(source).toContain('marker: "true"');
    expect(source).toContain("detailLat: lat.toFixed(4)");
    expect(source).toContain("detailLon: lon.toFixed(4)");
    expect(source).not.toContain("function LocationMarker()");
    expect(source).not.toContain("<LocationMarker />");
  });

  it("demande à Windy les vents et rafales en kilomètres par heure", () => {
    expect(source).toContain('metricWind: "km/h"');
  });

  it("rétablit les contrôles externes du plein écran", () => {
    expect(source).toContain('aria-label="Fermer la carte plein écran"');
    expect(source).toContain('aria-label="Type de fond de carte"');
    expect(source).toContain('aria-label="Centrer la carte sur le lieu actif"');
    expect(source).toContain('aria-label="Zoom manuel de la carte"');
    expect(source).toContain("fullscreenZoom");
  });

  it("masque uniquement la gouttière des contrôles natifs Windy sans supprimer la timeline", () => {
    expect(source).toContain("FULLSCREEN_NATIVE_CONTROL_GUTTER_PX = 72");
    expect(source).toContain("right: `-${FULLSCREEN_NATIVE_CONTROL_GUTTER_PX}px`");
    expect(source).toContain("width: `calc(100% + ${FULLSCREEN_NATIVE_CONTROL_GUTTER_PX}px)`");
    expect(source).toContain("barre temporelle native et son bouton lecture");
  });
});
