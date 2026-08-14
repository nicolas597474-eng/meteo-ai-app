import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Dashboard officiel avec contexte local", () => {
  it("préserve la température officielle tout en expliquant la moyenne station pondérée", () => {
    const source = readFileSync(new URL("./Dashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain("Prévision officielle consolidée");
    expect(source).toContain("Moyenne locale pondérée");
    expect(source).toContain("Contrôles calculés à cette requête : distance, fraîcheur, fiabilité, cohérence et altitude si renseignée.");
    expect(source).toContain('localMode: loc.localMode ?? "standard"');
    expect(source).toContain("Tous les régimes");
    expect(source).toContain("Comment est calculée la fusion officielle ?");
    expect(source).toContain("Voir les 20 régimes");
    expect(source).not.toContain("max-h-72 overflow-y-auto");
    expect(source).toContain("weightRows");
    expect(source).toContain('role="progressbar"');
    expect(source).toContain("expandedRegimeIds");
    expect(source).toContain("aria-expanded={isExpanded}");
    expect(source).toContain("candidate?.weights");
    expect(source).toContain("Tout développer");
    expect(source).toContain("Tout réduire");
  });

  it("conserve la hiérarchie mobile de référence sans remplacer les données métier", () => {
    const source = readFileSync(new URL("./Dashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain("Header mobile fidèle à la référence");
    expect(source).toContain("Ouvrir le menu MeteoAI");
    expect(source).toContain("Tendance : panneau autonome de la référence mobile");
    expect(source).toContain("Température locale");
    expect(source).toContain("Repli de modèle explicitement qualifié");
    expect(source).toContain("bg-blue-600");
    expect(source).toContain("HourlyChart hours={hours}");
    expect(source).toContain("FifteenDayChart days={days}");
  });
});
