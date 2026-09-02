import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("v8 P1.6 observation hook", () => {
  const source = readFileSync(new URL("./scheduledHandlers.ts", import.meta.url), "utf8");

  it("records P1.6 only through the non-blocking shadow boundary", () => {
    expect(source).toContain('executeShadowWriteSafely(`p1.6:${locKey}:${today}`');
    expect(source).toContain("recordP1ObservationDay");
    expect(source.indexOf("insertStationCollectionSnapshot")).toBeLessThan(source.indexOf('executeShadowWriteSafely(`p1.6:'));
  });
});
