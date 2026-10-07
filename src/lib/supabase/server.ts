import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";
import { authCookieOptions } from "@/lib/supabase/cookie";

/**
 * Request-scoped, cookie-backed Supabase client for Server Components, Server
 * Actions and Route Handlers. Runs as the signed-in user: RLS applies.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = publicEnv();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there. The proxy
          // refreshes sessions on every request, so this is safe to ignore.
        }
      },
    },
  });
}
