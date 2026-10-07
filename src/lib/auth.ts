import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeForRole, type AppRole } from "@/lib/schemas";
import { AppError } from "@/lib/utils";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  organizationId: string | null;
  hasActiveReport: boolean;
  team: string | null;
  operationalCategory: string | null;
  gender: string | null;
  /** The user's organization pilots the crew canvas (organizations.canvas_enabled). */
  canvasEnabled: boolean;
}

export { homeForRole };

/**
 * Verified identity for the current request. Uses getClaims() (signature
 * verified) and then the users row (authoritative role). Memoised per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const { data: row } = await supabase
    .from("users")
    .select("id, email, full_name, role, organization_id, has_active_report, team, operational_category, gender, organization:organizations(canvas_enabled)")
    .eq("id", data.claims.sub)
    .maybeSingle();
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role as AppRole,
    organizationId: row.organization_id,
    hasActiveReport: row.has_active_report,
    team: row.team,
    operationalCategory: row.operational_category,
    gender: row.gender,
    canvasEnabled: Boolean(row.organization?.canvas_enabled),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  // /login would bounce straight back while the cookie still verifies, so clear it first.
  if (!user) redirect("/auth/signout");
  return user;
}

/** Page-level guard: redirects to the user's own home when the role does not match. */
export async function requireRole(...roles: AppRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(`${homeForRole(user.role)}?error=forbidden`);
  return user;
}

/** Action/API-level guard: throws instead of redirecting. */
export async function assertRole(...roles: AppRole[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Sign in required", 401);
  if (!roles.includes(user.role)) throw new AppError("FORBIDDEN", "Not allowed", 403);
  return user;
}

/** Org admins act inside their own organization; super admins may pass any org id. */
export function resolveOrgScope(user: CurrentUser, requestedOrgId?: string | null): string {
  if (user.role === "super_admin") {
    if (!requestedOrgId) throw new AppError("ORG_REQUIRED", "Organization is required", 400);
    return requestedOrgId;
  }
  if (!user.organizationId) throw new AppError("NO_ORGANIZATION", "User has no organization", 400);
  return user.organizationId;
}
