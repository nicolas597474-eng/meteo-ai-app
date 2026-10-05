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
    expect(source).toContain("Performance météo individuelle non mesurée sans comparaisons physiques suffisantes entre réseaux distincts et prior empirique");
    expect(source).not.toContain("références physiques indépendantes suffisantes");
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
    expect(source).toContain('label="Stations utilisées"');
    expect(source).toContain('label="Dernier relevé"');
  });

  it("retire l’accès à l’Historique de la page Stations", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).not.toContain('import { Link } from "wouter"');
    expect(source).not.toContain("Historique des prévisions");
    expect(source).not.toContain('href="/history"');
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
    expect(source.indexOf("Carte des stations")).toBeLessThan(source.indexOf("Rayon de recherche"));
    expect(source).toContain("Vert : utilisée");
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

  it("affiche le relevé direct réel lorsqu’il n’est pas encore archivé", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain("liveStationsById");
    expect(source).toContain("const displayedLatest = station.latest ??");
    expect(source).toContain("Relevé actuel direct : pas encore archivé sur 24 h.");
    expect(source).toContain("Aucun relevé archivé ou direct disponible.");
  });

  it("garde les hooks de stations avant le retour de chargement", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source.indexOf("const liveStationsById = useMemo")).toBeLessThan(source.indexOf("if (isLoading)"));
  });

  it("affiche les détails de la synthèse locale sans panneau déroulant", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain('aria-label="Détails de la synthèse locale"');
    expect(source).toContain('<h3 className="px-1 text-xs font-semibold text-sky-100">Détails de la synthèse locale</h3>');
    expect(source).not.toContain('cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-sky-100');
  });

  it("place la carte des stations directement après la situation locale", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source.indexOf("Carte des stations")).toBeGreaterThan(source.indexOf("Votre situation locale"));
    expect(source.indexOf("Carte des stations")).toBeLessThan(source.indexOf("Relevés des stations"));
  });

  it("propose une relance physique explicite sans présenter la collecte comme une prévision", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain("refreshPhysicalStationSnapshots.useMutation");
    expect(source).toContain("Relancer les relevés");
    expect(source).toContain("Les nouveaux relevés directs sont ajoutés, sans remplacer le snapshot déjà archivé.");
    expect(source).toContain("location.snapshotPreserved");
    expect(source).toContain("nouveau${count > 1 ? \"x\" : \"\"} relevé");
    expect(source).toContain("Aucun relevé physique qualifié n’a été retourné par les stations.");
  });

  it("distingue la priorité technique source d’une performance météo individuelle", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain("priorité technique réseau {Math.round(station.reliabilityScore)}/100");
    expect(source).toContain("Priorités techniques fixes par réseau/source — pas des scores météo");
    expect(source).toContain("elles ne mesurent ni la précision météorologique ni la performance de cette station");
    expect(source).toContain("Performance individuelle non mesurée");
    expect(source).not.toContain("fiabilité {Math.round(station.reliabilityScore)}%");
  });

  it("sépare complétude, continuité et stabilité opérationnelles des mesures d’accord météo", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain("Profil opérationnel des relevés");
    expect(source).toContain("Complétude");
    expect(source).toContain("continuité");
    expect(source).toContain("stabilité");
    expect(source).toContain("pas la précision météorologique");
    expect(source).toContain("pas une vérité météorologique absolue");
    expect(source).toContain("MAE brute");
    expect(source).toContain("MAE shrinkée");
    expect(source).toContain("prior empirique");
    expect(source).toContain("poids de la mesure station");
    expect(source).toContain("intervalle nominal approximatif à 95 %");
    expect(source).toContain("désaccord moyen des références");
    expect(source).toContain("un site aux mêmes coordonnées n’est pas compté deux fois");
    expect(source).toContain("l’indépendance amont des fournisseurs n’est pas vérifiée");
    expect(source).not.toContain("PROFIL FIABLE");
  });

  it("ne publie pas d’estimation pluie ni de score ou probabilité calibrée", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).toContain("Les précipitations restent non mesurées jusqu’à une règle d’échantillon défendable");
    expect(source).toContain("aucun score composite ou probabilité n’est publié");
    expect(source).toContain("n’est pas calibré");
    expect(source).not.toContain("minimumPrecipitationEventDays");
  });

  it("signale les limites de la comparaison sur les deux plages sans modifier les séries tracées", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    const panelStart = source.indexOf("Stations vs prévision officielle");
    const panelEnd = source.indexOf("</section>", panelStart);
    const comparisonPanel = source.slice(panelStart, panelEnd);
    const chartStart = source.indexOf("function TemperatureComparison");
    const rankingPageStart = source.indexOf("export default function Ranking()", chartStart);
    const chart = source.slice(chartStart, rankingPageStart);

    expect(comparisonPanel).toContain("Comparaison descriptive ; l’heure de disponibilité des prévisions n’est pas vérifiée ici. Ce graphique ne constitue ni une MAE ni un score de fiabilité.");
    expect(comparisonPanel).toContain('onClick={() => setPeriodDays(1)}');
    expect(comparisonPanel).toContain('onClick={() => setPeriodDays(7)}');
    expect(source).toContain("const comparison = periodDays === 1 ? (data?.comparison24h ?? []) : (data?.comparison7d ?? []);");
    expect(comparisonPanel).toContain("<TemperatureComparison points={comparison} periodDays={periodDays} />");
    expect(chart).toContain('toPoint("officialTemperature")');
    expect(chart).toContain('toPoint("stationTemperature")');
  });
});
