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
    expect(source).toContain("w-[212px]");
    expect(source).toContain("hours.length * 214");
    expect(source).toContain("text-3xl font-bold text-white");
    expect(source).toContain("Détails par heure");
    expect(source).toContain('aria-label="Détails horaires défilables"');
    expect(source).toContain("hours.length * 180");
    expect(source).toContain("w-[174px]");
    expect(source).toContain("Temp. · ressenti · vent · pluie · humidité · pression");
    expect(source).toContain("chartScrollRef");
    expect(source).toContain('scrollTo({ left: targetLeft, behavior: "auto" })');
    expect(source).toContain("Maintenant ·");
  });
});
