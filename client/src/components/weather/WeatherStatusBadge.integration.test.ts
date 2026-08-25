import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const readPage = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("harmonisation des badges météo", () => {
  it("réutilise la primitive sur les écrans de synthèse et de fiabilité", () => {
    expect(readPage("../../pages/Ranking.tsx")).toContain("Confiance locale");
    expect(readPage("../../pages/Ranking.tsx")).toContain("WeatherStatusBadge");
    expect(readPage("../../pages/Dashboard.tsx")).toContain("Confiance locale");
    expect(readPage("../../pages/ReliabilityLaboratory.tsx")).toContain("Fiabilité en bref");
    expect(readPage("../../pages/WeatherAILab.tsx")).toContain("Hors fusion");
  });
});
