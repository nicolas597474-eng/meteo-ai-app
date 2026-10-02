import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./History.tsx", import.meta.url), "utf8");

describe("History", () => {
  it("isole la comparaison sur un modèle sélectionné afin d’éviter les graphiques surchargés", () => {
    expect(source).toContain("Modèle comparé");
    expect(source).toContain("comparisonModel");
    expect(source).toContain("CompactTemperatureHistogram");
    expect(source).toContain("Histogramme comparatif : observation, MeteoAI");
  });

  it("propose une lecture jour par jour sans dépendre du survol du graphique", () => {
    expect(source).toContain("Lecture jour par jour");
    expect(source).toContain("DailyComparison");
    expect(source).toContain("Écart");
    expect(source).toContain("showAllDays");
    expect(source).toContain("Afficher les");
    expect(source).toContain("Référence réelle");
    expect(source).toContain("Observation indisponible");
    expect(source).toContain("Comparaison en attente");
  });

  it("conserve l’état d’historique en constitution sans réintroduire des scores par échéance", () => {
    expect(source).toContain("Historique en cours de constitution");
    expect(source).not.toContain("Scores encore insuffisants");
    expect(source).not.toContain("Données par échéance insuffisantes");
    expect(source).not.toContain("normalizedScore");
  });

  it("affiche les preuves réellement collectées chaque soir sans inventer de couverture", () => {
    expect(source).toContain("EveningEvidence");
    expect(source).toContain("Preuves collectées chaque soir");
    expect(source).toContain("Couverture réelle");
    expect(source).toContain("Stations contributrices");
    expect(source).toContain("Motif d’exclusion");
    expect(source).toContain("Score non mis à jour");
    expect(source).toContain("data?.eveningEvidence ?? []");
    expect(source).toContain("isEveningEvidenceOpen");
    expect(source).toContain('aria-controls="evening-evidence-content"');
    expect(source).toContain('id="evening-evidence-content"');
    expect(source).toContain("ChevronDown");
    expect(source).toContain("ChevronUp");
  });

  it("explique les collectes horaires physiques futures avec statuts, tentatives et motifs", () => {
    expect(source).toContain("Statut de collecte horaire");
    expect(source).toContain("collectionTraces");
    expect(source).toContain("tentative");
    expect(source).toContain("Le détail par lieu, heure, tentative et motif sera disponible pour les collectes futures");
    expect(source).toContain("Aucune station qualifiée");
    expect(source).toContain("Échec après relance");
  });

  it("fournit des infobulles interactives contextualisées pour chaque graphique", () => {
    expect(source).toContain("HistoryChartTooltip");
    expect(source).toContain('role="tooltip"');
    expect(source).toContain("Écart MeteoAI / observation");
    expect(source).toContain("Fermer le détail d’observation");
    expect(source).toContain("dismissedLabel");
    expect(source).toContain('style={{ pointerEvents: "auto" }}');
    expect(source).toContain("onPointerDown={dismissTooltip}");
    expect(source).toContain('touchAction: "manipulation"');
    expect(source).toContain("activeDot");
    expect(source).toContain("cursor={{ stroke");
  });

  it("rend les températures maximales et minimales sous forme d’histogrammes groupés", () => {
    expect(source).toContain("Histogramme comparatif");
    expect(source).toContain("barCategoryGap");
    expect(source).toContain("maxBarSize={20}");
    expect(source).toContain('domain={["dataMin - 2", "dataMax + 2"]}');
  });

  it("donne une clé de lecture explicite et des couleurs distinctes aux histogrammes", () => {
    expect(source).toContain("HistogramLegend");
    expect(source).toContain("Clé de lecture des barres");
    expect(source).toContain("mesure réelle");
    expect(source).toContain("modèle comparé");
    expect(source).toContain("history-observation-bar");
    expect(source).toContain("history-meteoai-bar");
  });
});
