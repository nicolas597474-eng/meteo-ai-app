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

describe("relance manuelle des snapshots physiques", () => {
  it("réutilise le collecteur physique avec contrôle de propriété et sans réécriture", () => {
    const routerSource = readFileSync(new URL("./weather.ts", import.meta.url), "utf8");
    const handlerSource = readFileSync(new URL("../scheduledHandlers.ts", import.meta.url), "utf8");
    const dbSource = readFileSync(new URL("../db.ts", import.meta.url), "utf8");

    expect(routerSource).toContain("refreshPhysicalStationSnapshots: protectedProcedure");
    expect(routerSource).toContain("Ce lieu favori est introuvable ou ne vous appartient pas.");
    expect(routerSource).toContain("collectPhysicalObservationSnapshotsForFavorites([favorite], \"manual\")");
    expect(handlerSource).toContain("trigger: PhysicalSnapshotCollectionTrigger");
    expect(handlerSource).toContain('const preserveArchivedEvidence = trigger === "manual"');
    expect(handlerSource).toContain("Ce créneau est déjà archivé ; aucune réécriture n’a été effectuée.");
    expect(handlerSource).toContain("insertStationObservationIfMissing");
    expect(handlerSource).toContain("insertQualifiedObservationSnapshotIfMissing");
    expect(handlerSource).toContain("insertPhysicalSnapshotCollectionTraceIfMissing");
    expect(dbSource).toContain("export async function insertStationObservationIfMissing");
    expect(dbSource).toContain("export async function insertQualifiedObservationSnapshotIfMissing");
    expect(dbSource).toContain("export async function insertPhysicalSnapshotCollectionTraceIfMissing");
  });
});
