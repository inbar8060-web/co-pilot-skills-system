"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Icon } from "@/components/icons";
import { ChipRadio, Dot, ProgressBar } from "@/components/ui";
import type { WidgetId, WidgetSize } from "@/lib/canvas/registry";
import { cn } from "@/lib/utils";
import { redeemReward, respondToConsent } from "../actions";
import { Body, ModePill, SoftPill, WidgetLink, type Tool } from "./frame";
import type { CanvasData } from "./types";

export type RecentFilter = "all" | "solo" | "synergy";
export type StartPartner = CanvasData["start"]["partners"][number];

/** Client state and callbacks the widgets and their tools share with the canvas. */
export interface WidgetApi {
  routine: string;
  setRoutine: (r: string) => void;
  partner: StartPartner | null;
  /** "auto" picks the first consenting partner; "solo" forces a self-briefing. */
  partnerChoice: string;
  briefingHref: string;
  openPartnerPicker: () => void;
  recentFilter: RecentFilter;
  setRecentFilter: (f: RecentFilter) => void;
  snoozed: boolean;
  setSnoozed: (on: boolean) => void;
  confirmInsight: () => void;
  confirming: boolean;
  copy: (text: string, done: string) => void;
  openPrivacy: () => void;
}

export interface WidgetView { title: ReactNode; kicker?: boolean; tint?: boolean; meta?: ReactNode; body: ReactNode }

const FILTERS: Array<{ value: RecentFilter; label: string }> = [
  { value: "all", label: "All" }, { value: "solo", label: "Solo" }, { value: "synergy", label: "Synergy" },
];

function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-2 text-sm text-muted">
      <div>{children}</div>
      {action}
    </div>
  );
}

function PrimaryLink({ href, children, className, label }: { href: string; children: ReactNode; className?: string; label?: string }) {
  return (
    <Link href={href} aria-label={label} className={cn("inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand px-[22px] text-[15px] font-bold text-onbrand hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc", className)}>
      {children}
    </Link>
  );
}

/* ================================================================== views */
export function widgetView(id: WidgetId, size: WidgetSize, d: CanvasData, api: WidgetApi, select: () => void): WidgetView {
  switch (id) {
    case "start": return startView(size, d, api, select);
    case "tier": return tierView(size, d);
    case "recent": return recentView(size, d, api);
    case "insight": return insightView(size, d, api);
    case "partners": return partnersView(size, d);
    case "report": return reportView(size, d);
    case "rewards": return rewardsView(size, d);
    case "latest": return latestView(size, d, api);
  }
}

function partnerLine(d: CanvasData, api: WidgetApi): ReactNode {
  const label = d.start.routines.find((r) => r.value === api.routine)?.label ?? api.routine;
  if (api.partner) {
    return <>Partner for {label}: <strong className="font-bold text-ink">{api.partner.name}</strong> · approved, valid {api.partner.routines[api.routine]} days</>;
  }
  if (api.partnerChoice === "solo") return <>Solo self-briefing for {label}</>;
  return <>No consenting partner for {label} yet · solo self-briefing</>;
}

function startView(size: WidgetSize, d: CanvasData, api: WidgetApi, select: () => void): WidgetView {
  const blocked = !d.user.hasReport;
  if (size === "S") {
    return {
      title: "Start a routine",
      body: (
        <Body className="flex-row items-center gap-2.5 pt-3">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Routine</span>
            <select value={api.routine} onChange={(e) => { api.setRoutine(e.target.value); select(); }} className="ctl ctl-sm h-11 appearance-none rounded-xl pr-9 font-bold">
              {d.start.routines.map((r) => <option key={r.value} value={r.value}>{r.label}{api.partner && r.value === api.routine ? ` · ${api.partner.name}` : ""}</option>)}
            </select>
            <Icon name="chevronDown" size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          </label>
          {blocked ? (
            <Link href="/app/report?view=upload" aria-label="Upload your report to start a routine" className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line2 text-muted"><Icon name="upload" size={20} /></Link>
          ) : (
            <PrimaryLink href={api.briefingHref} label="Continue to briefing" className="size-11 shrink-0 px-0"><Icon name="play" size={18} /></PrimaryLink>
          )}
        </Body>
      ),
    };
  }
  return {
    title: "Start a routine",
    meta: <span className="max-md:hidden">Solo, or with a consenting partner</span>,
    body: (
      <Body className="justify-between gap-4">
        <ChipRadio name="canvas-routine" size="sm" value={api.routine} onChange={(r) => { api.setRoutine(r); select(); }} options={d.start.routines} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="min-w-0 text-sm text-muted">
            {blocked ? <>Routines unlock once your report is verified. <Link href="/app/report?view=upload" className="font-bold text-acc hover:underline">Upload report</Link></> : partnerLine(d, api)}
          </div>
          {blocked ? (
            <span aria-disabled="true" className="inline-flex h-11 items-center rounded-xl bg-brand px-[22px] text-[15px] font-bold text-onbrand opacity-45 max-md:flex-1 max-md:justify-center">Continue to briefing</span>
          ) : (
            <PrimaryLink href={api.briefingHref} className="max-md:flex-1">Continue to briefing</PrimaryLink>
          )}
        </div>
      </Body>
    ),
  };
}

function tierView(size: WidgetSize, d: CanvasData): WidgetView {
  const t = d.tier;
  const bar = <ProgressBar percent={t.percent} height={8} label={t.next ? `Progress to ${t.next}` : "Top tier reached"} />;
  const toNext = t.next ? `${t.toNext} more credits to ${t.next}` : "Top tier reached";
  if (size === "S") {
    return {
      title: "Credits",
      meta: <span>{t.current}</span>,
      body: (
        <Body className="justify-center gap-2 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[28px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{t.balance}</span>
            <span className="text-[13px] text-muted">{t.next ? `${t.toNext} to ${t.next}` : "Top tier"}</span>
          </div>
          {bar}
        </Body>
      ),
    };
  }
  return {
    title: "Credits & tier",
    meta: <span>{t.next ? `${t.current} → ${t.next}` : `${t.current} · top tier`}</span>,
    body: (
      <Body className="justify-between gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <div><span className="text-[34px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{t.balance}</span> <span className="text-sm font-bold text-muted">credits to spend</span></div>
          <span className="text-[13px] font-bold tabular-nums">{t.nextMin ? `${t.earned} / ${t.nextMin}` : t.earned}</span>
        </div>
        {bar}
        <div className="flex flex-col gap-0.5 text-[13px] text-muted">
          <span>{toNext}</span>
          <span>{t.streak > 0 ? `${t.streak}-week streak` : "No active streak"}{t.weekEarned > 0 ? ` · +${t.weekEarned} this week` : ""}</span>
        </div>
      </Body>
    ),
  };
}

function recentView(size: WidgetSize, d: CanvasData, api: WidgetApi): WidgetView {
  const all = d.recent.sessions;
  const list = all.filter((s) => api.recentFilter === "all" || (api.recentFilter === "synergy") === s.synergy);
  const filtered = api.recentFilter !== "all";
  const meta = filtered ? <span>{api.recentFilter === "solo" ? "Solo only" : "Synergy only"}</span> : undefined;
  const chips = (
    <div className="flex gap-1.5" role="group" aria-label="Filter sessions">
      {FILTERS.map((f) => (
        <button key={f.value} type="button" aria-pressed={api.recentFilter === f.value} onClick={() => api.setRecentFilter(f.value)}
          className={cn("h-8 rounded-xl border px-3 text-[13px] font-bold", api.recentFilter === f.value ? "border-acc bg-accsoft text-ink" : "border-line2 bg-transparent text-muted hover:text-ink")}>
          {f.label}
        </button>
      ))}
    </div>
  );
  if (all.length === 0) {
    return { title: "Recent routines", body: <Body><Empty action={<WidgetLink href="/app/routines/new">Start your first routine →</WidgetLink>}>No routines yet. Your sessions and their action cards will appear here.</Empty></Body> };
  }
  const none = list.length === 0 ? <div className="px-[18px] py-4 text-sm text-muted">No {api.recentFilter === "solo" ? "solo" : "synergy"} sessions in your latest {all.length}.</div> : null;

  if (size === "S") {
    const rows = list.slice(0, 2);
    return {
      title: "Recent routines", meta,
      body: (
        <div className="flex flex-1 flex-col justify-center gap-1.5 px-[18px] py-3">
          {rows.map((s) => (
            <Link key={s.id} href={`/app/routines/${s.id}`} className="flex items-center gap-2 truncate text-[15px] font-bold hover:underline"><ModePill synergy={s.synergy} compact />{s.title}</Link>
          ))}
          {none}
          {d.recent.total > rows.length ? <Link href="/app/routines" className="text-[13px] text-muted hover:underline">+{d.recent.total - rows.length} more</Link> : null}
        </div>
      ),
    };
  }
  if (size === "XL") {
    const rows = list.slice(0, 5);
    return {
      title: "Recent routines", meta,
      body: (
        <div className="flex flex-1 flex-col">
          <div className="px-[18px] pt-3">{chips}</div>
          <div className="flex-1 overflow-x-auto">
            <table className="dt mt-1 [&_td]:px-[18px] [&_td]:py-2.5 [&_th]:px-[18px]">
              <thead><tr><th>Routine</th><th>Scenario</th><th>Partner</th><th>Mode</th><th className="num">Date</th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="font-bold"><Link href={`/app/routines/${s.id}`} className="hover:underline">{s.title}</Link></td>
                    <td className="max-w-[260px] truncate text-muted">{s.scenario ?? "—"}</td>
                    <td>{s.partner ?? "—"}</td>
                    <td><ModePill synergy={s.synergy} /></td>
                    <td className="num whitespace-nowrap text-muted">{s.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {none}
          </div>
          <div className="flex items-center justify-between border-t border-line px-[18px] py-3 text-[13px] text-muted">
            <span>{rows.length} of {d.recent.total} sessions</span>
            <WidgetLink href="/app/routines">Full history →</WidgetLink>
          </div>
        </div>
      ),
    };
  }
  const rows = list.slice(0, size === "L" ? 4 : 3);
  return {
    title: "Recent routines", meta,
    body: (
      <div className="flex flex-1 flex-col">
        {size === "L" ? <div className="px-[18px] pt-3">{chips}</div> : null}
        {rows.map((s) => (
          <Link key={s.id} href={`/app/routines/${s.id}`} className="flex flex-1 items-center justify-between gap-3 border-b border-line px-[18px] py-2 hover:bg-bg">
            {size === "L" ? (
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="truncate text-[15px] font-bold">{s.title}</span>
                <span className="truncate text-[13px] text-muted">{s.scenario ?? ""}</span>
              </span>
            ) : (
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-bold">{s.title}</span>
                <span className="block truncate text-[13px] text-muted">{[s.when, s.scenario].filter(Boolean).join(" · ")}</span>
              </span>
            )}
            <span className="flex shrink-0 items-center gap-2">
              <ModePill synergy={s.synergy} />
              {size === "L" ? <span className="w-[72px] text-right text-[13px] text-muted">{s.when}</span> : null}
            </span>
          </Link>
        ))}
        {none}
        <div className="mt-auto px-[18px] py-3"><WidgetLink href="/app/routines">History · {d.recent.total} session{d.recent.total === 1 ? "" : "s"} →</WidgetLink></div>
      </div>
    ),
  };
}

function insightView(size: WidgetSize, d: CanvasData, api: WidgetApi): WidgetView {
  const i = d.insight;
  const title = i ? `Insight · Week ${i.week}` : "Weekly insight";
  if (!i) return { title, kicker: true, tint: true, body: <Body><Empty action={<WidgetLink href="/app/insights?view=past">Earlier insights →</WidgetLink>}>No insight this week.</Empty></Body> };
  if (api.snoozed) {
    return {
      title, kicker: true, tint: true,
      body: (
        <Body className="justify-center gap-2">
          <div className="text-sm text-muted">Snoozed until Monday. You can still confirm it this week.</div>
          <button type="button" onClick={() => api.setSnoozed(false)} className="self-start border-0 bg-transparent p-0 text-sm font-bold text-acc hover:underline">Show it now</button>
        </Body>
      ),
    };
  }
  const confirm = i.confirmed ? (
    <div className="inline-flex items-center gap-2 text-sm font-bold text-ok"><Dot tone="ok" />Confirmed this week</div>
  ) : (
    <button type="button" onClick={api.confirmInsight} disabled={api.confirming}
      className="inline-flex h-10 items-center self-start rounded-xl border-0 bg-brand px-4 text-sm font-bold text-onbrand hover:opacity-90 disabled:opacity-55">
      {api.confirming ? "Confirming…" : `Confirm read · +${d.credits.insight}`}
    </button>
  );
  return {
    title, kicker: true, tint: true,
    body: (
      <Body className={cn("justify-between gap-2", size === "S" && "pt-3")}>
        <div className="flex flex-col gap-1.5">
          <div className="text-base font-extrabold leading-[1.35]">{i.title}</div>
          {size !== "S" ? <p className="m-0 text-sm">{i.body}</p> : null}
        </div>
        {confirm}
      </Body>
    ),
  };
}

function partnersView(size: WidgetSize, d: CanvasData): WidgetView {
  const p = d.partners;
  if (!p) return { title: "Consented partners", body: <Body><Empty>Partners are for crew members.</Empty></Body> };
  const review = p.incoming.length;
  const meta = review ? <><Dot tone="warn" size={7} /><span className="font-bold text-ink">{review} to review</span></> : p.approved.length ? <span>{p.approved.length} sharing</span> : undefined;
  if (size === "S") {
    return {
      title: "Partners", meta,
      body: (
        <Body className="justify-center gap-1 pt-3">
          <div><span className="text-[28px] font-extrabold leading-none tabular-nums">{p.approved.length}</span> <span className="text-sm font-bold text-muted">sharing with you</span></div>
          <div className="text-[13px] text-muted">{review ? `${review} request${review === 1 ? "" : "s"} waiting for your answer` : p.outgoing.length ? `${p.outgoing.length} request${p.outgoing.length === 1 ? "" : "s"} pending` : "Nothing waiting"}</div>
        </Body>
      ),
    };
  }
  const max = size === "L" ? 6 : 3;
  const incoming = p.incoming.slice(0, size === "L" ? 2 : 1);
  const rest = [
    ...p.approved.map((a) => ({ key: a.id, name: a.name, sub: `${a.team ?? "Crew"} · valid ${a.days} day${a.days === 1 ? "" : "s"}`, pills: a.routines.map((r) => <SoftPill key={r}>{r}</SoftPill>) })),
    ...p.outgoing.map((o) => ({ key: o.id, name: o.name, sub: `${o.routine} · request sent ${o.sent === "Today" || o.sent === "Yesterday" ? o.sent.toLowerCase() : o.sent}`, pills: [<SoftPill key="p" tone="warn">Pending</SoftPill>] })),
  ];
  const shown = rest.slice(0, Math.max(0, max - incoming.length));
  const hidden = rest.length - shown.length + (p.incoming.length - incoming.length);
  if (incoming.length + rest.length === 0) {
    return { title: "Consented partners", body: <Body><Empty action={<WidgetLink href="/app/consents?view=request">Request sharing →</WidgetLink>}>No partners yet. Ask a colleague to share for a routine to unlock Blind Synergy.</Empty></Body> };
  }
  return {
    title: "Consented partners", meta,
    body: (
      <div className="flex flex-1 flex-col">
        {incoming.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-warnsoft/60 px-[18px] py-2.5">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold">{r.name}</div>
              <div className="text-[13px] text-muted">asks to share for {r.routine}</div>
            </div>
            <div className="flex gap-1.5 [&_button]:h-8 [&_button]:rounded-lg [&_button]:px-2.5 [&_button]:text-[13px]">
              <ActionForm action={respondToConsent} submitLabel={`Approve · +${d.credits.consent}`} pendingLabel="…" inline size="sm">
                <input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="decision" value="approved" />
              </ActionForm>
              <ActionForm action={respondToConsent} submitLabel="Decline" pendingLabel="…" inline size="sm" variant="danger">
                <input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="decision" value="declined" />
              </ActionForm>
            </div>
          </div>
        ))}
        {shown.map((r) => (
          <div key={r.key} className="flex flex-1 items-center justify-between gap-3 border-b border-line px-[18px] py-2 last:border-b-0">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold">{r.name}</div>
              <div className="truncate text-[13px] text-muted">{r.sub}</div>
            </div>
            <div className="flex flex-wrap justify-end gap-1">{r.pills}</div>
          </div>
        ))}
        {hidden > 0 ? <div className="mt-auto px-[18px] py-2.5"><WidgetLink href="/app/consents?view=partners">+{hidden} more · Sharing →</WidgetLink></div> : null}
      </div>
    ),
  };
}

function reportView(size: WidgetSize, d: CanvasData): WidgetView {
  const r = d.report;
  const status = r.verified
    ? <div className="flex items-center gap-2 font-bold text-ok"><Dot tone="ok" size={9} />Report verified</div>
    : <div className="flex items-center gap-2 font-bold text-ink"><Dot tone="warn" size={9} />Report missing</div>;
  if (size === "S") {
    return { title: "My report", body: <Body className="justify-center gap-1 pt-3">{status}<div className="truncate text-[13px] text-muted">{r.verified ? r.framework ?? "Linked" : "Routines are blocked"}</div></Body> };
  }
  return {
    title: "My report",
    body: r.verified ? (
      <Body className="justify-between gap-2.5">
        {status}
        <div className="text-sm text-muted">{[r.framework, r.linkedHow, r.linkedOn].filter(Boolean).join(" · ")}</div>
        <div className="text-[13px] text-muted">Your type is never shown to partners (anonymity wall).</div>
      </Body>
    ) : (
      <Body className="justify-between gap-2.5">
        {status}
        <div className="text-sm text-muted">Routines stay blocked until your MBTI or ADAPT report is loaded.</div>
        <PrimaryLink href="/app/report?view=upload" className="h-10 self-start px-4 text-sm">Upload report</PrimaryLink>
      </Body>
    ),
  };
}

function rewardsView(size: WidgetSize, d: CanvasData): WidgetView {
  const rw = d.rewards;
  if (!rw) return { title: "Rewards catalog", body: <Body><Empty>Rewards come from your organization.</Empty></Body> };
  const items = rw.items.slice(0, size === "L" ? 3 : 2);
  if (items.length === 0) return { title: "Rewards catalog", meta: <span className="truncate">{rw.org}</span>, body: <Body><Empty>No rewards published yet.</Empty></Body> };
  return {
    title: "Rewards catalog",
    meta: <span className="max-w-[160px] truncate">{rw.org}</span>,
    body: (
      <Body className={cn("grid gap-3", size === "L" ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
        {items.map((r) => {
          const out = r.left === 0;
          const afford = rw.balance >= r.cost;
          const can = afford && !out;
          return (
            <div key={r.id} className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-line px-3.5 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 font-extrabold leading-tight">{r.title}</div>
                <SoftPill>{r.cost} cr</SoftPill>
              </div>
              <div className="flex-1 text-[13px] text-muted">
                {out ? "Out of stock" : can ? r.description : `${r.left > 0 ? `${r.left} left · ` : ""}${r.cost - rw.balance} more credits needed`}
              </div>
              <ActionForm
                action={redeemReward} inline size="sm" variant={can ? "primary" : "secondary"} disabled={!can}
                submitLabel={out ? "Out of stock" : afford ? "Redeem" : "Not enough credits"}
                className="[&_button]:h-9 [&_button]:rounded-xl [&_button]:px-3.5"
                confirm={{
                  title: `Redeem ${r.title}?`,
                  body: `${r.cost} credits will be deducted. Your administrator confirms delivery.`,
                  confirmLabel: `Redeem for ${r.cost} cr`,
                  detail: (
                    <div className="flex items-center justify-between rounded-[10px] bg-bg px-3.5 py-3 text-sm">
                      <span className="text-muted">Balance after</span>
                      <span className="font-extrabold tabular-nums">{rw.balance - r.cost} credits</span>
                    </div>
                  ),
                }}
              >
                <input type="hidden" name="reward_id" value={r.id} />
              </ActionForm>
            </div>
          );
        })}
      </Body>
    ),
  };
}

function latestView(size: WidgetSize, d: CanvasData, api: WidgetApi): WidgetView {
  const l = d.latest;
  if (!l) return { title: "Latest briefing", body: <Body><Empty action={<WidgetLink href="/app/routines/new">Start a routine →</WidgetLink>}>No briefing yet.</Empty></Body> };
  return {
    title: "Latest briefing",
    meta: <span>{l.title} · {l.when}</span>,
    body: (
      <div className="flex flex-1 flex-col">
        <ol className="m-0 flex flex-1 list-none flex-col p-0">
          {l.cards.map((c, n) => (
            <li key={c.title} className="flex flex-1 gap-3 border-b border-line px-[18px] py-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accsoft text-[11px] font-extrabold">{n + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{c.title}</span>
                {size === "L" ? <span className="line-clamp-2 block text-[13px] text-muted">{c.lead}</span> : null}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex items-center justify-between gap-3 px-[18px] py-3">
          <button type="button" onClick={() => api.copy(l.text, "All cards copied to clipboard")} className="border-0 bg-transparent p-0 text-[13px] font-bold text-acc hover:underline">Copy all cards</button>
          <WidgetLink href={`/app/routines/${l.id}`}>Open session →</WidgetLink>
        </div>
      </div>
    ),
  };
}

/* ================================================================== tools */
/** Each widget's own tools, primary first. Only tools with a working destination are listed. */
export function widgetTools(id: WidgetId, d: CanvasData, api: WidgetApi): Tool[] {
  const lastSession = d.recent.sessions[0];
  switch (id) {
    case "start": {
      const tools: Tool[] = [
        d.user.hasReport
          ? { key: "continue", label: "Continue", icon: "play", primary: true, href: api.briefingHref, hint: "Go to the briefing form for the chosen routine" }
          : { key: "upload", label: "Upload", icon: "upload", primary: true, href: "/app/report?view=upload", hint: "Routines unlock once your report is verified" },
        { key: "partner", label: "Partner", icon: "userPlus", onSelect: api.openPartnerPicker, hint: "Switch between solo and a consented partner" },
        { key: "context", label: "Context", icon: "message", href: `${api.briefingHref}#context`, hint: "Add aircraft, phase and scenario before generating" },
      ];
      if (d.start.last) {
        const q = new URLSearchParams({ routine: d.start.last.routine, ...(d.start.last.partnerId ? { partner: d.start.last.partnerId } : {}) });
        tools.push({ key: "last", label: "Last used", icon: "clock", href: `/app/routines/new?${q}`, hint: "Repeat your previous routine setup" });
      }
      return tools;
    }
    case "tier":
      return [
        { key: "redeem", label: "Redeem", icon: "gift", primary: true, href: "/app/rewards", hint: "Open the catalog with your balance" },
        { key: "rules", label: "Rules", icon: "book", href: "/app/rewards?view=rules", hint: "What earns credits, and how many" },
        { key: "log", label: "Log", icon: "clock", href: "/app/rewards?view=activity", hint: "Credits you earned or spent recently" },
      ];
    case "recent": {
      if (!lastSession) return [{ key: "start", label: "Start", icon: "play", primary: true, href: "/app/routines/new", hint: "Generate your first routine" }];
      const next: Record<RecentFilter, RecentFilter> = { all: "solo", solo: "synergy", synergy: "all" };
      return [
        { key: "open", label: "Open last", icon: "open", primary: true, href: `/app/routines/${lastSession.id}`, hint: "Jump to the newest session and its cards" },
        ...(d.latest ? [{ key: "copy", label: "Copy cards", icon: "copy" as const, onSelect: () => api.copy(d.latest!.text, "All cards copied to clipboard"), hint: "Copy the newest session's action cards as text" }] : []),
        { key: "reflect", label: "Reflect", icon: "message", href: `/app/routines/${lastSession.id}?view=reflection`, hint: `Close the loop: what worked, what to change (+${d.credits.reflection} credits, once a day)` },
        { key: "filter", label: api.recentFilter === "all" ? "Filter" : api.recentFilter === "solo" ? "Solo" : "Synergy", icon: "filter", pressed: api.recentFilter !== "all", onSelect: () => api.setRecentFilter(next[api.recentFilter]), hint: "Cycle: all sessions, solo only, synergy only" },
      ];
    }
    case "insight": {
      const past: Tool = { key: "past", label: "Past", icon: "clock", href: "/app/insights?view=past", hint: "Browse earlier insights" };
      if (!d.insight) return [{ ...past, primary: true }];
      return [
        { key: "confirm", label: d.insight.confirmed ? "Confirmed" : "Confirm", icon: "check", primary: !d.insight.confirmed, disabled: d.insight.confirmed || api.confirming, onSelect: api.confirmInsight, hint: `Mark it read, +${d.credits.insight} credits, once per week` },
        past,
        api.snoozed
          ? { key: "show", label: "Show", icon: "eye", onSelect: () => api.setSnoozed(false), hint: "Show this week's insight again" }
          : { key: "snooze", label: "Snooze", icon: "bell", onSelect: () => api.setSnoozed(true), hint: "Collapse it until next week" },
      ];
    }
    case "partners":
      return [
        { key: "request", label: "Request", icon: "userPlus", primary: true, href: "/app/consents?view=request", hint: "Ask a colleague to share for a routine" },
        { key: "review", label: "Review", icon: "users", href: "/app/consents", badge: d.partners?.incoming.length || undefined, hint: "Approve or decline requests sent to you" },
      ];
    case "report":
      return [
        d.report.verified
          ? { key: "preview", label: "Preview", icon: "eye", primary: true, href: "/app/report", hint: "See the profile summary behind your report" }
          : { key: "upload", label: "Upload", icon: "upload", primary: true, href: "/app/report?view=upload", hint: "Add your report (PDF)" },
        { key: "privacy", label: "Privacy", icon: "shield", onSelect: api.openPrivacy, hint: "What is stored, and who can see what" },
      ];
    case "rewards":
      return [
        { key: "catalog", label: "Catalog", icon: "gift", primary: true, href: "/app/rewards", hint: "The full list of rewards" },
        { key: "redeemed", label: "Redeemed", icon: "clock", href: "/app/rewards?view=redeemed", hint: "Your redemptions and their status" },
        { key: "rules", label: "Rules", icon: "book", href: "/app/rewards?view=rules", hint: "How credits are earned" },
      ];
    case "latest": {
      const l = d.latest;
      if (!l) return [{ key: "start", label: "Start", icon: "play", primary: true, href: "/app/routines/new", hint: "Generate your first routine" }];
      return [
        { key: "open", label: "Open", icon: "open", primary: true, href: `/app/routines/${l.id}`, hint: "Open the session with all its cards" },
        { key: "copy", label: "Copy", icon: "copy", onSelect: () => api.copy(l.text, "All cards copied to clipboard"), hint: "Copy all action cards as text" },
        { key: "reflect", label: "Reflect", icon: "message", href: `/app/routines/${l.id}?view=reflection`, hint: `Close the loop (+${d.credits.reflection} credits, once a day)` },
      ];
    }
  }
}
