import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, rateLimit, readJson, route } from "@/server/api";
import { verifyPassword } from "@/server/auth/password";
import { authConfigured, createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/server/auth/session";
import { env } from "@/server/config/env";

export const POST = route(async (req) => {
  rateLimit(`login:${req.headers.get("x-forwarded-for") ?? "local"}`, 5, 5 * 60_000);
  if (!authConfigured()) {
    throw new ApiError(503, 'The dashboard password is not set up yet. Run `npm run setup`, then `npm run set-password -- "your password"`, and restart the server.');
  }
  const { password } = await readJson(req, z.object({ password: z.string().min(1).max(200) }));
  if (!verifyPassword(password, env.passwordHash)) throw new ApiError(401, "Wrong password.");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return res;
});
