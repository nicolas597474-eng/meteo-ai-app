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
    expect(source).toContain("Il reste hors de la température locale tant qu’un gain de fiabilité n’est pas mesuré.");
    expect(source).toContain("PopoverContent");
    expect(source).toContain("collisionPadding={12}");
    expect(source).toContain("À propos de ce statut");
    expect(source).toContain("PopoverClose");
    expect(source).toContain("Fermer l’aide");
  });

  it("distingue explicitement les références de modèles des stations locales", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain("Références de modèles — non stations");
    expect(source).toContain('label="Modèle" value="Non station"');
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

  it("retire le détail de calcul de la synthèse locale sans retirer les indicateurs", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("Détails de calcul de la synthèse");
    expect(source).not.toContain("GroundTruthDetailDialog");
    expect(source).not.toContain("Méthode de pondération");
    expect(source).toContain('label="Confiance synthèse locale"');
    expect(source).toContain('label="Dernière synthèse"');
  });

  it("donne accès à l’Historique complet depuis la page Stations", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain('import { Link } from "wouter"');
    expect(source).toContain("Historique des prévisions");
    expect(source).toContain('href="/history"');
    expect(source).toContain("graphiques complets, les observations archivées et les comparaisons par modèle");
    expect(source.indexOf("Historique des prévisions")).toBeLessThan(source.indexOf("<ForecastProvenanceBadge"));
    expect(source).toContain("border-emerald-400/60");
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

  it("présente la collecte planifiée dans une indication compacte et accessible", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain("Clock3");
    expect(source).toContain("Collecte automatique quotidienne à 05h00, heure de Paris");
    expect(source).toContain("Auto · 05h00 Paris");
    expect(source).toContain("rounded-full border border-slate-700/80");
  });

  it("retire les trois bilans techniques demandés après la carte des stations", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source.indexOf("Rayon de recherche")).toBeLessThan(source.indexOf("Carte des stations"));
    expect(source).toContain("Vue satellite");
    expect(source).not.toContain("Dernier bilan de collecte");
    expect(source).not.toContain("Disponibilité des stations");
    expect(source).not.toContain("Preuves physiques pour le scoring");
  });

  it("explique lorsque les modèles existent mais que les stations physiques sont insuffisantes", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain("Modèles disponibles, relevés physiques insuffisants");
    expect(source).toContain("{physicalStationExplanation}");
    expect(source).toContain("La source Netatmo a répondu, mais aucune station physique n’a été renvoyée");
    expect(source).toContain("station physique n’a été trouvée dans le rayon");
  });
});
