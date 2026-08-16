import { describe, expect, it } from "vitest";
import { isManualFusionCoolingDown, MANUAL_FUSION_COOLDOWN_MS } from "./manualFusion";

describe("relance manuelle de fusion", () => {
  it("bloque seulement les relances trop rapprochées", () => {
    const now = Date.parse("2026-08-16T15:00:00.000Z");
    expect(isManualFusionCoolingDown(new Date(now - MANUAL_FUSION_COOLDOWN_MS + 1), now)).toBe(true);
    expect(isManualFusionCoolingDown(new Date(now - MANUAL_FUSION_COOLDOWN_MS), now)).toBe(false);
    expect(isManualFusionCoolingDown(null, now)).toBe(false);
  });
});
