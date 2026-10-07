import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Banner, Dot, LinkButton, PageHero, Pill, ProgressBar, Row, RowText, SectionTitle, SideCard, type StatusItem } from "@/components/ui";
import type { CurrentUser } from "@/lib/auth";
import { effectiveStreak, tierProgress } from "@/lib/gamification-shared";
import { loadConsentedPartners } from "@/lib/partners";
import { createClient } from "@/lib/supabase/server";
import { firstName, formatDate, isoWeekKey, isoWeekNumber, ROUTINE_LABELS, tierShort, weekIndex } from "@/lib/utils";
import { acknowledgeInsight } from "./actions";
import { StartRoutine } from "./start-routine";

/** The pre-canvas "Focus" overview, kept for organizations outside the canvas pilot. */
export async function ClassicOverview({ user, error }: { user: CurrentUser; error?: string }) {
  const supabase = await createClient();

  const [statusRes, tiersRes, pendingRes, sessionsRes, insightRes, ackRes, partners] = await Promise.all([
    supabase.from("user_gamification_status").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("readiness_tiers").select("*").order("sort_order"),
    supabase.from("consent_requests").select("id", { count: "exact", head: true }).eq("target_user_id", user.id).eq("status", "pending").gt("expires_at", new Date().toISOString()),
    supabase.from("routine_sessions").select("id, routine_code, created_at, partner_user_id").eq("primary_user_id", user.id).order("created_at", { ascending: false }).limit(3),
    supabase.from("weekly_insights").select("*").eq("week_index", weekIndex()).maybeSingle(),
    supabase.from("insight_acknowledgements").select("iso_week").eq("user_id", user.id).eq("iso_week", isoWeekKey()).maybeSingle(),
    loadConsentedPartners(supabase, user.id),
  ]);

  const st = statusRes.data;
  const earned = st?.total_credits_earned ?? 0;
  const progress = tierProgress(earned, tiersRes.data ?? []);
  const pending = pendingRes.count ?? 0;
  const insight = insightRes.data;
  const blocked = !user.hasActiveReport;
  const tierLine = progress.next ? `${tierShort(progress.current.label)}, ${progress.creditsToNext} to ${tierShort(progress.next.label)}` : tierShort(progress.current.label);

  const status: StatusItem[] = [
    blocked ? { tone: "warn", label: "Report missing" } : { tone: "ok", label: "Report verified" },
    { tone: "acc", label: `${st?.current_balance ?? 0} credits · ${tierLine}` },
    ...(pending > 0 ? [{ tone: "warn" as const, label: `${pending} pending request${pending === 1 ? "" : "s"}`, href: "/app/consents" }] : []),
  ];

  return (
    <>
      {error === "forbidden" ? <Banner tone="warn" title="You do not have access to that area" /> : null}
      <PageHero title={`Ready for your next session, ${firstName(user.fullName)}?`} description="Just-in-time CRM/TEM insights for your next session." status={status} />

      {blocked ? (
        <Banner tone="warn" title="Routine generation is blocked until a full report is loaded" action={<LinkButton href="/app/report" size="sm" className="bg-card">Upload report</LinkButton>}>
          Upload your MBTI Step I/II or Symbiotics ADAPT report, or ask your administrator to link it.
        </Banner>
      ) : null}

      <StartRoutine partners={partners} disabled={blocked} />

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex flex-col gap-3">
          <SectionTitle action={<Link href="/app/routines" className="text-sm font-bold text-acc hover:underline">History</Link>}>Recent routines</SectionTitle>
          {sessionsRes.data && sessionsRes.data.length > 0 ? (
            sessionsRes.data.map((s) => (
              <Row key={s.id} href={`/app/routines/${s.id}`}>
                <RowText title={ROUTINE_LABELS[s.routine_code] ?? s.routine_code} sub={formatDate(s.created_at)} />
                {s.partner_user_id ? <Pill tone="acc" dot={false}>Blind synergy</Pill> : <Pill dot={false}>Solo</Pill>}
              </Row>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-line2 p-7 text-center font-semibold text-muted">No routines yet. Start one above.</div>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <SideCard className="gap-0">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-bold uppercase tracking-[0.05em] text-muted">{progress.next ? `${tierShort(progress.current.label)} → ${tierShort(progress.next.label)}` : tierShort(progress.current.label)}</span>
              <span className="text-[13px] font-bold tabular-nums">{progress.next ? `${earned} / ${progress.next.min_credits}` : earned}</span>
            </div>
            <div className="mt-2.5"><ProgressBar percent={progress.next ? (earned / Math.max(progress.next.min_credits, 1)) * 100 : 100} label="Tier progress" /></div>
            <div className="mt-2 text-[13px] text-muted">{progress.next ? `${progress.creditsToNext} more credits` : "Top tier reached"} · {effectiveStreak(st?.current_streak_weeks, st?.last_action_at)}-week streak</div>
          </SideCard>

          {insight ? (
            <SideCard tone="acc" className="gap-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.05em] text-acc">Insight · Week {isoWeekNumber()}</span>
                <Link href="/app/insights?view=past" className="text-[13px] font-bold text-acc hover:underline">Past weeks</Link>
              </div>
              <div className="mt-1.5 text-[15px] font-extrabold leading-[1.35]">{insight.title}</div>
              <p className="m-0 mt-2 text-sm">{insight.body}</p>
              <div className="mt-3.5">
                {ackRes.data ? (
                  <div className="inline-flex items-center gap-2 text-sm font-bold text-ok"><Dot tone="ok" />Confirmed this week</div>
                ) : (
                  <ActionForm action={acknowledgeInsight} submitLabel="Confirm read · +10" size="sm" inline className="[&_button]:h-10 [&_button]:px-4 [&_button]:text-sm">
                    <input type="hidden" name="insight_id" value={insight.id} />
                  </ActionForm>
                )}
              </div>
            </SideCard>
          ) : null}
        </div>
      </div>
    </>
  );
}
