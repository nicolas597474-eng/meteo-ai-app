import crypto from "crypto";
import { ENV } from "./_core/env";
import { createNetatmoOAuthState } from "./db";

export const NETATMO_REDIRECT_URI = process.env.NETATMO_REDIRECT_URI
  ?? "https://meteoai-7i8fkmsr.manus.space/api/netatmo/callback";
export const NETATMO_SCOPE = "read_station";
export const NETATMO_STATE_TTL_MS = 10 * 60 * 1000;

function signingKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required for Netatmo OAuth state");
  return crypto.createHash("sha256").update(ENV.cookieSecret).digest();
}

export function createNetatmoState(userId: number, now = Date.now()) {
  const payload = `${userId}.${now}.${crypto.randomBytes(24).toString("base64url")}`;
  const signature = crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyNetatmoState(state: string, now = Date.now()) {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [userIdRaw, issuedAtRaw, nonce, signature] = parts;
  const payload = `${userIdRaw}.${issuedAtRaw}.${nonce}`;
  const expected = crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const userId = Number(userIdRaw);
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isInteger(userId) || !Number.isFinite(issuedAt) || now - issuedAt > NETATMO_STATE_TTL_MS || issuedAt > now + 60_000) return null;
  return { userId, issuedAt };
}

export function hashNetatmoState(state: string) {
  return crypto.createHash("sha256").update(state).digest("hex");
}

export async function startNetatmoAuthorization(userId: number) {
  const state = createNetatmoState(userId);
  await createNetatmoOAuthState(hashNetatmoState(state), userId, new Date(Date.now() + NETATMO_STATE_TTL_MS));
  const authorizationUrl = new URL("https://api.netatmo.com/oauth2/authorize");
  authorizationUrl.searchParams.set("client_id", process.env.NETATMO_CLIENT_ID ?? "");
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", NETATMO_REDIRECT_URI);
  authorizationUrl.searchParams.set("scope", NETATMO_SCOPE);
  authorizationUrl.searchParams.set("state", state);
  return authorizationUrl.toString();
}

export function encryptNetatmoRefreshToken(refreshToken: string) {
  const key = signingKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptNetatmoRefreshToken(payload: string) {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted Netatmo token payload");
  const [ivRaw, tagRaw, encryptedRaw] = parts.map((part) => Buffer.from(part, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", signingKey(), ivRaw);
  decipher.setAuthTag(tagRaw);
  return Buffer.concat([decipher.update(encryptedRaw), decipher.final()]).toString("utf8");
}
