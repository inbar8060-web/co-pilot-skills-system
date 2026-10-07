import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { FilterChips, FullView, homeLink, Pane, PaneEmpty, PaneGrid, PaneRow, pickView, type Kpi, type ViewSection } from "@/components/full-view";
import { Dot, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getCanvasState } from "@/lib/canvas/server";
import { effectiveStreak } from "@/lib/gamification-shared";
import { createClient } from "@/lib/supabase/server";
import { formatDay, isoWeekKey, isoWeekNumber, singleParams, weekIndex, type SearchParams } from "@/lib/utils";
import { acknowledgeInsight } from "../actions";

const VIEWS = ["week", "past", "library"] as const;

const FOCUS: Record<string, string> = {
  briefing_prep: "Briefing preparation",
  stress_management: "Stress management",
  debrief_reflection: "Debrief & reflection",
};
const FOCUS_KEYS = Object.keys(FOCUS);

/** "2026-W41" -> "Week 41 · 2026". */
function weekLabel(isoWeek: string): string {
  const [year, week] = isoWeek.split("-W");
  return week ? `Week ${Number(week)} · ${year}` : isoWeek;
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = singleParams(await searchParams);
  const view = pickView(sp.view, VIEWS);
  const supabase = await createClient();

  const [canvas, insightsRes, acksRes, ruleRes, statusRes] = await Promise.all([
    getCanvasState(user),
    supabase.from("weekly_insights").select("*").order("week_index"),
    supabase.from("insight_acknowledgements").select("iso_week, insight_id, acknowledged_at").eq("user_id", user.id).order("acknowledged_at", { ascending: false }),
    supabase.from("gamification_rules").select("credits, is_active").eq("action_type", "weekly_insight_read").maybeSingle(),
    supabase.from("user_gamification_status").select("current_streak_weeks, last_action_at").eq("user_id", user.id).maybeSingle(),
  ]);

  const insights = insightsRes.data ?? [];
  const acks = acksRes.data ?? [];
  // An inactive rule awards nothing (award_credits only reads active rules), so do not promise credits then.
  const rule = ruleRes.data;
  const credits = rule ? (rule.is_active ? rule.credits : 0) : 10;
  const streak = effectiveStreak(statusRes.data?.current_streak_weeks, statusRes.data?.last_action_at);
  const thisWeek = isoWeekKey();
  const weekNo = isoWeekNumber();
  const current = insights.find((i) => i.week_index === weekIndex()) ?? null;
  const thisAck = acks.find((a) => a.iso_week === thisWeek) ?? null;
  const confirmed = Boolean(thisAck);
  const byId = new Map(insights.map((i) => [i.id, i]));
  const readIds = new Set(acks.map((a) => a.insight_id));

  const focus = sp.focus && FOCUS_KEYS.includes(sp.focus) ? sp.focus : "all";
  const shown = focus === "all" ? insights : insights.filter((i) => i.focus === focus);

  const sections: ViewSection[] = [
    { key: "week", label: "This week", icon: "bell", hint: "This week's tip and the confirm button", badge: current && !confirmed ? 1 : undefined },
    { key: "past", label: "Past", icon: "clock", hint: "The weeks you confirmed a tip" },
    { key: "library", label: "All tips", icon: "book", hint: "Every tip in the rotation, by focus" },
  ];
  const kpis: Kpi[] = [
    {
      label: "This week", value: confirmed ? "Confirmed" : current ? "Not yet" : "—",
      hint: thisAck ? `read on ${formatDay(thisAck.acknowledged_at)}` : !current ? "no tip this week" : credits ? `+${credits} credits waiting` : "tip waiting",
      tone: confirmed ? "ok" : current ? "warn" : "neutral",
    },
    { label: "Weeks read", value: acks.length, hint: acks.length === 1 ? "week confirmed" : "weeks confirmed" },
    { label: "Streak", value: `${streak} wk`, hint: streak ? "keep one action a week" : "start one this week", tone: streak ? "ok" : "neutral" },
    { label: "Per insight", value: credits ? `+${credits}` : "—", hint: credits ? "credits, once a week" : "no credits at the moment", tone: credits ? "acc" : "neutral" },
  ];

  return (
    <FullView
      basePath="/app/insights" name="Insights" title="Weekly insights" back={homeLink(canvas.active)}
      description="One short CRM tip each week. Confirm you read it for credits."
      kpis={kpis} sections={sections} active={view}
    >
      {view === "week" ? (
        <PaneGrid>
          <Pane title={`Insight · Week ${weekNo}`} meta={current ? FOCUS[current.focus] ?? current.focus : undefined} span={8} tint>
            {current ? (
              <>
                <h3 className="m-0 text-[20px] font-extrabold leading-[1.3] tracking-[-0.01em]">{current.title}</h3>
                <p className="m-0 max-w-[60ch] text-[15px]">{current.body}</p>
                <div className="pt-1">
                  {confirmed ? (
                    <div className="inline-flex items-center gap-2 text-sm font-bold text-ok"><Dot tone="ok" />Confirmed this week</div>
                  ) : (
                    <ActionForm action={acknowledgeInsight} submitLabel={credits ? `Confirm read · +${credits}` : "Confirm read"} pendingLabel="Confirming…" footer="plain" className="items-start">
                      <input type="hidden" name="insight_id" value={current.id} />
                    </ActionForm>
                  )}
                </div>
              </>
            ) : (
              <p className="m-0 text-sm text-muted">No insight this week.</p>
            )}
          </Pane>
          <Pane title="How it works" span={4}>
            <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-sm">
              <li>A new tip appears every Monday. The tips rotate, so each one comes back about every six weeks.</li>
              {credits ? (
                <>
                  <li>Confirming you read it earns <span className="font-bold text-ok">+{credits} credits</span>, once per ISO week (Monday to Sunday).</li>
                  <li>It also keeps your weekly streak alive: any action that earns credits in a week counts.</li>
                </>
              ) : (
                <li>You can confirm one tip per ISO week (Monday to Sunday). Confirming does not earn credits at the moment.</li>
              )}
            </ul>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link href="/app/insights?view=library" className="font-bold text-acc hover:underline">All tips →</Link>
              <Link href="/app/rewards?view=rules" className="font-bold text-acc hover:underline">How credits work →</Link>
            </div>
          </Pane>
        </PaneGrid>
      ) : null}

      {view === "past" ? (
        <PaneGrid>
          <Pane title="Weeks you read" meta={`${acks.length} week${acks.length === 1 ? "" : "s"}`} span={12} flush>
            {acks.length ? acks.map((a) => {
              const insight = byId.get(a.insight_id);
              return (
                <PaneRow key={a.iso_week} title={insight?.title ?? "Weekly insight"}
                  sub={[weekLabel(a.iso_week), insight ? FOCUS[insight.focus] : null].filter(Boolean).join(" · ")}
                  right={<span className="text-[13px] text-muted">Read on {formatDay(a.acknowledged_at)}</span>} />
              );
            }) : (
              <PaneEmpty action={<Link href="/app/insights" className="text-sm font-bold text-acc hover:underline">Read this week&apos;s tip →</Link>}>
                You have not confirmed a weekly insight yet.
              </PaneEmpty>
            )}
          </Pane>
        </PaneGrid>
      ) : null}

      {view === "library" ? (
        <PaneGrid>
          <Pane title="All tips" meta={`${insights.length} tip${insights.length === 1 ? "" : "s"}`} span={12} flush>
            <div className="px-[18px] pt-3">
              <FilterChips label="Filter tips by focus" active={focus} options={[
                { key: "all", label: "All", href: "/app/insights?view=library", count: insights.length },
                ...FOCUS_KEYS.map((k) => ({ key: k, label: FOCUS[k], href: `/app/insights?view=library&focus=${k}`, count: insights.filter((i) => i.focus === k).length })),
              ]} />
            </div>
            {shown.length ? (
              <ul className="m-0 mt-2 list-none p-0">
                {shown.map((i) => {
                  const isCurrent = current?.id === i.id;
                  const read = readIds.has(i.id);
                  return (
                    <li key={i.id} className="flex flex-col gap-1 border-b border-line px-[18px] py-3.5 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                        <div className="min-w-0 text-[15px] font-bold">{i.title}</div>
                        {isCurrent || read ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            {isCurrent ? <Pill tone="acc">This week</Pill> : null}
                            {read ? <Pill tone="ok">Read</Pill> : null}
                          </div>
                        ) : null}
                      </div>
                      <p className="m-0 max-w-[80ch] text-sm">{i.body}</p>
                      <div className="text-[13px] text-muted">{FOCUS[i.focus] ?? i.focus}</div>
                    </li>
                  );
                })}
              </ul>
            ) : <PaneEmpty>{insights.length ? "No tips with this focus." : "No tips published yet."}</PaneEmpty>}
          </Pane>
        </PaneGrid>
      ) : null}
    </FullView>
  );
}
