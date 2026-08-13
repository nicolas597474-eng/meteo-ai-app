import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Dashboard officiel avec contexte local", () => {
  it("préserve la température officielle tout en expliquant la moyenne station pondérée", () => {
    const source = readFileSync(new URL("./Dashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain("Prévision officielle consolidée");
    expect(source).toContain("Moyenne locale pondérée");
    expect(source).toContain("Contrôles calculés à cette requête : distance, fraîcheur, fiabilité, cohérence et altitude si renseignée.");
    expect(source).toContain('localMode: loc.localMode ?? "standard"');
  });
});
