"use server";

import { cookies, headers } from "next/headers";
import { ApiError, rateLimit } from "@/middlewares/apiHandler";
import { verifyPassword } from "@/services/auth/password";
import { authConfigured, createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/services/auth/session";
import { env } from "@/config/env";

export interface LoginResult {
  ok: boolean;
  error?: string;
}

/** Server action: check the dashboard password and set the session cookie. Runs on the server only. */
export async function login(password: string): Promise<LoginResult> {
  const h = await headers();
  try {
    rateLimit(`login:${h.get("x-forwarded-for") ?? "local"}`, 5, 5 * 60_000);
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.message : "Too many attempts." };
  }
  if (!authConfigured()) {
    return { ok: false, error: 'The dashboard password is not set up yet. Run `npm run setup`, then `npm run set-password -- "your password"`, and restart the server.' };
  }
  if (typeof password !== "string" || !password || password.length > 200 || !verifyPassword(password, env.passwordHash)) {
    return { ok: false, error: "Wrong password." };
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: h.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return { ok: true };
}
