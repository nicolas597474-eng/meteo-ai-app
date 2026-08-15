import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("WeatherStatusBadge", () => {
  it("expose des variantes sémantiques et une animation respectueuse des préférences utilisateur", () => {
    const source = readFileSync(new URL("./WeatherStatusBadge.tsx", import.meta.url), "utf8");
    expect(source).toContain('"info" | "success" | "warning" | "lab" | "neutral" | "danger"');
    expect(source).toContain("motion-safe:animate-pulse");
    expect(source).toContain("data-weather-status-badge");
    expect(source).toContain("aria-label");
  });
});
