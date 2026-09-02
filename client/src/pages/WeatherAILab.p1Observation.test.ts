import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WeatherAILab P1.6 owner panel", () => {
  const source = readFileSync(new URL("./WeatherAILab.tsx", import.meta.url), "utf8");

  it("keeps P1.6 behind the existing admin-only shadow report", () => {
    expect(source).toContain("shadowDataHubReport?.observationWindow");
    expect(source).toContain("<P1ObservationPanel window={shadowDataHubReport.observationWindow}");
    expect(source).toContain('user?.role === "admin"');
  });
});
