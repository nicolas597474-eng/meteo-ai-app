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
    expect(source).toContain("linear-gradient(165deg,#1679d4_0%,#2a95df_48%,#69b9ea_100%)");
    expect(source).toContain("linear-gradient(135deg,#3a9cdf_0%,#2d8bd1_100%)");
    expect(source).toContain("bg-[#2b83c9]/95");
  });
});
