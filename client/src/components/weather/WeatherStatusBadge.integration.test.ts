import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const readPage = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("harmonisation des badges météo", () => {
  it("réutilise les statuts visuels sans note globale de prévision", () => {
    const ranking = readPage("../../pages/Ranking.tsx");
    const dashboard = readPage("../../pages/Dashboard.tsx");
    const reliability = readPage("../../pages/ReliabilityLaboratory.tsx");
    const aiLab = readPage("../../pages/WeatherAILab.tsx");

    expect(ranking).toContain("WeatherStatusBadge");
    expect(ranking).toContain("sans note 0–100");
    expect(dashboard).toContain("WeatherStatusBadge");
    expect(dashboard).toContain("Accord inter-modèles");
    expect(reliability).toContain("Fiabilité historique, sans note globale");
    expect(aiLab).toContain("Hors fusion");
  });
});
