import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Dashboard repli multi-modèles", () => {
  it("étiquette les contributions comme modèles et affiche leurs poids traçables", () => {
    const source = readFileSync(new URL("./Dashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain("Contributions de la fusion officielle");
    expect(source).toContain("Poids de température issus de la trace de fusion officielle");
    expect(source).toContain("ce sont des modèles, pas des stations");
  });
});
