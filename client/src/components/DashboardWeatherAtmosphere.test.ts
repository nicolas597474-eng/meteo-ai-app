import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardWeatherAtmosphere } from "./DashboardWeatherAtmosphere";

describe("DashboardWeatherAtmosphere", () => {
  it("rend la pluie en plusieurs plans avec des reflets sur la surface", () => {
    const markup = renderToStaticMarkup(
      createElement(DashboardWeatherAtmosphere, { condition: "Pluie forte" })
    );

    expect(markup).toContain('data-weather-atmosphere="rain"');
    expect(markup).toContain('data-weather-intensity="heavy"');
    expect(markup).toContain("dashboard-weather-atmosphere__rain-drop--far");
    expect(markup).toContain("dashboard-weather-atmosphere__rain-drop--near");
    expect(markup).toContain("dashboard-weather-atmosphere__water-bead");
    expect(markup).toContain("dashboard-weather-atmosphere__wet-sheen");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("rend les nuages, le soleil et le soleil froid avec des lumières distinctes", () => {
    const clouds = renderToStaticMarkup(
      createElement(DashboardWeatherAtmosphere, { condition: "Nuageux" })
    );
    const sun = renderToStaticMarkup(
      createElement(DashboardWeatherAtmosphere, { condition: "Ensoleillé" })
    );
    const coldSun = renderToStaticMarkup(
      createElement(DashboardWeatherAtmosphere, { condition: "Grand soleil" })
    );

    expect(clouds).toContain("dashboard-weather-atmosphere__cloud--far");
    expect(clouds).toContain("dashboard-weather-atmosphere__cloud--near");
    expect(sun).toContain("dashboard-weather-atmosphere__sun-glow");
    expect(sun).toContain("dashboard-weather-atmosphere__sun-shaft");
    expect(coldSun).toContain('data-weather-atmosphere="cold-sun"');
    expect(coldSun).toContain("dashboard-weather-atmosphere__cold-sun-glow");
  });

  it("rend une pellicule glacée et des cristaux pour le verglas", () => {
    const markup = renderToStaticMarkup(
      createElement(DashboardWeatherAtmosphere, { condition: "Verglas" })
    );

    expect(markup).toContain('data-weather-atmosphere="ice"');
    expect(markup).toContain("dashboard-weather-atmosphere__ice-film");
    expect(markup).toContain("dashboard-weather-atmosphere__ice-spike");
    expect(markup).toContain("dashboard-weather-atmosphere__ice-crystal");
  });

  it("rend des flocons ou des particules de brume sèche selon le phénomène", () => {
    const snow = renderToStaticMarkup(
      createElement(DashboardWeatherAtmosphere, { condition: "Neige" })
    );
    const dust = renderToStaticMarkup(
      createElement(DashboardWeatherAtmosphere, { condition: "Brume sèche" })
    );

    expect(snow).toContain("dashboard-weather-atmosphere__snowflake");
    expect(dust).toContain('data-weather-atmosphere="dust"');
    expect(dust).toContain("dashboard-weather-atmosphere__dust-haze--far");
    expect(dust).toContain("dashboard-weather-atmosphere__dust-particle");
  });

  it("ne rend pas de phénomène décoratif sans condition ni mesure exploitable", () => {
    expect(
      renderToStaticMarkup(createElement(DashboardWeatherAtmosphere, {}))
    ).toBe("");
  });
});
