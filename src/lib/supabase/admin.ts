import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client. Bypasses RLS and is the ONLY way to reach the anonymity
 * wall (`public.admin_*` functions). Never expose to the browser; every caller
 * must have already authorised the actor with `requireRole`.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-application": "cognitive-copilot-server" } },
  });
}
