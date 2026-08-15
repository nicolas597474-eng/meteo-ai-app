import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MeteoIcon.tsx", import.meta.url), "utf8");

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
  });
});
