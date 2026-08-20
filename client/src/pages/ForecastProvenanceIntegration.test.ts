import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const pageFiles = [
  "Dashboard.tsx",
  "WeatherDetails.tsx",
  "ReliabilityLaboratory.tsx",
  "Ranking.tsx",
  "WeatherAILab.tsx",
];

describe("provenance unifiée des pages météo", () => {
  it("raccorde chaque page principale au contrat et au badge communs", () => {
    for (const filename of pageFiles) {
      const source = readFileSync(new URL(`./${filename}`, import.meta.url), "utf8");
      expect(source).toContain("ForecastProvenanceBadge");
      expect(source).toContain("weather.getForecastProvenance.useQuery");
    }
  });
});
