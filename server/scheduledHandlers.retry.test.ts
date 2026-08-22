import { describe, expect, it } from "vitest";
import { HOURLY_SNAPSHOT_MAX_ATTEMPTS, HOURLY_SNAPSHOT_RETRY_DELAY_MS, shouldRetryHourlyFavorite } from "./scheduledHandlers";

describe("relance bornée des favoris de collecte horaire", () => {
  it("autorise une seule relance puis conserve l’échec explicite", () => {
    expect(HOURLY_SNAPSHOT_MAX_ATTEMPTS).toBe(2);
    expect(HOURLY_SNAPSHOT_RETRY_DELAY_MS).toBe(1_200);
    expect(shouldRetryHourlyFavorite(0)).toBe(true);
    expect(shouldRetryHourlyFavorite(1)).toBe(false);
  });
});
