import { describe, expect, it } from "vitest";
import {
  buildHourlyJournalRows,
  filterHourlyJournalRows,
  getHourlyJournalFilterCounts,
  type HourlyJournalEntry,
} from "./hourlyJournalFilter";

const entries: HourlyJournalEntry[] = [
  { model: "AROME", modelId: "arome_france", isOfficialModel: true, status: "failed", requestAttempts: 3, hoursReceived: 0, valuesReceived: 0, expectedValueCount: 144, archiveRowsWritten: 0, projectionRowsWritten: 0, errorCode: "timeout", attemptedAt: 100, completedAt: 200 },
  { model: "ICON", modelId: "icon_seamless", isOfficialModel: true, status: "partial", requestAttempts: 1, hoursReceived: 24, valuesReceived: 120, expectedValueCount: 144, archiveRowsWritten: 24, projectionRowsWritten: 0, errorCode: "projection_write_failed", attemptedAt: 300, completedAt: 400 },
  { model: "GFS", modelId: "gfs_seamless", isOfficialModel: true, status: "safe_error", requestAttempts: 2, hoursReceived: 0, valuesReceived: 0, expectedValueCount: 144, archiveRowsWritten: 0, projectionRowsWritten: 0, errorCode: "database_unavailable", attemptedAt: 500, completedAt: 600 },
  { model: "IFS", modelId: "ifs", isOfficialModel: true, status: "succeeded", requestAttempts: 1, hoursReceived: 168, valuesReceived: 840, expectedValueCount: 840, archiveRowsWritten: 840, projectionRowsWritten: 168, errorCode: null, attemptedAt: 700, completedAt: 800 },
  { model: "UKMO", modelId: "ukmo_global_deterministic_10km", isOfficialModel: true, status: "attempting", requestAttempts: 1, hoursReceived: 0, valuesReceived: 0, expectedValueCount: 144, archiveRowsWritten: 0, projectionRowsWritten: 0, errorCode: null, attemptedAt: 900, completedAt: null },
];

describe("hourly journal filters", () => {
  const rows = buildHourlyJournalRows(["AROME", "ICON", "GFS", "IFS", "UKMO", "ECMWF", "DWD"], entries);

  it("groups partial and safe errors with failed attempts without including successes", () => {
    expect(filterHourlyJournalRows(rows, "problems", true).map(({ model }) => model)).toEqual(["AROME", "ICON", "GFS"]);
    expect(getHourlyJournalFilterCounts(rows, true).problems).toBe(3);
  });

  it("keeps successful, ongoing, and missing journal entries independently filterable", () => {
    expect(filterHourlyJournalRows(rows, "success", true).map(({ model }) => model)).toEqual(["IFS"]);
    expect(filterHourlyJournalRows(rows, "running", true).map(({ model }) => model)).toEqual(["UKMO"]);
    expect(filterHourlyJournalRows(rows, "missing", true).map(({ model }) => model)).toEqual(["ECMWF", "DWD"]);
  });

  it("does not label missing rows as unlogged when the journal itself is unavailable", () => {
    expect(getHourlyJournalFilterCounts(rows, false).missing).toBe(0);
    expect(filterHourlyJournalRows(rows, "missing", false)).toEqual([]);
  });

  it("includes recorded non-official references without counting them as official models", () => {
    const withReference = buildHourlyJournalRows(["AROME"], [
      entries[0],
      { ...entries[3], model: "Open-Meteo", modelId: "best_match", isOfficialModel: false },
    ]);
    expect(withReference.map(({ model, isOfficialModel }) => [model, isOfficialModel])).toEqual([
      ["AROME", true],
      ["Open-Meteo", false],
    ]);
  });
});
