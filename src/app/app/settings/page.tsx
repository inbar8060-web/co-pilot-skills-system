import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { FullView, homeLink, Pane, PaneEmpty, PaneGrid, PaneRow, pickView, type Kpi, type ViewSection } from "@/components/full-view";
import { ChipChecks, Dot, Field, Group, Input, Pill, RadioCards, RuleList, Segmented } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { WIDGETS } from "@/lib/canvas/registry";
import { getCanvasState } from "@/lib/canvas/server";
import { CREW_ROUTINES } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { cn, ROLE_LABELS, ROUTINE_LABELS, singleParams, type SearchParams } from "@/lib/utils";
import { changePassword, savePreferences, saveProfile } from "../actions";
import { CanvasViewSwitch, ResetLayoutButton, ShowWidgetButton } from "./canvas-controls";

const VIEWS = ["profile", "sharing", "notifications", "canvas"] as const;
type View = (typeof VIEWS)[number];

const FOCUS = [
  { value: "briefing_prep", label: "Briefing preparation" },
  { value: "stress_management", label: "Stress management" },
  { value: "debrief_reflection", label: "Debrief & reflection" },
];
const FOCUS_VALUES = FOCUS.map((f) => f.value);
const FREQUENCIES = ["high", "medium", "low", "off"] as const;
const LEVELS = [
  { value: "level_0_private", title: "Level 0 · Private", desc: "No shared routines at all", short: "Level 0", name: "Private", more: "Disables all shared routines: no partner can include you." },
  { value: "level_1_blind_synergy", title: "Level 1 · Blind synergy", desc: "Recommended. Partners get interface insights, never your data", short: "Level 1", name: "Blind synergy", more: "Recommended. Allows Blind Synergy: partners get interface insights for working with you, never your data." },
  { value: "level_2_full", title: "Level 2 · Full", desc: "Reserved for future use", short: "Level 2", name: "Full", more: "Reserved for future use." },
];

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const hhmm = (t: string | null) => t?.slice(0, 5) ?? "";

/** One hidden input per value, so a view's form also posts the other view's saved values. */
function Hidden({ name, values }: { name: string; values: string | readonly string[] }) {
  const list = typeof values === "string" ? [values] : values;
  return <>{list.map((v, i) => <input key={`${name}-${i}`} type="hidden" name={name} value={v} />)}</>;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = singleParams(await searchParams);
  const supabase = await createClient();

  const [canvas, prefsRes] = await Promise.all([
    getCanvasState(user),
    supabase.from("user_preferences_and_consent").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  const keys: readonly View[] = canvas.available ? VIEWS : VIEWS.filter((k) => k !== "canvas");
  const view = pickView(sp.view, keys);

  // If the saved row could not be read, the hidden inputs would carry defaults and overwrite it: block saving.
  const prefsFailed = Boolean(prefsRes.error);
  const prefsAlert = prefsFailed ? (
    <p role="alert" className="m-0 rounded-[10px] border border-bad bg-badsoft px-3.5 py-2.5 text-sm font-semibold text-bad">
      Your saved preferences could not be loaded. Reload the page before saving.
    </p>
  ) : null;
  // Defaults used when the user has never saved preferences.
  const p = prefsRes.data ?? {
    sharing_level: "level_1_blind_synergy", allowed_scenarios: ["simulator", "flight", "debrief"], notification_frequency: "medium",
    notification_focus: FOCUS_VALUES, max_notifications_per_week: 3, quiet_hours_start: null as string | null, quiet_hours_end: null as string | null,
  };
  // savePreferences validates every field, so carry only values it accepts.
  const scenarios = p.allowed_scenarios.filter((s) => (CREW_ROUTINES as readonly string[]).includes(s));
  const focus = p.notification_focus.filter((f) => FOCUS_VALUES.includes(f));
  const quietStart = hhmm(p.quiet_hours_start);
  const quietEnd = hhmm(p.quiet_hours_end);
  const hasQuiet = Boolean(quietStart && quietEnd);
  const level = LEVELS.find((l) => l.value === p.sharing_level);
  const freq = cap(p.notification_frequency);
  const off = p.notification_frequency === "off";

  const hiddenWidgets = canvas.layout.items.filter((i) => i.hidden).map((i) => WIDGETS[i.id]);
  const shownCount = canvas.layout.items.length - hiddenWidgets.length;

  const sections: ViewSection[] = [
    { key: "profile", label: "Profile", icon: "users", hint: "Your name, email, role and password" },
    { key: "sharing", label: "Sharing", icon: "shield", hint: "Your sharing level and the routines partners may request" },
    { key: "notifications", label: "Notify", icon: "bell", hint: "How often you are nudged, quiet hours and focus areas" },
    ...(canvas.available ? [{ key: "canvas", label: "Canvas", icon: "layout", hint: "Your home view, layout and hidden widgets" } satisfies ViewSection] : []),
  ];
  const kpis: Kpi[] = [
    { label: "Sharing level", value: level?.short ?? p.sharing_level, hint: level?.name, tone: p.sharing_level === "level_0_private" ? "warn" : "ok" },
    { label: "Notifications", value: freq, hint: off ? "no nudges" : `max ${p.max_notifications_per_week} a week`, tone: off ? "neutral" : "acc" },
    { label: "Quiet hours", value: hasQuiet ? quietStart : "None", hint: hasQuiet ? `until ${quietEnd}` : "nudges at any time" },
    ...(canvas.available ? [{
      label: "Canvas view", value: canvas.active ? "Canvas" : "Classic",
      hint: canvas.active ? `${shownCount} widget${shownCount === 1 ? "" : "s"} shown` : "classic overview", tone: canvas.active ? "acc" : "neutral",
    } satisfies Kpi] : []),
  ];

  // Each preferences form posts the other view's saved values too, so saving one never resets the other.
  const sharingHidden = (
    <>
      <Hidden name="sharing_level" values={p.sharing_level} />
      <Hidden name="allowed_scenarios" values={scenarios} />
    </>
  );
  const notificationsHidden = (
    <>
      <Hidden name="notification_frequency" values={p.notification_frequency} />
      <Hidden name="notification_focus" values={focus} />
      <Hidden name="max_notifications_per_week" values={String(p.max_notifications_per_week)} />
      <Hidden name="quiet_hours_start" values={quietStart} />
      <Hidden name="quiet_hours_end" values={quietEnd} />
    </>
  );

  return (
    <FullView
      basePath="/app/settings" name="Settings" title="Settings" back={homeLink(canvas.active)}
      description="Your profile, what you share and how often you are nudged."
      kpis={kpis} sections={sections} active={view}
    >
      {view === "profile" ? (
        <PaneGrid>
          <Pane title="Profile" meta={ROLE_LABELS[user.role] ?? user.role} span={7}>
            <ActionForm action={saveProfile} submitLabel="Save profile" className="gap-4">
              <Field label="Full name"><Input name="full_name" defaultValue={user.fullName} required maxLength={120} autoComplete="name" /></Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Email" hint="Used to sign in."><Input value={user.email} disabled readOnly /></Field>
                <Field label="Role"><Input value={ROLE_LABELS[user.role] ?? user.role} disabled readOnly /></Field>
              </div>
            </ActionForm>
          </Pane>
          <Pane title="Password" span={5}>
            <ActionForm action={changePassword} submitLabel="Update password" variant="secondary" resetOnSuccess className="gap-4">
              <Field label="New password"><Input type="password" name="password" placeholder="At least 10 characters" minLength={10} maxLength={128} autoComplete="new-password" required /></Field>
              <Field label="Confirm"><Input type="password" name="confirm" minLength={10} maxLength={128} autoComplete="new-password" required /></Field>
            </ActionForm>
          </Pane>
        </PaneGrid>
      ) : null}

      {view === "sharing" ? (
        <PaneGrid>
          <Pane title="Sharing & consent" meta={<><Dot tone={p.sharing_level === "level_0_private" ? "warn" : "ok"} />{level?.short ?? p.sharing_level}</>} span={8}>
            <p className="m-0 text-sm text-muted">Choose whether partners can include you in shared routines, and for which routines.</p>
            {prefsAlert}
            <ActionForm action={savePreferences} submitLabel="Save sharing" disabled={prefsFailed} className="gap-[22px]">
              <Group label="Sharing level"><RadioCards name="sharing_level" options={LEVELS} defaultValue={p.sharing_level} /></Group>
              <Group label="Routines partners may request">
                <ChipChecks name="allowed_scenarios" options={CREW_ROUTINES.map((r) => ({ value: r, label: ROUTINE_LABELS[r] }))} defaultValues={p.allowed_scenarios} />
              </Group>
              {notificationsHidden}
            </ActionForm>
          </Pane>
          <Pane title="About the levels" span={4}>
            <ul className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
              {LEVELS.map((l) => {
                const here = l.value === p.sharing_level;
                return (
                  <li key={l.value} className="flex gap-2.5">
                    <Dot tone={here ? "acc" : "neutral"} className="mt-1.5" />
                    <div className="min-w-0">
                      <div className={cn("flex flex-wrap items-center gap-2", here ? "font-extrabold" : "font-bold")}>
                        {l.title}{here ? <Pill tone="acc" dot={false}>Current</Pill> : null}
                      </div>
                      <div className="text-muted">{l.more}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="m-0 border-t border-line pt-3 text-[13px] text-muted">
              Routines partners may request limits the routine types a partner can include you in
              {scenarios.length ? ` (now ${scenarios.length} of ${CREW_ROUTINES.length})` : " (none selected now)"}.
            </p>
            <Link href="/app/consents" className="self-start text-sm font-bold text-acc hover:underline">Manage partner consents →</Link>
          </Pane>
        </PaneGrid>
      ) : null}

      {view === "notifications" ? (
        <PaneGrid>
          <Pane title="Notifications" meta={off ? "Off" : `${freq} · max ${p.max_notifications_per_week}/week`} span={8}>
            {prefsAlert}
            <ActionForm action={savePreferences} submitLabel="Save notifications" disabled={prefsFailed} className="gap-[22px] @container">
              <Group label="Frequency">
                <Segmented name="notification_frequency" defaultValue={p.notification_frequency} options={FREQUENCIES.map((f) => ({ value: f, label: cap(f) }))} />
              </Group>
              <div className="grid gap-3.5 @lg:grid-cols-2">
                <Field label="Max per week"><Input type="number" name="max_notifications_per_week" min={0} max={21} defaultValue={p.max_notifications_per_week} /></Field>
                <Group label="Quiet hours" className="gap-1.5">
                  <div className="flex items-center gap-2">
                    <Input type="time" name="quiet_hours_start" aria-label="Quiet hours start" defaultValue={quietStart} className="min-w-0 flex-1 px-3" />
                    <span className="text-muted">to</span>
                    <Input type="time" name="quiet_hours_end" aria-label="Quiet hours end" defaultValue={quietEnd} className="min-w-0 flex-1 px-3" />
                  </div>
                </Group>
              </div>
              <Group label="Focus areas"><ChipChecks name="notification_focus" options={FOCUS} defaultValues={p.notification_focus} /></Group>
              {sharingHidden}
            </ActionForm>
          </Pane>
          <Pane title="Summary" span={4}>
            <RuleList items={[
              { key: "freq", label: "Frequency", value: freq, dot: off ? "neutral" : "acc" },
              { key: "max", label: "Max per week", value: p.max_notifications_per_week },
              { key: "quiet", label: "Quiet hours", value: hasQuiet ? `${quietStart}–${quietEnd}` : "None" },
              { key: "focus", label: "Focus areas", sub: focus.length ? FOCUS.filter((f) => focus.includes(f.value)).map((f) => f.label).join(", ") : "None selected", value: `${focus.length} of ${FOCUS.length}` },
            ]} />
            <p className="m-0 text-sm">
              {off ? "Notifications are off. " : `Up to ${p.max_notifications_per_week} nudge${p.max_notifications_per_week === 1 ? "" : "s"} a week, ${p.notification_frequency} frequency. `}
              {hasQuiet ? `Quiet from ${quietStart} to ${quietEnd}.` : "No quiet hours set."}
            </p>
          </Pane>
        </PaneGrid>
      ) : null}

      {view === "canvas" && canvas.available ? (
        <PaneGrid>
          <Pane title="Canvas layout" meta={`${shownCount} shown · ${hiddenWidgets.length} hidden`} span={7} flush>
            <PaneRow title="Home view" sub={canvas.active ? "Canvas: widgets you arrange yourself" : "Classic overview"}
              right={<CanvasViewSwitch view={canvas.active ? "canvas" : "classic"} />} />
            <PaneRow title="Reset layout" sub="Default order, sizes and visibility for every widget" right={<ResetLayoutButton />} />
            <h3 className="m-0 border-b border-line px-[18px] pb-2 pt-4 text-xs font-extrabold uppercase tracking-[0.05em] text-muted">
              Hidden widgets · {hiddenWidgets.length}
            </h3>
            {hiddenWidgets.length ? hiddenWidgets.map((w) => (
              <PaneRow key={w.id} title={w.title} sub={w.description} right={<ShowWidgetButton id={w.id} title={w.title} />} />
            )) : <PaneEmpty>No hidden widgets. Everything is on your canvas.</PaneEmpty>}
          </Pane>
          <Pane title="About the canvas" span={5}>
            <p className="m-0 text-sm">The canvas is a pilot for your organization: your home is a set of summary widgets, and each widget&apos;s tools open the full page for its data.</p>
            <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm">
              <li>Hide, add back and resize widgets from the canvas toolbar.</li>
              <li>Your layout is saved to your account only.</li>
              <li>Switch to the classic overview at any time, and back again here.</li>
            </ul>
            {canvas.active
              ? <Link href="/app" className="self-start text-sm font-bold text-acc hover:underline">Open the canvas →</Link>
              : <p className="m-0 text-[13px] text-muted">You are using the classic overview. Switch to the canvas to arrange widgets.</p>}
          </Pane>
        </PaneGrid>
      ) : null}
    </FullView>
  );
}
