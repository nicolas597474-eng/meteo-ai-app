export type HourlyForecastPersistenceErrorCode = "database_unavailable" | "archive_write_failed" | "projection_write_failed";

/** Safe, classified persistence failure with counts committed before the failure. */
export class HourlyForecastPersistenceError extends Error {
  constructor(
    readonly errorCode: HourlyForecastPersistenceErrorCode,
    readonly archiveRowsWritten: number,
    readonly projectionRowsWritten: number,
  ) {
    super(`Hourly forecast persistence failed (${errorCode}).`);
    this.name = "HourlyForecastPersistenceError";
  }
}

/**
 * Run immutable archive writes before refreshing the current projection.
 * Writers report only committed row counts; a failed later batch preserves the
 * exact count already confirmed by earlier transactions.
 */
export async function withHourlyForecastPersistenceStages(
  writeArchive: (confirmCommittedRows: (count: number) => void) => Promise<void>,
  writeProjection: (confirmCommittedRows: (count: number) => void) => Promise<void>,
): Promise<{ archiveRowsWritten: number; projectionRowsWritten: number }> {
  let archiveRowsWritten = 0;
  let projectionRowsWritten = 0;
  try {
    await writeArchive((count) => {
      if (Number.isFinite(count) && count > 0) archiveRowsWritten += Math.floor(count);
    });
  } catch {
    throw new HourlyForecastPersistenceError("archive_write_failed", archiveRowsWritten, projectionRowsWritten);
  }
  try {
    await writeProjection((count) => {
      if (Number.isFinite(count) && count > 0) projectionRowsWritten += Math.floor(count);
    });
  } catch {
    throw new HourlyForecastPersistenceError("projection_write_failed", archiveRowsWritten, projectionRowsWritten);
  }
  return { archiveRowsWritten, projectionRowsWritten };
}
