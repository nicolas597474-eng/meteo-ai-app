import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("ForecastProvenanceBadge", () => {
  it("distingue la prévision horaire, le repli quotidien et l’indisponibilité", () => {
    const source = readFileSync(new URL("./ForecastProvenanceBadge.tsx", import.meta.url), "utf8");
    expect(source).toContain('data.kind === "unavailable"');
    expect(source).toContain('data.kind === "daily_fusion"');
    expect(source).toContain("Donnée calculée le");
    expect(source).toContain("Horodatage indisponible");
    expect(source).toContain("h disponibles");
    expect(source).toContain("Météo-France · suivi shadow");
    expect(source).toContain("Flux authentifié Météo-France");
    expect(source).toContain("Repli Open-Meteo · AROME/ARPEGE");
    expect(source).toContain("non appliqué à la prévision visible");
  });
});
