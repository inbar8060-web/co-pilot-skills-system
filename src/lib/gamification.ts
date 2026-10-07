import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const AwardResultSchema = z.object({
  awarded: z.boolean(),
  reason: z.string().optional(),
  credits: z.number().optional(),
  balance: z.number().optional(),
  tier: z.string().optional(),
  streak_weeks: z.number().optional(),
  bonus: z.unknown().optional(),
});
export type AwardResult = z.infer<typeof AwardResultSchema>;

export type GamificationAction =
  | "report_verified"
  | "synergy_brief"
  | "weekly_insight_read"
  | "reflection"
  | "consent_given"
  | "streak_bonus";

/** Awards credits through the DB engine (rules, cooldowns, streaks, tiers are enforced there). */
export async function awardCredits(
  userId: string,
  action: GamificationAction,
  metadata: Record<string, unknown> = {},
): Promise<AwardResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_award_credits", {
    p_user_id: userId,
    p_action: action,
    p_metadata: metadata as never,
  });
  if (error) {
    console.error("[gamification] award failed", action, error);
    return { awarded: false, reason: "ERROR" };
  }
  const parsed = AwardResultSchema.safeParse(data);
  return parsed.success ? parsed.data : { awarded: false, reason: "BAD_RESPONSE" };
}
