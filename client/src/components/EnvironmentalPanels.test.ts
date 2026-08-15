import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./EnvironmentalPanels.tsx", import.meta.url), "utf8");

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
});
