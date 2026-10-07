"use client";

import { useActionState, useState } from "react";
import { InsightCards } from "@/components/insight-cards";
import { Button, Field, Select, StatusText, Textarea } from "@/components/ui";
import { FAMILY_ROUTINE } from "@/lib/schemas";
import { runPlayground } from "../actions";

const FAMILIES = ["briefing", "debrief", "coaching"] as const;

export function Playground({ activePrompts }: { activePrompts: Record<string, string> }) {
  const [family, setFamily] = useState<string>("briefing");
  const [content, setContent] = useState<string>(activePrompts.briefing ?? "");
  const [state, action, pending] = useActionState(runPlayground, null);

  return (
    <div className="flex flex-col gap-[18px]">
      <form action={action} className="flex flex-col gap-[18px]">
        <div className="grid gap-3.5 md:grid-cols-2">
          <Field label="Family">
            <Select name="routine_type" value={family} onChange={(e) => { setFamily(e.target.value); setContent(activePrompts[e.target.value] ?? ""); }}>
              {FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </Select>
          </Field>
          <Field label="Personas"><Select disabled defaultValue="pair"><option value="pair">ISTJ captain + ENFP first officer</option></Select></Field>
        </div>
        <Field label="Demo scenario"><Textarea name="scenario" rows={2} maxLength={2000} defaultValue="Night approach into a busy hub with a late runway change." /></Field>
        <Field label="Draft system prompt"><Textarea name="content" rows={5} value={content} onChange={(e) => setContent(e.target.value)} minLength={20} maxLength={20000} className="font-mono text-[13px]" /></Field>
        {state && !state.ok ? <div role="alert" className="rounded-[10px] border border-bad bg-badsoft px-3.5 py-2.5 text-sm font-semibold text-bad">{state.error}</div> : null}
        <div className="flex justify-end border-t border-line pt-[18px]"><Button type="submit" variant="secondary" size="lg" disabled={pending} className="max-md:flex-1">{pending ? "Running…" : "Run test"}</Button></div>
      </form>
      {state?.ok && state.data ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-[10px] bg-oksoft px-3.5 py-3 text-sm"><StatusText tone="ok">Schema valid · model {state.data.model}</StatusText></div>
          <InsightCards routine={FAMILY_ROUTINE[state.data.family as keyof typeof FAMILY_ROUTINE]} output={state.data.output} />
        </div>
      ) : null}
    </div>
  );
}
