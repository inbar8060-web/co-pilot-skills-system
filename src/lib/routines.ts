import "server-only";
import { getActivePrompt, type ActivePrompt } from "@/lib/ai/prompts";
import { generateRoutineInsight, type GenerationResult } from "@/lib/ai/generate";
import { audit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth";
import { awardCredits, type AwardResult } from "@/lib/gamification";
import { enforceModelBudget } from "@/lib/rate-limit";
import {
  PersonaSchema,
  promptFamilyFor,
  type CoachingOutput,
  type CrewRoutine,
  type Persona,
  type RoutineOutput,
  type RoutineType,
  type ScenarioContext,
} from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, ROUTINE_LABELS } from "@/lib/utils";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface RoutineRun {
  sessionId: string;
  routineType: string;
  output: RoutineOutput;
  model: string;
  credits: AwardResult | null;
}

export interface LoadedPersona {
  persona: Persona;
  code: string;
  framework: string;
  linkedAt: string | null;
  method: string | null;
}

/** Loads the persona behind the wall for a user, or null when no report is linked. */
export async function loadPersona(userId: string): Promise<LoadedPersona | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_wall_get_profile_for_user", { p_user_id: userId });
  if (error) throw new AppError("WALL_LOOKUP_FAILED", "Could not load profile", 500);
  if (!data || typeof data !== "object") return null;
  const row = data as { persona?: unknown; code?: string; framework?: string; linked_at?: string; method?: string };
  const persona = PersonaSchema.safeParse(row.persona);
  if (!persona.success) throw new AppError("PERSONA_INVALID", "Stored persona is malformed", 500);
  return {
    persona: persona.data,
    code: row.code ?? "",
    framework: row.framework ?? "",
    linkedAt: row.linked_at ?? null,
    method: row.method ?? null,
  };
}

async function loadPartner(admin: AdminClient, partnerId: string, orgId: string) {
  const { data: partner } = await admin
    .from("users")
    .select("id, organization_id, role, has_active_report")
    .eq("id", partnerId)
    .maybeSingle();
  if (!partner || partner.organization_id !== orgId || partner.role !== "end_user") {
    throw new AppError("PARTNER_NOT_FOUND", "Partner must be a crew member in your organization", 404);
  }
  if (!partner.has_active_report) {
    throw new AppError("NO_ACTIVE_REPORT_PARTNER", "Your partner has no verified report yet", 409);
  }
  const { data: prefs } = await admin
    .from("user_preferences_and_consent")
    .select("sharing_level, allowed_scenarios")
    .eq("user_id", partnerId)
    .maybeSingle();
  return { partner, prefs };
}

async function saveSession(
  admin: AdminClient,
  row: {
    organizationId: string;
    routineCode: RoutineType;
    primaryUserId: string;
    partnerUserId: string | null;
    context: ScenarioContext;
    prompt: ActivePrompt;
    result: GenerationResult<RoutineOutput>;
  },
): Promise<string> {
  const { data: session, error } = await admin
    .from("routine_sessions")
    .insert({
      organization_id: row.organizationId,
      routine_code: row.routineCode,
      primary_user_id: row.primaryUserId,
      partner_user_id: row.partnerUserId,
      scenario_context: row.context,
      ai_generated_output: row.result.output,
      model: row.result.model,
      prompt_version: row.prompt.version,
      input_tokens: row.result.inputTokens,
      output_tokens: row.result.outputTokens,
    })
    .select("id")
    .single();
  if (error || !session) throw new AppError("SESSION_SAVE_FAILED", "Could not save the session", 500);
  return session.id;
}

/** Crew routines (simulator / flight / debrief) for an end user, optionally with a consenting partner. */
export async function runCrewRoutine(
  user: CurrentUser,
  input: { routineType: CrewRoutine; partnerUserId: string | null; context: ScenarioContext },
): Promise<RoutineRun> {
  if (!user.organizationId) throw new AppError("NO_ORGANIZATION", "You are not assigned to an organization", 400);
  await enforceModelBudget("routine", user);

  const primary = await loadPersona(user.id);
  if (!primary) throw new AppError("NO_ACTIVE_REPORT_PRIMARY", "Load and verify your report before generating routines", 409);

  const admin = createAdminClient();
  let partnerPersona: Persona | null = null;

  if (input.partnerUserId) {
    if (input.partnerUserId === user.id) throw new AppError("PARTNER_IS_SELF", "Choose a different crew member", 400);
    const { prefs } = await loadPartner(admin, input.partnerUserId, user.organizationId);
    if (prefs?.sharing_level === "level_0_private") {
      throw new AppError("PARTNER_PRIVATE", "Your partner has disabled sharing", 403);
    }
    if (prefs && !prefs.allowed_scenarios.includes(input.routineType)) {
      throw new AppError("SCENARIO_NOT_ALLOWED", "Your partner does not share for this routine type", 403);
    }
    // valid_until is stamped by the consent trigger on approval: the single definition of the window.
    const { data: consent } = await admin
      .from("consent_requests")
      .select("id")
      .eq("requester_user_id", user.id)
      .eq("target_user_id", input.partnerUserId)
      .eq("routine_type", input.routineType)
      .eq("status", "approved")
      .gt("valid_until", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (!consent) throw new AppError("CONSENT_REQUIRED_OR_PENDING", "Your partner has not approved sharing for this routine", 403);
    const partner = await loadPersona(input.partnerUserId);
    if (!partner) throw new AppError("NO_ACTIVE_REPORT_PARTNER", "Your partner has no verified report yet", 409);
    partnerPersona = partner.persona;
  }

  const family = promptFamilyFor(input.routineType);
  const prompt = await getActivePrompt(family);
  const result = await generateRoutineInsight({
    family,
    systemPrompt: prompt.content,
    routineLabel: ROUTINE_LABELS[input.routineType] ?? input.routineType,
    primaryPersona: primary.persona,
    partnerPersona,
    context: input.context,
  });

  const sessionId = await saveSession(admin, {
    organizationId: user.organizationId,
    routineCode: input.routineType,
    primaryUserId: user.id,
    partnerUserId: input.partnerUserId,
    context: input.context,
    prompt,
    result,
  });

  const credits = await awardCredits(user.id, "synergy_brief", { session_id: sessionId, routine: input.routineType });
  await audit(user.id, "routine.generated", { type: "routine_session", id: sessionId }, {
    routine: input.routineType,
    partner: Boolean(input.partnerUserId),
    model: result.model,
  });

  return { sessionId, routineType: input.routineType, output: result.output, model: result.model, credits };
}

/** Manager coaching routine: org admin (manager) -> employee in the same org. Employee's profile never leaves the server. */
export async function runCoachingRoutine(
  manager: CurrentUser,
  input: { employeeUserId: string; context: ScenarioContext },
): Promise<{ sessionId: string; output: CoachingOutput; model: string }> {
  if (!manager.organizationId) throw new AppError("NO_ORGANIZATION", "You are not assigned to an organization", 400);
  await enforceModelBudget("coaching", manager);

  const admin = createAdminClient();
  const { prefs } = await loadPartner(admin, input.employeeUserId, manager.organizationId);
  if (prefs?.sharing_level === "level_0_private") {
    throw new AppError("EMPLOYEE_PRIVATE", "This employee has disabled sharing", 403);
  }
  const employee = await loadPersona(input.employeeUserId);
  if (!employee) throw new AppError("NO_ACTIVE_REPORT_PARTNER", "Employee has no verified report", 409);

  // Manager persona is optional: fall back to a neutral persona if the manager has no report.
  const managerProfile = await loadPersona(manager.id);
  const managerPersona: Persona = managerProfile?.persona ?? NEUTRAL_MANAGER_PERSONA;

  const prompt = await getActivePrompt("coaching");
  const result = await generateRoutineInsight({
    family: "coaching",
    systemPrompt: prompt.content,
    routineLabel: ROUTINE_LABELS.coaching,
    primaryPersona: managerPersona,
    partnerPersona: employee.persona,
    context: input.context,
  });

  const sessionId = await saveSession(admin, {
    organizationId: manager.organizationId,
    routineCode: "coaching",
    primaryUserId: manager.id,
    partnerUserId: input.employeeUserId,
    context: input.context,
    prompt,
    result,
  });

  await audit(manager.id, "coaching.generated", { type: "routine_session", id: sessionId }, { employee: input.employeeUserId });
  return { sessionId, output: result.output as CoachingOutput, model: result.model };
}

const NEUTRAL_MANAGER_PERSONA: Persona = {
  framework: "Custom",
  type_code: null,
  summary: "No manager profile on file. Assume a balanced, direct communication style.",
  dimensions: null,
  communication_style: "Direct and balanced.",
  decision_making_style: "Evidence-based.",
  stress_response: "Neutral.",
  conflict_style: "Addresses issues promptly.",
  leadership_style: "Balanced.",
  strengths: [],
  watch_outs: [],
  feedback_preferences: [],
  confidence: "low",
  is_valid_report: false,
};
