import { NextResponse } from "next/server";
import { z } from "zod";
import { getActivePrompt } from "@/lib/ai/prompts";
import { errorResponse } from "@/lib/api";
import { assertRole, resolveOrgScope } from "@/lib/auth";
import { ingestReport, mapWithConcurrency } from "@/lib/reports";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/utils";

export const dynamic = "force-dynamic";
// Batch mode runs up to MAX_BATCH_FILES normalisations with bounded concurrency; give it headroom.
// Honoured on Vercel; Netlify ignores it (hard 60 s), which is why the uploaders send one file per request.
export const maxDuration = 300;

const MAX_BATCH_FILES = 10;
const BATCH_CONCURRENCY = 3;

/**
 * POST /api/reports/upload (multipart/form-data)
 *  - mode=self  : end user uploads their own report; it is linked to them and credits are awarded.
 *  - mode=batch : org admin uploads N reports; they are stored anonymously (codes only) for Super Admin mapping.
 */
export async function POST(req: Request) {
  try {
    const user = await assertRole("end_user", "org_admin", "super_admin");
    const form = await req.formData().catch(() => {
      throw new AppError("INVALID_FORM", "Expected multipart/form-data", 400);
    });
    const mode = form.get("mode") === "batch" ? "batch" : "self";
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new AppError("NO_FILE", "Attach at least one PDF", 400);

    if (mode === "self") {
      if (user.hasActiveReport) throw new AppError("ALREADY_LINKED", "A verified report is already linked to your account", 409);
      if (!user.organizationId) throw new AppError("NO_ORGANIZATION", "You are not assigned to an organization", 400);
      const result = await ingestReport(user, files[0], { organizationId: user.organizationId, linkToSelf: true });
      return NextResponse.json({ success: true, result }, { headers: { "cache-control": "no-store" } });
    }

    if (user.role === "end_user") throw new AppError("FORBIDDEN", "Batch ingestion is for organization admins", 403);
    if (files.length > MAX_BATCH_FILES) throw new AppError("TOO_MANY_FILES", `At most ${MAX_BATCH_FILES} files per batch`, 400);

    // Validate the target organization before any parsing or model spend.
    const requested = form.get("organizationId");
    const orgId = resolveOrgScope(user, typeof requested === "string" && z.guid().safeParse(requested).success ? requested : undefined);
    const { data: org } = await createAdminClient().from("organizations").select("id").eq("id", orgId).maybeSingle();
    if (!org) throw new AppError("ORG_NOT_FOUND", "Organization not found", 404);

    const prompt = await getActivePrompt("normalize_report");
    const results = await mapWithConcurrency(files, BATCH_CONCURRENCY, async (file) => {
      try {
        const r = await ingestReport(user, file, { organizationId: orgId, linkToSelf: false, prompt });
        return { file: file.name, ok: true as const, code: r.code, framework: r.framework };
      } catch (err) {
        return { file: file.name, ok: false as const, error: err instanceof AppError ? err.message : "Failed" };
      }
    });
    return NextResponse.json({ success: true, results }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
