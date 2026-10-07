import "server-only";
import type { CurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/utils";

/**
 * DB-backed fixed-window limiter (shared across serverless instances).
 * Fails closed: if the check itself errors, the request is rejected.
 */
export async function enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[rate-limit] check failed", error);
    throw new AppError("RATE_LIMIT_UNAVAILABLE", "Try again shortly", 503);
  }
  if (!data) throw new AppError("RATE_LIMITED", "Too many requests. Try again later.", 429);
}

/**
 * Paid model calls are capped at three levels so one large (or compromised) organization
 * cannot run the bill up: per user, per organization, and globally. Hourly windows.
 */
export const MODEL_BUDGETS = {
  routine: { user: 12, org: 300, global: 3000 },
  coaching: { user: 12, org: 200, global: 2000 },
  ingest: { user: 30, org: 300, global: 2000 },
  playground: { user: 20, org: 100, global: 500 },
} as const;

export type BudgetScope = keyof typeof MODEL_BUDGETS;

export async function enforceModelBudget(scope: BudgetScope, user: Pick<CurrentUser, "id" | "organizationId">): Promise<void> {
  const b = MODEL_BUDGETS[scope];
  await enforceRateLimit(`${scope}:user:${user.id}`, b.user, 3600);
  await enforceRateLimit(`${scope}:org:${user.organizationId ?? "none"}`, b.org, 3600);
  await enforceRateLimit(`${scope}:global`, b.global, 3600);
}
