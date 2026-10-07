/**
 * RLS / anonymity-wall integration checks against the LOCAL Supabase stack.
 * Run: npm run db:reset && npm run test:rls
 * Requires .env.local (loaded via node --env-file).
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
// DEMO_PASSWORD overrides the README password, e.g. while `npm run share` has rotated it.
const PASSWORD = process.env.DEMO_PASSWORD ?? "Copilot-Dev-2026!";
const DANA = "aaaaaaaa-0000-0000-0000-000000000003";
const YOAV = "aaaaaaaa-0000-0000-0000-000000000004";
const ORG = "11111111-1111-1111-1111-111111111111";
const ORG_ADMIN = "aaaaaaaa-0000-0000-0000-000000000002";

if (!URL || !PUB || !SECRET) {
  console.error("Missing env. Run with: node --env-file=.env.local scripts/rls-check.mjs");
  process.exit(2);
}

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function asUser(email) {
  const c = createClient(URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return c;
}

const anon = createClient(URL, PUB, { auth: { persistSession: false } });
const admin = createClient(SECRET ? URL : URL, SECRET, { auth: { persistSession: false } });
const dana = await asUser("dana.captain@skyline.local");
const yoav = await asUser("yoav.fo@skyline.local");
const orgAdmin = await asUser("admin@skyline.local");
const superAdmin = await asUser("super@copilot.local");

// --- anon --------------------------------------------------------------------
{
  const { data, error } = await anon.from("users").select("id");
  check("anon cannot read users", (data ?? []).length === 0 || Boolean(error));
  const { error: e2 } = await anon.rpc("admin_wall_get_profile_for_user", { p_user_id: DANA });
  check("anon cannot call wall functions", Boolean(e2), e2?.message);
  const { error: e3 } = await anon.rpc("redeem_reward", { p_reward_id: "00000000-0000-0000-0000-000000000000" });
  check("anon cannot call redeem_reward", Boolean(e3), e3?.message);
  const { error: e4 } = await anon.from("gamification_rules").select("action_type");
  check("anon cannot read catalog tables", Boolean(e4), e4?.message);
}

// --- end user ----------------------------------------------------------------
{
  const { data } = await dana.from("users").select("id");
  check("end user sees only own users row", data?.length === 1 && data[0].id === DANA);

  const { error } = await dana.rpc("admin_wall_get_profile_for_user", { p_user_id: YOAV });
  check("end user cannot call wall functions", Boolean(error), error?.message);

  const { error: e3 } = await dana.rpc("admin_award_credits", { p_user_id: DANA, p_action: "report_verified", p_metadata: {} });
  check("end user cannot award themselves credits", Boolean(e3), e3?.message);

  const { data: st } = await dana.from("user_gamification_status").select("user_id");
  check("end user sees only own gamification status", st?.length === 1 && st[0].user_id === DANA);

  const { error: e4 } = await dana.from("users").update({ role: "super_admin" }).eq("id", DANA);
  check("end user cannot escalate own role (column grant)", Boolean(e4), e4?.message);

  const { data: after } = await admin.from("users").select("role").eq("id", DANA).single();
  check("role unchanged after escalation attempt", after?.role === "end_user");
  if (after?.role !== "end_user") {
    console.error("ABORT: privilege escalation succeeded; later checks would be meaningless.");
    process.exit(1);
  }

  const { error: e4b } = await dana.from("users").update({ organization_id: null }).eq("id", DANA);
  check("end user cannot change own organization", Boolean(e4b), e4b?.message);

  const { error: e4c } = await dana.from("users").update({ has_active_report: true }).eq("id", DANA);
  check("end user cannot flip has_active_report", Boolean(e4c), e4c?.message);

  const { error: e5 } = await dana.from("routine_sessions").insert({ organization_id: ORG, routine_code: "flight", primary_user_id: DANA, ai_generated_output: {} });
  check("end user cannot insert routine sessions directly", Boolean(e5), e5?.message);

  const { data: prompts } = await dana.from("system_prompts").select("id");
  check("end user cannot read system prompts", (prompts ?? []).length === 0);
}

// --- consent flow ------------------------------------------------------------
{
  await admin.from("consent_requests").delete().eq("requester_user_id", DANA).eq("target_user_id", YOAV);
  const { data: created, error } = await dana.from("consent_requests").insert({ organization_id: ORG, requester_user_id: DANA, target_user_id: YOAV, routine_type: "flight" }).select("id").single();
  check("requester can create consent request", !error && Boolean(created?.id), error?.message);
  if (!created?.id) {
    console.error("ABORT: consent request could not be created; remaining consent checks skipped.");
    process.exit(1);
  }
  const { data: dir, error: dirErr } = await dana.rpc("crew_directory");
  check("crew directory lists org colleagues without emails", !dirErr && (dir ?? []).some((u) => u.id === YOAV) && !("email" in ((dir ?? [])[0] ?? {})), dirErr?.message);
  const { data: yoavRow } = await dana.from("users").select("id").eq("id", YOAV);
  check("crew member still cannot read a colleague's users row", (yoavRow ?? []).length === 0);

  const { error: forged } = await dana.from("consent_requests").insert({ organization_id: ORG, requester_user_id: YOAV, target_user_id: DANA, routine_type: "flight" });
  check("cannot create a request on behalf of someone else", Boolean(forged), forged?.message);

  const { data: selfApprove } = await dana.from("consent_requests").update({ status: "approved" }).eq("id", created.id).select("id");
  check("requester cannot approve own request", (selfApprove ?? []).length === 0);

  const { data: inbox } = await yoav.from("consent_requests").select("id").eq("target_user_id", YOAV).eq("status", "pending");
  check("target sees the pending request", (inbox ?? []).some((r) => r.id === created.id));

  const { data: approved, error: e2 } = await yoav.from("consent_requests").update({ status: "approved" }).eq("id", created.id).select("status").single();
  check("target can approve", !e2 && approved?.status === "approved", e2?.message);

  const { data: again, error: e3 } = await yoav.from("consent_requests").update({ status: "declined" }).eq("id", created.id).select("status");
  check("resolved request cannot be changed again", Boolean(e3) || (again ?? []).length === 0, e3?.message);
  const { data: still } = await admin.from("consent_requests").select("status").eq("id", created.id).single();
  check("approved consent stays approved", still?.status === "approved");
}

// --- consent hardening ----------------------------------------------------------
{
  const { error: adminReq } = await orgAdmin.from("consent_requests").insert({ organization_id: ORG, requester_user_id: "aaaaaaaa-0000-0000-0000-000000000002", target_user_id: DANA, routine_type: "flight" });
  check("org admin cannot send Blind Synergy requests", Boolean(adminReq), adminReq?.message);

  await admin.from("consent_requests").delete().eq("requester_user_id", YOAV).eq("target_user_id", DANA);
  const { data: stale } = await admin.from("consent_requests").insert({ organization_id: ORG, requester_user_id: YOAV, target_user_id: DANA, routine_type: "debrief", expires_at: new Date(Date.now() - 60_000).toISOString() }).select("id").single();
  const { data: approvedStale, error: staleErr } = await dana.from("consent_requests").update({ status: "approved" }).eq("id", stale.id).select("status");
  check("time-expired pending request cannot be approved", Boolean(staleErr) || (approvedStale ?? []).length === 0, staleErr?.message);
  const { error: tamper } = await dana.from("consent_requests").update({ status: "approved", expires_at: "2099-01-01" }).eq("id", stale.id);
  check("expires_at cannot be rewritten by the target", Boolean(tamper), tamper?.message);
  const { data: expiredCount } = await dana.rpc("expire_stale_consents");
  check("members can expire stale requests in their org", typeof expiredCount === "number" && expiredCount >= 1, String(expiredCount));

  const { data: approvedRow } = await admin.from("consent_requests").select("valid_until").eq("requester_user_id", DANA).eq("target_user_id", YOAV).eq("status", "approved").limit(1).maybeSingle();
  check("approval stamps valid_until", Boolean(approvedRow?.valid_until));

  await admin.from("user_preferences_and_consent").update({ allowed_scenarios: ["flight"] }).eq("user_id", YOAV);
  const { error: prefErr } = await dana.from("consent_requests").insert({ organization_id: ORG, requester_user_id: DANA, target_user_id: YOAV, routine_type: "simulator" });
  check("request rejected when target does not share that routine", Boolean(prefErr), prefErr?.message);
  await admin.from("user_preferences_and_consent").update({ allowed_scenarios: ["simulator", "flight", "debrief"] }).eq("user_id", YOAV);

  const { error: promptErr } = await superAdmin.rpc("admin_activate_prompt", { p_id: "00000000-0000-0000-0000-000000000000", p_actor: DANA });
  check("prompt management functions are server-only", Boolean(promptErr), promptErr?.message);
}

// --- org admin ---------------------------------------------------------------
{
  const { data } = await orgAdmin.from("users").select("id, has_active_report").eq("organization_id", ORG);
  check("org admin sees org members with report Yes/No", (data ?? []).length >= 3);

  const { error } = await orgAdmin.rpc("admin_wall_list_profiles", { p_org_id: ORG });
  check("org admin cannot call wall functions directly (server-only)", Boolean(error), error?.message);

  const { data: consents } = await orgAdmin.from("consent_requests").select("id");
  check("org admin cannot read individual consent requests", (consents ?? []).length === 0);

  // Coaching sessions the admin ran themselves are legitimately visible; nobody else's are.
  const { data: sessions } = await orgAdmin.from("routine_sessions").select("id, primary_user_id, partner_user_id");
  check("org admin cannot read other people's routine outputs", (sessions ?? []).every((r) => r.primary_user_id === ORG_ADMIN || r.partner_user_id === ORG_ADMIN));

  const { data: stats, error: e2 } = await orgAdmin.rpc("org_engagement_stats");
  check("org admin can read anonymous engagement stats", !e2 && typeof stats === "object", e2?.message);

  const { data: upd } = await orgAdmin.from("users").update({ team: "Fleet 787" }).eq("id", DANA).select("id");
  check("org admin can edit crew team", (upd ?? []).length === 1);

  const { error: e4 } = await orgAdmin.from("users").update({ role: "org_admin" }).eq("id", DANA);
  check("org admin cannot change roles", Boolean(e4), e4?.message);
}

// --- super admin (DB level: still cannot bypass the wall through the Data API) -
{
  const { error } = await superAdmin.rpc("admin_wall_list_mappings", {});
  check("super admin JWT cannot call wall functions (only server service role can)", Boolean(error), error?.message);
  const { data: audit } = await superAdmin.from("audit_log").select("id").limit(1);
  check("super admin can read audit log", Array.isArray(audit));
}

// --- service role reaches the wall -------------------------------------------
{
  const { data, error } = await admin.rpc("admin_wall_get_profile_for_user", { p_user_id: DANA });
  check("service role can read a profile through the wall function", !error && data?.code?.startsWith("PROF-"), error?.message);
  const { error: e2 } = await admin.from("anonymous_profiles").select("id");
  check("wall tables are not exposed through the Data API even to service role", Boolean(e2), e2?.message);
}

// --- reference data ships with the migration ------------------------------------
{
  const { data: prompts } = await admin.from("system_prompts").select("routine_type").eq("is_active", true);
  check("four active system prompts exist from the migration", (prompts ?? []).length === 4);
  const { data: rule } = await admin.from("gamification_rules").select("cooldown_kind").eq("action_type", "weekly_insight_read").single();
  check("weekly insight rule is per_week", rule?.cooldown_kind === "per_week");
}

// --- gamification engine -----------------------------------------------------
{
  const { data: first } = await admin.rpc("admin_award_credits", { p_user_id: DANA, p_action: "report_verified", p_metadata: {} });
  check("one-time action does not award twice", first?.awarded === false && first?.reason === "COOLDOWN", JSON.stringify(first));
  const { data: unknown } = await admin.rpc("admin_award_credits", { p_user_id: DANA, p_action: "nope", p_metadata: {} });
  check("unknown action rejected", unknown?.awarded === false && unknown?.reason === "UNKNOWN_ACTION");
  // Fresh key per run: a fixed key stays limited for the window when the suite is re-run.
  const rlKey = `test:rl:${crypto.randomUUID()}`;
  const { data: rl1 } = await admin.rpc("admin_check_rate_limit", { p_key: rlKey, p_limit: 2, p_window_seconds: 60 });
  const { data: rl2 } = await admin.rpc("admin_check_rate_limit", { p_key: rlKey, p_limit: 2, p_window_seconds: 60 });
  const { data: rl3 } = await admin.rpc("admin_check_rate_limit", { p_key: rlKey, p_limit: 2, p_window_seconds: 60 });
  check("rate limiter allows N then blocks", rl1 === true && rl2 === true && rl3 === false);
}

// --- crew canvas: saved layouts are owner-only; the org flag is server-managed --------
{
  // Keep whatever layout Dana has (the demo may be in use) and put it back afterwards.
  const { data: saved } = await admin.from("user_canvas_layouts").select("*").eq("user_id", DANA).maybeSingle();
  const { error: e1 } = await dana.from("user_canvas_layouts").upsert({ user_id: DANA, layout: { items: [] } });
  check("crew member can save own canvas layout", !e1, e1?.message);
  const { data: seen } = await yoav.from("user_canvas_layouts").select("user_id").eq("user_id", DANA);
  check("another crew member cannot read someone's layout", (seen ?? []).length === 0);
  const { data: adminSeen } = await orgAdmin.from("user_canvas_layouts").select("user_id");
  check("org admin cannot read crew layouts", (adminSeen ?? []).every((r) => r.user_id === ORG_ADMIN));
  const { error: e2 } = await yoav.from("user_canvas_layouts").insert({ user_id: DANA, layout: { items: [] } });
  check("cannot write a layout for someone else", Boolean(e2), e2?.message);
  const { error: e3 } = await anon.from("user_canvas_layouts").select("user_id");
  check("anon cannot read canvas layouts", Boolean(e3), e3?.message);
  const { error: e4 } = await dana.from("user_canvas_layouts").upsert({ user_id: DANA, layout: "not an object" });
  check("layout must be a JSON object", Boolean(e4), e4?.message);
  const { error: e5 } = await dana.from("organizations").update({ canvas_enabled: false }).eq("id", ORG);
  check("crew member cannot flip the organization canvas flag", Boolean(e5), e5?.message);
  if (saved) await admin.from("user_canvas_layouts").upsert(saved);
  else await admin.from("user_canvas_layouts").delete().eq("user_id", DANA);
}

console.log(failures === 0 ? "\nAll RLS checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
