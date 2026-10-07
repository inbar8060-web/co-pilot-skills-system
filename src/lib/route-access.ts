/**
 * Pure request-gating rules shared by the proxy and its unit tests (no Next.js imports).
 */

/** Paths that need a session. `/api/health` stays public for uptime checks. */
const PROTECTED = /^\/(?:(?:app|admin|super)(?:\/|$)|api\/(?!health(?:\/|$)))/;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED.test(pathname);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF guard for route handlers (server actions already get Next's own origin check).
 * SameSite=Lax is not enough on its own: other ports on the same host (another local app on
 * localhost:3000) and sibling subdomains count as "same-site", so the Origin host must match
 * exactly. A request without Origin/Sec-Fetch-Site is not from a browser and carries no
 * ambient cookies to abuse.
 */
export function isCrossOriginWrite(
  method: string,
  headers: { origin: string | null; host: string | null; fetchSite: string | null },
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  if (headers.fetchSite === "cross-site" || headers.fetchSite === "same-site") return true;
  if (!headers.origin) return false;
  if (headers.origin === "null" || !headers.host) return true;
  try {
    return new URL(headers.origin).host !== headers.host;
  } catch {
    return true;
  }
}

/** localhost / 127.0.0.1 / [::1], with or without a port. */
export function isLoopbackHost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
}
