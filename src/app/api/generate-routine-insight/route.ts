import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { assertRole } from "@/lib/auth";
import { runCrewRoutine } from "@/lib/routines";
import { GenerateInsightRequestSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";
// Honoured on Vercel; Netlify ignores it (hard 60 s), so live AI there needs a fast model/effort.
export const maxDuration = 120;

/**
 * POST /api/generate-routine-insight
 * Body: { routineType: 'simulator'|'flight'|'debrief', partnerUserId?: uuid|null, context?: {...} }
 * The system prompt is never accepted from the client; it is resolved server-side.
 */
export async function POST(req: Request) {
  try {
    const user = await assertRole("end_user", "org_admin", "super_admin");
    const body = GenerateInsightRequestSchema.parse(await readJson(req));
    const run = await runCrewRoutine(user, body);
    return NextResponse.json({ success: true, result: run }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
