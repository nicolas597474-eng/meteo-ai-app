import { describe, expect, it } from "vitest";
import { optionalCoordinatesSchema, requiredCoordinatesSchema } from "./weatherInput";

describe("validation des coordonnées météo", () => {
  it("accepte les coordonnées géographiques complètes dans leurs bornes", () => {
    expect(requiredCoordinatesSchema.parse({ lat: 50.7567, lon: 2.5204 })).toEqual({ lat: 50.7567, lon: 2.5204 });
    expect(optionalCoordinatesSchema.parse({})).toEqual({});
  });

  it("rejette les coordonnées hors bornes et les paires incomplètes", () => {
    expect(() => requiredCoordinatesSchema.parse({ lat: 91, lon: 2 })).toThrow();
    expect(() => requiredCoordinatesSchema.parse({ lat: 45, lon: -181 })).toThrow();
    expect(() => optionalCoordinatesSchema.parse({ lat: 45 })).toThrow();
  });
});
