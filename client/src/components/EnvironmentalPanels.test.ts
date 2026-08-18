import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./EnvironmentalPanels.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const modernSunMoonSource = source.slice(source.indexOf("function SunMoonPanelAlwaysVisible"));

describe("EnvironmentalPanels", () => {
  it("présente la qualité de l’air avec ses mesures réelles et son attribution", () => {
    expect(source).toContain("Qualité de l’air");
    expect(source).toContain("PM2.5");
    expect(source).toContain("Prévision de qualité de l’air");
    expect(source).toContain("Prochaines 24 h");
  });

  it("présente les éphémérides Soleil et Lune sans substituer de données", () => {
    expect(source).toContain("Soleil & Lune");
    expect(source).toContain("Éphémérides locales du jour");
    expect(source).toContain("Éclairage");
    expect(source).toContain("Éphémérides réelles temporairement indisponibles");
  });

  it("ouvre des modales de détail accessibles depuis les deux panneaux", () => {
    expect(source).toContain("DialogTrigger");
    expect(source).toContain("Voir les détails");
    expect(source).toContain("Détails de l’indice et des polluants");
    expect(modernSunMoonSource).toContain("Les deux astres restent visibles et distincts sur l’arche des éphémérides.");
  });

  it("préserve l’arche complète du cycle solaire sur mobile", () => {
    expect(source).toContain("rounded-t-full");
    expect(styles).toContain("Qualité de l’air, soleil et lune");
    expect(styles).toContain("height: 12rem !important");
    expect(styles).toContain("aspect-ratio: 2 / 1");
    expect(styles).toContain("ratio 2:1 évite le sommet aplati");
    expect(styles).toContain("bottom: 1.15rem !important");
    expect(styles).toContain("top: calc(100% + 0.2rem)");
    expect(styles).toContain("text-amber-100");
    expect(styles).toContain("text-indigo-100");
    expect(styles).toContain("celestial-solar-disc-breathe");
    expect(styles).toContain("prefers-reduced-motion: no-preference");
  });

  it("distingue les positions du Soleil et de la Lune à partir des heures réelles", () => {
    expect(modernSunMoonSource).toContain("celestialArcPosition");
    expect(modernSunMoonSource).toContain("moonPosition");
    expect(modernSunMoonSource).toContain("meteoai-solar-disc-textured_d3eb7ecc.png");
    expect(modernSunMoonSource).toContain("celestial-realistic-sun");
    expect(modernSunMoonSource).not.toContain("formatAltitude(astronomy.sunAltitudeDeg)");
    expect(modernSunMoonSource).not.toContain("formatAltitude(astronomy.moonAltitudeDeg)");
    expect(modernSunMoonSource).toContain('MeteoIcon name="clear_night" size={40}');
    expect(modernSunMoonSource).toContain("isNightAtLocalMinutes");
    expect(modernSunMoonSource).toContain("celestial-night-marker");
    expect(modernSunMoonSource).toContain("markersAreClose");
    expect(modernSunMoonSource).toContain("sunDisplayPosition");
    expect(modernSunMoonSource).toContain("moonDisplayPosition");
    expect(source).toContain("Math.sin((position / 100) * Math.PI) * 140");
    expect(modernSunMoonSource).toContain("Position du Soleil sur l’arche");
    expect(modernSunMoonSource).toContain("Position de la Lune sur l’arche");
    expect(modernSunMoonSource).toContain("h-12 w-12");
    expect(styles).not.toContain('content: "Nuit locale"');
  });

  it("remplace explicitement le premier croissant par une lune 3D réaliste", () => {
    expect(source).toContain("meteoai-first-quarter-moon-3d-realistic_64387ecc.png");
    expect(source).toContain("Lune 3D représentant le premier croissant");
    expect(source).toContain('astronomy.moon.label === "Premier croissant"');
    expect(source).toContain("moon-3d-first-crescent");
    expect(styles).toContain("Premier croissant : seul l’astre est visible");
    expect(styles).toContain("background: transparent !important");
  });
});
