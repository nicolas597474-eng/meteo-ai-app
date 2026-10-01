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

  it("alimente Dashboard et détails avec le même snapshot et la même pondération horaire", () => {
    const dashboard = readFileSync(new URL("./Dashboard.tsx", import.meta.url), "utf8");
    const details = readFileSync(new URL("./WeatherDetails.tsx", import.meta.url), "utf8");
    const router = readFileSync(new URL("../../../server/routers/weather.ts", import.meta.url), "utf8");

    expect(dashboard).toContain("trpc.weather.getDetailedForecast.useQuery");
    expect(details).toContain("trpc.weather.getDetailedForecast.useQuery");
    expect(dashboard).toContain("officialSnapshot?.hourlyWeighting");
    expect(details).toContain("officialSnapshot?.hourlyWeighting");
    expect(router).toContain("hours: snapshot.hourly");
    expect(router).toContain("hourlyWeighting: snapshot.hourlyWeighting");
  });

  it("retire les deux panneaux des pages volontairement simplifiées", () => {
    for (const filename of simplifiedPageFiles) {
      const source = readFileSync(new URL(`./${filename}`, import.meta.url), "utf8");
      expect(source).not.toContain("<ForecastProvenanceBadge");
      expect(source).not.toContain("<ForecastMetricDefinitions");
    }
  });
});
