import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("Phase 8 metrics panel", () => {
  it("expose les métriques shadow et les garde-fous de production", () => {
    const source = fs.readFileSync(new URL("./Phase8MetricsPanel.tsx", import.meta.url), "utf8");
    expect(source).toContain("Métriques shadow");
    expect(source).toContain("Comparaisons physiques");
    expect(source).toContain("appliquées à production");
    expect(source).toContain("Brier, CRPS");
  });
});
