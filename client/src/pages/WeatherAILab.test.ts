import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Weather AI Lab — transparence de fusion", () => {
  it("centralise la méthode et les sources de fusion hors du Dashboard", () => {
    const source = readFileSync(new URL("./WeatherAILab.tsx", import.meta.url), "utf8");
    expect(source).toContain("Fusion officielle actuelle");
    expect(source).toContain("Méthode de fusion");
    expect(source).toContain("Sources appliquées par paramètre");
    expect(source).toContain("Modèle principal");
  });

  it("présente explicitement la dernière fusion archivée sans la confondre avec la prévision actuelle", () => {
    const source = readFileSync(new URL("./WeatherAILab.tsx", import.meta.url), "utf8");
    expect(source).toContain("snapshotStatus");
    expect(source).toContain("Dernière fusion archivée");
    expect(source).toContain("Elle ne pilote pas la prévision actuelle");
  });
});
