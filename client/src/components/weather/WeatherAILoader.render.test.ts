import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.stubGlobal("React", React);
import { WeatherAILoader } from "./WeatherAILoader";

/**
 * Vérifie le rendu réel du visuel de chargement, et pas seulement son code
 * source : c'est ce rendu qui garantit qu'aucune image ni ressource externe
 * n'est demandée pendant l'attente des données météo.
 */
describe("WeatherAILoader — rendu réel du visuel de chargement", () => {
  it("dessine la planète en CSS, sans image, sans canvas et sans ressource distante", () => {
    const html = renderToStaticMarkup(
      createElement(WeatherAILoader, { loading: true, message: "Chargement des prévisions" })
    );

    // Le visuel est bien rendu
    expect(html).toContain("weather-loader-globe__disc");
    expect(html).toContain("weather-loader-globe__orbit");
    expect(html).toContain("weather-loader-globe__sun");

    // Les informations accessibles restent présentes
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Chargement des prévisions");

    // Aucune ressource à télécharger : ni image, ni canvas, ni proxy de stockage
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("/textures/");
    expect(html).not.toContain("manus-storage");
    expect(html).not.toContain("earth-globe");
  });

  it("ne rend rien une fois le chargement terminé", () => {
    expect(
      renderToStaticMarkup(createElement(WeatherAILoader, { loading: false }))
    ).toBe("");
  });
});
