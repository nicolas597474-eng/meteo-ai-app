import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MeteoIcon.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../index.css", import.meta.url), "utf8");

describe("MeteoIcon", () => {
  it("utilise le pack pictural 3D pour les principales conditions météo", () => {
    expect(source).toContain("PICTORIAL_WEATHER_ICONS");
    expect(source).toContain("meteo3d-sunny_9181afc4.png");
    expect(source).toContain("meteo3d-thunderstorm_20bf50ef.png");
    expect(source).toContain("meteo3d-clear-night_9a98fab7.png");
    expect(source).toContain("meteo3d-temperature_d834ebfe.png");
    expect(source).toContain("getPictorialAnimationClass");
    expect(source).toContain("meteo-icon-motion-storm");
    expect(source).toContain('key === "location"');
    expect(source).toContain('key === "stations"');
  });

  it("conserve une description accessible à chaque icône météo", () => {
    expect(source).toContain("role=\"img\"");
    expect(source).toContain("Icône météo");
    expect(source).toContain('aria-hidden=\"true\"');
  });

  it("centralise les effets contextuels sur toutes les familles météo", () => {
    expect(source).toContain("type WeatherEffectKind");
    expect(source).toContain("getWeatherEffectKind");
    expect(source).toContain("meteo-icon-effect-${kind}");
    expect(source).toContain('kind === "rain" || kind === "storm"');
    expect(source).toContain('kind === "snow"');
    expect(source).toContain('kind === "wind"');
    expect(source).toContain('kind === "night"');
    expect(source).toContain("WeatherEffects name={name}");
  });

  it("préserve les dimensions explicites des usages existants", () => {
    expect(source).toContain("hasExplicitSizeClass");
    expect(source).toContain("meteo-icon-shell");
    expect(source).toContain("style={shellSizeStyle}");
  });

  it("respecte les variantes responsive cachées afin de ne jamais dupliquer une icône", () => {
    expect(styles).toContain(".meteo-icon-shell.hidden { display: none; }");
    expect(styles).toContain(".meteo-icon-shell.sm\\:block { display: block; }");
  });
});
