import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { BriefingOutputSchema, CoachingOutputSchema, DebriefOutputSchema, type RoutineType } from "@/lib/schemas";

function ActionCard({ title, copy, children }: { title: string; copy: string[]; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[14px] border border-line bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h3 className="m-0 text-[15px] font-extrabold">{title}</h3>
        <CopyButton text={`${title}\n${copy.map((l) => `- ${l}`).join("\n")}`} toastText="Card copied to clipboard" />
      </header>
      {children}
    </section>
  );
}

const Bullets = ({ items }: { items: string[] }) => (
  <ul className="m-0 list-disc flex flex-col gap-2 py-4 pl-9 pr-5 text-[15px]">{items.map((l, i) => <li key={i}>{l}</li>)}</ul>
);

function DoDont({ dos, donts }: { dos: ReactNode[]; donts: ReactNode[] }) {
  return (
    <div className="grid gap-4 px-5 pb-[18px] pt-4 md:grid-cols-2">
      <div>
        <div className="mb-1.5 text-xs font-extrabold uppercase tracking-[0.05em] text-ok">Do</div>
        <ul className="m-0 list-disc flex flex-col gap-1.5 pl-[18px] text-sm">{dos.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-extrabold uppercase tracking-[0.05em] text-bad">Don&apos;t</div>
        <ul className="m-0 list-disc flex flex-col gap-1.5 pl-[18px] text-sm">{donts.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </div>
    </div>
  );
}

const Def = ({ term, children, strong }: { term: string; children: ReactNode; strong?: boolean }) => (
  <div>
    <dt className="text-xs font-bold text-muted">{term}</dt>
    <dd className={strong ? "m-0 mt-0.5 text-[17px] font-extrabold" : "m-0 mt-0.5 text-[15px]"}>{children}</dd>
  </div>
);

/** Card titles with a one-line lead, for the canvas "Latest briefing" widget. */
export function outputCards(output: unknown): Array<{ title: string; lead: string }> {
  const b = BriefingOutputSchema.safeParse(output);
  if (b.success) {
    const o = b.data;
    return [
      { title: `Synergy area: ${o.synergy_area.title}`, lead: o.synergy_area.points[0] },
      { title: "Threat points & countermeasures", lead: `${o.threat_points[0].threat} → ${o.threat_points[0].countermeasure}` },
      { title: "Briefing do's & don'ts", lead: o.briefing_dos_and_donts.dos[0] },
      { title: "Challenge & response trigger", lead: `“${o.challenge_response_trigger.trigger_phrase}”` },
    ];
  }
  const d = DebriefOutputSchema.safeParse(output);
  if (d.success) {
    const o = d.data;
    return [
      { title: "Mental model alignment", lead: o.mental_model_alignment.summary },
      { title: "Stress impact on communication", lead: o.stress_impact.summary },
      { title: "Actionable behavioural lesson", lead: o.actionable_behavioural_lesson.lesson },
    ];
  }
  const c = CoachingOutputSchema.safeParse(output);
  if (c.success) {
    const o = c.data;
    return [
      { title: "Feedback reception profile", lead: o.feedback_reception_profile.summary },
      { title: "Language adaptation", lead: o.language_adaptation.dos[0].guideline },
      { title: "Reflection questions", lead: o.reflection_questions[0] },
    ];
  }
  return [];
}

/** Flattens any routine output into plain text for "Copy all cards". */
export function outputToText(output: unknown): string {
  const b = BriefingOutputSchema.safeParse(output);
  if (b.success) {
    const o = b.data;
    return [
      `Synergy area: ${o.synergy_area.title}`, ...o.synergy_area.points.map((p) => `- ${p}`), "",
      "Threat points & countermeasures", ...o.threat_points.map((t) => `- ${t.threat} -> ${t.countermeasure}`), "",
      "Do", ...o.briefing_dos_and_donts.dos.map((d) => `- ${d}`), "Don't", ...o.briefing_dos_and_donts.donts.map((d) => `- ${d}`), "",
      `Trigger: "${o.challenge_response_trigger.trigger_phrase}"`, `Response: ${o.challenge_response_trigger.expected_response}`, `When: ${o.challenge_response_trigger.when_to_use}`,
    ].join("\n");
  }
  const d = DebriefOutputSchema.safeParse(output);
  if (d.success) {
    const o = d.data;
    return [
      "Mental model alignment", o.mental_model_alignment.summary, ...o.mental_model_alignment.gaps.map((g) => `- ${g}`), "",
      "Stress impact", o.stress_impact.summary, ...o.stress_impact.communication_effects.map((g) => `- ${g}`), "",
      `Lesson: ${o.actionable_behavioural_lesson.lesson}`, `Cue: ${o.actionable_behavioural_lesson.cue}`, `Next flight: ${o.actionable_behavioural_lesson.next_flight_action}`,
    ].join("\n");
  }
  const c = CoachingOutputSchema.safeParse(output);
  if (c.success) {
    const o = c.data;
    return [
      "Feedback reception profile", o.feedback_reception_profile.summary, ...o.feedback_reception_profile.sensitivity_points.map((g) => `- ${g}`), "",
      "Do", ...o.language_adaptation.dos.map((x) => `- ${x.guideline}: ${x.example}`), "Don't", ...o.language_adaptation.donts.map((x) => `- ${x.guideline}: ${x.example}`), "",
      "Reflection questions", ...o.reflection_questions.map((q) => `- ${q}`),
    ].join("\n");
  }
  return JSON.stringify(output, null, 2);
}

/** Renders a routine output as the redesigned action cards. Unknown shapes degrade to raw JSON. */
export function InsightCards({ routine, output }: { routine: RoutineType | string; output: unknown }) {
  if (routine === "simulator" || routine === "flight" || routine === "training") {
    const parsed = BriefingOutputSchema.safeParse(output);
    if (parsed.success) {
      const o = parsed.data;
      const dd = o.briefing_dos_and_donts;
      const t = o.challenge_response_trigger;
      return (
        <div className="grid items-start gap-4 md:grid-cols-2">
          <ActionCard title={`Synergy area: ${o.synergy_area.title}`} copy={o.synergy_area.points}><Bullets items={o.synergy_area.points} /></ActionCard>
          <ActionCard title="Threat points & countermeasures" copy={o.threat_points.map((p) => `${p.threat} -> ${p.countermeasure}`)}>
            <div className="flex flex-col gap-2.5 px-5 pb-[18px] pt-4">
              {o.threat_points.map((p, i) => (
                <div key={i} className="rounded-[10px] bg-bg px-3.5 py-3">
                  <div className="font-bold">{p.threat}</div>
                  <div className="text-sm text-muted">Countermeasure: {p.countermeasure}</div>
                </div>
              ))}
            </div>
          </ActionCard>
          <ActionCard title="Briefing do's & don'ts" copy={[...dd.dos.map((d) => `DO: ${d}`), ...dd.donts.map((d) => `DON'T: ${d}`)]}><DoDont dos={dd.dos} donts={dd.donts} /></ActionCard>
          <ActionCard title="Challenge & response trigger" copy={[`Trigger: "${t.trigger_phrase}"`, `Response: ${t.expected_response}`, `When: ${t.when_to_use}`]}>
            <dl className="m-0 flex flex-col gap-2.5 px-5 pb-[18px] pt-4">
              <Def term="Trigger phrase" strong>“{t.trigger_phrase}”</Def>
              <Def term="Expected response">{t.expected_response}</Def>
              <Def term="When to use">{t.when_to_use}</Def>
            </dl>
          </ActionCard>
        </div>
      );
    }
  }
  if (routine === "debrief") {
    const parsed = DebriefOutputSchema.safeParse(output);
    if (parsed.success) {
      const o = parsed.data;
      const l = o.actionable_behavioural_lesson;
      return (
        <div className="grid items-start gap-4 xl:grid-cols-3">
          <ActionCard title="Mental model alignment" copy={[o.mental_model_alignment.summary, ...o.mental_model_alignment.gaps]}>
            <div className="px-5 pb-[18px] pt-4"><p className="m-0 mb-2.5 text-[15px]">{o.mental_model_alignment.summary}</p><ul className="m-0 list-disc flex flex-col gap-1.5 pl-[18px] text-sm">{o.mental_model_alignment.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>
          </ActionCard>
          <ActionCard title="Stress impact on communication" copy={[o.stress_impact.summary, ...o.stress_impact.communication_effects]}>
            <div className="px-5 pb-[18px] pt-4"><p className="m-0 mb-2.5 text-[15px]">{o.stress_impact.summary}</p><ul className="m-0 list-disc flex flex-col gap-1.5 pl-[18px] text-sm">{o.stress_impact.communication_effects.map((g, i) => <li key={i}>{g}</li>)}</ul></div>
          </ActionCard>
          <ActionCard title="Actionable behavioural lesson" copy={[l.lesson, `Cue: ${l.cue}`, `Next flight: ${l.next_flight_action}`]}>
            <dl className="m-0 flex flex-col gap-2.5 px-5 pb-[18px] pt-4">
              <Def term="Lesson" strong>{l.lesson}</Def>
              <Def term="Cue">{l.cue}</Def>
              <Def term="Next flight">{l.next_flight_action}</Def>
            </dl>
          </ActionCard>
        </div>
      );
    }
  }
  if (routine === "coaching") {
    const parsed = CoachingOutputSchema.safeParse(output);
    if (parsed.success) {
      const o = parsed.data;
      const la = o.language_adaptation;
      const pair = (d: { guideline: string; example: string }, i: number) => (
        <span key={i}><span className="font-bold">{d.guideline}</span><span className="block text-muted">“{d.example}”</span></span>
      );
      return (
        <div className="grid items-start gap-4 xl:grid-cols-3">
          <ActionCard title="Feedback reception profile" copy={[o.feedback_reception_profile.summary, ...o.feedback_reception_profile.sensitivity_points]}>
            <div className="px-5 pb-[18px] pt-4"><p className="m-0 mb-2.5 text-[15px]">{o.feedback_reception_profile.summary}</p><ul className="m-0 list-disc flex flex-col gap-1.5 pl-[18px] text-sm">{o.feedback_reception_profile.sensitivity_points.map((g, i) => <li key={i}>{g}</li>)}</ul></div>
          </ActionCard>
          <ActionCard title="Language adaptation" copy={[...la.dos.map((d) => `DO ${d.guideline}: ${d.example}`), ...la.donts.map((d) => `DON'T ${d.guideline}: ${d.example}`)]}>
            <DoDont dos={la.dos.map(pair)} donts={la.donts.map(pair)} />
          </ActionCard>
          <ActionCard title="Reflection questions" copy={o.reflection_questions}><Bullets items={o.reflection_questions} /></ActionCard>
        </div>
      );
    }
  }
  return <pre className="overflow-x-auto rounded-[14px] border border-line bg-card p-5 font-mono text-xs">{JSON.stringify(output, null, 2)}</pre>;
}
