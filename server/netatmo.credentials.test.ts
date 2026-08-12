import { describe, expect, it } from "vitest";

describe("identifiants Netatmo", () => {
  it("requiert un jeu OAuth complet avant toute requête au réseau Netatmo", () => {
    expect(process.env.NETATMO_CLIENT_ID?.trim()).toBeTruthy();
    expect(process.env.NETATMO_CLIENT_SECRET?.trim()).toBeTruthy();
    expect(process.env.NETATMO_REFRESH_TOKEN?.trim()).toBeTruthy();
  });

  it.runIf(process.env.NETATMO_VERIFY_LIVE === "true")("obtient un jeton d’accès Netatmo via le renouvellement OAuth", async () => {
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.NETATMO_CLIENT_ID ?? "",
      client_secret: process.env.NETATMO_CLIENT_SECRET ?? "",
      refresh_token: process.env.NETATMO_REFRESH_TOKEN ?? "",
    });
    const response = await fetch("https://api.netatmo.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const body = await response.json() as { access_token?: string; error?: string; error_description?: string };
    expect(response.ok, `Netatmo OAuth: ${body.error ?? "erreur inconnue"}${body.error_description ? ` — ${body.error_description}` : ""}`).toBe(true);
    expect(body.access_token).toBeTruthy();
  }, 20_000);
});
