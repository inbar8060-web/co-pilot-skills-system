"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { authCookieOptions } from "@/lib/supabase/cookie";

/** Browser client (singleton under the hood). Only the publishable key is ever shipped. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookieOptions: authCookieOptions },
  );
}
