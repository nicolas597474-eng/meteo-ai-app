import { describe, expect, it } from "vitest";
import { getChartTemperatureScale } from "./chartTemperatureScale";

describe("getChartTemperatureScale", () => {
  it("conserve des graduations de dix degrés pour une plage positive", () => {
    expect(getChartTemperatureScale([12, 23], 2)).toMatchObject({
      scaleBot: 10,
      scaleTop: 30,
      ticks: [10, 20, 30],
    });
  });

  it("étend automatiquement l’échelle sous zéro pour des températures négatives simulées", () => {
    expect(getChartTemperatureScale([-12, -6, -1], 2)).toMatchObject({
      scaleBot: -20,
      scaleTop: 10,
      ticks: [-20, -10, 0, 10],
    });
  });

  it("couvre les deux côtés de zéro pour une plage hivernale mixte", () => {
    expect(getChartTemperatureScale([-4, 12], 3)).toMatchObject({
      scaleBot: -10,
      scaleTop: 20,
      ticks: [-10, 0, 10, 20],
    });
  });
});
