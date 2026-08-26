import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("collecte horaire des snapshots physiques", () => {
  it("isole une erreur par favori et expose un statut partiel sans interrompre les autres lieux", () => {
    const source = readFileSync(resolve(process.cwd(), "server/scheduledHandlers.ts"), "utf8");

    expect(source).toContain("Physical snapshot collection failed for");
    expect(source).toContain("Physical snapshot collection failed after retry for");
    expect(source).toContain("Erreur de collecte après relance : ${message}");
    expect(source).toContain("retrying once:");
    expect(source).toContain('status: allLocationsFailed ? "failed" : collectionErrors.length > 0 ? "partial" : "completed"');
    expect(source).toContain("Physical snapshot collection failed for all favorite locations");
    expect(source).toContain("await processWithConcurrency(Array.from(unique.values()), 2");
  });

  it("relance une fois la recherche lorsqu’aucune station physique qualifiée n’est disponible", () => {
    const source = readFileSync(resolve(process.cwd(), "server/scheduledHandlers.ts"), "utf8");

    expect(source).toContain("No qualified physical station for");
    expect(source).toContain("hasTemperature: synthesis.temperature != null");
    expect(source).toContain("if (synthesis.stationCount < 1 || synthesis.temperature == null)");
    expect(source).toContain("await new Promise<void>((resolve) => setTimeout(resolve, HOURLY_SNAPSHOT_RETRY_DELAY_MS));");
  });
});
