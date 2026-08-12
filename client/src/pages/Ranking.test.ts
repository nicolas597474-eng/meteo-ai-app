import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("page Fiabilité", () => {
  it("n’affiche plus de parcours de connexion Netatmo", () => {
    const source = readFileSync(new URL("./Ranking.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("startAuthorization");
    expect(source).not.toContain("Connectez votre compte");
    expect(source).not.toContain(">Connecter<");
  });
});
