import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { homeForRole, type AppRole } from "@/lib/schemas";
import { authCookieOptions } from "@/lib/supabase/cookie";
import { isCrossOriginWrite, isLoopbackHost, isProtectedPath } from "@/lib/route-access";

/**
 * Session refresh + authenticated-or-not gating. Role authorisation is NOT done here:
 * JWT claims lag role changes until the next token refresh, so layouts and actions
 * check the database (`requireRole` / `assertRole`). Claims are only used to pick a
 * landing page, where a stale value is harmless (the layout redirects again).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // Behind a TLS-terminating proxy (Cloudflare tunnel, CDN), never serve the app over plain http:
  // the session cookie would travel unencrypted. Direct local requests carry no forwarded proto.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  if (request.headers.get("x-forwarded-proto") === "http" && host && !isLoopbackHost(host)) {
    return NextResponse.redirect(`https://${host}${pathname}${search}`, 308);
  }

  if (isApi && isCrossOriginWrite(request.method, {
    origin: request.headers.get("origin"),
    host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    fetchSite: request.headers.get("sec-fetch-site"),
  })) {
    return NextResponse.json({ success: false, error: "FORBIDDEN_ORIGIN" }, { status: 403 });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    },
  );

  // IMPORTANT: do not add code between client creation and getClaims().
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  /** Any early return must carry the cookies/headers a refresh may have written onto `response`. */
  const finish = (res: NextResponse) => {
    for (const cookie of response.cookies.getAll()) res.cookies.set(cookie);
    for (const key of ["cache-control", "expires", "pragma"]) {
      const v = response.headers.get(key);
      if (v) res.headers.set(key, v);
    }
    return res;
  };

  if (!claims && isProtectedPath(pathname)) {
    if (isApi) {
      return finish(NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 }));
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return finish(NextResponse.redirect(url));
  }

  if (claims && (pathname === "/login" || pathname === "/")) {
    const role = (claims.app_metadata as { role?: AppRole } | undefined)?.role;
    const url = request.nextUrl.clone();
    url.pathname = homeForRole(role);
    url.search = "";
    return finish(NextResponse.redirect(url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
