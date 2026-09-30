import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  acquireForecastLease,
  decideScheduledForecastJobDisposition,
  FORECAST_REFRESH_LOCK_LEASE_MS,
  type ForecastLeaseStore,
} from "./forecastRefreshLock";

type Lease = { ownerToken: string; leaseExpiresAt: Date };
function memoryStore(initial: Record<string, Lease> = {}) {
  const leases = new Map(Object.entries(initial));
  const store: ForecastLeaseStore = {
    async insertIfAbsent({ lockKey, ownerToken, leaseExpiresAt }) {
      if (leases.has(lockKey)) return false;
      leases.set(lockKey, { ownerToken, leaseExpiresAt });
      return true;
    },
    async claimIfExpired({ lockKey, ownerToken, now, leaseExpiresAt }) {
      const current = leases.get(lockKey);
      if (!current || current.leaseExpiresAt.getTime() > now.getTime()) return false;
      leases.set(lockKey, { ownerToken, leaseExpiresAt });
      return true;
    },
  };
  return { store, leases };
}

describe("leases distribués du refresh prévision", () => {
  it("n’accorde qu’un propriétaire au milieu de deux claims concurrents", async () => {
    const { store, leases } = memoryStore();
    const now = new Date("2026-09-30T08:00:00.000Z");
    const results = await Promise.all([
      acquireForecastLease(store, { lockKey: "forecast-location:1,2", ownerToken: "a", now }),
      acquireForecastLease(store, { lockKey: "forecast-location:1,2", ownerToken: "b", now }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(leases.get("forecast-location:1,2")?.leaseExpiresAt.getTime()).toBe(now.getTime() + FORECAST_REFRESH_LOCK_LEASE_MS);
  });

  it("permet de reprendre une lease expirée par compare-and-set", async () => {
    const oldNow = new Date("2026-09-30T08:00:00.000Z");
    const newNow = new Date(oldNow.getTime() + FORECAST_REFRESH_LOCK_LEASE_MS + 1);
    const { store, leases } = memoryStore({
      "favorites-forecast-scheduler": {
        ownerToken: "abandoned",
        leaseExpiresAt: new Date(oldNow.getTime() + FORECAST_REFRESH_LOCK_LEASE_MS),
      },
    });
    expect(await acquireForecastLease(store, {
      lockKey: "favorites-forecast-scheduler",
      ownerToken: "recovery",
      now: newNow,
    })).toBe(true);
    expect(leases.get("favorites-forecast-scheduler")?.ownerToken).toBe("recovery");
  });

  it("ignore une deuxième demande tant que le lease est valide", async () => {
    const now = new Date("2026-09-30T08:00:00.000Z");
    const { store } = memoryStore({
      "favorites-forecast-scheduler": {
        ownerToken: "first",
        leaseExpiresAt: new Date(now.getTime() + 1_000),
      },
    });
    expect(await acquireForecastLease(store, {
      lockKey: "favorites-forecast-scheduler",
      ownerToken: "second",
      now,
    })).toBe(false);
  });
});

describe("idempotence des slots de collecte", () => {
  const now = new Date("2026-09-30T08:00:00.000Z");

  it("ne relance pas un lot terminé, y compris un lot partiel déjà observé", () => {
    expect(decideScheduledForecastJobDisposition({ status: "completed", startedAt: now }, now)).toBe("already-completed");
  });

  it("évite un chevauchement de job récent, mais autorise la reprise d’un run échoué ou obsolète", () => {
    expect(decideScheduledForecastJobDisposition({ status: "running", startedAt: now }, now)).toBe("in-progress");
    expect(decideScheduledForecastJobDisposition({ status: "failed", startedAt: now }, now)).toBe("retry");
    expect(decideScheduledForecastJobDisposition({
      status: "running",
      startedAt: new Date(now.getTime() - FORECAST_REFRESH_LOCK_LEASE_MS - 1),
    }, now)).toBe("retry");
    expect(decideScheduledForecastJobDisposition({ status: "running", startedAt: null }, now)).toBe("in-progress");
  });

  it("déclare l’unicité du slot et des leases dans le schéma MySQL", () => {
    const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
    const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(schema).toContain('uniqueIndex("collection_jobs_schedule_run_key_unique").on(table.scheduleRunKey)');
    expect(schema).toContain('mysqlTable("forecast_refresh_locks"');
    expect(schema).toContain('lockKey: varchar("lockKey", { length: 64 }).primaryKey()');
    expect(database).toContain('eq(collectionJobs.jobType, "forecast"), isNotNull(collectionJobs.scheduleRunKey)');
  });
});
