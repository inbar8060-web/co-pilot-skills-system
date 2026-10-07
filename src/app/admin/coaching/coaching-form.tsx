"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { InsightCards } from "@/components/insight-cards";
import { useToast } from "@/components/overlays";
import { Button, Field, Input, Panel, Select, Textarea } from "@/components/ui";
import { generateCoaching } from "../actions";

interface Employee { id: string; name: string; team: string | null; hasReport: boolean }

export function CoachingForm({ employees, children }: { employees: Employee[]; children: ReactNode }) {
  const [state, action, pending] = useActionState(generateCoaching, null);
  const toast = useToast();
  const seen = useRef<unknown>(null);
  useEffect(() => {
    if (state && seen.current !== state) {
      seen.current = state;
      if (state.ok) toast("Coaching guidance ready · logged for audit");
    }
  }, [state, toast]);

  return (
    <>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Prepare the conversation">
          <form action={action} className="flex flex-col gap-[18px]">
            <Field label="Employee">
              <Select name="employeeUserId" required defaultValue="">
                <option value="" disabled>Select…</option>
                {employees.map((e) => <option key={e.id} value={e.id} disabled={!e.hasReport}>{e.name}{e.team ? ` · ${e.team}` : ""}{e.hasReport ? "" : " (no report)"}</option>)}
              </Select>
            </Field>
            <Field label="Type of conversation"><Input name="phase" maxLength={60} placeholder="e.g. Post-simulator feedback, performance review" /></Field>
            <Field label="What happened / what do you want to address?"><Textarea name="scenario" rows={4} maxLength={2000} required /></Field>
            <Field label="Your goal for the conversation"><Textarea name="notes" rows={2} maxLength={2000} /></Field>
            {state && !state.ok ? <div role="alert" className="rounded-[10px] border border-bad bg-badsoft px-3.5 py-2.5 text-sm font-semibold text-bad">{state.error}</div> : null}
            <div className="flex justify-end border-t border-line pt-[18px]">
              <Button type="submit" size="lg" disabled={pending} className="h-12 max-md:flex-1">{pending ? "Generating…" : "Get coaching guidance"}</Button>
            </div>
          </form>
        </Panel>
        {children}
      </div>
      {state?.ok && state.data ? <InsightCards routine="coaching" output={state.data.output} /> : null}
    </>
  );
}
