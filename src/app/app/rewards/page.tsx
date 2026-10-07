import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { FilterChips, FullView, homeLink, Pane, PaneEmpty, PaneGrid, PaneRow, pickView, type Kpi, type ViewSection } from "@/components/full-view";
import { Dot, Pill, ProgressBar, STATUS_TONE } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getCanvasState } from "@/lib/canvas/server";
import { ACTION_LABELS, effectiveStreak, tierProgress } from "@/lib/gamification-shared";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatDay, singleParams, tierShort, type SearchParams } from "@/lib/utils";
import { redeemReward } from "../actions";

const VIEWS = ["catalog", "redeemed", "rules", "activity"] as const;
const LOG_PAGE = 20;

export default async function RewardsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = singleParams(await searchParams);
  const view = pickView(sp.view, VIEWS);
  const supabase = await createClient();

  const logFilter = sp.filter === "earned" || sp.filter === "spent" ? sp.filter : "all";
  const page = Math.max(1, Math.min(500, Number.parseInt(sp.page ?? "1", 10) || 1));
  let logs = supabase.from("gamification_logs").select("*", { count: "exact" }).eq("user_id", user.id);
  if (logFilter === "earned") logs = logs.gt("credits_awarded", 0);
  if (logFilter === "spent") logs = logs.lt("credits_awarded", 0);

  const [canvas, statusRes, tiersRes, rulesRes, rewardsRes, redemptionsRes, logsRes] = await Promise.all([
    getCanvasState(user),
    supabase.from("user_gamification_status").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("readiness_tiers").select("*").order("sort_order"),
    supabase.from("gamification_rules").select("*").eq("is_active", true).order("credits", { ascending: false }),
    supabase.from("organization_rewards").select("*").eq("is_active", true).order("cost_in_credits"),
    supabase.from("reward_redemptions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    view === "activity" ? logs.order("created_at", { ascending: false }).range((page - 1) * LOG_PAGE, page * LOG_PAGE - 1) : Promise.resolve({ data: null, count: null }),
  ]);

  const st = statusRes.data;
  const balance = st?.current_balance ?? 0;
  const earned = st?.total_credits_earned ?? 0;
  const tiers = tiersRes.data ?? [];
  const progress = tierProgress(earned, tiers);
  const current = tierShort(progress.current.label);
  const next = progress.next ? tierShort(progress.next.label) : null;
  const streak = effectiveStreak(st?.current_streak_weeks, st?.last_action_at);
  const rewards = rewardsRes.data ?? [];
  const redemptions = redemptionsRes.data ?? [];
  const openRedemptions = redemptions.filter((r) => r.status === "requested" || r.status === "approved").length;
  const affordable = rewards.filter((r) => r.inventory_count !== 0 && balance >= r.cost_in_credits);
  const catalogFilter = sp.filter === "affordable" ? "affordable" : "all";
  const shown = catalogFilter === "affordable" ? affordable : rewards;

  const sections: ViewSection[] = [
    { key: "catalog", label: "Catalog", icon: "gift", hint: "Every reward you can redeem" },
    { key: "redeemed", label: "Redeemed", icon: "clock", hint: "Your redemptions and their status", badge: openRedemptions || undefined },
    { key: "rules", label: "Earn", icon: "book", hint: "How credits are earned, the tiers and the streak" },
    { key: "activity", label: "Log", icon: "list", hint: "Every credit you earned or spent" },
  ];
  const kpis: Kpi[] = [
    { label: "Balance", value: balance, hint: "credits to spend", tone: "acc" },
    { label: "Earned in total", value: earned, hint: "counts toward your tier", tone: "ok" },
    { label: "Tier", value: current, hint: next ? `${progress.creditsToNext} to ${next}` : "Top tier reached" },
    { label: "Streak", value: `${streak} wk`, hint: streak ? "keep one action a week" : "start one this week", tone: streak ? "ok" : "neutral" },
  ];

  const tierCard = (
    <Pane title="Tier progress" meta={next ? `${current} → ${next}` : `${current} · top tier`} span={4}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-muted">{next ? `${progress.creditsToNext} more credits to ${next}` : "Top tier reached"}</span>
        <span className="text-[13px] font-bold tabular-nums">{progress.next ? `${earned} / ${progress.next.min_credits}` : earned}</span>
      </div>
      <ProgressBar percent={progress.next ? (earned / Math.max(progress.next.min_credits, 1)) * 100 : 100} height={8} label="Tier progress" />
      <ol className="m-0 flex list-none flex-col p-0">
        {tiers.map((t) => {
          const reached = earned >= t.min_credits;
          const here = t.tier === progress.current.tier;
          return (
            <li key={t.tier} className="flex items-center justify-between gap-3 border-t border-line py-2 text-sm">
              <span className={cn("flex items-center gap-2", here ? "font-extrabold" : "font-semibold", !reached && "text-muted")}>
                <Dot tone={here ? "acc" : reached ? "ok" : "neutral"} />{tierShort(t.label)}{here ? <span className="text-xs font-bold text-muted">you are here</span> : null}
              </span>
              <span className="tabular-nums text-muted">{t.min_credits}+</span>
            </li>
          );
        })}
      </ol>
    </Pane>
  );

  return (
    <FullView
      basePath="/app/rewards" name="Rewards" title="Credits & rewards" back={homeLink(canvas.active)}
      description="CRM Credits reward consistent, professional use. Redeem them in your organization's catalog."
      kpis={kpis} sections={sections} active={view}
    >
      {view === "catalog" ? (
        <PaneGrid>
          <Pane title="Catalog" meta={`${rewards.length} reward${rewards.length === 1 ? "" : "s"}`} span={8}>
            <FilterChips label="Filter rewards" active={catalogFilter} options={[
              { key: "all", label: "All", href: "/app/rewards", count: rewards.length },
              { key: "affordable", label: "Affordable now", href: "/app/rewards?filter=affordable", count: affordable.length },
            ]} />
            {shown.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {shown.map((r) => {
                  const out = r.inventory_count === 0;
                  const afford = balance >= r.cost_in_credits;
                  const can = afford && !out;
                  return (
                    <div key={r.id} className="flex min-w-0 flex-col gap-2 rounded-xl border border-line px-4 py-3.5">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="font-extrabold leading-tight">{r.title}</div>
                        <Pill tone="acc" dot={false} className="font-extrabold">{r.cost_in_credits} cr</Pill>
                      </div>
                      <div className="flex-1 text-sm text-muted">{r.description}</div>
                      <div className="flex items-center justify-between gap-2.5 pt-1">
                        <span className="text-[13px] text-muted">
                          {out ? "Out of stock" : r.inventory_count < 0 ? "Unlimited" : `${r.inventory_count} left`}
                          {!afford && !out ? ` · ${r.cost_in_credits - balance} more needed` : ""}
                        </span>
                        <ActionForm
                          action={redeemReward} inline size="sm" variant={can ? "primary" : "secondary"} disabled={!can}
                          submitLabel={out ? "Out of stock" : afford ? "Redeem" : "Not enough credits"}
                          className="[&_button]:h-9 [&_button]:rounded-xl [&_button]:px-3.5"
                          confirm={{
                            title: `Redeem ${r.title}?`,
                            body: `${r.cost_in_credits} credits will be deducted. Your administrator confirms delivery.`,
                            confirmLabel: `Redeem for ${r.cost_in_credits} cr`,
                            detail: (
                              <div className="flex items-center justify-between rounded-[10px] bg-bg px-3.5 py-3 text-sm">
                                <span className="text-muted">Balance after</span>
                                <span className="font-extrabold tabular-nums">{balance - r.cost_in_credits} credits</span>
                              </div>
                            ),
                          }}
                        >
                          <input type="hidden" name="reward_id" value={r.id} />
                        </ActionForm>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line2 p-6 text-center text-sm font-semibold text-muted">
                {rewards.length ? "Nothing is affordable yet. Earn credits to unlock rewards." : "No rewards published yet."}
              </div>
            )}
          </Pane>
          {tierCard}
        </PaneGrid>
      ) : null}

      {view === "redeemed" ? (
        <PaneGrid>
          <Pane title="My redemptions" meta={`${redemptions.length} total`} span={8} flush>
            {redemptions.length ? redemptions.map((r) => (
              <PaneRow key={r.id} title={r.reward_title || "Reward"} sub={`${formatDay(r.created_at)} · ${r.credits_spent} credits`} right={<Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill>} />
            )) : <PaneEmpty action={<Link href="/app/rewards" className="text-sm font-bold text-acc hover:underline">Open the catalog →</Link>}>No redemptions yet.</PaneEmpty>}
          </Pane>
          <Pane title="How redemption works" span={4}>
            <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-sm">
              <li><span className="font-bold">Requested</span>: credits are deducted when you redeem.</li>
              <li><span className="font-bold">Approved</span>: your administrator accepts the request.</li>
              <li><span className="font-bold">Delivered</span>: you received the reward.</li>
            </ol>
            <p className="m-0 text-[13px] text-muted">If a request is cancelled, the credits return to your balance.</p>
          </Pane>
        </PaneGrid>
      ) : null}

      {view === "rules" ? (
        <PaneGrid>
          <Pane title="How to earn" meta={`${(rulesRes.data ?? []).length} actions`} span={8} flush>
            {(rulesRes.data ?? []).map((r) => (
              <PaneRow key={r.action_type} title={r.label}
                sub={r.cooldown_kind === "once" ? "One time" : `Up to ${r.cooldown_limit} ${r.cooldown_kind.replace("per_", "per ")}`}
                right={<span className="font-extrabold tabular-nums text-ok">+{r.credits}</span>} />
            ))}
          </Pane>
          <div className="col-span-1 flex flex-col gap-5 md:col-span-6 xl:col-span-4">
            {tierCard}
            <Pane title="Weekly streak" meta={`${streak} week${streak === 1 ? "" : "s"}`}>
              <p className="m-0 text-sm">Any action that earns credits in a week (Monday to Sunday) keeps your streak going. Every third week in a row adds a streak bonus.</p>
            </Pane>
          </div>
        </PaneGrid>
      ) : null}

      {view === "activity" ? (
        <PaneGrid>
          <Pane title="Credit log" meta={`${logsRes.count ?? 0} entr${logsRes.count === 1 ? "y" : "ies"}`} span={12} flush
            footer={(logsRes.count ?? 0) > LOG_PAGE ? (
              <>
                <span>Page {page} of {Math.ceil((logsRes.count ?? 0) / LOG_PAGE)}</span>
                <span className="flex gap-3">
                  {page > 1 ? <Link className="font-bold text-acc hover:underline" href={`/app/rewards?view=activity&filter=${logFilter}&page=${page - 1}`}>← Newer</Link> : null}
                  {page * LOG_PAGE < (logsRes.count ?? 0) ? <Link className="font-bold text-acc hover:underline" href={`/app/rewards?view=activity&filter=${logFilter}&page=${page + 1}`}>Older →</Link> : null}
                </span>
              </>
            ) : undefined}>
            <div className="px-[18px] pt-3">
              <FilterChips label="Filter credits" active={logFilter} options={[
                { key: "all", label: "All", href: "/app/rewards?view=activity" },
                { key: "earned", label: "Earned", href: "/app/rewards?view=activity&filter=earned" },
                { key: "spent", label: "Spent", href: "/app/rewards?view=activity&filter=spent" },
              ]} />
            </div>
            {logsRes.data && logsRes.data.length ? (
              <div className="mt-2">
                {logsRes.data.map((l) => {
                  const meta = (l.metadata ?? {}) as Record<string, unknown>;
                  const session = typeof meta.session_id === "string" ? meta.session_id : null;
                  return (
                    <PaneRow key={l.id} title={ACTION_LABELS[l.action_type] ?? l.action_type} sub={formatDate(l.created_at)}
                      href={session ? `/app/routines/${session}` : undefined}
                      right={<span className={cn("font-extrabold tabular-nums", l.credits_awarded >= 0 ? "text-ok" : "text-bad")}>{l.credits_awarded >= 0 ? "+" : ""}{l.credits_awarded}</span>} />
                  );
                })}
              </div>
            ) : <PaneEmpty>No credit activity{logFilter === "all" ? " yet" : ` (${logFilter})`}.</PaneEmpty>}
          </Pane>
        </PaneGrid>
      ) : null}
    </FullView>
  );
}
