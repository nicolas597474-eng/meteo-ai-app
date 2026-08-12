import { describe, expect, it } from "vitest";
import { MAP_UNAVAILABLE_MESSAGE } from "./Map";

describe("repli de cartographie", () => {
  it("informe que la liste de stations reste disponible lorsque la carte échoue", () => {
    expect(MAP_UNAVAILABLE_MESSAGE).toContain("stations restent accessibles");
  });
});
