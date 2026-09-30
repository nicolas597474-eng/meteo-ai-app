export const FORECAST_REFRESH_LOCK_LEASE_MS = 5 * 60_000;
export const FAVORITES_FORECAST_SCHEDULER_LOCK_KEY = "favorites-forecast-scheduler";

export function getLocationForecastRefreshLockKey(locationKey: string): string {
  return `forecast-location:${locationKey}`;
}

/** Adapter atomique fourni par la base de données ou par un test. */
export type ForecastLeaseStore = {
  insertIfAbsent: (input: { lockKey: string; ownerToken: string; leaseExpiresAt: Date }) => Promise<boolean>;
  claimIfExpired: (input: { lockKey: string; ownerToken: string; now: Date; leaseExpiresAt: Date }) => Promise<boolean>;
};

export type ScheduledForecastJobDisposition = "already-completed" | "in-progress" | "retry";

export function decideScheduledForecastJobDisposition(
  existing: { status: string; startedAt: Date | string | null | undefined },
  now = new Date(),
  leaseMs = FORECAST_REFRESH_LOCK_LEASE_MS,
): ScheduledForecastJobDisposition {
  if (existing.status === "completed") return "already-completed";
  if (existing.status !== "running") return "retry";
  const startedAtMs = existing.startedAt instanceof Date
    ? existing.startedAt.getTime()
    : existing.startedAt == null ? NaN : new Date(existing.startedAt).getTime();
  if (!Number.isFinite(startedAtMs) || startedAtMs > now.getTime() - leaseMs) return "in-progress";
  return "retry";
}

/**
 * Acquiert ou reprend un lease arrivé à expiration. La sûreté concurrente vient
 * de l'unicité de lockKey et du compare-and-set de l'adaptateur persistant.
 */
export async function acquireForecastLease(
  store: ForecastLeaseStore,
  input: { lockKey: string; ownerToken: string; now?: Date; leaseMs?: number },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + (input.leaseMs ?? FORECAST_REFRESH_LOCK_LEASE_MS));
  if (await store.insertIfAbsent({ lockKey: input.lockKey, ownerToken: input.ownerToken, leaseExpiresAt })) return true;
  return store.claimIfExpired({ lockKey: input.lockKey, ownerToken: input.ownerToken, now, leaseExpiresAt });
}
