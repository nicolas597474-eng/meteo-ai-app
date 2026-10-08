import { describe, expect, it } from "vitest";
import {
  getDashboardWeatherAtmosphere,
  getDashboardWeatherFogOpacity,
} from "./dashboardWeatherAtmosphere";

describe("getDashboardWeatherAtmosphere", () => {
  it("choisit la pluie et son intensité à partir du libellé ou des précipitations", () => {
    expect(getDashboardWeatherAtmosphere({ condition: "Pluie forte" })).toEqual(
      {
        kind: "rain",
        intensity: "heavy",
      }
    );
    expect(getDashboardWeatherAtmosphere({ condition: "Bruine" })).toEqual({
      kind: "rain",
      intensity: "light",
    });
    expect(getDashboardWeatherAtmosphere({ condition: "Averses" }).kind).toBe(
      "rain"
    );
    expect(getDashboardWeatherAtmosphere({ precipitation: 12 }).intensity).toBe(
      "heavy"
    );
  });

  it("distingue orage, neige, grêle, brouillard, chaleur et vent", () => {
    expect(
      getDashboardWeatherAtmosphere({ condition: "Orage violent" }).kind
    ).toBe("storm");
    expect(
      getDashboardWeatherAtmosphere({ condition: "Neige forte" }).kind
    ).toBe("snow");
    expect(getDashboardWeatherAtmosphere({ condition: "Grésil" }).kind).toBe(
      "hail"
    );
    expect(
      getDashboardWeatherAtmosphere({ condition: "Brouillard" }).kind
    ).toBe("fog");
    expect(getDashboardWeatherAtmosphere({ condition: "Canicule" }).kind).toBe(
      "heat"
    );
    expect(getDashboardWeatherAtmosphere({ windSpeed: 70 })).toEqual({
      kind: "wind",
      intensity: "heavy",
    });
  });

  it("sépare le verglas et le givre de la neige", () => {
    expect(getDashboardWeatherAtmosphere({ condition: "Verglas" }).kind).toBe(
      "ice"
    );
    expect(
      getDashboardWeatherAtmosphere({ condition: "Pluie verglaçante" }).kind
    ).toBe("ice");
    expect(getDashboardWeatherAtmosphere({ condition: "Givre" }).kind).toBe(
      "ice"
    );
    expect(getDashboardWeatherAtmosphere({ condition: "Neige" }).kind).toBe(
      "snow"
    );
    expect(getDashboardWeatherAtmosphere({ temperature: -2 }).kind).toBe("ice");
  });

  it("n’utilise pas un cumul de précipitations sans période pour intensifier la neige", () => {
    expect(
      getDashboardWeatherAtmosphere({ condition: "Neige", precipitation: 18 })
    ).toEqual({ kind: "snow", intensity: "steady" });
    expect(
      getDashboardWeatherAtmosphere({
        condition: "Neige forte",
        precipitation: null,
      })
    ).toEqual({ kind: "snow", intensity: "heavy" });
  });

  it("rend la brume sèche et le soleil froid distincts", () => {
    expect(
      getDashboardWeatherAtmosphere({ condition: "Brume sèche" }).kind
    ).toBe("dust");
    expect(getDashboardWeatherAtmosphere({ condition: "Poussière" }).kind).toBe(
      "dust"
    );
    expect(
      getDashboardWeatherAtmosphere({ condition: "Grand soleil" }).kind
    ).toBe("cold-sun");
    expect(
      getDashboardWeatherAtmosphere({ condition: "Soleil froid" }).kind
    ).toBe("cold-sun");
  });

  it("sélectionne le ciel, la nuit et les nuages selon la condition observée", () => {
    expect(
      getDashboardWeatherAtmosphere({ condition: "Ensoleillé" }).kind
    ).toBe("sun");
    expect(
      getDashboardWeatherAtmosphere({ condition: "Partiellement nuageux" }).kind
    ).toBe("clouds");
    expect(
      getDashboardWeatherAtmosphere({ condition: "Nuit claire" }).kind
    ).toBe("night");
    expect(
      getDashboardWeatherAtmosphere({ condition: "Nuageux", cloudCover: 95 })
    ).toEqual({ kind: "clouds", intensity: "heavy" });
  });

  it("réutilise les mesures météo réelles en l’absence de libellé de condition", () => {
    expect(getDashboardWeatherAtmosphere({ precipitation: 0.3 }).kind).toBe(
      "rain"
    );
    expect(getDashboardWeatherAtmosphere({ windSpeed: 45 }).kind).toBe("wind");
    expect(getDashboardWeatherAtmosphere({ visibilityKm: 0.8 }).kind).toBe(
      "fog"
    );
    expect(getDashboardWeatherAtmosphere({ visibilityKm: 0.1 }).intensity).toBe(
      "heavy"
    );
    expect(getDashboardWeatherAtmosphere({ temperature: 34 }).kind).toBe(
      "heat"
    );
    expect(getDashboardWeatherAtmosphere({ regime: "Neige forte" })).toEqual({
      kind: "snow",
      intensity: "heavy",
    });
  });

  it("garde la visibilité inconnue distincte de zéro et module seulement l’opacité visuelle", () => {
    expect(getDashboardWeatherFogOpacity(null)).toBeNull();
    expect(getDashboardWeatherFogOpacity(Number.NaN)).toBeNull();
    expect(getDashboardWeatherFogOpacity(-1)).toBeNull();
    expect(getDashboardWeatherFogOpacity(0)).toEqual({ far: 0.32, near: 0.23 });
    expect(getDashboardWeatherFogOpacity(1)).toEqual({ far: 0.14, near: 0.1 });
    expect(getDashboardWeatherFogOpacity(24)).toEqual({ far: 0.14, near: 0.1 });
  });

  it("n’invente aucun phénomène quand les conditions et les mesures sont absentes", () => {
    expect(
      getDashboardWeatherAtmosphere({ condition: "Condition indisponible" })
    ).toEqual({ kind: "none", intensity: "steady" });
    expect(getDashboardWeatherAtmosphere({})).toEqual({
      kind: "none",
      intensity: "steady",
    });
  });

  it("donne la priorité à la condition officielle sur les mesures secondaires", () => {
    expect(
      getDashboardWeatherAtmosphere({
        condition: "Ensoleillé",
        precipitation: 4,
        windSpeed: 45,
        temperature: -3,
      }).kind
    ).toBe("sun");
  });
});
