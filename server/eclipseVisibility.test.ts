import { describe, expect, it } from "vitest";
import { getEclipseVisibilityLayers, getLocalEclipseCircumstances } from "./eclipseVisibility";

describe("eclipse visibility layers", () => {
  const layers = getEclipseVisibilityLayers([
    { id: "lunar_partial_2026_08_28", title: "Éclipse lunaire partielle", date: "2026-08-28" },
    { id: "solar_partial_2027_08_02", title: "Éclipse solaire totale", date: "2027-08-02" },
  ]);

  it("exposes a calculated lunar visibility grid", () => {
    const layer = layers.find((item) => item.type === "lunar");
    expect(layer?.visibilityCells.length).toBeGreaterThan(0);
    expect(layer?.visibilityCells.some((cell) => cell.visibility === "full_event")).toBe(true);
  });

  it("keeps NASA's central solar path distinct from the computed partial grid", () => {
    const layer = layers.find((item) => item.type === "solar");
    expect(layer?.centralPath?.northLimit.length).toBeGreaterThan(8);
    expect(layer?.centralPath?.southLimit.length).toBe(layer?.centralPath?.northLimit.length);
    expect(layer?.centralPath?.attribution).toContain("NASA");
  });

  it("returns local lunar circumstances without claiming visibility below the horizon", () => {
    const circumstances = getLocalEclipseCircumstances({ eventId: "lunar_partial_2026_08_28", lat: 50.7567, lon: 2.5204 });
    expect(circumstances.label).toContain("lunaire");
    expect(circumstances.peakAt).toMatch(/2026-08/);
    expect(circumstances.azimuthDegrees).toBeGreaterThanOrEqual(0);
    expect(circumstances.azimuthCardinal).toMatch(/^(N|NE|E|SE|S|SO|O|NO)$/);
    expect(circumstances.precisionLabel).toContain("horizon réel");
  });

  it("returns calculated solar circumstances at the selected point", () => {
    const circumstances = getLocalEclipseCircumstances({ eventId: "solar_partial_2027_08_02", lat: 50.7567, lon: 2.5204 });
    expect(circumstances.label).toContain("solaire");
    expect(circumstances.peakAt).toMatch(/2027-08/);
    expect(circumstances.azimuthDegrees).toBeGreaterThanOrEqual(0);
    expect(circumstances.azimuthCardinal).toMatch(/^(N|NE|E|SE|S|SO|O|NO)$/);
    expect(["full_event", "partial", "not_visible"]).toContain(circumstances.visibility);
  });
});
