import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./index.css", import.meta.url), "utf8");

describe("surface 3D des graphiques", () => {
  it("atténue le fond sans retirer le contour lumineux", () => {
    expect(styles).toContain("rgba(59, 130, 246, 0.10)");
    expect(styles).toContain("rgba(11, 19, 32, 0.98)");
    expect(styles).toContain("rgba(96, 165, 250, 0.58)");
    expect(styles).toContain("0 0 26px rgba(37, 99, 235, 0.09)");
  });
});
