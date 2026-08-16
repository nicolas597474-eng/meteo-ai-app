import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./EnvironmentalPanels.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../index.css", import.meta.url), "utf8");

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
    expect(source).toContain("Éphémérides locales et état actuel du cycle jour-nuit");
  });

  it("préserve l’arche complète du cycle solaire sur mobile", () => {
    expect(source).toContain("rounded-t-full");
    expect(styles).toContain("Qualité de l’air, soleil et lune");
    expect(styles).toContain("height: 10rem !important");
    expect(styles).toContain("height: 8.75rem !important");
  });

  it("remplace explicitement le premier croissant par une lune 3D réaliste", () => {
    expect(source).toContain("meteoai-first-quarter-moon-3d-realistic_64387ecc.png");
    expect(source).toContain("Lune 3D représentant le premier croissant");
    expect(source).toContain('astronomy.moon.label === "Premier croissant"');
  });
});
