import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const dashboardPageFiles = [
  "Dashboard.tsx",
];

const simplifiedPageFiles = [
  "WeatherDetails.tsx",
  "ReliabilityLaboratory.tsx",
  "Ranking.tsx",
  "WeatherAILab.tsx",
];

describe("provenance unifiée des pages météo", () => {
  it("conserve le contrat et les panneaux repliables sur le Dashboard", () => {
    for (const filename of dashboardPageFiles) {
      const source = readFileSync(new URL(`./${filename}`, import.meta.url), "utf8");
      expect(source).toContain("ForecastProvenanceBadge");
      expect(source).toContain("weather.getForecastProvenance.useQuery");
      expect(source).toContain("HourlyWeightingNotice");
    }
  });

  it("retire les deux panneaux des pages volontairement simplifiées", () => {
    for (const filename of simplifiedPageFiles) {
      const source = readFileSync(new URL(`./${filename}`, import.meta.url), "utf8");
      expect(source).not.toContain("<ForecastProvenanceBadge");
      expect(source).not.toContain("<ForecastMetricDefinitions");
    }
  });
});
