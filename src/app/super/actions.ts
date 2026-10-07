"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, raisedMessage, str } from "@/lib/actions";
import { DEMO_PERSONA_A, DEMO_PERSONA_B } from "@/lib/ai/fixtures";
import { generateRoutineInsight } from "@/lib/ai/generate";
import { assertRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { enforceModelBudget } from "@/lib/rate-limit";
import { FAMILY_ROUTINE, LinkProfileInput, PROMPT_FAMILIES, PromptInput, RulesBatchInput, TiersBatchInput, type PromptFamily, type RoutineOutput } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, ROUTINE_LABELS, type ActionResult } from "@/lib/utils";
import { provisionUser } from "@/lib/provision";

/* ---------------- Identity mapping wall ---------------- */
export async function linkProfile(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await assertRole("super_admin");
    const input = LinkProfileInput.parse({ user_id: str(fd, "user_id"), profile_id: str(fd, "profile_id") });
    const admin = createAdminClient();
    const { error } = await admin.rpc("admin_wall_link_profile", { p_user_id: input.user_id, p_profile_id: input.profile_id, p_actor: actor.id, p_method: "manual" });
    if (error) {
      console.error("[wall] link failed", error);
      if (raisedMessage(error) === "ORG_MISMATCH") throw new AppError("ORG_MISMATCH", "User and profile belong to different organizations");
      if (error.code === "23505") throw new AppError("ALREADY_LINKED", "User or profile is already linked");
      throw new AppError("LINK_FAILED", "Could not link");
    }
    revalidatePath("/super/mapping");
    return { ok: true, message: "Linked." };
  } catch (err) {
    return fail(err, "super");
  }
}

export async function unlinkProfile(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await assertRole("super_admin");
    const userId = z.guid().parse(str(fd, "user_id"));
    const admin = createAdminClient();
    const { error } = await admin.rpc("admin_wall_unlink_profile", { p_user_id: userId, p_actor: actor.id });
    if (error) {
      console.error("[wall] unlink failed", error);
      throw new AppError("UNLINK_FAILED", raisedMessage(error) === "NOT_LINKED" ? "User is not linked" : "Could not unlink");
    }
    revalidatePath("/super/mapping");
    return { ok: true, message: "Unlinked." };
  } catch (err) {
    return fail(err, "super");
  }
}

export async function autoMatch(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await assertRole("super_admin");
    const orgId = z.guid().parse(str(fd, "organization_id"));
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("admin_wall_auto_match", { p_org_id: orgId, p_actor: actor.id });
    if (error) {
      console.error("[wall] auto-match failed", error);
      throw new AppError("AUTO_MATCH_FAILED", "Auto-match failed");
    }
    revalidatePath("/super/mapping");
    return { ok: true, message: `Auto-match linked ${data} profile(s) by candidate email.` };
  } catch (err) {
    return fail(err, "super");
  }
}

/* ---------------- System prompts (atomic + audited in SQL) ---------------- */
export async function createPromptVersion(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await assertRole("super_admin");
    const input = PromptInput.parse({
      routine_type: str(fd, "routine_type"),
      content: str(fd, "content"),
      notes: str(fd, "notes"),
      activate: str(fd, "activate") === "on",
    });
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("admin_create_prompt_version", {
      p_family: input.routine_type,
      p_content: input.content,
      p_notes: input.notes,
      p_activate: input.activate,
      p_actor: actor.id,
    });
    if (error) {
      console.error("[prompts] create failed", error);
      throw new AppError("SAVE_FAILED", "Could not save the prompt");
    }
    const version = (data as { version?: number } | null)?.version;
    revalidatePath("/super/prompts");
    return { ok: true, message: `Saved ${input.routine_type} v${version}${input.activate ? " and activated." : "."}` };
  } catch (err) {
    return fail(err, "super");
  }
}

export async function activatePrompt(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await assertRole("super_admin");
    const id = z.guid().parse(str(fd, "prompt_id"));
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("admin_activate_prompt", { p_id: id, p_actor: actor.id });
    if (error) {
      if (raisedMessage(error) === "PROMPT_NOT_FOUND") throw new AppError("NOT_FOUND", "Prompt not found");
      console.error("[prompts] activate failed", error);
      throw new AppError("ACTIVATE_FAILED", "Could not activate");
    }
    const row = data as { family?: string; version?: number } | null;
    revalidatePath("/super/prompts");
    return { ok: true, message: `Activated ${row?.family} v${row?.version}.` };
  } catch (err) {
    return fail(err, "super");
  }
}

export type PlaygroundResult = ActionResult<{ family: PromptFamily; output: RoutineOutput; model: string }>;

/** Runs a draft prompt against two demo personas. Uses AI_MODE (mock or live). Never touches real profiles. */
export async function runPlayground(_p: PlaygroundResult | null, fd: FormData): Promise<PlaygroundResult> {
  try {
    const actor = await assertRole("super_admin");
    await enforceModelBudget("playground", actor);
    const family = z.enum(PROMPT_FAMILIES).parse(str(fd, "routine_type"));
    if (family === "normalize_report") throw new AppError("UNSUPPORTED", "Use a PDF upload to test the normaliser");
    const content = z.string().min(20).max(20000).parse(str(fd, "content"));
    const scenario = z.string().max(2000).parse(str(fd, "scenario"));
    const result = await generateRoutineInsight({
      family,
      systemPrompt: content,
      routineLabel: ROUTINE_LABELS[FAMILY_ROUTINE[family]],
      primaryPersona: DEMO_PERSONA_A,
      partnerPersona: DEMO_PERSONA_B,
      context: { scenario, aircraft: "787", phase: "Playground", notes: "" },
    });
    await audit(actor.id, "prompt.playground", null, { family, model: result.model });
    return { ok: true, data: { family, output: result.output, model: result.model } };
  } catch (err) {
    return fail<{ family: PromptFamily; output: RoutineOutput; model: string }>(err, "super");
  }
}

/* ---------------- Gamification rules (one save per table; audit is mandatory) ---------------- */
export async function updateRules(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await assertRole("super_admin");
    const keys = fd.getAll("action_type").map(String);
    const input = RulesBatchInput.parse(keys.map((k) => ({
      action_type: k,
      credits: str(fd, `credits__${k}`),
      cooldown_kind: str(fd, `kind__${k}`),
      cooldown_limit: str(fd, `limit__${k}`),
      is_active: str(fd, `active__${k}`) === "on",
    })));
    const admin = createAdminClient();
    for (const r of input) {
      const { data, error } = await admin.from("gamification_rules")
        .update({ credits: r.credits, cooldown_kind: r.cooldown_kind, cooldown_limit: r.cooldown_limit, is_active: r.is_active })
        .eq("action_type", r.action_type).select("action_type").maybeSingle();
      if (error) throw new AppError("SAVE_FAILED", `Could not save rule ${r.action_type}`);
      if (!data) throw new AppError("NOT_FOUND", `Unknown rule ${r.action_type}`);
    }
    await audit(actor.id, "rule.updated", { type: "gamification_rules", id: "batch" }, { rules: input }, { critical: true });
    revalidatePath("/super/rules");
    return { ok: true, message: `${input.length} rules saved · applied to all organizations` };
  } catch (err) {
    return fail(err, "super");
  }
}

export async function updateTiers(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await assertRole("super_admin");
    const keys = fd.getAll("tier").map(String);
    const input = TiersBatchInput.parse(keys.map((k) => ({ tier: k, min_credits: str(fd, `min__${k}`) })));
    const sorted = [...input].sort((a, b) => a.min_credits - b.min_credits).map((t) => t.tier).join(",");
    if (sorted !== "bronze,silver,gold,platinum") throw new AppError("ORDER", "Thresholds must increase from Bronze to Platinum");
    const admin = createAdminClient();
    // A statement-level trigger recomputes every stored readiness_tier after each update.
    for (const t of input) {
      const { error } = await admin.from("readiness_tiers").update({ min_credits: t.min_credits }).eq("tier", t.tier);
      if (error) throw new AppError("SAVE_FAILED", "Could not save thresholds");
    }
    await audit(actor.id, "tier.updated", { type: "readiness_tiers", id: "batch" }, { tiers: input }, { critical: true });
    revalidatePath("/super/rules");
    return { ok: true, message: "Thresholds saved · member tiers recomputed" };
  } catch (err) {
    return fail(err, "super");
  }
}

/* ---------------- Organizations ---------------- */
const OrgInput = z.object({ name: z.string().trim().min(2).max(120), slug: z.string().regex(/^[a-z0-9-]{2,64}$/) });
const OrgAdminInput = z.object({ organization_id: z.guid(), email: z.email().max(200), full_name: z.string().trim().min(1).max(120) });

export async function createOrganization(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await assertRole("super_admin");
    const input = OrgInput.parse({ name: str(fd, "name"), slug: str(fd, "slug").toLowerCase() });
    const admin = createAdminClient();
    const { data, error } = await admin.from("organizations").insert(input).select("id").single();
    if (error) throw new AppError("CREATE_FAILED", error.code === "23505" ? "Slug already in use" : "Could not create organization");
    await audit(actor.id, "organization.created", { type: "organization", id: data.id }, input, { critical: true });
    revalidatePath("/super/organizations");
    return { ok: true, message: "Organization created." };
  } catch (err) {
    return fail(err, "super");
  }
}

/** Crew canvas pilot flag per organization (organizations.canvas_enabled). */
export async function setOrgCanvas(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await assertRole("super_admin");
    const input = z.object({ organization_id: z.guid(), enabled: z.enum(["true", "false"]) }).parse({ organization_id: str(fd, "organization_id"), enabled: str(fd, "enabled") });
    const enabled = input.enabled === "true";
    const admin = createAdminClient();
    const { data, error } = await admin.from("organizations").update({ canvas_enabled: enabled }).eq("id", input.organization_id).select("id, name").maybeSingle();
    if (error || !data) throw new AppError("UPDATE_FAILED", "Could not update the organization");
    await audit(actor.id, "organization.canvas", { type: "organization", id: data.id }, { canvas_enabled: enabled });
    revalidatePath("/super/organizations");
    return { ok: true, message: `Canvas ${enabled ? "turned on" : "turned off"} for ${data.name}.` };
  } catch (err) {
    return fail(err, "super");
  }
}

type NewAdminResult = ActionResult<{ tempPassword: string; email: string }>;

export async function createOrgAdmin(_p: NewAdminResult | null, fd: FormData): Promise<NewAdminResult> {
  try {
    const actor = await assertRole("super_admin");
    const input = OrgAdminInput.parse({ organization_id: str(fd, "organization_id"), email: str(fd, "email").toLowerCase(), full_name: str(fd, "full_name") });
    const { userId, tempPassword } = await provisionUser({
      email: input.email,
      fullName: input.full_name,
      role: "org_admin",
      organizationId: input.organization_id,
    });
    await audit(actor.id, "org_admin.created", { type: "user", id: userId }, { organization_id: input.organization_id }, { critical: true });
    revalidatePath("/super/organizations");
    return { ok: true, message: "Organization admin created. Share the temporary password securely.", data: { tempPassword, email: input.email } };
  } catch (err) {
    return fail<{ tempPassword: string; email: string }>(err, "super");
  }
}
