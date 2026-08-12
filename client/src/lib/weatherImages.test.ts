import { describe, expect, it } from "vitest";
import { getDashboardWeatherImage, getWeatherImageFromData } from "./weatherImages";

describe("getDashboardWeatherImage", () => {
  it("priorise la condition de l’heure actuelle sur le régime journalier", () => {
    expect(getDashboardWeatherImage({ condition: "Pluie forte", regime: "Ensoleillé" })).toContain("heavy-rain");
  });

  it("couvre les conditions de fond principales de la carte Dashboard", () => {
    expect(getDashboardWeatherImage({ condition: "Brouillard" })).toContain("weather-fog");
    expect(getDashboardWeatherImage({ condition: "Orage violent" })).toContain("violent-storm");
    expect(getDashboardWeatherImage({ condition: "Neige forte" })).toContain("heavy-snow");
    expect(getDashboardWeatherImage({ condition: "Ensoleillé" })).toContain("sunny-master");
  });

  it("conserve une sélection déterministe par données quand la condition manque", () => {
    expect(getWeatherImageFromData({ cloudCover: 95 })).toContain("weather-overcast");
    expect(getWeatherImageFromData({ precipitation: 12 })).toContain("heavy-rain");
  });
});
