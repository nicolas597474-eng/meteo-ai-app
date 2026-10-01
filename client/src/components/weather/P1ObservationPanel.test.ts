import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P1ObservationPanel", () => {
  const source = readFileSync(
    new URL("./P1ObservationPanel.tsx", import.meta.url),
    "utf8"
  );

  it("explains the four P1.6 verdicts and keeps promotion manual", () => {
    expect(source).toContain("Observation en cours");
    expect(source).toContain("P1 validable");
    expect(source).toContain("À prolonger");
    expect(source).toContain("Échec sécurité");
    expect(source).toContain("ne peut pas promouvoir P1 automatiquement");
  });

  it("shows the five gates and daily history in an accessible panel", () => {
    expect(source).toContain("Couverture");
    expect(source).toContain("Idempotence");
    expect(source).toContain("Isolation");
    expect(source).toContain("Historique quotidien P1.6");
    expect(source).toContain("<details");
  });

  it("keeps administrative closure separate from the weather verdict and requires explicit confirmation", () => {
    expect(source).toContain(
      "Décision de gouvernance · distincte du verdict météo"
    );
    expect(source).toContain("P1.6 clôturée administrativement");
    expect(source).toContain("Confirmer la clôture admin de P1.6 ?");
    expect(source).toContain("Confirmer la clôture");
    expect(source).toContain(
      "Les verdicts et snapshots P1.6 d’origine restent inchangés."
    );
  });
});
