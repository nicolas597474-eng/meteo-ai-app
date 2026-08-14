import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("reconstruction visuelle 3D", () => {
  it("conserve les graphiques officiels du Dashboard dans leurs surfaces 3D", () => {
    const dashboard = source("./pages/Dashboard.tsx");
    expect(dashboard).toContain("trpc.weather.getDetailedForecast.useQuery");
    expect(dashboard).toContain("<HourlyChart hours={hours}");
    expect(dashboard).toContain("<FifteenDayChart days={days}");
    expect(dashboard).toContain("weather-surface weather-chart-surface");
  });

  it("centralise les niveaux de profondeur dans des primitives sans logique métier", () => {
    const styles = source("./index.css");
    const surface = source("./components/weather/WeatherSurface.tsx");
    expect(styles).toContain(".weather-page");
    expect(styles).toContain(".weather-surface-inset");
    expect(surface).toContain('"raised"');
    expect(surface).toContain('"observation"');
  });
});
