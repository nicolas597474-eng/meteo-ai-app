import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./WeatherDetails.tsx", import.meta.url), "utf8");

describe("page Prévisions détaillées", () => {
  it("conserve le déroulé horaire sans afficher de section Graphiques", () => {
    expect(source).toContain('import { MeteoSurface } from "@/components/weather/MeteoSurface"');
    expect(source).toContain('import { BackToTopButton } from "@/components/BackToTopButton"');
    expect(source).toContain('tone="default"');
    expect(source).not.toContain("weather-chart-3d");
    expect(source).toContain("<BackToTopButton />");
    expect(source).toContain("w-[160px]");
    expect(source).toContain("hours.length * 170");
    expect(source).toContain("text-[36px] font-semibold leading-none");
    expect(source).toContain("MAINTENANT");
    expect(source).toContain("hourlyCardStride = 170");
    expect(source).toContain('rail.scrollTo({ left: targetLeft, behavior: "auto" })');
    expect(source).toContain("rgba(77,105,132,0.20)");
    expect(source).toContain("rgba(44,128,181,0.30)");
    expect(source).toContain("border-white/20 bg-[linear-gradient(160deg,rgba(77,105,132,0.20),rgba(16,36,56,0.28))]");
    expect(source).toContain("border-sky-200/65 bg-[linear-gradient(160deg,rgba(44,128,181,0.30),rgba(10,35,60,0.34))]");
    expect(source).toContain("HourlyMetric");
    expect(source).toContain("hourlyTemperatureTone(h.temp)");
    expect(source).toContain('return "text-amber-200"');
    expect(source).toContain('return "text-orange-300"');
    expect(source).toContain("Déroulé temporel");
    expect(source).toContain("Glissez pour voir les heures suivantes");
    expect(source).toContain("const periodHours = data?.periodHours ?? hours");
    expect(source).toContain("hours={periodHours}");
    expect(source).toContain("Détail horaire non disponible pour cette journée.");
    expect(source).toContain("getSlotAgreementConfidence");
    expect(source).toContain("Accord {value}%");
    expect(source).toContain("windSpeedSpread");
    expect(source).toContain("humiditySpread");
    expect(source).toContain("cloudCoverSpread");
    expect(source).toContain("windGustSpread");
    expect(source).toContain("windDirectionDifference");
    expect(source).toContain("Accord par paramètre");
    expect(source).toContain("Historique qualifié");
  });
});
