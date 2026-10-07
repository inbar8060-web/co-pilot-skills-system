"use client";

import { useState } from "react";
import { ChipRadio, LinkButton, Panel } from "@/components/ui";
import { CREW_ROUTINES } from "@/lib/schemas";
import type { ConsentedPartner } from "@/lib/partners";
import { ROUTINE_LABELS } from "@/lib/utils";

export function StartRoutine({ partners, disabled }: { partners: ConsentedPartner[]; disabled: boolean }) {
  const [routine, setRoutine] = useState<string>("flight");
  const partner = partners.find((p) => p.hasReport && p.routines[routine] !== undefined);
  const href = `/app/routines/new?routine=${routine}${partner ? `&partner=${partner.id}` : ""}`;
  return (
    <Panel>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[17px] font-extrabold">Start a routine</h2>
        <span className="text-[13px] text-muted">Solo, or with a consenting partner</span>
      </div>
      <ChipRadio name="routine" value={routine} onChange={setRoutine} options={CREW_ROUTINES.map((r) => ({ value: r, label: ROUTINE_LABELS[r] }))} />
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-[18px]">
        <div className="text-sm text-muted">
          {partner
            ? `Partner for ${ROUTINE_LABELS[routine]}: ${partner.name} · approved, valid ${partner.routines[routine]} days`
            : `No consenting partner for ${ROUTINE_LABELS[routine]} yet · solo self-briefing`}
        </div>
        {disabled ? (
          <span className="inline-flex h-[46px] items-center rounded-[10px] bg-brand px-[22px] text-[15px] font-bold text-onbrand opacity-55 max-md:flex-1 max-md:justify-center">Continue to briefing</span>
        ) : (
          <LinkButton href={href} variant="primary" size="lg" className="max-md:flex-1">Continue to briefing</LinkButton>
        )}
      </div>
    </Panel>
  );
}
