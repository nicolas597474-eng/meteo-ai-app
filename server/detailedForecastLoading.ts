type SnapshotWithHourly<THourly> = {
  hourly: THourly[];
};

type DetailedForecastLoadingOptions<THourly, TSnapshot extends SnapshotWithHourly<THourly>, TMetadata, TFallback> = {
  loadSnapshot: () => Promise<TSnapshot>;
  includeExtendedPeriods: boolean;
  loadExtendedPeriods: () => Promise<THourly[]>;
  loadMetadata: () => Promise<TMetadata>;
  loadHourlyFallback: (hours: THourly[]) => Promise<TFallback>;
};

/**
 * Starts independent forecast reads together, then starts the hourly fallback
 * as soon as the official snapshot is ready. Results and failure behavior are
 * unchanged; only avoidable serial waiting is removed.
 */
export async function loadDetailedForecastSources<
  THourly,
  TSnapshot extends SnapshotWithHourly<THourly>,
  TMetadata,
  TFallback,
>(options: DetailedForecastLoadingOptions<THourly, TSnapshot, TMetadata, TFallback>) {
  const snapshotPromise = options.loadSnapshot();
  const periodHoursPromise = options.includeExtendedPeriods
    ? options.loadExtendedPeriods()
    : snapshotPromise.then((snapshot) => snapshot.hourly);
  const metadataPromise = options.loadMetadata();
  const hourlyFallbackPromise = snapshotPromise.then((snapshot) => options.loadHourlyFallback(snapshot.hourly));

  const [snapshot, periodHours, metadata, hourlyFallback] = await Promise.all([
    snapshotPromise,
    periodHoursPromise,
    metadataPromise,
    hourlyFallbackPromise,
  ]);

  return { snapshot, periodHours, metadata, hourlyFallback };
}
