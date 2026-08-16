import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./WeatherDetails.tsx", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../index.css", import.meta.url), "utf8");

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
    expect(source).toContain("details-blue-page");
    expect(source).toContain("linear-gradient(135deg,#5db5eb_0%,#429edb_100%)");
    expect(source).toContain("bg-[#3b98d5]/95");
    expect(globalStyles).toContain(".details-blue-page .weather-surface");
    expect(globalStyles).toContain("background: linear-gradient(135deg, #5db5eb 0%, #429edb 100%) !important");
    expect(globalStyles).toContain(".details-blue-page .weather-surface-inset");
  });
});
