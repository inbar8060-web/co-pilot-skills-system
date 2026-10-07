"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pane } from "@/components/full-view";
import { useToast } from "@/components/overlays";
import { Banner, Button, ChipRadio, Field, Group, Input, LinkButton, Textarea } from "@/components/ui";
import type { ConsentedPartner } from "@/lib/partners";
import { CREW_ROUTINES } from "@/lib/schemas";
import { cn, ROUTINE_LABELS } from "@/lib/utils";

/** The briefing form: routine, partner (only those approved for that routine with a report), context. */
export function RoutineGenerator({ disabled, partners, initialRoutine, initialPartner }: {
  disabled: boolean; partners: ConsentedPartner[]; initialRoutine: string; initialPartner: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [routine, setRoutine] = useState(initialRoutine);
  const [partner, setPartner] = useState(() => (partners.some((p) => p.id === initialPartner && p.routines[initialRoutine] !== undefined && p.hasReport) ? initialPartner : "solo"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickRoutine(r: string) {
    setRoutine(r);
    const current = partners.find((p) => p.id === partner);
    if (!current || current.routines[r] === undefined) setPartner("solo");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-routine-insight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          routineType: routine,
          partnerUserId: partner === "solo" ? null : partner,
          context: { scenario: String(fd.get("scenario") ?? ""), aircraft: String(fd.get("aircraft") ?? ""), phase: String(fd.get("phase") ?? ""), notes: String(fd.get("notes") ?? "") },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message ?? "Generation failed");
        return;
      }
      const credits = json.result?.credits;
      toast(credits?.awarded ? `Action cards ready · +${credits.credits} credits` : "Action cards ready · saved to history");
      router.push(`/app/routines/${json.result.sessionId}`);
      router.refresh();
    } catch {
      setError("Network error. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  const partnerOptions = [
    { value: "solo", label: "Solo", sub: "self-briefing" },
    ...partners.map((p) => {
      const days = p.routines[routine];
      const ok = days !== undefined && p.hasReport;
      return { value: p.id, label: p.name, sub: !p.hasReport ? "no report yet" : ok ? `approved · ${days} days` : "no consent for this routine", disabled: !ok };
    }),
  ];

  return (
    <Pane id="generate" title="Generate a routine" meta={partner === "solo" ? "Solo self-briefing" : "Blind synergy"} span={8}>
      {disabled ? (
        <Banner tone="warn" title="A verified report is required" action={<LinkButton href="/app/report?view=upload" size="sm" className="bg-card">Upload report</LinkButton>}>
          Load your report to enable routine generation.
        </Banner>
      ) : null}
      <form onSubmit={onSubmit} className={cn("flex flex-col gap-[18px]", disabled && "opacity-60")}>
        <fieldset disabled={disabled || busy} className="m-0 flex min-w-0 flex-col gap-[18px] border-0 p-0">
          <Group label="Routine"><ChipRadio name="routine" value={routine} onChange={pickRoutine} options={CREW_ROUTINES.map((r) => ({ value: r, label: ROUTINE_LABELS[r] }))} /></Group>
          <Group label="Partner"><ChipRadio name="partner" value={partner} onChange={setPartner} options={partnerOptions} /></Group>
          <div id="context" className="grid scroll-mt-6 gap-3.5 md:grid-cols-2">
            <Field label="Aircraft / fleet"><Input name="aircraft" maxLength={60} placeholder="e.g. 787" /></Field>
            <Field label="Phase / scenario type"><Input name="phase" maxLength={60} placeholder="e.g. Night approach, engine failure sim" /></Field>
          </div>
          <Field label="Scenario"><Textarea name="scenario" rows={4} maxLength={2000} placeholder="Describe the session, event or flight. For debriefs: what happened, in order." /></Field>
          <Field label="Additional notes" optional="(optional)"><Textarea name="notes" rows={2} maxLength={2000} /></Field>
        </fieldset>
        {error ? <div role="alert" className="rounded-[10px] border border-bad bg-badsoft px-3.5 py-2.5 text-sm font-semibold text-bad">{error}</div> : null}
        <div className="flex justify-end border-t border-line pt-[18px]">
          <Button type="submit" size="lg" disabled={disabled || busy} className="h-12 max-md:flex-1">{busy ? "Generating…" : "Generate action cards"}</Button>
        </div>
      </form>
    </Pane>
  );
}
