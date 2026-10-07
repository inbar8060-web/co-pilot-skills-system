import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, generateTempPassword } from "@/lib/utils";

/**
 * Creates an auth user and completes the profile row. If the profile step fails the auth
 * user is deleted again so the admin can simply retry (no orphaned account, no lost password).
 */
export async function provisionUser(input: {
  email: string;
  fullName: string;
  role: "end_user" | "org_admin";
  organizationId: string;
  team?: string | null;
  operationalCategory?: string | null;
  gender?: string | null;
}): Promise<{ userId: string; tempPassword: string }> {
  const admin = createAdminClient();
  const tempPassword = generateTempPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
    app_metadata: { role: input.role, organization_id: input.organizationId },
  });
  if (error || !data.user) {
    if (error?.code === "email_exists") throw new AppError("EXISTS", "A user with this email already exists");
    console.error("[provision] createUser failed", error);
    throw new AppError("CREATE_FAILED", "Could not create the account");
  }
  // GoTrue persists app_metadata after the insert trigger has run, so set the row explicitly.
  const { error: rowError } = await admin
    .from("users")
    .update({
      organization_id: input.organizationId,
      role: input.role,
      team: input.team || null,
      operational_category: input.operationalCategory ?? null,
      gender: input.gender ?? null,
    })
    .eq("id", data.user.id);
  if (rowError) {
    console.error("[provision] profile update failed; rolling back auth user", rowError);
    await admin.auth.admin.deleteUser(data.user.id).catch((e) => console.error("[provision] rollback failed", e));
    throw new AppError("CREATE_FAILED", "Could not complete the account; nothing was created. Please retry.");
  }
  return { userId: data.user.id, tempPassword };
}

