import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------
export const ROUTINE_TYPES = ["simulator", "flight", "debrief", "training", "coaching"] as const;
export type RoutineType = (typeof ROUTINE_TYPES)[number];
export const CREW_ROUTINES = ["simulator", "flight", "debrief", "training"] as const;
export type CrewRoutine = (typeof CREW_ROUTINES)[number];
export const PROMPT_FAMILIES = ["briefing", "debrief", "coaching", "normalize_report"] as const;
export type PromptFamily = (typeof PROMPT_FAMILIES)[number];
export const FRAMEWORKS = ["MBTI_Step_I", "MBTI_Step_II", "Symbiotics_ADAPT", "Custom"] as const;
export const ROLES = ["end_user", "org_admin", "super_admin"] as const;
export type AppRole = (typeof ROLES)[number];
export const OPERATIONAL_CATEGORIES = ["military_pilot", "civilian_pilot", "management", "first_officer", "captain", "other"] as const;
export const GENDERS = ["male", "female", "other"] as const;

export function promptFamilyFor(routine: RoutineType): PromptFamily {
  if (routine === "simulator" || routine === "flight" || routine === "training") return "briefing";
  return routine;
}

/** Representative routine for each prompt family (used by the playground and card renderer). */
export const FAMILY_ROUTINE: Record<Exclude<PromptFamily, "normalize_report">, RoutineType> = {
  briefing: "flight",
  debrief: "debrief",
  coaching: "coaching",
};

/** Landing page per role. Shared by the proxy, auth guards and the login action. */
export function homeForRole(role: AppRole | undefined): string {
  if (role === "super_admin") return "/super";
  if (role === "org_admin") return "/admin";
  return "/app";
}

// ---------------------------------------------------------------------------
// Normalised persona (what lives behind the wall). Structured-output schema:
// every field required, nullable where unknown, no optionals.
// ---------------------------------------------------------------------------
export const DimensionsSchema = z.object({
  extraversion: z.number().int().min(0).max(100).nullable(),
  sensing: z.number().int().min(0).max(100).nullable(),
  thinking: z.number().int().min(0).max(100).nullable(),
  judging: z.number().int().min(0).max(100).nullable(),
});

export const PersonaSchema = z.object({
  framework: z.enum(FRAMEWORKS),
  type_code: z.string().max(12).nullable(),
  summary: z.string().max(600),
  dimensions: DimensionsSchema.nullable(),
  communication_style: z.string().max(400),
  decision_making_style: z.string().max(400),
  stress_response: z.string().max(400),
  conflict_style: z.string().max(400),
  leadership_style: z.string().max(400),
  strengths: z.array(z.string().max(120)).max(8),
  watch_outs: z.array(z.string().max(120)).max(8),
  feedback_preferences: z.array(z.string().max(120)).max(8),
  confidence: z.enum(["high", "medium", "low"]),
  is_valid_report: z.boolean(),
});
export type Persona = z.infer<typeof PersonaSchema>;

/** Output of the report normaliser: persona + identity hints (hints stay behind the wall). */
export const NormalizedReportSchema = z.object({
  persona: PersonaSchema,
  candidate_identity: z.object({
    name: z.string().max(120).nullable(),
    email: z.string().max(200).nullable(),
  }),
});
export type NormalizedReport = z.infer<typeof NormalizedReportSchema>;

/** What an end user is allowed to see about their own profile (no identity hints). */
export const PersonaSummarySchema = PersonaSchema.omit({ is_valid_report: true });

// ---------------------------------------------------------------------------
// AI outputs per routine family
// ---------------------------------------------------------------------------
export const BriefingOutputSchema = z.object({
  synergy_area: z.object({
    title: z.string().max(120),
    points: z.array(z.string().max(240)).min(1).max(5),
  }),
  threat_points: z.array(z.object({
    threat: z.string().max(240),
    countermeasure: z.string().max(240),
  })).min(1).max(5),
  briefing_dos_and_donts: z.object({
    dos: z.array(z.string().max(200)).min(1).max(6),
    donts: z.array(z.string().max(200)).min(1).max(6),
  }),
  challenge_response_trigger: z.object({
    trigger_phrase: z.string().max(120),
    expected_response: z.string().max(240),
    when_to_use: z.string().max(240),
  }),
});
export type BriefingOutput = z.infer<typeof BriefingOutputSchema>;

export const DebriefOutputSchema = z.object({
  mental_model_alignment: z.object({
    summary: z.string().max(400),
    gaps: z.array(z.string().max(240)).min(1).max(5),
  }),
  stress_impact: z.object({
    summary: z.string().max(400),
    communication_effects: z.array(z.string().max(240)).min(1).max(5),
  }),
  actionable_behavioural_lesson: z.object({
    lesson: z.string().max(300),
    cue: z.string().max(200),
    next_flight_action: z.string().max(240),
  }),
});
export type DebriefOutput = z.infer<typeof DebriefOutputSchema>;

export const CoachingOutputSchema = z.object({
  feedback_reception_profile: z.object({
    summary: z.string().max(400),
    sensitivity_points: z.array(z.string().max(240)).min(1).max(5),
  }),
  language_adaptation: z.object({
    dos: z.array(z.object({ guideline: z.string().max(160), example: z.string().max(240) })).min(1).max(5),
    donts: z.array(z.object({ guideline: z.string().max(160), example: z.string().max(240) })).min(1).max(5),
  }),
  reflection_questions: z.array(z.string().max(240)).min(2).max(6),
});
export type CoachingOutput = z.infer<typeof CoachingOutputSchema>;

export type RoutineOutput = BriefingOutput | DebriefOutput | CoachingOutput;

export function outputSchemaFor(family: PromptFamily) {
  switch (family) {
    case "briefing":
      return BriefingOutputSchema;
    case "debrief":
      return DebriefOutputSchema;
    case "coaching":
      return CoachingOutputSchema;
    default:
      throw new Error(`No routine output schema for ${family}`);
  }
}

// ---------------------------------------------------------------------------
// Request bodies / form inputs
// ---------------------------------------------------------------------------
export const ScenarioContextSchema = z.object({
  scenario: z.string().trim().max(2000).default(""),
  aircraft: z.string().trim().max(60).default(""),
  phase: z.string().trim().max(60).default(""),
  notes: z.string().trim().max(2000).default(""),
});
export type ScenarioContext = z.infer<typeof ScenarioContextSchema>;

export const GenerateInsightRequestSchema = z.object({
  routineType: z.enum(CREW_ROUTINES),
  partnerUserId: z.guid().nullable().default(null),
  context: ScenarioContextSchema.default({ scenario: "", aircraft: "", phase: "", notes: "" }),
});
export type GenerateInsightRequest = z.infer<typeof GenerateInsightRequestSchema>;

export const CoachingRequestSchema = z.object({
  employeeUserId: z.guid(),
  context: ScenarioContextSchema.default({ scenario: "", aircraft: "", phase: "", notes: "" }),
});

export const ConsentRequestInput = z.object({
  targetUserId: z.guid(),
  routineType: z.enum(CREW_ROUTINES),
});

export const ConsentRespondInput = z.object({
  requestId: z.guid(),
  decision: z.enum(["approved", "declined"]),
});

export const PreferencesInput = z.object({
  sharing_level: z.enum(["level_0_private", "level_1_blind_synergy", "level_2_full"]),
  allowed_scenarios: z.array(z.enum(CREW_ROUTINES)).max(4),
  notification_frequency: z.enum(["high", "medium", "low", "off"]),
  notification_focus: z.array(z.enum(["briefing_prep", "stress_management", "debrief_reflection"])).max(3),
  max_notifications_per_week: z.coerce.number().int().min(0).max(21),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
});

export const ProfileInput = z.object({
  full_name: z.string().trim().min(1).max(120),
});

export const ReflectionInput = z.object({
  session_id: z.guid().nullable(),
  routine_type: z.enum(["simulator", "flight", "debrief", "training"]),
  what_worked: z.string().trim().min(3).max(4000),
  what_to_change: z.string().trim().min(3).max(4000),
});

export const RewardInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  cost_in_credits: z.coerce.number().int().min(1).max(100000),
  inventory_count: z.coerce.number().int().min(-1).max(100000),
});

export const RedemptionStatusInput = z.object({
  redemption_id: z.guid(),
  status: z.enum(["approved", "delivered", "cancelled"]),
});

export const NewUserInput = z.object({
  email: z.email().max(200),
  full_name: z.string().trim().min(1).max(120),
  team: z.string().trim().max(80).default(""),
  operational_category: z.enum(OPERATIONAL_CATEGORIES).nullable(),
  gender: z.enum(GENDERS).nullable(),
});

export const UpdateUserInput = z.object({
  user_id: z.guid(),
  team: z.string().trim().max(80).default(""),
  operational_category: z.enum(OPERATIONAL_CATEGORIES).nullable(),
  gender: z.enum(GENDERS).nullable(),
});

export const LinkProfileInput = z.object({
  user_id: z.guid(),
  profile_id: z.guid(),
});

export const PromptInput = z.object({
  routine_type: z.enum(PROMPT_FAMILIES),
  content: z.string().trim().min(20).max(20000),
  notes: z.string().trim().max(500).default(""),
  activate: z.boolean().default(false),
});

export const RuleInput = z.object({
  action_type: z.string().min(1).max(60),
  credits: z.coerce.number().int().min(0).max(10000),
  cooldown_kind: z.enum(["once", "per_day", "per_week"]),
  cooldown_limit: z.coerce.number().int().min(1).max(100),
  is_active: z.boolean(),
});

export const TierInput = z.object({
  tier: z.enum(["bronze", "silver", "gold", "platinum"]),
  min_credits: z.coerce.number().int().min(0).max(1000000),
});

export const PasswordChangeInput = z.object({
  password: z.string().min(10).max(128),
});

export const ResearchFiltersSchema = z.object({
  org: z.guid().nullable().default(null),
  gender: z.enum(GENDERS).nullable().default(null),
  category: z.enum(OPERATIONAL_CATEGORIES).nullable().default(null),
});
export type ResearchFilters = z.infer<typeof ResearchFiltersSchema>;

/** Parse research filters from a query-like record, treating "" and unknown values as "all". */
export function parseResearchFilters(q: Record<string, string | undefined>): ResearchFilters {
  const pick = (schema: z.ZodType, v: string | undefined) => (v && schema.safeParse(v).success ? v : null);
  return {
    org: pick(z.guid(), q.org) as string | null,
    gender: pick(z.enum(GENDERS), q.gender) as ResearchFilters["gender"],
    category: pick(z.enum(OPERATIONAL_CATEGORIES), q.category) as ResearchFilters["category"],
  };
}

/** Batch forms from the redesigned rules page: one save for all rules, one for all tiers. */
export const RulesBatchInput = z.array(RuleInput).min(1).max(50);
export const TiersBatchInput = z.array(TierInput).min(1).max(10);
