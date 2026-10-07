export type HourlyJournalStatus = "attempting" | "succeeded" | "partial" | "failed" | "safe_error";

export type HourlyJournalEntry = {
  model: string;
  modelId: string | null;
  isOfficialModel: boolean;
  status: HourlyJournalStatus;
  requestAttempts: number;
  hoursReceived: number;
  valuesReceived: number;
  expectedValueCount: number;
  archiveRowsWritten: number;
  projectionRowsWritten: number;
  errorCode: string | null;
  attemptedAt: number;
  completedAt: number | null;
};

export type HourlyJournalRow = {
  model: string;
  isOfficialModel: boolean;
  entry: HourlyJournalEntry | null;
};

export type HourlyJournalFilter = "all" | "problems" | "success" | "running" | "missing";
export type HourlyJournalFilterCounts = Record<HourlyJournalFilter, number>;

const PROBLEM_STATUSES = new Set<HourlyJournalStatus>(["partial", "failed", "safe_error"]);

export function buildHourlyJournalRows(
  expectedModels: readonly string[],
  entries: readonly HourlyJournalEntry[],
): HourlyJournalRow[] {
  const modelNames = Array.from(new Set([
    ...expectedModels,
    ...entries.map((entry) => entry.model),
  ]));
  const entriesByModel = new Map(entries.map((entry) => [entry.model, entry]));
  const officialModels = new Set(expectedModels);

  return modelNames.map((model) => {
    const entry = entriesByModel.get(model) ?? null;
    return {
      model,
      isOfficialModel: entry?.isOfficialModel ?? officialModels.has(model),
      entry,
    };
  });
}

export function getHourlyJournalFilterCounts(
  rows: readonly HourlyJournalRow[],
  available: boolean,
): HourlyJournalFilterCounts {
  return {
    all: rows.length,
    problems: rows.filter(({ entry }) => entry && PROBLEM_STATUSES.has(entry.status)).length,
    success: rows.filter(({ entry }) => entry?.status === "succeeded").length,
    running: rows.filter(({ entry }) => entry?.status === "attempting").length,
    missing: available ? rows.filter(({ entry }) => !entry).length : 0,
  };
}

export function filterHourlyJournalRows(
  rows: readonly HourlyJournalRow[],
  filter: HourlyJournalFilter,
  available: boolean,
): HourlyJournalRow[] {
  switch (filter) {
    case "problems":
      return rows.filter(({ entry }) => entry != null && PROBLEM_STATUSES.has(entry.status));
    case "success":
      return rows.filter(({ entry }) => entry?.status === "succeeded");
    case "running":
      return rows.filter(({ entry }) => entry?.status === "attempting");
    case "missing":
      return available ? rows.filter(({ entry }) => !entry) : [];
    case "all":
    default:
      return [...rows];
  }
}
