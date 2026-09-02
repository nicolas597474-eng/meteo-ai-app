import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ProviderRunEvidencePanel", () => {
  const source = readFileSync(new URL("./ProviderRunEvidencePanel.tsx", import.meta.url), "utf8");

  it("explains the four P2 evidence levels without presenting metadata as payload proof", () => {
    expect(source).toContain("Run prouvé");
    expect(source).toContain("Métadonnée Open-Meteo");
    expect(source).toContain("Horaire théorique");
    expect(source).toContain("Run inconnu");
    expect(source).toContain("ne prouve pas à elle seule que le payload Forecast");
  });

  it("keeps the panel owner-facing and production protected", () => {
    expect(source).toContain("P2 · Rapport propriétaire");
    expect(source).toContain("Production protégée");
  });
});

