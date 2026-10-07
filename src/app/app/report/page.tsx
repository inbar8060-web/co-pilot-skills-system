import { FullView, homeLink, Pane, PaneGrid, pickView, type Kpi, type ViewSection } from "@/components/full-view";
import { KeyValue, LinkButton, Mono, Pill, StatusText } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getCanvasState } from "@/lib/canvas/server";
import { MAX_PDF_MB } from "@/lib/limits";
import { loadPersona } from "@/lib/routines";
import { createClient } from "@/lib/supabase/server";
import { formatDay, humanize, relativeDay, singleParams, type SearchParams } from "@/lib/utils";
import { ReportUploader } from "./uploader";

const WITH_REPORT = ["overview", "privacy"] as const;
const WITHOUT_REPORT = ["overview", "privacy", "upload"] as const;
type View = (typeof WITHOUT_REPORT)[number];

const LINK_METHOD: Record<string, string> = { self: "Uploaded by you", auto: "Matched automatically", manual: "Linked by an administrator" };
/** Shorter form for the KPI hint, which is truncated to one line on phones. */
const LINK_METHOD_SHORT: Record<string, string> = { self: "uploaded by you", auto: "matched by email", manual: "by an administrator" };

const Trait = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-3 border-t border-line py-2.5"><span className="shrink-0 text-muted">{k}</span><span className="text-right font-semibold">{v}</span></div>
);
const TraitList = ({ title, items }: { title: string; items: string[] }) => (
  <div className="min-w-0">
    <div className="mb-1.5 text-xs font-extrabold uppercase tracking-[0.05em] text-muted">{title}</div>
    {items.length ? <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px]">{items.map((s) => <li key={s}>{s}</li>)}</ul> : <div className="text-muted">None listed</div>}
  </div>
);

export default async function ReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = singleParams(await searchParams);
  const supabase = await createClient();

  const [canvas, profile, ruleRes] = await Promise.all([
    getCanvasState(user),
    user.hasActiveReport ? loadPersona(user.id) : Promise.resolve(null),
    supabase.from("gamification_rules").select("credits, is_active").eq("action_type", "report_verified").maybeSingle(),
  ]);

  const p = profile?.persona ?? null;
  const verified = Boolean(profile && p);
  const views: readonly View[] = verified ? WITH_REPORT : WITHOUT_REPORT;
  const view = pickView<View>(sp.view, views);
  // An inactive rule awards nothing (award_credits only reads active rules), so do not promise credits then.
  const rule = ruleRes.data;
  const reportCredits = rule ? (rule.is_active ? rule.credits : 0) : 100;
  const framework = profile?.framework ? humanize(profile.framework) : null;
  const linkedOn = profile?.linkedAt ? formatDay(profile.linkedAt) : null;
  const linkedHow = profile?.method ? LINK_METHOD[profile.method] ?? null : null;

  const sections: ViewSection[] = [
    { key: "overview", label: "Overview", icon: "eye", hint: verified ? "Your report status and profile summary" : "Why the report matters and what happens next" },
    { key: "privacy", label: "Privacy", icon: "shield", hint: "What is stored and who can see what" },
    ...(verified ? [] : [{ key: "upload", label: "Upload", icon: "upload", hint: "Add your report (PDF)" } satisfies ViewSection]),
  ];
  const kpis: Kpi[] = [
    { label: "Status", value: verified ? "Verified" : "Missing", hint: verified ? "active report" : "no report loaded", tone: verified ? "ok" : "warn" },
    { label: "Framework", value: framework ?? "—", hint: p?.type_code ?? (verified ? "no type code" : "from your report") },
    // Short date in the KPI so it stays on one line at phone width; the Status pane has the full date.
    { label: "Linked", value: profile?.linkedAt ? relativeDay(profile.linkedAt) : "—", hint: (profile?.method ? LINK_METHOD_SHORT[profile.method] : undefined) ?? (verified ? undefined : "not linked yet") },
    { label: "Routines", value: verified ? "Unlocked" : "Blocked", hint: verified ? "briefings and debriefs" : "until a report is loaded", tone: verified ? "ok" : "bad" },
  ];

  const fileNote = (
    <Pane title="What happens to the file" span={4}>
      <p className="m-0 text-sm">The text is normalised into a behavioural persona and stored under an anonymous token. The original file is not kept.</p>
      {reportCredits > 0 ? (
        <>
          <div className="flex items-center justify-between gap-3 rounded-[10px] bg-bg px-3.5 py-3 text-sm">
            <span className="text-muted">Loading a verified report earns</span>
            <span className="whitespace-nowrap font-extrabold tabular-nums text-ok">+{reportCredits} credits</span>
          </div>
          <p className="m-0 text-[13px] text-muted">One time, the first time a report is linked to your account.</p>
        </>
      ) : null}
    </Pane>
  );

  return (
    <FullView
      basePath="/app/report" name="Report" title="My report" back={homeLink(canvas.active)}
      description={'Stored behind the anonymity wall under an anonymous token. Only you see this summary; your organization sees "Report loaded: Yes/No".'}
      kpis={kpis} sections={sections} active={view}
    >
      {view === "overview" && profile && p ? (
        <PaneGrid>
          <Pane title="Status" span={4}>
            <StatusText tone="ok">Active verified report</StatusText>
            <KeyValue items={[
              { k: "Token", v: <Mono>{profile.code}</Mono> },
              { k: "Framework", v: framework ?? "—" },
              { k: "Linked", v: linkedOn ?? "—" },
              { k: "Method", v: linkedHow ?? "—" },
              { k: "Confidence", v: <span className="capitalize">{p.confidence}</span> },
            ]} />
            <p className="m-0 text-[13px] text-muted">Your type is never shown to partners (anonymity wall).</p>
          </Pane>
          <Pane title="Profile summary" span={8} meta={p.type_code ? <span className="text-[13px] font-extrabold tracking-[0.05em] text-acc">{p.type_code}</span> : undefined}>
            <p className="m-0 text-[15px]">{p.summary}</p>
            <div className="grid gap-x-6 text-sm md:grid-cols-2">
              <Trait k="Communication" v={p.communication_style} />
              <Trait k="Conflict" v={p.conflict_style} />
              <Trait k="Decisions" v={p.decision_making_style} />
              <Trait k="Leadership" v={p.leadership_style} />
              <Trait k="Under stress" v={p.stress_response} />
            </div>
            <div className="grid gap-4 border-t border-line pt-4 text-sm md:grid-cols-3">
              <TraitList title="Strengths" items={p.strengths} />
              <TraitList title="Watch-outs" items={p.watch_outs} />
              <TraitList title="Feedback preferences" items={p.feedback_preferences} />
            </div>
          </Pane>
        </PaneGrid>
      ) : null}

      {view === "overview" && !verified ? (
        <PaneGrid>
          <Pane title="No report loaded" span={8} meta={<Pill tone="warn">Routines blocked</Pill>}>
            <p className="m-0 text-[15px] font-bold">Routine generation is blocked until a full report is loaded.</p>
            <p className="m-0 text-sm text-muted">Briefings, debriefs and Blind Synergy all start from your behavioural profile. Upload your MBTI Step I/II or Symbiotics ADAPT report, or ask your administrator to link it.</p>
            <LinkButton href="/app/report?view=upload" variant="primary" className="self-start">Upload report</LinkButton>
          </Pane>
          {fileNote}
        </PaneGrid>
      ) : null}

      {view === "upload" ? (
        <PaneGrid>
          <Pane title="Upload your report" span={8}>
            <p className="m-0 text-[13px] text-muted">PDF only, up to {MAX_PDF_MB} MB. The parser validates it is a complete MBTI Step I/II or Symbiotics ADAPT report.</p>
            <ReportUploader doneHref="/app/report" />
          </Pane>
          {fileNote}
        </PaneGrid>
      ) : null}

      {view === "privacy" ? (
        <PaneGrid>
          <Pane title="What is stored" span={7}>
            <ul className="m-0 flex list-disc flex-col gap-2.5 pl-5 text-sm">
              <li>Your PDF is read once and normalised into a behavioural persona: communication, decisions, conflict, leadership, stress response, strengths, watch-outs and feedback preferences.</li>
              <li>The persona is stored behind the anonymity wall under an anonymous token{profile?.code ? <> (yours is <Mono>{profile.code}</Mono>)</> : null}.</li>
              <li>The file itself is not kept.</li>
              <li>A name or email printed on the report stays behind the wall and is used only to match the report to the right account.</li>
            </ul>
          </Pane>
          <Pane title="Who can see what" span={5}>
            <ul className="m-0 flex list-disc flex-col gap-2.5 pl-5 text-sm">
              <li><span className="font-bold">You</span> see this summary.</li>
              <li><span className="font-bold">Partners</span> never see your type or profile. Blind Synergy uses both profiles only to write the action cards for the person who asked.</li>
              <li><span className="font-bold">Your organization</span> sees only &quot;Report loaded: Yes/No&quot;.</li>
              <li>Every link between a report and an account is recorded in an audit log.</li>
            </ul>
          </Pane>
          <Pane title="Replacing your report" span={12}>
            <p className="m-0 text-sm">Replacing a report is not available yet. If your report is out of date or linked to the wrong account, contact your administrator.</p>
          </Pane>
        </PaneGrid>
      ) : null}
    </FullView>
  );
}
