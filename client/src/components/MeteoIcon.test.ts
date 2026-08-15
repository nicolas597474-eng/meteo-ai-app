import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MeteoIcon.tsx", import.meta.url), "utf8");

describe("MeteoIcon", () => {
  it("applique une profondeur 3D et un halo futuriste à la bibliothèque partagée", () => {
    expect(source).toContain("meteo-icon-3d");
    expect(source).toContain("feDropShadow");
    expect(source).toContain("radialGradient");
    expect(source).toContain("showOrb");
  });

  it("conserve une description accessible à chaque icône météo", () => {
    expect(source).toContain("role=\"img\"");
    expect(source).toContain("Icône météo");
  });
});
