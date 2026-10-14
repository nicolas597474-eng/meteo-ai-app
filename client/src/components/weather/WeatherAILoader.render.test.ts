import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.stubGlobal("React", React);
import { WeatherAILoader } from "./WeatherAILoader";

/** The initial render works without a browser, WebGL or the optional 3D chunk. */
describe("WeatherAILoader — rendu réel du visuel de chargement", () => {
  it("rend un poster local avant WebGL, sans moteur ou texture externe dans le HTML", () => {
    const html = renderToStaticMarkup(
      createElement(WeatherAILoader, {
        loading: true,
        message: "Chargement des prévisions",
      })
    );
    expect(html).toContain("earth-loader__poster");
    expect(html).toContain("earth-poster.webp");
    expect(html).toContain('data-render-mode="static"');
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Chargement des prévisions");
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("earth-day.webp");
    expect(html).not.toContain("earthLoaderScene");
    expect(html).not.toContain("manus-storage");
    // SVG namespaces are not runtime network resources.
    expect(html).not.toMatch(/(?:src|href)="https?:/);
  });

  it.each(["full", "light", "compact"] as const)(
    "préserve la variante %s et l'indicateur indéterminé",
    variant => {
      const html = renderToStaticMarkup(
        createElement(WeatherAILoader, { loading: true, variant })
      );
      expect(html).toContain(`data-variant="${variant}"`);
      expect(html).toContain("weather-ai-loader__progress");
      expect(html).not.toContain("aria-valuenow");
    }
  );

  it("réduit les mouvements sur tout le loader, pas seulement sur le globe", () => {
    const html = renderToStaticMarkup(
      createElement(WeatherAILoader, { loading: true, reducedMotion: true })
    );
    expect(html).toContain("weather-ai-loader--reduced-motion");
    expect(html).not.toContain("animate-pulse");
  });

  it("ne rend rien une fois le chargement terminé", () => {
    expect(
      renderToStaticMarkup(createElement(WeatherAILoader, { loading: false }))
    ).toBe("");
  });
});
