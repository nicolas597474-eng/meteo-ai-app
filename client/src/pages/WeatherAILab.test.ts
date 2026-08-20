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
    expect(source).toContain("Ces modèles sont archivés pour une validation historique");
    expect(source).toContain("gain de fiabilité n’est pas mesuré");
    expect(source).toContain("Calcul de l’indicateur");
    expect(source).toContain("40 % accord des modèles");
    expect(source).toContain("60 % de stabilité des températures maximales");
    expect(source).toContain("poids final strictement positif");
    expect(source).toContain("PopoverClose");
    expect(source).toContain("h-6 w-6");
    expect(source).toContain("Simulation de la fusion");
    expect(source).toContain("Snapshot retenu");
    expect(source).toContain("Collecte des modèles");
    expect(source).toContain("Pondération finale");
    expect(source).toContain("Résultat officiel");
    expect(source).toContain("Résultat final · contexte des stations locales");
    expect(source).toContain("Aucune station physique locale active");
  });

  it("présente explicitement la dernière fusion archivée sans la confondre avec la prévision actuelle", () => {
    const source = readFileSync(new URL("./WeatherAILab.tsx", import.meta.url), "utf8");
    expect(source).toContain("snapshotStatus");
    expect(source).toContain("Dernière fusion archivée");
    expect(source).toContain("Elle ne pilote pas la prévision actuelle");
    expect(source).toContain("La simulation lit une fusion conservée pour transparence");
  });

  it("propose une relance manuelle pour le lieu favori avec ses états explicites", () => {
    const source = readFileSync(new URL("./WeatherAILab.tsx", import.meta.url), "utf8");
    expect(source).toContain("refreshManualFusion");
    expect(source).toContain("Relancer");
    expect(source).toContain("Fusion relancée avec");
    expect(source).toContain("Une fusion vient déjà d’être calculée");
  });
});
