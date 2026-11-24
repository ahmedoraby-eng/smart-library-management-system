import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { jwtVerify, SignJWT } from "jose";
import type { Config } from "../config";

export const SESSION_COOKIE = "slm_session";

const key = (secret: string) => new TextEncoder().encode(secret);

/**
 * The session is a signed JWT (HS256) in an HttpOnly cookie. It carries only the staff id:
 * the role is read from the database on every request, so changes apply at once.
 */
export async function issueSession(c: Context, config: Config, staffId: string): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(staffId)
    .setIssuedAt()
    .setExpirationTime(`${config.sessionHours}h`)
    .sign(key(config.sessionSecret));
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.environment === "production" || new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: config.sessionHours * 3600,
  });
}

export function clearSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Returns the staff id from a valid session cookie, or null. */
export async function readSession(c: Context, config: Config): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(config.sessionSecret), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
