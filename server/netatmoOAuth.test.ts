import { describe, expect, it } from "vitest";
import {
  createNetatmoState,
  decryptNetatmoRefreshToken,
  encryptNetatmoRefreshToken,
  hashNetatmoState,
  verifyNetatmoState,
} from "./netatmoOAuth";
import { getNetatmoCallbackDiagnostic } from "./netatmoOAuthRoutes";

describe("sécurité OAuth Netatmo", () => {
  it("valide un état signé dans sa fenêtre de validité", () => {
    const now = Date.now();
    const state = createNetatmoState(42, now);
    expect(verifyNetatmoState(state, now + 30_000)).toMatchObject({ userId: 42, issuedAt: now });
  });

  it("rejette un état altéré ou expiré", () => {
    const now = Date.now();
    const state = createNetatmoState(42, now);
    expect(verifyNetatmoState(`${state}x`, now + 1_000)).toBeNull();
    expect(verifyNetatmoState(state, now + 11 * 60_000)).toBeNull();
  });

  it("produit une empreinte stable à conserver sans exposer l’état signé", () => {
    const state = createNetatmoState(42, Date.now());
    const hash = hashNetatmoState(state);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(state);
    expect(hashNetatmoState(state)).toBe(hash);
  });

  it("porte l’identité dans l’état signé plutôt que dans un contexte de session transitoire", () => {
    const state = createNetatmoState(42, Date.now());
    expect(verifyNetatmoState(state)?.userId).toBe(42);
    expect(hashNetatmoState(state)).toHaveLength(64);
  });

  it("chiffre le refresh token sans le conserver en clair", () => {
    const token = "refresh-token-test";
    const encrypted = encryptNetatmoRefreshToken(token);
    expect(encrypted).not.toContain(token);
    expect(decryptNetatmoRefreshToken(encrypted)).toBe(token);
  });

  it("distingue un refus mobile Netatmo de l’absence de code", () => {
    expect(getNetatmoCallbackDiagnostic({
      code: undefined,
      state: "etat-mobile",
      netatmoError: "access_denied",
      verifiedState: { userId: 42 },
    })).toBe("netatmo_access_denied");
    expect(getNetatmoCallbackDiagnostic({
      code: undefined,
      state: undefined,
      netatmoError: undefined,
      verifiedState: null,
    })).toBe("code_absent");
  });

  it("ne considère pas un code fournisseur comme une preuve de callback sans state signé", () => {
    expect(getNetatmoCallbackDiagnostic({
      code: "code-netatmo",
      state: undefined,
      netatmoError: undefined,
      verifiedState: null,
    })).toBe("state_absent");
  });

  it("n’expose pas de texte non sûr provenant du fournisseur", () => {
    expect(getNetatmoCallbackDiagnostic({
      code: undefined,
      state: "etat",
      netatmoError: "access denied <script>",
      verifiedState: { userId: 42 },
    })).toBe("netatmo_accessdeniedscript");
  });
});
