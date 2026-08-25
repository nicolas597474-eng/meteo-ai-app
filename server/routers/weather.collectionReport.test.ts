import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("weather.getForecastCollectionReport", () => {
  it("retourne uniquement la couverture archivée des modèles, séparée des stations", () => {
    const source = readFileSync(new URL("./weather.ts", import.meta.url), "utf8");
    expect(source).toContain("getForecastCollectionReport: publicProcedure");
    expect(source).toContain('scheduledAt: "05:00"');
    expect(source).toContain("dailyCollectedModels");
    expect(source).toContain("hourlyCollectedModels");
    expect(source).toContain("getStationCollectionSnapshots(locationKey, 1)");
    const procedure = source.slice(source.indexOf("getForecastCollectionReport:"), source.indexOf("getProviderDiagnostics:"));
    expect(procedure).not.toContain("collectExpertForecasts");
  });
});

describe("collectFavoritesForecastsHandler", () => {
  it("écrit le bilan des modèles indépendamment du flux physique différé", () => {
    const source = readFileSync(new URL("../scheduledHandlers.ts", import.meta.url), "utf8");
    const marker = "// Le bilan des modèles doit être écrit même lorsque les snapshots physiques";
    const start = source.indexOf(marker);
    const end = source.indexOf("locationsProcessed++;", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const writeBlock = source.slice(start, end);
    expect(writeBlock).toContain("await insertStationCollectionSnapshot(buildStationCollectionSnapshot({");
    expect(writeBlock).not.toContain("if (!stationCollectionDeferred)");
  });
});
