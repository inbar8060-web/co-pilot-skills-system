"use server";

import { revalidatePath } from "next/cache";
import { fail, list, raisedMessage, str } from "@/lib/actions";
import { assertRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { awardCredits } from "@/lib/gamification";
import {
  ConsentRequestInput,
  ConsentRespondInput,
  PasswordChangeInput,
  PreferencesInput,
  ProfileInput,
  ReflectionInput,
} from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { AppError, isoWeekKey, type ActionResult } from "@/lib/utils";

const CONSENT_ERRORS: Record<string, string> = {
  CONSENT_EXPIRED: "This request has expired. Ask your partner to send a new one.",
  CONSENT_NOT_ALLOWED_BY_PREFERENCES: "Your privacy settings do not allow sharing for this routine. Update them first.",
  CONSENT_ALREADY_RESOLVED: "This request was already answered.",
};

const REDEEM_ERRORS: Record<string, string> = {
  INSUFFICIENT_CREDITS: "Not enough credits for this reward.",
  OUT_OF_STOCK: "This reward is out of stock.",
  REWARD_UNAVAILABLE: "This reward is not available.",
};

export async function createConsentRequest(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    // Only crew members pair up for Blind Synergy; managers use the coaching tool instead.
    const user = await assertRole("end_user");
    if (!user.organizationId) throw new AppError("NO_ORGANIZATION", "You are not assigned to an organization");
    const input = ConsentRequestInput.parse({ targetUserId: str(fd, "targetUserId"), routineType: str(fd, "routineType") });
    if (input.targetUserId === user.id) throw new AppError("SELF", "Choose a different crew member");
    const supabase = await createClient();
    // Keep the DB consistent with what the UI shows before the unique-pending index is evaluated.
    await supabase.rpc("expire_stale_consents");
    const { error } = await supabase.from("consent_requests").insert({
      organization_id: user.organizationId,
      requester_user_id: user.id,
      target_user_id: input.targetUserId,
      routine_type: input.routineType,
    });
    if (error) {
      if (error.code === "23505") throw new AppError("DUPLICATE", "A pending request for this partner and routine already exists");
      if (error.code === "42501") throw new AppError("NOT_ALLOWED", "This crew member does not share for that routine, or is not eligible");
      throw new AppError("INSERT_FAILED", "Could not send the request");
    }
    revalidatePath("/app/consents");
    revalidatePath("/app");
    return { ok: true, message: "Request sent. Your partner will see it in their inbox." };
  } catch (err) {
    return fail(err);
  }
}

export async function respondToConsent(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await assertRole("end_user");
    const input = ConsentRespondInput.parse({ requestId: str(fd, "requestId"), decision: str(fd, "decision") });
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("consent_requests")
      .update({ status: input.decision })
      .eq("id", input.requestId)
      .eq("target_user_id", user.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();
    if (error) {
      const raised = raisedMessage(error);
      throw new AppError(raised ?? "UPDATE_FAILED", (raised && CONSENT_ERRORS[raised]) ?? "Could not update the request");
    }
    if (!data) throw new AppError("NOT_FOUND", "Request is no longer pending (it may have expired)");
    if (input.decision === "approved") await awardCredits(user.id, "consent_given", { request_id: input.requestId });
    await audit(user.id, `consent.${input.decision}`, { type: "consent_request", id: input.requestId });
    revalidatePath("/app/consents");
    revalidatePath("/app");
    return { ok: true, message: input.decision === "approved" ? "Approved. Blind Synergy is now enabled for this routine." : "Declined." };
  } catch (err) {
    return fail(err);
  }
}

export async function savePreferences(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await assertRole("end_user", "org_admin", "super_admin");
    const input = PreferencesInput.parse({
      sharing_level: str(fd, "sharing_level"),
      allowed_scenarios: list(fd, "allowed_scenarios"),
      notification_frequency: str(fd, "notification_frequency"),
      notification_focus: list(fd, "notification_focus"),
      max_notifications_per_week: str(fd, "max_notifications_per_week"),
      quiet_hours_start: str(fd, "quiet_hours_start") || null,
      quiet_hours_end: str(fd, "quiet_hours_end") || null,
    });
    const supabase = await createClient();
    const { error } = await supabase.from("user_preferences_and_consent").upsert({ user_id: user.id, ...input });
    if (error) throw new AppError("SAVE_FAILED", "Could not save preferences");
    revalidatePath("/app/settings");
    return { ok: true, message: "Preferences saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function saveProfile(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await assertRole("end_user", "org_admin", "super_admin");
    const input = ProfileInput.parse({ full_name: str(fd, "full_name") });
    const supabase = await createClient();
    const { error } = await supabase.from("users").update({ full_name: input.full_name }).eq("id", user.id);
    if (error) throw new AppError("SAVE_FAILED", "Could not save profile");
    revalidatePath("/app", "layout");
    return { ok: true, message: "Profile saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function changePassword(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    await assertRole("end_user", "org_admin", "super_admin");
    const input = PasswordChangeInput.parse({ password: str(fd, "password") });
    if (input.password !== str(fd, "confirm")) throw new AppError("MISMATCH", "Passwords do not match");
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) throw new AppError("PASSWORD_FAILED", error.message);
    return { ok: true, message: "Password updated." };
  } catch (err) {
    return fail(err);
  }
}

export async function submitReflection(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await assertRole("end_user", "org_admin", "super_admin");
    const input = ReflectionInput.parse({
      session_id: str(fd, "session_id") || null,
      routine_type: str(fd, "routine_type"),
      what_worked: str(fd, "what_worked"),
      what_to_change: str(fd, "what_to_change"),
    });
    const supabase = await createClient();
    const { error } = await supabase.from("reflections").insert({ user_id: user.id, ...input });
    if (error) throw new AppError("SAVE_FAILED", "Could not save the reflection");
    const credits = await awardCredits(user.id, "reflection", { session_id: input.session_id });
    revalidatePath("/app");
    return {
      ok: true,
      message: credits.awarded ? `Reflection saved. +${credits.credits} credits.` : "Reflection saved (daily credit already earned).",
    };
  } catch (err) {
    return fail(err);
  }
}

export async function acknowledgeInsight(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await assertRole("end_user", "org_admin", "super_admin");
    const insightId = str(fd, "insight_id");
    if (!insightId) throw new AppError("BAD_INPUT", "Missing insight");
    const supabase = await createClient();
    const { error } = await supabase
      .from("insight_acknowledgements")
      .insert({ user_id: user.id, insight_id: insightId, iso_week: isoWeekKey() });
    if (error?.code === "23505") {
      // Already confirmed this ISO week: no second insert, no second award.
      revalidatePath("/app");
      revalidatePath("/app/insights");
      return { ok: true, message: "Already confirmed this week." };
    }
    if (error) throw new AppError("SAVE_FAILED", "Could not record acknowledgement");
    const credits = await awardCredits(user.id, "weekly_insight_read", { insight_id: insightId });
    revalidatePath("/app");
    revalidatePath("/app/insights");
    return { ok: true, message: credits.awarded ? `Confirmed. +${credits.credits} credits.` : "Confirmed." };
  } catch (err) {
    return fail(err);
  }
}

export async function redeemReward(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await assertRole("end_user", "org_admin", "super_admin");
    const rewardId = str(fd, "reward_id");
    if (!rewardId) throw new AppError("BAD_INPUT", "Missing reward");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("redeem_reward", { p_reward_id: rewardId });
    if (error) {
      const raised = raisedMessage(error);
      throw new AppError(raised ?? "REDEEM_FAILED", (raised && REDEEM_ERRORS[raised]) ?? "Could not redeem the reward");
    }
    await audit(user.id, "reward.redeemed", { type: "reward_redemption", id: String(data) }, { reward_id: rewardId });
    revalidatePath("/app/rewards");
    revalidatePath("/app");
    return { ok: true, message: "Redemption requested. Your admin will confirm delivery." };
  } catch (err) {
    return fail(err);
  }
}
