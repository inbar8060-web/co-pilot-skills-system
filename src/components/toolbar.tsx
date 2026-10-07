"use client";

import type { KeyboardEvent } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

/** A left-bar / sheet tool. Tools without a working destination are left out, never shown inert. */
export interface Tool {
  key: string;
  label: string;
  icon: IconName;
  /** What it does (tooltip and accessible description). */
  hint: string;
  primary?: boolean;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  badge?: number;
  pressed?: boolean;
}

/* ------------------------------------------------------------------ tool tiles */
function ToolInner({ tool, size }: { tool: Tool; size: "bar" | "sheet" }) {
  return (
    <>
      <span className="relative">
        <Icon name={tool.icon} size={size === "bar" ? "1.7em" : 20} strokeWidth={tool.primary ? 2 : 1.75} />
        {tool.badge ? <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-card bg-warn px-0.5 text-[9px] font-extrabold leading-none text-onacc">{tool.badge}</span> : null}
      </span>
      <span className={cn("text-center font-bold leading-[1.1]", size === "bar" ? "text-[0.77em]" : "text-[10px]")}>{tool.label}</span>
    </>
  );
}

export function ToolTile({ tool, size, tabIndex, onKeyDown }: { tool: Tool; size: "bar" | "sheet"; tabIndex?: number; onKeyDown?: (e: KeyboardEvent) => void }) {
  const cls = cn(
    "flex flex-col items-center justify-center gap-[3px] rounded-xl border-0 no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc",
    size === "bar" ? "min-h-[4em] w-full px-[0.15em] py-[0.46em]" : "min-h-[52px] px-0.5 py-1.5",
    tool.primary ? "bg-brand text-onbrand hover:opacity-90" : tool.pressed ? "bg-accsoft text-ink" : "bg-transparent text-muted hover:bg-bg hover:text-ink",
    tool.disabled && "pointer-events-none opacity-45",
  );
  const common = { "data-tool": "", title: tool.hint, tabIndex, onKeyDown, className: cls, "aria-label": `${tool.label}: ${tool.hint}` };
  if (tool.href && !tool.disabled) return <Link href={tool.href} {...common}><ToolInner tool={tool} size={size} /></Link>;
  return (
    <button type="button" onClick={tool.onSelect} disabled={tool.disabled} aria-pressed={tool.pressed} {...common}>
      <ToolInner tool={tool} size={size} />
    </button>
  );
}

/** Arrow-key movement between the tiles of a toolbar (roving focus). */
export function moveToolFocus(e: KeyboardEvent, orientation: "vertical" | "horizontal") {
  const keys = orientation === "vertical" ? ["ArrowDown", "ArrowUp"] : ["ArrowRight", "ArrowLeft"];
  if (![...keys, "Home", "End"].includes(e.key)) return;
  const bar = (e.currentTarget as HTMLElement).closest("[role=toolbar]");
  const tiles = bar ? Array.from(bar.querySelectorAll<HTMLElement>("[data-tool]:not([disabled])")) : [];
  const i = tiles.indexOf(e.currentTarget as HTMLElement);
  if (i < 0 || tiles.length === 0) return;
  e.preventDefault();
  const next = e.key === "Home" ? 0 : e.key === "End" ? tiles.length - 1 : (i + (e.key === keys[0] ? 1 : -1) + tiles.length) % tiles.length;
  tiles.forEach((t, j) => t.setAttribute("tabindex", j === next ? "0" : "-1"));
  tiles[next].focus();
}

/* ------------------------------------------------------------------ section bar (full pages) */
export interface BarItem { key: string; label: string; icon: IconName; href: string; hint: string; badge?: number; primary?: boolean }

/**
 * The left bar of a full page: same place, size and tiles as the canvas left bar, so moving from a
 * widget to its full page keeps the structure. Back to the canvas, then the page's sections (the
 * current one pressed), then optional page actions.
 */
export function SectionBar({ kicker, title, back, sections, active, actions = [] }: {
  kicker: string; title: string; back: BarItem; sections: BarItem[]; active: string; actions?: BarItem[];
}) {
  const tile = (t: BarItem, pressed: boolean, first: boolean) => (
    <Link key={t.key} href={t.href} data-tool="" tabIndex={first ? 0 : -1} onKeyDown={(e) => moveToolFocus(e, "vertical")}
      aria-current={pressed ? "page" : undefined} aria-label={`${t.label}: ${t.hint}`} title={t.hint}
      className={cn(
        "flex min-h-[4em] w-full flex-col items-center justify-center gap-[3px] rounded-xl px-[0.15em] py-[0.46em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc",
        t.primary ? "bg-brand text-onbrand hover:opacity-90" : pressed ? "bg-accsoft text-ink" : "text-muted hover:bg-bg hover:text-ink",
      )}>
      <span className="relative">
        <Icon name={t.icon} size="1.7em" strokeWidth={pressed || t.primary ? 2 : 1.75} />
        {t.badge ? <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-card bg-warn px-0.5 text-[9px] font-extrabold leading-none text-onacc">{t.badge}</span> : null}
      </span>
      <span className="text-center text-[0.77em] font-bold leading-[1.1]">{t.label}</span>
    </Link>
  );
  return (
    <aside aria-label={`${title} sections`} className="tb relative z-20 hidden self-start md:sticky md:top-5 md:block">
      <div className="flex flex-col gap-[0.31em] rounded-[0.92em] border border-line bg-card px-[0.62em] py-[0.77em]">
        <div className="border-b border-line px-0.5 pb-[0.62em] pt-[0.31em]">
          <div className="text-[0.77em] font-extrabold uppercase leading-[1.2] tracking-[0.04em] text-acc">{kicker}</div>
          <div className="mt-0.5 text-[0.85em] font-extrabold leading-[1.2] [hyphens:auto] [overflow-wrap:break-word]" lang="en">{title}</div>
        </div>
        <nav role="toolbar" aria-orientation="vertical" aria-label={`${title} sections`} className="flex flex-col gap-[0.31em]">
          {tile(back, false, true)}
          <div className="my-[0.31em] h-px bg-line" />
          {sections.map((s) => tile(s, s.key === active, false))}
          {actions.length ? <div className="my-[0.31em] h-px bg-line" /> : null}
          {actions.map((a) => tile(a, false, false))}
        </nav>
      </div>
    </aside>
  );
}
