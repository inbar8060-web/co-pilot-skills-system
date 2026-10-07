import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Liveness + database reachability (bounded, so a hung DB reports 503 instead of hanging). No secrets, no user data. */
export async function GET() {
  const startedAt = Date.now();
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("readiness_tiers").select("tier").limit(1).abortSignal(AbortSignal.timeout(3000));
    if (error) throw error;
    return NextResponse.json({ status: "ok", db: "ok", latencyMs: Date.now() - startedAt }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[health] db check failed", err);
    return NextResponse.json({ status: "degraded", db: "unreachable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
