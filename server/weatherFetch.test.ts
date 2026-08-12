import { describe, expect, it } from "vitest";
import { isTransientWeatherStatus } from "./weatherFetch";

describe("reprises des sources météo", () => {
  it("ne retente que les statuts transitoires documentés", () => {
    expect(isTransientWeatherStatus(408)).toBe(true);
    expect(isTransientWeatherStatus(429)).toBe(true);
    expect(isTransientWeatherStatus(500)).toBe(true);
    expect(isTransientWeatherStatus(404)).toBe(false);
  });
});
