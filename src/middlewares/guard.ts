import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "../services/auth/session";

/**
 * True when the request carries a valid session cookie.
 * Server actions must check this themselves: an action can be invoked by a POST to any page,
 * including the public login page, so the middleware alone does not protect it.
 */
export async function isSignedIn(): Promise<boolean> {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}
