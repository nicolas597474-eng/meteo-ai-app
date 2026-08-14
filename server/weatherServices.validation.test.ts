import { describe, expect, it } from "vitest";
import { VALIDATION_WEATHER_MODELS, WEATHER_SERVICES } from "./weatherServices";

describe("validation weather models", () => {
  it("keeps candidate models separate from the eight active experts", () => {
    expect(WEATHER_SERVICES.expert).toHaveLength(8);
    expect(VALIDATION_WEATHER_MODELS.map((model) => model.name)).toEqual([
      "DMI HARMONIE-DINI",
      "ICON-D2",
      "ECMWF AIFS",
      "ECMWF ENS",
    ]);
    const activeNames = WEATHER_SERVICES.expert.map((model) => model.name);
    expect(VALIDATION_WEATHER_MODELS.every((model) => !activeNames.includes(model.name))).toBe(true);
  });
});
