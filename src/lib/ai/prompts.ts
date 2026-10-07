import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PromptFamily } from "@/lib/schemas";
import { AppError } from "@/lib/utils";

export interface ActivePrompt {
  id: string;
  version: number;
  content: string;
}

/** Active system prompt for a routine family (seeded from the PRD, editable by Super Admins). */
export async function getActivePrompt(family: PromptFamily): Promise<ActivePrompt> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("system_prompts")
    .select("id, version, content")
    .eq("routine_type", family)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new AppError("PROMPT_LOOKUP_FAILED", "Could not load system prompt", 500);
  if (!data) throw new AppError("PROMPT_MISSING", `No active system prompt for ${family}`, 500);
  return data;
}
