import Link from "next/link";
import { redirect } from "next/navigation";
import { FilterChips, FullView, homeLink, Pane, PaneEmpty, PaneGrid, pickView, type Kpi, type ViewSection } from "@/components/full-view";
import { LinkButton, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getCanvasState } from "@/lib/canvas/server";
import { CREW_ROUTINES } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { formatDate, humanize, relativeDay, ROUTINE_SHORT, sessionTitle, shortName, singleParams, type SearchParams } from "@/lib/utils";
import { clip, isUuidLike, ModeBadge } from "./shared";

const VIEWS = ["sessions", "reflections"] as const;
const PAGE = 15;
const REFLECTIONS = 30;
const BASE = "/app/routines";

type Mode = "all" | "solo" | "synergy";

/** History links keep the filters; the default view, "all" filters and page 1 stay out of the URL. */
function historyHref({ mode, r, page }: { mode: Mode; r: string; page?: number }): string {
  const q = new URLSearchParams();
  if (mode !== "all") q.set("mode", mode);
  if (r !== "all") q.set("r", r);
  if (page && page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `${BASE}?${s}` : BASE;
}

const linkCls = "text-sm font-bold text-acc hover:underline";

export default async function RoutineHistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = singleParams(await searchParams);

  // Old links (the canvas "Continue" tool, bookmarks) carried the briefing prefill here: send them to Start.
  if (sp.routine !== undefined || sp.partner !== undefined) {
    const q = new URLSearchParams();
    if ((CREW_ROUTINES as readonly string[]).includes(sp.routine ?? "")) q.set("routine", sp.routine!);
    if (isUuidLike(sp.partner)) q.set("partner", sp.partner);
    const s = q.toString();
    redirect(s ? `${BASE}/new?${s}` : `${BASE}/new`);
  }

  const view = pickView(sp.view, VIEWS);
  const supabase = await createClient();

  const mode: Mode = sp.mode === "solo" || sp.mode === "synergy" ? sp.mode : "all";
  const r = (CREW_ROUTINES as readonly string[]).includes(sp.r ?? "") ? sp.r! : "all";
  const page = Math.max(1, Math.min(500, Number.parseInt(sp.page ?? "1", 10) || 1));

  let sessions = supabase.from("routine_sessions").select("id, routine_code, created_at, partner_user_id, scenario_context", { count: "exact" })
    .eq("primary_user_id", user.id).neq("routine_code", "coaching");
  if (mode === "solo") sessions = sessions.is("partner_user_id", null);
  if (mode === "synergy") sessions = sessions.not("partner_user_id", "is", null);
  if (r !== "all") sessions = sessions.eq("routine_code", r);

  const [canvas, totalRes, synergyRes, reflCountRes, lastRes, pageRes, reflectionsRes] = await Promise.all([
    getCanvasState(user),
    supabase.from("routine_sessions").select("id", { count: "exact", head: true }).eq("primary_user_id", user.id).neq("routine_code", "coaching"),
    supabase.from("routine_sessions").select("id", { count: "exact", head: true }).eq("primary_user_id", user.id).neq("routine_code", "coaching").not("partner_user_id", "is", null),
    supabase.from("reflections").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("routine_sessions").select("routine_code, created_at").eq("primary_user_id", user.id).neq("routine_code", "coaching").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    view === "sessions" ? sessions.order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1) : Promise.resolve({ data: null, count: null }),
    view === "reflections"
      ? supabase.from("reflections").select("id, created_at, routine_type, session_id, what_worked, what_to_change").eq("user_id", user.id).order("created_at", { ascending: false }).limit(REFLECTIONS)
      : Promise.resolve({ data: null }),
  ]);

  const total = totalRes.count ?? 0;
  const synergy = synergyRes.count ?? 0;
  const reflectionCount = reflCountRes.count ?? 0;
  const last = lastRes.data;
  const rows = pageRes.data ?? [];
  const matching = pageRes.count ?? 0;

  // Second step for the visible page only: which sessions have a reflection, and partner names.
  const ids = rows.map((s) => s.id);
  const withPartner = rows.some((s) => s.partner_user_id);
  const [doneRes, directoryRes] = await Promise.all([
    ids.length ? supabase.from("reflections").select("session_id").eq("user_id", user.id).in("session_id", ids) : Promise.resolve({ data: [] as Array<{ session_id: string | null }> }),
    withPartner && user.organizationId ? supabase.rpc("crew_directory") : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
  ]);
  const reflected = new Set((doneRes.data ?? []).map((d) => d.session_id).filter(Boolean));
  const names = new Map((directoryRes.data ?? []).map((d) => [d.id, shortName(d.full_name)]));

  const list = rows.map((s) => {
    const ctx = (s.scenario_context ?? {}) as Record<string, string>;
    return {
      id: s.id,
      title: sessionTitle(s.routine_code),
      scenario: [ctx.aircraft, ctx.phase].filter(Boolean).join(" · ") || null,
      partner: s.partner_user_id ? names.get(s.partner_user_id) ?? "Crew member" : null,
      synergy: Boolean(s.partner_user_id),
      reflected: reflected.has(s.id),
      date: formatDate(s.created_at),
    };
  });

  const sections: ViewSection[] = [
    { key: "sessions", label: "Sessions", icon: "clock", hint: "Every routine you generated, with filters" },
    { key: "reflections", label: "Reflections", icon: "message", hint: "What worked and what you will change" },
  ];
  const kpis: Kpi[] = [
    { label: "Sessions", value: total, hint: "solo and synergy", tone: "acc" },
    { label: "Synergy sessions", value: synergy, hint: total ? `${Math.round((synergy / total) * 100)}% of sessions` : "with a consented partner" },
    { label: "Reflections", value: reflectionCount, hint: "after your sessions", tone: reflectionCount ? "ok" : "neutral" },
    { label: "Last session", value: last ? relativeDay(last.created_at) : "None yet", hint: last ? sessionTitle(last.routine_code) : "start your first routine" },
  ];

  const filtered = mode !== "all" || r !== "all";
  const from = (page - 1) * PAGE;

  return (
    <FullView
      basePath={BASE} name="History" title="Routine history" back={homeLink(canvas.active)}
      description="Every routine you generated, with its action cards and your reflections."
      kpis={kpis} sections={sections} active={view}
      actions={[{ key: "start", label: "Start", icon: "play", href: `${BASE}/new`, hint: "Generate a new routine", primary: true }]}
      aside={<LinkButton href={`${BASE}/new`} variant="primary" size="sm" className="md:hidden">Start a routine</LinkButton>}
    >
      {view === "sessions" ? (
        <PaneGrid>
          <Pane title="Sessions" meta={filtered ? `${matching} of ${total}` : `${total} total`} span={12} flush
            footer={matching > 0 && rows.length > 0 ? (
              <>
                <span className="tabular-nums">{from + 1}–{from + rows.length} of {matching} session{matching === 1 ? "" : "s"}</span>
                {matching > PAGE ? (
                  <span className="flex gap-3">
                    {page > 1 ? <Link className="font-bold text-acc hover:underline" href={historyHref({ mode, r, page: page - 1 })}>← Newer</Link> : null}
                    {page * PAGE < matching ? <Link className="font-bold text-acc hover:underline" href={historyHref({ mode, r, page: page + 1 })}>Older →</Link> : null}
                  </span>
                ) : null}
              </>
            ) : undefined}>
            {total > 0 ? (
              <div className="flex flex-col gap-2 px-[18px] pt-3">
                <FilterChips label="Filter by mode" active={mode} options={[
                  { key: "all", label: "All", href: historyHref({ mode: "all", r }), count: r === "all" ? total : undefined },
                  { key: "solo", label: "Solo", href: historyHref({ mode: "solo", r }), count: r === "all" ? total - synergy : undefined },
                  { key: "synergy", label: "Synergy", href: historyHref({ mode: "synergy", r }), count: r === "all" ? synergy : undefined },
                ]} />
                <FilterChips label="Filter by routine" active={r} options={[
                  { key: "all", label: "All routines", href: historyHref({ mode, r: "all" }) },
                  ...CREW_ROUTINES.map((c) => ({ key: c, label: ROUTINE_SHORT[c], href: historyHref({ mode, r: c }) })),
                ]} />
              </div>
            ) : null}

            {total === 0 ? (
              <PaneEmpty action={<Link href={`${BASE}/new`} className={linkCls}>Start a routine →</Link>}>
                No sessions yet. Each routine you generate is saved here with its action cards.
              </PaneEmpty>
            ) : list.length === 0 ? (
              page > 1 ? (
                <PaneEmpty action={<Link href={historyHref({ mode, r })} className={linkCls}>Back to the newest →</Link>}>This page is past the end of the list.</PaneEmpty>
              ) : filtered ? (
                <PaneEmpty action={<Link href={BASE} className={linkCls}>Clear filters →</Link>}>No sessions match these filters.</PaneEmpty>
              ) : (
                <PaneEmpty>Sessions could not be loaded right now. Refresh the page to try again.</PaneEmpty>
              )
            ) : (
              <>
                {/* Tablets and desktop: the full table. */}
                <div className="mt-2 hidden overflow-x-auto md:block">
                  <table className="dt [&_td]:px-[18px] [&_th]:px-[18px]">
                    <thead>
                      <tr><th>Routine</th><th>Scenario</th><th>Partner</th><th>Mode</th><th>Reflection</th><th className="num">Date</th></tr>
                    </thead>
                    <tbody>
                      {list.map((s) => (
                        <tr key={s.id} className="hover:bg-bg">
                          <td className="whitespace-nowrap font-bold"><Link href={`${BASE}/${s.id}`} className="hover:underline">{s.title}</Link></td>
                          <td className="text-muted"><span className="line-clamp-2 max-w-[260px] break-words" title={s.scenario ?? undefined}>{s.scenario ?? "—"}</span></td>
                          <td className="whitespace-nowrap">{s.partner ?? <span className="text-muted">—</span>}</td>
                          <td><ModeBadge synergy={s.synergy} /></td>
                          <td>{s.reflected ? <Pill tone="ok">Done</Pill> : <span className="text-muted">—</span>}</td>
                          <td className="num whitespace-nowrap text-muted">{s.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Phones: one row per session. */}
                <div className="mt-2 border-t border-line md:hidden">
                  {list.map((s) => (
                    <Link key={s.id} href={`${BASE}/${s.id}`} className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-[18px] py-2.5 last:border-b-0 hover:bg-bg">
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-bold">{s.title}</span>
                        <span className="block truncate text-[13px] text-muted">{[s.scenario, s.partner, s.date].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <ModeBadge synergy={s.synergy} />
                        {s.reflected ? <span className="text-xs font-bold text-ok">Reflected</span> : null}
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </Pane>
        </PaneGrid>
      ) : null}

      {view === "reflections" ? (
        <PaneGrid>
          <Pane title="Reflections" meta={reflectionCount > REFLECTIONS ? `Latest ${REFLECTIONS} of ${reflectionCount}` : `${reflectionCount} total`} span={12} flush>
            {reflectionsRes.data && reflectionsRes.data.length ? reflectionsRes.data.map((x) => (
              <article key={x.id} className="flex flex-col gap-1.5 border-b border-line px-[18px] py-3.5 last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-[15px] font-bold">{ROUTINE_SHORT[x.routine_type] ?? humanize(x.routine_type)} reflection</span>
                  <span className="flex items-baseline gap-3 text-[13px] text-muted">
                    <span>{formatDate(x.created_at)}</span>
                    {x.session_id ? <Link href={`${BASE}/${x.session_id}`} className="font-bold text-acc hover:underline">Open session →</Link> : null}
                  </span>
                </div>
                <div className="grid gap-x-6 gap-y-1 text-sm md:grid-cols-2">
                  <p className="m-0 line-clamp-3 break-words"><span className="font-bold">Worked:</span> {clip(x.what_worked)}</p>
                  <p className="m-0 line-clamp-3 break-words"><span className="font-bold">Change:</span> {clip(x.what_to_change)}</p>
                </div>
              </article>
            )) : (
              <PaneEmpty action={last ? <Link href={BASE} className={linkCls}>Pick a session to reflect on →</Link> : <Link href={`${BASE}/new`} className={linkCls}>Start a routine →</Link>}>
                No reflections yet. After a session, note what worked and what you will change.
              </PaneEmpty>
            )}
          </Pane>
        </PaneGrid>
      ) : null}
    </FullView>
  );
}
