import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("page Fiabilité", () => {
  it("n’affiche plus de parcours de connexion Netatmo", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("startAuthorization");
    expect(source).not.toContain("Connectez votre compte");
    expect(source).not.toContain(">Connecter<");
  });

  it("explique le statut des capteurs citoyens en validation", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain("Comprendre le statut capteur en validation");
    expect(source).toContain("il n’influence pas la température locale tant qu’un gain de précision n’est pas démontré");
  });

  it("distingue explicitement les références de modèles des stations locales", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain("Références de modèles — non stations");
    expect(source).toContain("MODÈLE · NON STATION");
    expect(source).toContain("il ne modifie pas la température locale avant une validation historique mesurée");
  });

  it("distingue une station Netatmo authentifiée d’une référence ou d’un capteur citoyen", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain("STATION NETATMO");
    expect(source).toContain("NIVEAU 1 · AUTHENTIFIÉE");
    expect(source).toContain("identifiant de station vérifiable et provenance physique");
  });

  it("ouvre une modale de transparence depuis chaque source", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    const dialog = readFileSync(new URL("./SourceDetailsDialog.tsx", import.meta.url), "utf8");
    expect(source).toContain("Ouvrir les données brutes et la contribution de");
    expect(source).toContain("SourceDetailsDialog");
    expect(dialog).toContain("Données brutes du dernier relevé");
    expect(dialog).toContain("poids de fusion locale 0 %");
    expect(dialog).toContain("Décomposition du poids appliqué");
  });

  it("affiche une seule station locale puis propose de développer les autres", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain("showAdditionalLocalStations");
    expect(source).toContain("station={realLocalStations[0]}");
    expect(source).toContain("Afficher les ${realLocalStations.length - 1} autres stations");
    expect(source).toContain("realLocalStations.slice(1).map");
    expect(source).toContain("aria-expanded={showAdditionalLocalStations}");
  });

  it("affiche une seule référence de modèle puis propose de développer les autres", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain("showAdditionalModelReferences");
    expect(source).toContain("reference={modelReferences[0]}");
    expect(source).toContain("Afficher les ${modelReferences.length - 1} autres références");
    expect(source).toContain("modelReferences.slice(1).map");
    expect(source).toContain("aria-expanded={showAdditionalModelReferences}");
  });
});
