import { describe, expect, it } from "vitest";
import { dashboardTemperatureLayout } from "./dashboardTemperatureLayout";

describe("mise en page de température du Dashboard", () => {
  it("réserve une colonne non réductible aux températures maximale et minimale sur mobile", () => {
    expect(dashboardTemperatureLayout.content).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(dashboardTemperatureLayout.extremes).toContain("shrink-0");
  });

  it("borne la température principale et interdit le retour à la ligne des valeurs", () => {
    expect(dashboardTemperatureLayout.currentValue).toContain("clamp(3.25rem,16vw,4.5rem)");
    expect(dashboardTemperatureLayout.currentValue).toContain("whitespace-nowrap");
    expect(dashboardTemperatureLayout.extremeValue).toContain("whitespace-nowrap");
  });

  it("préserve une zone tactile de 44 px tout en compactant les sections mobiles", () => {
    expect(dashboardTemperatureLayout.refreshButton).toContain("min-h-11");
    expect(dashboardTemperatureLayout.compactMetrics).toContain("mt-2");
    expect(dashboardTemperatureLayout.compactMetrics).toContain("sm:mt-3");
  });
});
