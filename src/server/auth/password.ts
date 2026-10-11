import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Stored as scrypt:<salt hex>:<hash hex>. Colons (not "$") so the value survives .env variable expansion.
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length || 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
