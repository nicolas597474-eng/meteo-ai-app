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
    expect(source).toContain("hours.length * 186");
    expect(source).toContain("w-[174px]");
    expect(source).toContain("Temp. · ressenti · vent · pluie · humidité · pression");
    expect(source).toContain("chartScrollRef");
    expect(source).toContain("detailScrollRef");
    expect(source).toContain("detailCardStride = 186");
    expect(source).toContain('scrollTo({ left: detailTargetLeft, behavior: "auto" })');
    expect(source).toContain("syncDetailScroll");
    expect(source).toContain("syncChartScroll");
    expect(source).toContain("detailTargetLeft = progress * detailScrollableWidth");
    expect(source).toContain("chartTargetLeft = progress * chartScrollableWidth");
    expect(source).toContain("onScroll={syncDetailScroll}");
    expect(source).toContain("onScroll={syncChartScroll}");
    expect(source).toContain("const chartTop = 36");
    expect(source).toContain("chartBottom = chartH - 8");
    expect(source).toContain('paintOrder="stroke"');
    expect(source).toContain("chartH + 42");
    expect(source).toContain("MAINTENANT");
    expect(source).toContain("Maintenant ·");
    expect(source).toContain("hourlyCardStride = 224");
    expect(source).toContain('rail.scrollTo({ left: targetLeft, behavior: "auto" })');
    expect(source).toContain("bg-slate-800/60");
    expect(source).toContain("bg-sky-800/50");
  });
});
