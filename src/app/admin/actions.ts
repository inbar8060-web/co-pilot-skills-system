"use server";

import { revalidatePath } from "next/cache";
import { fail, orNull, raisedMessage, str } from "@/lib/actions";
import { assertRole, resolveOrgScope } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { runCoachingRoutine } from "@/lib/routines";
import { CoachingRequestSchema, NewUserInput, RedemptionStatusInput, RewardInput, UpdateUserInput, type CoachingOutput } from "@/lib/schemas";
import { provisionUser } from "@/lib/provision";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AppError, type ActionResult } from "@/lib/utils";

type NewUserResult = ActionResult<{ tempPassword: string; email: string }>;

/** Creates a crew member in the admin's organization. Returns a one-time temporary password (shown once, never stored). */
export async function addUser(_p: NewUserResult | null, fd: FormData): Promise<NewUserResult> {
  try {
    const actor = await assertRole("org_admin", "super_admin");
    const orgId = resolveOrgScope(actor, str(fd, "organization_id") || undefined);
    const input = NewUserInput.parse({
      email: str(fd, "email").toLowerCase(),
      full_name: str(fd, "full_name"),
      team: str(fd, "team"),
      operational_category: orNull(str(fd, "operational_category")),
      gender: orNull(str(fd, "gender")),
    });
    const { userId, tempPassword } = await provisionUser({
      email: input.email,
      fullName: input.full_name,
      role: "end_user",
      organizationId: orgId,
      team: input.team,
      operationalCategory: input.operational_category,
      gender: input.gender,
    });
    await audit(actor.id, "user.created", { type: "user", id: userId }, { organization_id: orgId }, { critical: true });
    revalidatePath("/admin/users");
    return { ok: true, message: "User created. Share the temporary password securely; it is shown only once.", data: { tempPassword, email: input.email } };
  } catch (err) {
    return fail<{ tempPassword: string; email: string }>(err, "admin");
  }
}

export async function updateUser(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await assertRole("org_admin", "super_admin");
    const input = UpdateUserInput.parse({
      user_id: str(fd, "user_id"),
      team: str(fd, "team"),
      operational_category: orNull(str(fd, "operational_category")),
      gender: orNull(str(fd, "gender")),
    });
    const supabase = await createClient(); // RLS: org admins can only update end_users in their org
    const { data, error } = await supabase
      .from("users")
      .update({ team: input.team || null, operational_category: input.operational_category, gender: input.gender })
      .eq("id", input.user_id)
      .select("id")
      .maybeSingle();
    if (error) throw new AppError("UPDATE_FAILED", "Could not update user");
    if (!data) throw new AppError("NOT_FOUND", "User not found in your organization");
    await audit(actor.id, "user.updated", { type: "user", id: input.user_id });
    revalidatePath("/admin/users");
    return { ok: true, message: "Saved." };
  } catch (err) {
    return fail(err, "admin");
  }
}

export async function createReward(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await assertRole("org_admin", "super_admin");
    const orgId = resolveOrgScope(actor, str(fd, "organization_id") || undefined);
    const input = RewardInput.parse({
      title: str(fd, "title"),
      description: str(fd, "description"),
      cost_in_credits: str(fd, "cost_in_credits"),
      inventory_count: str(fd, "inventory_count") === "" ? -1 : str(fd, "inventory_count"),
    });
    const supabase = actor.role === "super_admin" ? createAdminClient() : await createClient();
    const { error } = await supabase.from("organization_rewards").insert({ ...input, organization_id: orgId, created_by: actor.id });
    if (error) throw new AppError("CREATE_FAILED", "Could not create reward");
    revalidatePath("/admin/rewards");
    return { ok: true, message: "Reward published." };
  } catch (err) {
    return fail(err, "admin");
  }
}

export async function toggleReward(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await assertRole("org_admin", "super_admin");
    const id = str(fd, "reward_id");
    const active = str(fd, "is_active") === "true";
    const supabase = actor.role === "super_admin" ? createAdminClient() : await createClient();
    const { data, error } = await supabase.from("organization_rewards").update({ is_active: active }).eq("id", id).select("id").maybeSingle();
    if (error) throw new AppError("UPDATE_FAILED", "Could not update reward");
    if (!data) throw new AppError("NOT_FOUND", "Reward not found in your organization");
    revalidatePath("/admin/rewards");
    return { ok: true };
  } catch (err) {
    return fail(err, "admin");
  }
}

export async function setRedemptionStatus(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await assertRole("org_admin", "super_admin");
    const input = RedemptionStatusInput.parse({ redemption_id: str(fd, "redemption_id"), status: str(fd, "status") });
    const supabase = actor.role === "super_admin" ? createAdminClient() : await createClient();
    const { data, error } = await supabase.from("reward_redemptions").update({ status: input.status }).eq("id", input.redemption_id).select("id").maybeSingle();
    if (error) {
      if (raisedMessage(error) === "REDEMPTION_ALREADY_FINAL") throw new AppError("FINAL", "This redemption is already final");
      throw new AppError("UPDATE_FAILED", "Could not update redemption");
    }
    if (!data) throw new AppError("NOT_FOUND", "Redemption not found");
    await audit(actor.id, `redemption.${input.status}`, { type: "reward_redemption", id: input.redemption_id });
    revalidatePath("/admin/rewards");
    return { ok: true };
  } catch (err) {
    return fail(err, "admin");
  }
}

export type CoachingResult = ActionResult<{ sessionId: string; output: CoachingOutput; model: string }>;

export async function generateCoaching(_p: CoachingResult | null, fd: FormData): Promise<CoachingResult> {
  try {
    const actor = await assertRole("org_admin", "super_admin");
    const input = CoachingRequestSchema.parse({
      employeeUserId: str(fd, "employeeUserId"),
      context: { scenario: str(fd, "scenario"), aircraft: "", phase: str(fd, "phase"), notes: str(fd, "notes") },
    });
    const result = await runCoachingRoutine(actor, input);
    return { ok: true, data: result };
  } catch (err) {
    return fail<{ sessionId: string; output: CoachingOutput; model: string }>(err, "admin");
  }
}
