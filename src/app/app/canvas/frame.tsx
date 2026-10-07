"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Grip } from "@/components/icons";
import { cn } from "@/lib/utils";

export { moveToolFocus, ToolTile, type Tool } from "@/components/toolbar";

/* ------------------------------------------------------------------ widget frame */
export interface Place { x: number; y: number; w: number; h: number }

function placeVars(desktop?: Place, tablet?: Place): CSSProperties {
  const v: Record<string, string> = {};
  if (desktop) { v["--dc"] = `${desktop.x + 1} / span ${desktop.w}`; v["--dr"] = `${desktop.y + 1} / span ${desktop.h}`; }
  if (tablet) { v["--tc"] = `${tablet.x + 1} / span ${tablet.w}`; v["--tr"] = `${tablet.y + 1} / span ${tablet.h}`; }
  return v as CSSProperties;
}

/** Grid placement classes: flow on phones, explicit 6-column cells on tablets, 12-column cells on desktop. */
export const PLACED = "md:[grid-column:var(--tc)] md:[grid-row:var(--tr)] xl:[grid-column:var(--dc)] xl:[grid-row:var(--dr)]";

export function WidgetFrame({ id, title, kicker = false, meta, selected, onSelect, tint = false, desktop, tablet, children }: {
  id: string;
  title: ReactNode;
  /** Render the title as an uppercase kicker (Insight · Week 41). */
  kicker?: boolean;
  meta?: ReactNode;
  selected: boolean;
  onSelect: () => void;
  tint?: boolean;
  desktop?: Place;
  tablet?: Place;
  children: ReactNode;
}) {
  return (
    <section
      data-widget={id}
      aria-labelledby={`w-${id}-title`}
      style={placeVars(desktop, tablet)}
      className={cn("relative flex min-w-0 flex-col overflow-hidden rounded-xl border", tint ? "border-accline bg-accsoft" : "border-line bg-card", PLACED)}
    >
      <header className={cn("flex min-h-12 items-center gap-2.5 border-b px-4 py-2", tint ? "border-accline" : "border-line")}>
        <h2 id={`w-${id}-title`} className="m-0 min-w-0 flex-1">
          <button
            type="button" onClick={onSelect} aria-pressed={selected}
            className="flex w-full min-w-0 items-center gap-2.5 rounded-md border-0 bg-transparent p-0 py-1 text-left text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc"
          >
            <Grip className={tint ? "text-acc" : "text-faint"} />
            <span className={cn("truncate", kicker ? "text-xs font-extrabold uppercase tracking-[0.05em]" : "text-[15px] font-extrabold")}>{title}</span>
          </button>
        </h2>
        {meta ? <div className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">{meta}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {selected ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl border-2 border-acc" /> : null}
    </section>
  );
}

/** Dashed free cell left by the packing ("4 × 3 free"). */
export function FreeSlot({ place, view, onAdd }: { place: Place; view: "desktop" | "tablet"; onAdd?: () => void }) {
  const style = view === "desktop" ? placeVars(place) : placeVars(undefined, place);
  const cls = cn("items-center justify-center rounded-xl border border-dashed border-line2 p-3 text-center text-sm font-bold text-muted", PLACED, view === "desktop" ? "hidden xl:flex" : "hidden md:flex xl:hidden");
  const text = `${place.w} × ${place.h} free`;
  return onAdd ? (
    <button type="button" onClick={onAdd} style={style} className={cn(cls, "bg-transparent hover:border-acc hover:text-ink")}>{text} · add a widget</button>
  ) : (
    <div aria-hidden="true" style={style} className={cls}>{text}</div>
  );
}

/* ------------------------------------------------------------------ small widget parts */
export function Body({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-0 flex-1 flex-col gap-3 px-[18px] pb-[18px] pt-4", className)}>{children}</div>;
}

export function ModePill({ synergy, compact }: { synergy: boolean; compact?: boolean }) {
  if (compact) {
    return <span className={cn("size-2 shrink-0 rounded-full", synergy ? "bg-acc" : "bg-faint")} role="img" aria-label={synergy ? "Blind synergy" : "Solo"} />;
  }
  return (
    <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-xl px-[9px] py-[3px] text-xs font-bold", synergy ? "bg-accsoft text-ink" : "bg-bg text-muted")}>
      {synergy ? "Blind synergy" : "Solo"}
    </span>
  );
}

export function SoftPill({ children, tone = "acc" }: { children: ReactNode; tone?: "acc" | "warn" }) {
  return <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-xl px-[9px] py-[3px] text-xs font-bold", tone === "acc" ? "bg-accsoft text-ink" : "bg-warnsoft text-ink")}>{children}</span>;
}

export function WidgetLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="text-[13px] font-bold text-acc hover:underline">{children}</Link>;
}
