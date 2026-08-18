import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Weather AI Lab — transparence de fusion", () => {
  it("centralise la méthode et les sources de fusion hors du Dashboard", () => {
    const source = readFileSync(new URL("./WeatherAILab.tsx", import.meta.url), "utf8");
    expect(source).toContain("Fusion officielle actuelle");
    expect(source).toContain("Méthode de fusion");
    expect(source).toContain("Sources appliquées par paramètre");
    expect(source).toContain("Modèle principal");
    expect(source).toContain("Régime de prévision dominant");
    expect(source).toContain("Le Dashboard indique séparément le phénomène immédiat");
    expect(source).toContain("Lexique, méthode et sources");
    expect(source).toContain("AI_LAB_GLOSSARY");
    expect(source).toContain("Confiance");
    expect(source).toContain("Stabilité des modèles");
    expect(source).toContain("Données insuffisantes / —");
    expect(source).toContain("group-open:rotate-180");
    expect(source).toContain("Horizon de prévision");
    expect(source).toContain("MAE");
    expect(source).toContain("RMSE");
    expect(source).toContain("Seuils de décision");
    expect(source).toContain("Correction de biais");
    expect(source).toContain("Maille et microclimat");
    expect(source).toContain("Sources, provenance et cartes");
    expect(source).toContain("Netatmo Weather API");
    expect(source).toContain("Google Maps JavaScript API");
    expect(source).toContain("Astronomy Engine");
    expect(source).toContain("Visibilité d’éclipse");
  });

  it("présente explicitement la dernière fusion archivée sans la confondre avec la prévision actuelle", () => {
    const source = readFileSync(new URL("./WeatherAILab.tsx", import.meta.url), "utf8");
    expect(source).toContain("snapshotStatus");
    expect(source).toContain("Dernière fusion archivée");
    expect(source).toContain("Elle ne pilote pas la prévision actuelle");
  });

  it("propose une relance manuelle pour le lieu favori avec ses états explicites", () => {
    const source = readFileSync(new URL("./WeatherAILab.tsx", import.meta.url), "utf8");
    expect(source).toContain("refreshManualFusion");
    expect(source).toContain("Relancer");
    expect(source).toContain("Fusion relancée avec");
    expect(source).toContain("Une fusion vient déjà d’être calculée");
  });
});
