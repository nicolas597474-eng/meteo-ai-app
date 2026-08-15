import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./WeatherDetails.tsx", import.meta.url), "utf8");

describe("page Prévisions détaillées", () => {
  it("réutilise les surfaces et contrôles visuels MeteoAI", () => {
    expect(source).toContain('import { MeteoSurface } from "@/components/weather/MeteoSurface"');
    expect(source).toContain('import { WeatherStatusBadge } from "@/components/weather/WeatherStatusBadge"');
    expect(source).toContain('import { BackToTopButton } from "@/components/BackToTopButton"');
    expect(source).toContain('tone="accent"');
    expect(source).toContain('tone="default"');
    expect(source).toContain("weather-chart-3d");
    expect(source).toContain("Prévisions détaillées");
    expect(source).toContain('aria-label="Retour au Dashboard"');
    expect(source).toContain("<BackToTopButton />");
  });
});
