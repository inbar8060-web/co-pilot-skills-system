import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, homeForRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAuthCookie } from "@/lib/supabase/cookie";

/**
 * Clears a session that verifies but no longer maps to a users row (deleted or
 * deactivated account). Server Components cannot write cookies, so `requireUser`
 * redirects here instead of straight to /login, which would bounce back to the
 * app while the cookie is still valid. Regular sign-out is the CSRF-protected
 * `signOut` server action; this GET only ever clears sessions that are already
 * unusable, so a cross-site link cannot log a working user out.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (user) return relativeRedirect(homeForRole(user.role));

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);

  // Belt and braces: drop any auth cookie chunk signOut left behind.
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (isAuthCookie(name)) cookieStore.delete(name);
  }

  return relativeRedirect("/login?reason=session");
}

/**
 * Relative Location: behind a tunnel or reverse proxy, request.nextUrl reflects the server's own
 * bind address (localhost:4000), not the public host the browser used.
 */
function relativeRedirect(path: string) {
  return new NextResponse(null, { status: 307, headers: { Location: path, "Cache-Control": "no-store" } });
}
