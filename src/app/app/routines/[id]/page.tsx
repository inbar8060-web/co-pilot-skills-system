import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { FullView, Pane, PaneEmpty, PaneGrid, pickView, type ViewSection } from "@/components/full-view";
import { InsightCards, outputToText } from "@/components/insight-cards";
import { Field, KeyValue, Mono, Textarea } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CREW_ROUTINES } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { formatDate, sessionTitle, singleParams, type SearchParams } from "@/lib/utils";
import { submitReflection } from "../../actions";
import { HashToView } from "../hash-view";
import { ModeBadge, ruleCadence } from "../shared";

const VIEWS = ["cards", "context", "reflection"] as const;

const termCls = "text-xs font-extrabold uppercase tracking-[0.05em] text-muted";

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const user = await requireUser();
  const sp = singleParams(await searchParams);
  const view = pickView(sp.view, VIEWS);
  const supabase = await createClient();
  const { data: session } = await supabase.from("routine_sessions").select("*").eq("id", id).eq("primary_user_id", user.id).maybeSingle();
  if (!session) notFound();

  const [reflectionsRes, creditRes, directoryRes, ruleRes] = await Promise.all([
    supabase.from("reflections").select("id, created_at, what_worked, what_to_change").eq("session_id", id).order("created_at", { ascending: false }),
    supabase.from("gamification_logs").select("credits_awarded").eq("user_id", user.id).eq("action_type", "synergy_brief").eq("metadata->>session_id", id).maybeSingle(),
    session.partner_user_id ? supabase.rpc("crew_directory") : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
    supabase.from("gamification_rules").select("credits, cooldown_kind, cooldown_limit").eq("action_type", "reflection").eq("is_active", true).maybeSingle(),
  ]);
  const ctx = (session.scenario_context ?? {}) as Record<string, string>;
  const routine = session.routine_code;
  const synergy = Boolean(session.partner_user_id);
  const partnerName = (directoryRes.data ?? []).find((d) => d.id === session.partner_user_id)?.full_name;
  const subtitle = [
    synergy ? `Blind synergy${partnerName ? ` with ${partnerName}` : ""}` : "Solo self-briefing",
    ctx.aircraft, ctx.phase, formatDate(session.created_at),
  ].filter(Boolean).join(" · ");
  const reflections = reflectionsRes.data ?? [];
  const rule = ruleRes.data;
  const reflectionCredits = rule ? `+${rule.credits} credits, ${ruleCadence(rule)}` : null;
  const basePath = `/app/routines/${session.id}`;
  const hasContext = Boolean(ctx.scenario || ctx.notes || ctx.aircraft || ctx.phase);
  const crewRoutine = (CREW_ROUTINES as readonly string[]).includes(routine);

  const sections: ViewSection[] = [
    { key: "cards", label: "Cards", icon: "list", hint: "The action cards for this session" },
    { key: "context", label: "Context", icon: "message", hint: "What you entered and how the cards were made" },
    { key: "reflection", label: "Reflect", icon: "check", hint: "What worked, what you will change", badge: reflections.length || undefined },
  ];

  return (
    <FullView
      basePath={basePath} name="Session" title={sessionTitle(routine)} description={subtitle}
      back={{ href: "/app/routines", label: "History" }}
      sections={sections} active={view}
      aside={<CopyButton text={outputToText(session.ai_generated_output)} label="Copy all cards →" toastText="All cards copied to clipboard" className="p-0 text-sm" />}
    >
      <HashToView basePath={basePath} hash="reflection" view="reflection" active={view} />

      {view === "cards" ? (
        <PaneGrid>
          <div className="col-span-1 flex min-w-0 flex-col gap-4 md:col-span-6 xl:col-span-12">
            <h2 className="sr-only">Action cards</h2>
            <InsightCards routine={routine} output={session.ai_generated_output} />
            {reflections.length === 0 ? (
              <Link href={`${basePath}?view=reflection`} className="self-start text-sm font-bold text-acc hover:underline">
                After the session, add a reflection{reflectionCredits ? ` (${reflectionCredits})` : ""} →
              </Link>
            ) : null}
          </div>
        </PaneGrid>
      ) : null}

      {view === "context" ? (
        <PaneGrid>
          <Pane title="Context you gave" span={8} flush={!hasContext}>
            {hasContext ? (
              <dl className="m-0 grid gap-4 md:grid-cols-2">
                {ctx.aircraft || ctx.phase ? (
                  <>
                    <div className="min-w-0"><dt className={termCls}>Aircraft / fleet</dt><dd className="m-0 mt-1 break-words text-[15px]">{ctx.aircraft || "—"}</dd></div>
                    <div className="min-w-0"><dt className={termCls}>Phase / scenario type</dt><dd className="m-0 mt-1 break-words text-[15px]">{ctx.phase || "—"}</dd></div>
                  </>
                ) : null}
                {ctx.scenario ? <div className="min-w-0 md:col-span-2"><dt className={termCls}>Scenario</dt><dd className="m-0 mt-1 whitespace-pre-wrap break-words text-[15px]">{ctx.scenario}</dd></div> : null}
                {ctx.notes ? <div className="min-w-0 md:col-span-2"><dt className={termCls}>Notes</dt><dd className="m-0 mt-1 whitespace-pre-wrap break-words text-[15px]">{ctx.notes}</dd></div> : null}
              </dl>
            ) : (
              <PaneEmpty action={crewRoutine ? <Link href={`/app/routines/new?routine=${encodeURIComponent(routine)}#context`} className="text-sm font-bold text-acc hover:underline">Start a new {sessionTitle(routine).toLowerCase()} with context →</Link> : undefined}>
                No context was added to this session. Aircraft, phase and a short scenario make the cards more specific.
              </PaneEmpty>
            )}
          </Pane>
          <Pane title="Session details" span={4}>
            <KeyValue items={[
              { k: "Mode", v: <ModeBadge synergy={synergy} /> },
              ...(synergy ? [{ k: "Partner", v: partnerName ?? "Crew member" }] : []),
              { k: "Model", v: session.model ? <Mono className="break-all">{session.model}</Mono> : "—" },
              { k: "Created", v: formatDate(session.created_at) },
              ...(creditRes.data ? [{ k: "Credits", v: <span className="font-extrabold tabular-nums text-ok">+{creditRes.data.credits_awarded} earned</span> }] : []),
            ]} />
            <p className="m-0 text-[13px] text-muted">Saved to your history. {synergy ? "Your partner does not see these cards." : "Only you can see these cards."}</p>
          </Pane>
        </PaneGrid>
      ) : null}

      {view === "reflection" ? (
        <PaneGrid>
          <Pane id="reflection" title="Reflection" meta={reflectionCredits ?? undefined} span={8}>
            <p className="m-0 text-sm text-muted">Close the learning loop after the session.</p>
            <ActionForm action={submitReflection} submitLabel="Save reflection" size="lg" resetOnSuccess>
              <input type="hidden" name="session_id" value={session.id} />
              <input type="hidden" name="routine_type" value={routine === "coaching" ? "training" : routine} />
              <div className="grid gap-3.5 md:grid-cols-2">
                <Field label="What worked well?"><Textarea name="what_worked" rows={4} required minLength={3} maxLength={4000} /></Field>
                <Field label="What will you change next time?"><Textarea name="what_to_change" rows={4} required minLength={3} maxLength={4000} /></Field>
              </div>
            </ActionForm>
          </Pane>
          <Pane title="Past reflections" meta={reflections.length ? `${reflections.length}` : undefined} span={4} flush={reflections.length === 0}>
            {reflections.length ? reflections.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 rounded-[10px] bg-bg px-3.5 py-3 text-sm">
                <div className="text-xs font-bold text-muted">{formatDate(r.created_at)}</div>
                <div className="whitespace-pre-wrap break-words"><span className="font-bold">Worked:</span> {r.what_worked}</div>
                <div className="whitespace-pre-wrap break-words"><span className="font-bold">Change:</span> {r.what_to_change}</div>
              </div>
            )) : <PaneEmpty>No reflections for this session yet.</PaneEmpty>}
          </Pane>
        </PaneGrid>
      ) : null}
    </FullView>
  );
}
