import Link from "next/link";
import { FullView, homeLink, Pane, PaneEmpty, PaneGrid, pickView, type Kpi, type ViewSection } from "@/components/full-view";
import { LinkButton, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getCanvasState } from "@/lib/canvas/server";
import { loadConsentedPartners } from "@/lib/partners";
import { CREW_ROUTINES } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { cn, relativeDay, ROUTINE_LABELS, ROUTINE_SHORT, sessionTitle, singleParams, type SearchParams } from "@/lib/utils";
import { RoutineGenerator } from "../generator";
import { ruleCadence } from "../shared";

const VIEWS = ["briefing", "partners"] as const;
const REQUEST_HREF = "/app/consents?view=request";

const linkCls = "self-start text-sm font-bold text-acc hover:underline";
const headingCls = "text-xs font-extrabold uppercase tracking-[0.05em] text-muted";

export default async function StartRoutinePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = singleParams(await searchParams);
  const view = pickView(sp.view, VIEWS);
  const supabase = await createClient();

  const [canvas, partners, ruleRes, countRes, lastRes] = await Promise.all([
    getCanvasState(user),
    loadConsentedPartners(supabase, user.id),
    supabase.from("gamification_rules").select("credits, cooldown_kind, cooldown_limit").eq("action_type", "synergy_brief").eq("is_active", true).maybeSingle(),
    supabase.from("routine_sessions").select("id", { count: "exact", head: true }).eq("primary_user_id", user.id).neq("routine_code", "coaching"),
    supabase.from("routine_sessions").select("routine_code, created_at").eq("primary_user_id", user.id).neq("routine_code", "coaching").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const verified = user.hasActiveReport;
  const initialRoutine = (CREW_ROUTINES as readonly string[]).includes(sp.routine ?? "") ? sp.routine! : "flight";
  const total = countRes.count ?? 0;
  const last = lastRes.data;
  const rule = ruleRes.data;
  const ready = partners.filter((p) => p.hasReport);
  const eligible = (routine: string) => ready.filter((p) => p.routines[routine] !== undefined).length;

  const sections: ViewSection[] = [
    { key: "briefing", label: "Briefing", icon: "play", hint: "Pick a routine, a partner and the context, then generate" },
    { key: "partners", label: "Partners", icon: "users", hint: "Crew who approved sharing with you" },
  ];
  const kpis: Kpi[] = [
    { label: "Report", value: verified ? "Verified" : "Missing", hint: verified ? "used for every brief" : "required to generate", tone: verified ? "ok" : "warn" },
    { label: "Consented partners", value: partners.length, hint: partners.length ? `${ready.length} with a verified report` : "solo briefs only", tone: partners.length ? "acc" : "neutral" },
    { label: "Sessions so far", value: total, hint: "saved to your history" },
    { label: "Last session", value: last ? relativeDay(last.created_at) : "None yet", hint: last ? sessionTitle(last.routine_code) : "nothing generated yet" },
  ];

  return (
    <FullView
      basePath="/app/routines/new" name="Start" title="Start a routine" back={homeLink(canvas.active)}
      description="Pick a routine, optionally a consenting partner, add context, and get operational action cards."
      kpis={kpis} sections={sections} active={view}
      actions={[{ key: "history", label: "History", icon: "clock", href: "/app/routines", hint: "Every session you generated" }]}
    >
      {view === "briefing" ? (
        <PaneGrid>
          <RoutineGenerator disabled={!verified} partners={partners} initialRoutine={initialRoutine} initialPartner={sp.partner ?? ""} />
          <Pane title="Before you generate" span={4}>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold">Your report</span>
                <Pill tone={verified ? "ok" : "warn"}>{verified ? "Verified" : "Missing"}</Pill>
              </div>
              <p className="m-0 text-[13px] text-muted">
                {verified ? "Every brief is written from your verified profile." : "Load and verify your report to unlock routine generation."}
              </p>
              <Link href={verified ? "/app/report" : "/app/report?view=upload"} className={linkCls}>{verified ? "My report →" : "Load your report →"}</Link>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-line pt-3">
              <span className="text-sm font-bold">Choosing a partner</span>
              <p className="m-0 text-[13px] text-muted">Only crew who approved sharing for that routine and have a verified report can be chosen. Everyone else is listed with the reason.</p>
              <ul className="m-0 flex list-none flex-col p-0">
                {CREW_ROUTINES.map((r) => {
                  const n = eligible(r);
                  return (
                    <li key={r} className="flex items-center justify-between gap-3 py-1 text-sm">
                      <span className="font-semibold">{ROUTINE_LABELS[r]}</span>
                      <span className={cn("tabular-nums", n ? "font-bold text-acc" : "text-muted")}>{n ? `${n} partner${n === 1 ? "" : "s"}` : "Solo only"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {rule ? (
              <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold">Credits per brief</span>
                  <span className="font-extrabold tabular-nums text-ok">+{rule.credits}</span>
                </div>
                <p className="m-0 text-[13px] text-muted">Earned for each brief you generate, solo or with a partner, {ruleCadence(rule)}.</p>
              </div>
            ) : null}

            <div className="border-t border-line pt-3">
              <Link href={REQUEST_HREF} className={linkCls}>Request a partner →</Link>
            </div>
          </Pane>
        </PaneGrid>
      ) : null}

      {view === "partners" ? (
        <PaneGrid>
          <Pane title="Consented partners" meta={`${partners.length} partner${partners.length === 1 ? "" : "s"}`} span={8} flush
            footer={partners.length ? (
              <>
                <span>Approvals are per routine and last 30 days.</span>
                <LinkButton href={REQUEST_HREF} size="sm">Request another partner</LinkButton>
              </>
            ) : undefined}>
            {partners.length ? partners.map((p) => {
              const days = Object.values(p.routines);
              const min = Math.min(...days);
              const max = Math.max(...days);
              const left = min === max ? `${max} day${max === 1 ? "" : "s"} left` : `${min}–${max} days left`;
              return (
                <div key={p.id} className="flex flex-col gap-2 border-b border-line px-[18px] py-3 last:border-b-0 md:min-h-14 md:flex-row md:items-center md:justify-between md:gap-3 md:py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold">{p.name}</div>
                    <div className="truncate text-[13px] text-muted">{[p.team ?? "Crew", left, p.hasReport ? null : "no report yet"].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 md:shrink-0 md:justify-end">
                    {Object.keys(p.routines).map((r) => (
                      p.hasReport ? (
                        <Link key={r} href={`/app/routines/new?routine=${encodeURIComponent(r)}&partner=${encodeURIComponent(p.id)}`} title={`${ROUTINE_LABELS[r] ?? r} with ${p.name} · ${p.routines[r]} days left`} aria-label={`Start a ${ROUTINE_SHORT[r] ?? r} routine with ${p.name}`} className="rounded-full hover:opacity-80">
                          <Pill tone="acc" dot={false}>{ROUTINE_SHORT[r] ?? r}</Pill>
                        </Link>
                      ) : (
                        <span key={r} title={`${ROUTINE_LABELS[r] ?? r} · ${p.routines[r]} days left`}><Pill dot={false}>{ROUTINE_SHORT[r] ?? r}</Pill></span>
                      )
                    ))}
                  </div>
                </div>
              );
            }) : (
              <PaneEmpty action={<Link href={REQUEST_HREF} className={linkCls}>Request sharing →</Link>}>
                No consented partners yet. Ask a colleague to share for a routine to unlock Blind Synergy.
              </PaneEmpty>
            )}
          </Pane>
          <Pane title="Blind Synergy" span={4} tint>
            <p className="m-0 text-sm">Partners never see your type or profile, and you never see theirs.</p>
            <p className="m-0 text-sm">Blind Synergy uses both profiles only to write the action cards for the person who asked. The cards are saved to that person&apos;s history only.</p>
            <div className="flex flex-col gap-1">
              <span className={headingCls}>Consent</span>
              <p className="m-0 text-[13px] text-muted">A partner approves one routine type at a time. Requests expire after 14 days; approvals stay valid for 30 days.</p>
            </div>
            {ready.length ? <p className="m-0 text-[13px] text-muted">Select a routine next to a partner to open the briefing with them already chosen.</p> : null}
          </Pane>
        </PaneGrid>
      ) : null}
    </FullView>
  );
}
