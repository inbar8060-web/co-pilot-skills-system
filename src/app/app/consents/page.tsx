import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { FilterChips, FullView, homeLink, Pane, PaneEmpty, PaneGrid, PaneRow, pickView, type Kpi, type ViewSection } from "@/components/full-view";
import { Avatar, ChipRadio, Field, Group, Pill, Select, STATUS_TONE, type Tone } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getCanvasState } from "@/lib/canvas/server";
import { loadConsentedPartners } from "@/lib/partners";
import { CREW_ROUTINES } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, formatDay, nowMs, ROUTINE_LABELS, ROUTINE_SHORT, singleParams, type SearchParams } from "@/lib/utils";
import { createConsentRequest, respondToConsent } from "../actions";
import { HashView } from "./hash-view";

const BASE = "/app/consents";
const VIEWS = ["review", "partners", "requests", "request"] as const;
const STATUSES = ["pending", "approved", "declined", "expired"] as const;
type Status = (typeof STATUSES)[number];
const STATUS_LABEL: Record<Status, string> = { pending: "Pending", approved: "Approved", declined: "Declined", expired: "Expired" };
const INBOX_LIMIT = 100;
const MINE_LIMIT = 100;
const HISTORY_PREVIEW = 8;
const DEFAULT_CONSENT_CREDITS = 15;

interface ConsentRow {
  id: string; requester_user_id: string; target_user_id: string; routine_type: string; status: string;
  requested_at: string; responded_at: string | null; valid_until: string | null; expires_at: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const routineOrder = (r: string) => {
  const i = (CREW_ROUTINES as readonly string[]).indexOf(r);
  return i < 0 ? CREW_ROUTINES.length : i;
};
const linkCls = "text-sm font-bold text-acc hover:underline";

export default async function ConsentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = singleParams(await searchParams);
  const view = pickView(sp.view, VIEWS);
  const supabase = await createClient();
  // Only crew members pair up for Blind Synergy; the actions reject everyone else.
  const isCrew = user.role === "end_user";

  const [canvas, inboxRes, mineRes, crewRes, partners, ruleRes] = await Promise.all([
    getCanvasState(user),
    supabase.from("consent_requests").select("*").eq("target_user_id", user.id).order("requested_at", { ascending: false }).limit(INBOX_LIMIT),
    supabase.from("consent_requests").select("*", { count: "exact" }).eq("requester_user_id", user.id).order("requested_at", { ascending: false }).limit(MINE_LIMIT),
    supabase.rpc("crew_directory"),
    isCrew ? loadConsentedPartners(supabase, user.id) : Promise.resolve([]),
    supabase.from("gamification_rules").select("credits, is_active").eq("action_type", "consent_given").maybeSingle(),
  ]);

  const crew = (crewRes.data ?? []).filter((c) => c.id !== user.id);
  const names = new Map(crew.map((c) => [c.id, c.full_name]));
  const nameOf = (id: string) => names.get(id) ?? "Crew member";

  const now = nowMs();
  const effective = (r: ConsentRow): Status => (r.status === "pending" && new Date(r.expires_at).getTime() < now ? "expired" : (r.status as Status));
  const stillValid = (r: ConsentRow) => r.status === "approved" && daysUntil(r.valid_until) > 0;
  const badge = (r: ConsentRow): { label: string; tone: Tone } => {
    const s = effective(r);
    if (s === "approved" && !stillValid(r)) return { label: "ended", tone: "neutral" };
    return { label: s, tone: STATUS_TONE[s] ?? "neutral" };
  };
  const when = (r: ConsentRow) => {
    const s = effective(r);
    if (s === "approved") {
      const left = daysUntil(r.valid_until);
      return left > 0 ? `Approved ${formatDay(r.responded_at)} · valid ${plural(left, "more day")}` : `Approved ${formatDay(r.responded_at)} · ended ${formatDay(r.valid_until)}`;
    }
    if (s === "declined") return `Declined ${formatDay(r.responded_at)}`;
    if (s === "expired") return `Expired ${formatDay(r.expires_at)}`;
    return `Requested ${formatDay(r.requested_at)} · expires in ${plural(daysUntil(r.expires_at), "day")}`;
  };

  const inbox = inboxRes.data ?? [];
  const pending = inbox.filter((r) => effective(r) === "pending");
  const history = inbox.filter((r) => effective(r) !== "pending");
  const allHistory = sp.history === "all";
  const historyShown = allHistory ? history : history.slice(0, HISTORY_PREVIEW);
  const sharingWith = new Set(inbox.filter(stillValid).map((r) => r.requester_user_id)).size;

  const mine = mineRes.data ?? [];
  const sentTotal = Math.max(mineRes.count ?? 0, mine.length);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, mine.filter((r) => effective(r) === s).length])) as Record<Status, number>;
  const statusFilter: Status | "all" = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as Status) : "all";
  const mineShown = statusFilter === "all" ? mine : mine.filter((r) => effective(r) === statusFilter);

  const grants = partners.reduce((n, p) => n + Object.keys(p.routines).length, 0);
  const rule = ruleRes.data;
  const approveCredits = rule ? (rule.is_active ? rule.credits : 0) : DEFAULT_CONSENT_CREDITS;

  // Request form prefill (from "Ask again" links): only a colleague in the directory and a crew routine.
  const prefillTo = sp.to && names.has(sp.to) ? sp.to : "";
  const prefillRoutine = (CREW_ROUTINES as readonly string[]).includes(sp.routine ?? "") ? (sp.routine as string) : "flight";
  const askAgainHref = (r: ConsentRow) => `${BASE}?view=request&to=${encodeURIComponent(r.target_user_id)}&routine=${encodeURIComponent(r.routine_type)}`;
  // "Ask again" only on the latest request per colleague and routine, and only when nothing is
  // pending or still approved for that pair (a new request would be refused as a duplicate).
  const pairKey = (r: ConsentRow) => `${r.target_user_id}:${r.routine_type}`;
  const livePairs = new Set(mine.filter((r) => effective(r) === "pending" || stillValid(r)).map(pairKey));
  const askAgainIds = new Set<string>();
  const seenPairs = new Set<string>();
  for (const r of mine) {
    const k = pairKey(r);
    if (seenPairs.has(k)) continue;
    seenPairs.add(k);
    if (isCrew && !livePairs.has(k) && names.has(r.target_user_id) && (CREW_ROUTINES as readonly string[]).includes(r.routine_type)
      && (effective(r) === "expired" || (r.status === "approved" && !stillValid(r)))) askAgainIds.add(r.id);
  }

  const sections: ViewSection[] = [
    { key: "review", label: "To review", icon: "users", hint: "Approve or decline requests sent to you", badge: pending.length || undefined },
    { key: "partners", label: "Partners", icon: "link", hint: "Colleagues who share with you, per routine" },
    { key: "requests", label: "My requests", icon: "clock", hint: "Requests you sent and their status" },
    { key: "request", label: "Request", icon: "userPlus", hint: "Ask a colleague to share for a routine" },
  ];
  const kpis: Kpi[] = [
    { label: "To review", value: pending.length, hint: pending.length ? "waiting for your answer" : "inbox clear", tone: pending.length ? "warn" : undefined },
    { label: "Sharing with me", value: partners.length, hint: partners.length ? `${plural(grants, "routine")} approved` : "no approvals yet", tone: partners.length ? "ok" : undefined },
    { label: "Requests sent", value: sentTotal, hint: counts.pending ? `${counts.pending} pending` : "none pending", tone: "acc" },
    { label: "You share with", value: sharingWith, hint: "approvals you gave, still valid" },
  ];

  return (
    <FullView
      basePath={BASE} name="Sharing" title="Sharing & consent" back={homeLink(canvas.active)}
      description="Blind Synergy needs explicit consent from your partner for each routine type. Requests expire after 14 days; approvals stay valid for 30 days."
      kpis={kpis} sections={sections} active={view}
    >
      {view === "review" ? (
        <PaneGrid>
          <HashView />
          <Pane title="Inbox" meta={pending.length ? `${pending.length} waiting` : "Clear"} span={8} flush
            footer={<span>Approving never shows them your profile.</span>}>
            {pending.length ? pending.map((r) => {
              const name = nameOf(r.requester_user_id);
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line px-[18px] py-3.5 last:border-b-0">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <Avatar name={name} />
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-bold">{name} · {ROUTINE_LABELS[r.routine_type] ?? r.routine_type}</div>
                      <div className="truncate text-[13px] text-muted">{when(r)}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 max-md:w-full [&>form]:max-md:flex-1 [&_button]:max-md:w-full">
                    <ActionForm action={respondToConsent} submitLabel={approveCredits > 0 ? `Approve · +${approveCredits}` : "Approve"} inline>
                      <input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="decision" value="approved" />
                    </ActionForm>
                    <ActionForm action={respondToConsent} submitLabel="Decline" variant="danger" inline>
                      <input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="decision" value="declined" />
                    </ActionForm>
                  </div>
                </div>
              );
            }) : (
              <PaneEmpty action={partners.length ? <Link href={`${BASE}?view=partners`} className={linkCls}>See who shares with you →</Link> : undefined}>
                Nothing waiting for your answer.
              </PaneEmpty>
            )}
          </Pane>

          <Pane title="Inbox history" meta={history.length ? `${history.length} total` : undefined} span={4} flush
            footer={history.length > HISTORY_PREVIEW ? (
              allHistory
                ? <Link href={BASE} className="font-bold text-acc hover:underline">Show the latest {HISTORY_PREVIEW}</Link>
                : <><span>Latest {HISTORY_PREVIEW} of {history.length}</span><Link href={`${BASE}?history=all`} className="font-bold text-acc hover:underline">Show all →</Link></>
            ) : undefined}>
            {historyShown.length ? historyShown.map((r) => {
              const b = badge(r);
              return (
                <PaneRow key={r.id} title={`${nameOf(r.requester_user_id)} · ${ROUTINE_SHORT[r.routine_type] ?? r.routine_type}`} sub={when(r)}
                  right={<Pill tone={b.tone}>{b.label}</Pill>} />
              );
            }) : <PaneEmpty>No answered or expired requests yet.</PaneEmpty>}
          </Pane>
        </PaneGrid>
      ) : null}

      {view === "partners" ? (
        <PaneGrid>
          <Pane title="Sharing with me" meta={plural(partners.length, "partner")} span={8} flush
            footer={isCrew && partners.length ? (
              <><span>Each routine has its own 30-day approval.</span><Link href={`${BASE}?view=request`} className="font-bold text-acc hover:underline">Ask another colleague →</Link></>
            ) : undefined}>
            {partners.length ? partners.map((p) => {
              const routines = Object.entries(p.routines).sort(([a], [b]) => routineOrder(a) - routineOrder(b));
              const first = routines.find(([r]) => (CREW_ROUTINES as readonly string[]).includes(r))?.[0];
              return (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-b border-line px-[18px] py-3.5 last:border-b-0">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <Avatar name={p.name} />
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-bold">{p.name}</div>
                      <div className="truncate text-[13px] text-muted">{p.team ?? "Crew"}{p.hasReport ? "" : " · no report yet"}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 max-md:pl-[54px]">
                    {routines.map(([r, days]) => (
                      <Pill key={r} tone={days <= 5 ? "warn" : "ok"}>{ROUTINE_SHORT[r] ?? r} · {days} d</Pill>
                    ))}
                    {first ? (
                      <Link href={`/app/routines/new?routine=${encodeURIComponent(first)}&partner=${encodeURIComponent(p.id)}`} aria-label={`Start a routine with ${p.name}`} className="ml-1.5 text-[13px] font-bold text-acc hover:underline">
                        Start a routine →
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            }) : (
              <PaneEmpty action={isCrew ? <Link href={`${BASE}?view=request`} className={linkCls}>Request sharing →</Link> : undefined}>
                {isCrew ? "No one shares with you yet. Ask a colleague to share for a routine to unlock Blind Synergy." : "Sharing is between crew members, so no one shares with you here."}
              </PaneEmpty>
            )}
          </Pane>

          <Pane title="What partners see" span={4}>
            <div className="flex flex-col gap-1.5">
              <div className="text-[13px] font-bold text-muted">When a colleague approves your request</div>
              <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm">
                <li>Your action cards for that routine are written with both profiles in mind.</li>
                <li>You never see their type, profile or report.</li>
              </ul>
            </div>
            <div className="flex flex-col gap-1.5 border-t border-line pt-3">
              <div className="text-[13px] font-bold text-muted">When you approve a request</div>
              <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm">
                <li>Their action cards for that routine use your profile, on the server only.</li>
                <li>They never see your type, profile or report, your sessions or your reflections.</li>
              </ul>
            </div>
            <p className="m-0 border-t border-line pt-3 text-[13px] text-muted">
              Your organization admins see totals only, never who asked whom. Choose which routines colleagues may ask for in{" "}
              <Link href="/app/settings?view=sharing" className="font-bold text-acc hover:underline">Settings</Link>.
            </p>
          </Pane>
        </PaneGrid>
      ) : null}

      {view === "requests" ? (
        <PaneGrid>
          <Pane title="My requests" meta={`${sentTotal} sent`} span={12} flush
            footer={mine.length < sentTotal ? <span>Showing the latest {mine.length} of {sentTotal} requests.</span> : undefined}>
            <div className="px-[18px] pt-3">
              <FilterChips label="Filter requests by status" active={statusFilter} options={[
                { key: "all", label: "All", href: `${BASE}?view=requests`, count: mine.length },
                ...STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], href: `${BASE}?view=requests&status=${s}`, count: counts[s] })),
              ]} />
            </div>
            {mineShown.length ? (
              <div className="mt-2">
                {mineShown.map((r) => {
                  const b = badge(r);
                  return (
                    <PaneRow key={r.id} title={`${nameOf(r.target_user_id)} · ${ROUTINE_LABELS[r.routine_type] ?? r.routine_type}`} sub={when(r)}
                      right={<>
                        {askAgainIds.has(r.id) ? (
                          <Link href={askAgainHref(r)} aria-label={`Ask ${nameOf(r.target_user_id)} again for ${ROUTINE_LABELS[r.routine_type] ?? r.routine_type}`} className="text-[13px] font-bold text-acc hover:underline">Ask again</Link>
                        ) : null}
                        <Pill tone={b.tone}>{b.label}</Pill>
                      </>} />
                  );
                })}
              </div>
            ) : (
              <PaneEmpty action={isCrew && statusFilter === "all" ? <Link href={`${BASE}?view=request`} className={linkCls}>Request sharing →</Link> : undefined}>
                {statusFilter === "all" ? "You have not sent any requests." : `No ${statusFilter} requests.`}
              </PaneEmpty>
            )}
          </Pane>
        </PaneGrid>
      ) : null}

      {view === "request" ? (
        <PaneGrid>
          <Pane title="Request sharing" span={7}
            footer={isCrew && counts.pending ? (
              <><span>{plural(counts.pending, "request")} waiting for an answer</span><Link href={`${BASE}?view=requests&status=pending`} className="font-bold text-acc hover:underline">View →</Link></>
            ) : undefined}>
            {isCrew ? (
              <>
                <p className="m-0 text-sm text-muted">Ask a crew member to enable Blind Synergy for a routine.</p>
                {crew.length ? (
                  <ActionForm key={`${prefillTo}:${prefillRoutine}`} action={createConsentRequest} submitLabel="Send request" resetOnSuccess className="gap-[18px]">
                    <Field label="Crew member">
                      <Select name="targetUserId" required defaultValue={prefillTo}>
                        <option value="" disabled>Select…</option>
                        {crew.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.team ? ` · ${c.team}` : ""}{c.has_active_report ? "" : " (no report yet)"}</option>)}
                      </Select>
                    </Field>
                    <Group label="Routine">
                      <ChipRadio name="routineType" size="sm" defaultValue={prefillRoutine} options={CREW_ROUTINES.map((r) => ({ value: r, label: ROUTINE_LABELS[r] }))} />
                      <span className="text-[13px] text-muted">Only routines they allow in their sharing settings can be requested.</span>
                    </Group>
                  </ActionForm>
                ) : <div className="text-sm text-muted">No other crew members in your organization yet.</div>}
              </>
            ) : (
              <>
                <p className="m-0 text-sm">Sharing requests are between crew members. Organization admins do not take part in Blind Synergy, so you cannot send or answer requests here.</p>
                <p className="m-0 text-sm text-muted">To prepare a conversation with a team member, use Feedback coaching.</p>
                <Link href="/admin/coaching" className={`${linkCls} self-start`}>Open Feedback coaching →</Link>
              </>
            )}
          </Pane>

          <Pane title="How it works" span={5}>
            <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-sm">
              <li><span className="font-bold">Ask</span>: choose a colleague and one routine. You can have one pending request per colleague and routine.</li>
              <li><span className="font-bold">They decide</span>: they approve or decline each routine separately. Without an answer, the request expires after 14 days.</li>
              <li><span className="font-bold">30 days</span>: an approval stays valid for 30 days. Ask again to continue after that.</li>
            </ol>
            <p className="m-0 text-[13px] text-muted">They never see your profile, and you never see theirs. Blind Synergy uses both only to write your action cards.</p>
          </Pane>
        </PaneGrid>
      ) : null}
    </FullView>
  );
}
