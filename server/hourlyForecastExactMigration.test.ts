import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(new URL("../drizzle/0051_hourly_exact_horizon_calibration.sql", import.meta.url), "utf8");
const migrationJournal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};

describe("migration 0051 de calibration horaire au lead exact", () => {
  it("n’ajoute que les deux tables exactes et leurs index, sans opération destructive ni DML", () => {
    const statements = migrationSql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);

    expect(statements).toHaveLength(6);
    expect(statements.every((statement) => /^(CREATE TABLE|CREATE INDEX)\b/i.test(statement))).toBe(true);
    expect(migrationSql).not.toMatch(/\b(?:ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    expect(migrationSql).toContain("CREATE TABLE `hourly_forecast_exact_comparisons`");
    expect(migrationSql).toContain("CREATE TABLE `hourly_forecast_exact_evaluation_scores`");
    expect(migrationSql).toContain("UNIQUE(`forecastRunValueId`,`observationSnapshotId`)");
    expect(migrationSql).toContain("`horizonMilliseconds` bigint NOT NULL");
    expect(migrationSql).toContain("UNIQUE(`locationKey`,`date`,`sourceName`,`modelName`,`variable`,`horizonMilliseconds`)");
  });

  it("conserve son entrée Drizzle sans prétendre que la migration a été appliquée", () => {
    expect(migrationJournal.entries.find((entry) => entry.tag === "0051_hourly_exact_horizon_calibration")).toMatchObject({
      idx: 51,
      tag: "0051_hourly_exact_horizon_calibration",
      // The journal records generated migrations; it does not record database application state.
      version: expect.any(String),
    });
  });
});
