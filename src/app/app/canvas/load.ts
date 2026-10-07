import "server-only";
import { outputCards, outputToText } from "@/components/insight-cards";
import type { CurrentUser } from "@/lib/auth";
import { effectiveStreak, tierProgress } from "@/lib/gamification-shared";
import { loadConsentedPartners } from "@/lib/partners";
import { loadPersona } from "@/lib/routines";
import { CREW_ROUTINES } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { firstName, humanize, isoWeekKey, isoWeekNumber, relativeDay, ROUTINE_SHORT, sessionTitle, shortName, tierShort, weekIndex } from "@/lib/utils";
import type { CanvasData } from "./types";

const LINK_METHOD: Record<string, string> = { self: "uploaded by you", auto: "matched automatically", manual: "linked by an administrator" };

function weekStartIso(now: Date): string {
  const day = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day)).toISOString();
}

/** Everything the crew canvas shows, in one round of parallel queries (all through the user's RLS client). */
export async function loadCanvasData(user: CurrentUser): Promise<CanvasData> {
  const supabase = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const isCrew = user.role === "end_user";

  const [
    statusRes, tiersRes, rulesRes, sessionsRes, countRes, latestRes, insightRes, ackRes, partners,
    incomingRes, outgoingRes, directoryRes, weekLogsRes, rewardsRes, orgRes, persona,
  ] = await Promise.all([
    supabase.from("user_gamification_status").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("readiness_tiers").select("*").order("sort_order"),
    supabase.from("gamification_rules").select("action_type, credits").in("action_type", ["reflection", "weekly_insight_read", "consent_given"]),
    supabase.from("routine_sessions").select("id, routine_code, created_at, partner_user_id, scenario_context").eq("primary_user_id", user.id).neq("routine_code", "coaching").order("created_at", { ascending: false }).limit(8),
    supabase.from("routine_sessions").select("id", { count: "exact", head: true }).eq("primary_user_id", user.id).neq("routine_code", "coaching"),
    supabase.from("routine_sessions").select("id, routine_code, created_at, ai_generated_output").eq("primary_user_id", user.id).neq("routine_code", "coaching").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("weekly_insights").select("*").eq("week_index", weekIndex()).maybeSingle(),
    supabase.from("insight_acknowledgements").select("iso_week").eq("user_id", user.id).eq("iso_week", isoWeekKey()).maybeSingle(),
    isCrew ? loadConsentedPartners(supabase, user.id) : Promise.resolve([]),
    isCrew ? supabase.from("consent_requests").select("id, requester_user_id, routine_type").eq("target_user_id", user.id).eq("status", "pending").gt("expires_at", nowIso).order("requested_at") : Promise.resolve({ data: [] }),
    isCrew ? supabase.from("consent_requests").select("id, target_user_id, routine_type, requested_at").eq("requester_user_id", user.id).eq("status", "pending").gt("expires_at", nowIso).order("requested_at", { ascending: false }) : Promise.resolve({ data: [] }),
    user.organizationId ? supabase.rpc("crew_directory") : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; team: string | null }> }),
    supabase.from("gamification_logs").select("credits_awarded").eq("user_id", user.id).gte("created_at", weekStartIso(now)).gt("credits_awarded", 0),
    user.organizationId ? supabase.from("organization_rewards").select("id, title, description, cost_in_credits, inventory_count").eq("is_active", true).order("cost_in_credits") : Promise.resolve({ data: [] }),
    user.organizationId ? supabase.from("organizations").select("name").eq("id", user.organizationId).maybeSingle() : Promise.resolve({ data: null }),
    user.hasActiveReport ? loadPersona(user.id).catch(() => null) : Promise.resolve(null),
  ]);

  const names = new Map((directoryRes.data ?? []).map((d) => [d.id, shortName(d.full_name)]));
  const nameOf = (id: string | null) => (id ? names.get(id) ?? "Crew member" : null);
  const rule = (action: string, fallback: number) => rulesRes.data?.find((r) => r.action_type === action)?.credits ?? fallback;

  const st = statusRes.data;
  const earned = st?.total_credits_earned ?? 0;
  const progress = tierProgress(earned, tiersRes.data ?? []);
  const balance = st?.current_balance ?? 0;

  const sessions = (sessionsRes.data ?? []).map((s) => {
    const ctx = (s.scenario_context ?? {}) as Record<string, string>;
    const scenario = [ctx.aircraft, ctx.phase].filter(Boolean).join(" · ") || null;
    return { id: s.id, title: sessionTitle(s.routine_code), routine: s.routine_code, when: relativeDay(s.created_at, now), scenario, partner: nameOf(s.partner_user_id), synergy: Boolean(s.partner_user_id) };
  });
  const last = sessionsRes.data?.[0];
  const latest = latestRes.data;

  // Cheapest affordable first, then the nearest unaffordable; sold-out rewards last.
  const rewards = [...(rewardsRes.data ?? [])].sort((a, b) => {
    const rank = (r: typeof a) => (r.inventory_count === 0 ? 2 : balance >= r.cost_in_credits ? 0 : 1);
    return rank(a) - rank(b) || a.cost_in_credits - b.cost_in_credits;
  });

  return {
    isoWeek: isoWeekKey(now),
    user: { firstName: firstName(user.fullName), hasReport: user.hasActiveReport, isCrew },
    credits: { reflection: rule("reflection", 20), insight: rule("weekly_insight_read", 10), consent: rule("consent_given", 15) },
    start: {
      routines: CREW_ROUTINES.map((r) => ({ value: r, label: ROUTINE_SHORT[r] })),
      partners: partners.map((p) => ({ id: p.id, name: shortName(p.name), hasReport: p.hasReport, routines: p.routines })),
      last: last && (CREW_ROUTINES as readonly string[]).includes(last.routine_code) ? { routine: last.routine_code, partnerId: last.partner_user_id } : null,
    },
    tier: {
      balance,
      earned,
      current: tierShort(progress.current.label),
      next: progress.next ? tierShort(progress.next.label) : null,
      nextMin: progress.next?.min_credits ?? null,
      toNext: progress.creditsToNext,
      percent: progress.next ? Math.round((earned / Math.max(progress.next.min_credits, 1)) * 100) : 100,
      streak: effectiveStreak(st?.current_streak_weeks, st?.last_action_at, now),
      weekEarned: (weekLogsRes.data ?? []).reduce((sum, l) => sum + l.credits_awarded, 0),
    },
    recent: { total: countRes.count ?? 0, sessions },
    latest: latest
      ? { id: latest.id, title: sessionTitle(latest.routine_code), when: relativeDay(latest.created_at, now), cards: outputCards(latest.ai_generated_output), text: outputToText(latest.ai_generated_output) }
      : null,
    insight: insightRes.data
      ? { id: insightRes.data.id, week: isoWeekNumber(now), title: insightRes.data.title, body: insightRes.data.body, confirmed: Boolean(ackRes.data) }
      : null,
    partners: isCrew
      ? {
          incoming: (incomingRes.data ?? []).map((r) => ({ id: r.id, name: nameOf(r.requester_user_id) ?? "Crew member", routine: ROUTINE_SHORT[r.routine_type] ?? r.routine_type })),
          approved: partners.map((p) => ({
            id: p.id, name: shortName(p.name), team: p.team, days: Math.max(0, ...Object.values(p.routines)),
            routines: Object.keys(p.routines).map((r) => ROUTINE_SHORT[r] ?? r),
          })),
          outgoing: (outgoingRes.data ?? []).map((r) => ({ id: r.id, name: nameOf(r.target_user_id) ?? "Crew member", routine: ROUTINE_SHORT[r.routine_type] ?? r.routine_type, sent: relativeDay(r.requested_at, now) })),
        }
      : null,
    report: {
      verified: user.hasActiveReport,
      framework: persona ? humanize(persona.framework) : null,
      linkedHow: persona?.method ? LINK_METHOD[persona.method] ?? null : null,
      linkedOn: persona?.linkedAt ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(persona.linkedAt)) : null,
    },
    rewards: user.organizationId
      ? { org: orgRes.data?.name ?? "Your organization", balance, items: rewards.slice(0, 3).map((r) => ({ id: r.id, title: r.title, description: r.description, cost: r.cost_in_credits, left: r.inventory_count })) }
      : null,
  };
}
