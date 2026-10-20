// Signed session cookie. Imported by the middleware, so it must stay free of Node-only modules.
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "ja_session";
export const SESSION_DAYS = 7;

function key(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET || "";
  return secret.length >= 32 ? new TextEncoder().encode(secret) : null;
}

export function authConfigured(): boolean {
  return key() !== null && Boolean(process.env.DASHBOARD_PASSWORD_HASH);
}

export async function createSessionToken(): Promise<string> {
  const k = key();
  if (!k) throw new Error("AUTH_SECRET is missing or shorter than 32 characters.");
  return new SignJWT({ sub: "owner" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${SESSION_DAYS}d`).sign(k);
}

/** False for a missing, expired or tampered token — and whenever AUTH_SECRET is not set. */
export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  const k = key();
  if (!k || !token) return false;
  try {
    await jwtVerify(token, k, { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}
