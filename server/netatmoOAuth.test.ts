import { describe, expect, it } from "vitest";
import {
  createNetatmoState,
  decryptNetatmoRefreshToken,
  encryptNetatmoRefreshToken,
  verifyNetatmoState,
} from "./netatmoOAuth";

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

  it("chiffre le refresh token sans le conserver en clair", () => {
    const token = "refresh-token-test";
    const encrypted = encryptNetatmoRefreshToken(token);
    expect(encrypted).not.toContain(token);
    expect(decryptNetatmoRefreshToken(encrypted)).toBe(token);
  });
});
