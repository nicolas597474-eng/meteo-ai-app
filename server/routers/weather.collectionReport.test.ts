import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("weather.getForecastCollectionReport", () => {
  it("retourne uniquement la couverture archivée des modèles, séparée des stations", () => {
    const source = readFileSync(new URL("./weather.ts", import.meta.url), "utf8");
    expect(source).toContain("getForecastCollectionReport: publicProcedure");
    expect(source).toContain('scheduledAt: "05:00"');
    expect(source).toContain("dailyCollectedModels");
    expect(source).toContain("hourlyCollectedModels");
    expect(source).toContain("getStationCollectionSnapshots(locationKey, 8)");
    expect(source).toContain("lastForecastSuccess");
    expect(source).toContain("lastPhysicalCollection");
    expect(source).toContain("hourlyHistory");
    expect(source).toContain("technicalFailureStreak");
    expect(source).toContain("buildRecentPhysicalSnapshotSlots(physicalTraces)");
    expect(source).toContain("noQualifiedStationSlots");
    expect(source).toContain("missingSnapshotSlots");
    expect(source).toContain("scheduleCoverage");
    const procedure = source.slice(source.indexOf("getForecastCollectionReport:"), source.indexOf("getProviderDiagnostics:"));
    expect(procedure).not.toContain("collectExpertForecasts");
    expect(procedure).toContain("getRecentCollectionJobs(24)");
    expect(procedure).toContain("nextForecastRun");
    expect(procedure).toContain("lastForecastRun");
    expect(procedure).toContain("durationMs");
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
    expect(handlerSource).toContain('const preserveArchivedEvidence = trigger === "manual" || trigger === "recovery"');
    expect(handlerSource).toContain("directReadingsAdded");
    expect(handlerSource).toContain("snapshotPreserved: true");
    expect(handlerSource).toContain("seuls les nouveaux relevés directs ont été ajoutés");
    expect(handlerSource).toContain("insertStationObservationIfMissing");
    expect(handlerSource).toContain("insertQualifiedObservationSnapshotIfMissing");
    expect(handlerSource).toContain("insertPhysicalSnapshotCollectionTraceIfMissing");
    expect(dbSource).toContain("export async function insertStationObservationIfMissing");
    expect(dbSource).toContain("export async function insertQualifiedObservationSnapshotIfMissing");
    expect(dbSource).toContain("export async function insertPhysicalSnapshotCollectionTraceIfMissing");
  });
});

describe("reprise programmée des snapshots physiques", () => {
  it("prévoit une seconde tentative horaire idempotente sans déclenchement manuel", () => {
    const handlerSource = readFileSync(new URL("../scheduledHandlers.ts", import.meta.url), "utf8");

    expect(handlerSource).toContain('"scheduled" | "manual" | "recovery"');
    expect(handlerSource).toContain('const preserveArchivedEvidence = trigger === "manual" || trigger === "recovery"');
    expect(handlerSource).toContain('const recoveryOnly = trigger === "recovery"');
    expect(handlerSource).toContain("Créneau déjà archivé par le passage horaire principal ; reprise ignorée.");
    expect(handlerSource).toContain("Archivé via la reprise automatique après l’absence de trace du passage principal.");
    expect(handlerSource).toContain('req.body?.snapshotMode === "recovery" ? "recovery" : "scheduled"');
    expect(handlerSource).not.toContain('collectPhysicalObservationSnapshotsForFavorites(favorites, "manual")');
  });
});

describe("cadence affichée des snapshots physiques", () => {
  it("reflète la minute de déclenchement de la tâche v4", () => {
    const routerSource = readFileSync(new URL("./weather.ts", import.meta.url), "utf8");

    expect(routerSource).toContain('snapshotCadence: "Chaque heure à :20 UTC"');
    expect(routerSource).not.toContain('snapshotCadence: "Chaque heure à :05 UTC"');
  });
});
