import { describe, expect, it } from "vitest";
import { MAP_UNAVAILABLE_MESSAGE } from "./Map";

describe("repli de cartographie", () => {
  it("informe que la liste de stations reste disponible lorsque la carte échoue", () => {
    expect(MAP_UNAVAILABLE_MESSAGE).toContain("stations restent accessibles");
  });

  it("permet de contrôler Street View et de signaler le passage en plein écran", async () => {
    const source = await import("node:fs").then(({ readFileSync }) => readFileSync(new URL("./Map.tsx", import.meta.url), "utf8"));
    expect(source).toContain("streetViewControl?: boolean");
    expect(source).toContain("rotateControl?: boolean");
    expect(source).toContain("mapTypeControl?: boolean");
    expect(source).toContain("fullscreenControl?: boolean");
    expect(source).toContain("zoomControl?: boolean");
    expect(source).toContain("cameraControl?: boolean");
    expect(source).toContain("cameraControl = false");
    expect(source).toContain("isFractionalZoomEnabled?: boolean");
    expect(source).toContain("isFractionalZoomEnabled = true");
    expect(source).toContain("allowPageScroll?: boolean");
    expect(source).toContain("allowPageScroll = false");
    expect(source).toContain('allowPageScroll ? "touch-pan-y" : "touch-none"');
    expect(source).toContain("isFractionalZoomEnabled: isFractionalZoomEnabled && !prefersReducedMotion");
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain("touchGestureActive");
    expect(source).toContain("touch-none");
    expect(source).toContain("touchGestureActive.current");
    expect(source).toContain("data-swipe-exclude");
    expect(source).toContain("resizeFrame");
    expect(source).toContain("window.requestAnimationFrame");
    expect(source).toContain("window.cancelAnimationFrame");
    expect(source).toContain("onFullscreenChange?:");
    expect(source).toContain('document.addEventListener("fullscreenchange", reportFullscreen)');
	    expect(source).toContain("ResizeObserver");
	    expect(source).toContain('window.google.maps.event.trigger(mapInstance, "resize")');
	    expect(source).toContain('loading: "async"');
	    expect(source).toContain("document.getElementById(GOOGLE_MAPS_SCRIPT_ID)");
    expect(source).toContain("isMapsReady");
    expect(source).toContain('window.google.maps.importLibrary("maps")');
    expect(source).toContain("const MapConstructor");
    expect(source).toContain("script.defer = true");
	    expect(source).toContain("document.getElementById(GOOGLE_MAPS_SCRIPT_ID)");
	  });
});
