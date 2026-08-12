import type { Express, Request, Response } from "express";
import { consumeNetatmoOAuthState, upsertNetatmoOAuthToken } from "./db";
import { encryptNetatmoRefreshToken, hashNetatmoState, NETATMO_REDIRECT_URI, NETATMO_SCOPE, verifyNetatmoState } from "./netatmoOAuth";

function queryValue(req: Request, key: string) {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerNetatmoOAuthRoutes(app: Express) {
  app.get("/api/netatmo/callback", async (req: Request, res: Response) => {
    const code = queryValue(req, "code");
    const state = queryValue(req, "state");
    const verifiedState = state ? verifyNetatmoState(state) : null;
    if (!code || !verifiedState) {
      const reason = !code ? "code_absent" : !state ? "state_absent" : "state_signature_invalide_ou_expiree";
      console.warn(`[Netatmo OAuth] Callback rejeté: ${reason}; longueur_state=${state?.length ?? 0}`);
      res.status(400).send(`Connexion Netatmo refusée (${reason}). Relancez l’autorisation depuis MeteoAI.`);
      return;
    }
    const stateConsumed = await consumeNetatmoOAuthState(hashNetatmoState(state!), verifiedState.userId);
    if (!stateConsumed) {
      console.warn("[Netatmo OAuth] Callback rejeté: état absent, expiré ou déjà consommé");
      res.status(400).send("Connexion Netatmo expirée ou déjà utilisée. Relancez l’autorisation depuis MeteoAI.");
      return;
    }

    try {
      const form = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.NETATMO_CLIENT_ID ?? "",
        client_secret: process.env.NETATMO_CLIENT_SECRET ?? "",
        code,
        redirect_uri: NETATMO_REDIRECT_URI,
        scope: NETATMO_SCOPE,
      });
      const response = await fetch("https://api.netatmo.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: form,
        signal: AbortSignal.timeout(15_000),
      });
      const token = await response.json() as { refresh_token?: string };
      if (!response.ok || !token.refresh_token) throw new Error("Netatmo token exchange failed");
      await upsertNetatmoOAuthToken(verifiedState.userId, encryptNetatmoRefreshToken(token.refresh_token), NETATMO_SCOPE);
      res.redirect(302, "/reliability?netatmo=connected");
    } catch (error) {
      console.error("[Netatmo OAuth] Callback failed", error);
      res.status(502).send("Connexion Netatmo impossible. Vérifiez l’application et relancez l’autorisation.");
    }
  });
}
