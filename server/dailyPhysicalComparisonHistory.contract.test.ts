import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const start = dbSource.indexOf("export async function getDailyPhysicalComparisonHistory(");
const end = dbSource.indexOf("/** Exact location/horizon evidence", start);
const readerSource = dbSource.slice(start, end);

describe("contrat de lecture de l’historique quotidien physique", () => {
  it("ne lit que l’archive de production et exclut explicitement les preuves non physiques/non qualifiées", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(readerSource).toContain(".from(dailyForecastObservationComparisons)");
    expect(readerSource).toContain('eq(dailyForecastObservationComparisons.evidenceType, "physical_observation")');
    expect(readerSource).toContain("eq(dailyForecastObservationComparisons.observationIsQualified, 1)");
    expect(readerSource).not.toContain("shadowWeatherPhase8Comparisons");
    expect(readerSource).not.toContain("shadowWeatherPhase7");
  });

  it("reste strictement en lecture seule et distingue l’absence de table de l’absence de base", () => {
    expect(readerSource).toContain("db.select()");
    expect(readerSource).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    expect(readerSource).toContain('unavailableDailyPhysicalComparisonHistory("database_unavailable")');
    expect(readerSource).toContain("isDailyComparisonTableUnavailable(error)");
    expect(readerSource).toContain('unavailableDailyPhysicalComparisonHistory("table_unavailable")');
  });
});
