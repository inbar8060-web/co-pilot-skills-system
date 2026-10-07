"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, str } from "@/lib/actions";
import { homeForRole, type AppRole } from "@/lib/schemas";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { AppError, safeRelativePath, type ActionResult } from "@/lib/utils";

const LoginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(128),
});

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let destination: string;
  try {
    const parsed = LoginSchema.safeParse({ email: str(formData, "email"), password: str(formData, "password") });
    if (!parsed.success) throw new AppError("BAD_CREDENTIALS", "Enter a valid email and password.");
    const email = parsed.data.email.toLowerCase();

    // App-level brake in front of GoTrue's own limiter: 10 attempts per address per 15 minutes.
    await enforceRateLimit(`login:${email}`, 10, 900);

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
    if (error || !data.user) {
      // Generic message: never confirm whether the account exists.
      throw new AppError("BAD_CREDENTIALS", "Invalid email or password.");
    }
    const role = (data.user.app_metadata?.role as AppRole | undefined) ?? "end_user";
    destination = safeRelativePath(str(formData, "next")) ?? homeForRole(role);
  } catch (err) {
    if (err instanceof AppError && err.code === "RATE_LIMITED") {
      return { ok: false, error: "Too many sign-in attempts. Try again in a few minutes." };
    }
    return fail(err, "login");
  }
  redirect(destination);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
