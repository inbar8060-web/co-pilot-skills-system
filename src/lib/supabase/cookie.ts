/**
 * Fixed auth cookie name for every Supabase client (proxy, server, browser).
 * The default is derived from the project host, so every local Supabase stack on
 * 127.0.0.1 would write the same `sb-127-auth-token` cookie, and cookies are not
 * port-scoped. A fixed, app-specific name keeps other local projects' sessions out.
 */
export const AUTH_COOKIE_NAME = "sb-copilot-auth-token";

export const authCookieOptions = { name: AUTH_COOKIE_NAME } as const;

/** Matches the session cookie and its chunks (`<name>.0`, `<name>.1`, …). */
export function isAuthCookie(name: string): boolean {
  return name === AUTH_COOKIE_NAME || name.startsWith(`${AUTH_COOKIE_NAME}.`);
}
