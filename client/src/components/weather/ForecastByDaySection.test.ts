import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ForecastByDaySection.tsx", import.meta.url), "utf8");

describe("ForecastByDaySection — libellés de condition", () => {
  it("présente summer_heat comme une chaleur marquée, pas comme une canicule", () => {
    expect(source).toContain('summer_heat: "Chaleur marquée"');
    expect(source).not.toContain('summer_heat: "Canicule"');
  });
});
