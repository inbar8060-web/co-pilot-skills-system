import "server-only";
import { getActivePrompt, type ActivePrompt } from "@/lib/ai/prompts";
import { normalizeReport } from "@/lib/ai/generate";
import { audit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth";
import { awardCredits, type AwardResult } from "@/lib/gamification";
import { extractPdfText, looksLikePsychometricReport } from "@/lib/pdf";
import { enforceModelBudget } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/utils";

export interface IngestResult {
  code: string;
  framework: string;
  confidence: string;
  pages: number;
  credits?: AwardResult | null;
}

export interface IngestOptions {
  organizationId: string;
  linkToSelf: boolean;
  /** Pre-fetched normaliser prompt (batch callers load it once). */
  prompt?: ActivePrompt;
}

/** Parse -> pre-screen -> normalise -> store behind the wall. `linkToSelf` is the end-user path; batch is the org-admin path. */
export async function ingestReport(actor: CurrentUser, file: File, options: IngestOptions): Promise<IngestResult> {
  await enforceModelBudget("ingest", actor);

  const { text, pages } = await extractPdfText(file);
  // Refuse obvious non-reports before paying for a model call.
  if (!looksLikePsychometricReport(text)) {
    throw new AppError("REPORT_NOT_VALID", "The document does not look like an MBTI / ADAPT report.", 422);
  }
  const prompt = options.prompt ?? (await getActivePrompt("normalize_report"));
  const { output } = await normalizeReport(text, prompt.content);

  if (!output.persona.is_valid_report || output.persona.confidence === "low") {
    throw new AppError(
      "REPORT_NOT_VALID",
      "The document could not be validated as an MBTI / ADAPT report. Upload the complete original report.",
      422,
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_wall_ingest_profile", {
    p_org_id: options.organizationId,
    p_uploaded_by: actor.id,
    p_framework: output.persona.framework,
    p_raw: { text_length: text.length, pages, candidate_identity: output.candidate_identity, file_name: file.name } as never,
    p_normalized: output.persona as never,
    p_link_user_id: options.linkToSelf ? actor.id : undefined,
    p_method: options.linkToSelf ? "self" : "manual",
  });
  if (error) {
    // 23505 on the (explicitly named) one-mapping-per-user constraint: a report is already linked.
    if (error.code === "23505" && error.message.includes("user_profile_mappings_user_id_key")) {
      throw new AppError("ALREADY_LINKED", "A report is already linked to this account", 409);
    }
    console.error("[reports] ingest failed", error);
    throw new AppError("INGEST_FAILED", "Could not store the report", 500);
  }
  const row = data as { code?: string; id?: string };
  const code = row.code ?? "";

  let credits: AwardResult | null = null;
  if (options.linkToSelf) {
    credits = await awardCredits(actor.id, "report_verified", { code });
  }
  await audit(actor.id, options.linkToSelf ? "report.self_uploaded" : "report.batch_ingested", { type: "anonymous_profile", id: row.id ?? "" }, {
    framework: output.persona.framework,
    pages,
  });

  return { code, framework: output.persona.framework, confidence: output.persona.confidence, pages, credits };
}

/** Run `fn` over items with at most `limit` in flight; results keep input order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
