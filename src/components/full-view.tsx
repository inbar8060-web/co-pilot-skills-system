/**
 * Full-page template ("full view") for the data behind each canvas widget.
 *
 * It keeps the canvas structure: the same three-column frame (left bar · content · mirror gutter),
 * the left bar in the same place showing the page's sections instead of widget tools, and content
 * in widget-style panes on the same 12-column grid (6 on tablets, 1 on phones). A section is a view
 * of the page (`?view=`), so a tool opens its section in place instead of jumping down a long page.
 *
 * Server-safe: no hooks here. The left bar is a small client component (SectionBar).
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { SectionBar, type BarItem } from "@/components/toolbar";
import { Dot, type Tone } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface ViewSection { key: string; label: string; icon: IconName; hint: string; badge?: number }
export interface Kpi { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }

/** The requested view if it is one of the page's sections, otherwise the first (default) section. */
export function pickView<K extends string>(requested: string | undefined, keys: readonly K[]): K {
  return (keys as readonly string[]).includes(requested ?? "") ? (requested as K) : keys[0];
}

/** Where "back" leads: the canvas for pilot organizations, the overview otherwise. */
export function homeLink(canvasActive: boolean): { href: string; label: string } {
  return canvasActive ? { href: "/app", label: "Canvas" } : { href: "/app", label: "Overview" };
}

function viewHref(basePath: string, key: string, defaultKey: string) {
  return key === defaultKey ? basePath : `${basePath}?view=${encodeURIComponent(key)}`;
}

export function FullView({ basePath, name, title, description, back, kpis, sections, active, actions, aside, children }: {
  /** The page path, e.g. "/app/rewards"; section links become `${basePath}?view=key`. */
  basePath: string;
  /** Short page name for the left bar ("Rewards"), like a widget name on the canvas. */
  name: string;
  title: string;
  description?: ReactNode;
  back: { href: string; label: string };
  kpis?: Kpi[];
  sections: ViewSection[];
  active: string;
  /** Page-level actions shown after the sections in the left bar (primary first, red). */
  actions?: Array<{ key: string; label: string; icon: IconName; href: string; hint: string; primary?: boolean }>;
  /** Optional element at the right of the header (e.g. a "Copy all cards" button). */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const current = sections.find((s) => s.key === active) ?? sections[0];
  const defaultKey = sections[0]?.key ?? "";
  const barSections: BarItem[] = sections.map((s) => ({ key: s.key, label: s.label, icon: s.icon, hint: s.hint, badge: s.badge, href: viewHref(basePath, s.key, defaultKey) }));
  const backItem: BarItem = { key: "__back", label: back.label, icon: "back", href: back.href, hint: `Back to the ${back.label.toLowerCase()}` };

  return (
    <div data-full-view className="grid gap-5 md:grid-cols-[var(--bar)_minmax(0,1fr)] xl:grid-cols-[var(--bar)_minmax(0,1fr)_var(--bar)]" style={{ "--bar": "clamp(57px, 5.13vw, 74px)" } as React.CSSProperties}>
      <SectionBar kicker="Page" title={name} back={backItem} sections={barSections} active={current?.key ?? ""} actions={actions} />

      <div className="flex min-w-0 flex-col gap-5">
        <header className="flex flex-col gap-3">
          <Link href={back.href} className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-acc hover:underline md:hidden">
            <Icon name="back" size={16} strokeWidth={2} />{back.label}
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 max-w-[640px]">
              <div className="text-xs font-extrabold uppercase tracking-[0.06em] text-acc">{current && sections.length > 1 ? current.label : name}</div>
              <h1 className="m-0 mt-1 text-[28px] font-extrabold leading-[1.15] tracking-[-0.025em] md:text-[32px]">{title}</h1>
              {description ? <p className="m-0 mt-1.5 text-[15px] text-muted">{description}</p> : null}
            </div>
            {aside ? <div className="flex items-center gap-2.5">{aside}</div> : null}
          </div>
          {kpis && kpis.length ? <KpiStrip items={kpis} /> : null}
        </header>

        {sections.length > 1 ? <ViewTabs sections={sections} active={current?.key ?? ""} basePath={basePath} defaultKey={defaultKey} /> : null}

        {children}
      </div>
    </div>
  );
}

/** Phone (and narrow) section switcher; on tablets and desktop the left bar does this. */
function ViewTabs({ sections, active, basePath, defaultKey }: { sections: ViewSection[]; active: string; basePath: string; defaultKey: string }) {
  return (
    <nav aria-label="Sections" className="-mx-5 overflow-x-auto px-5 md:hidden">
      <div className="flex w-max gap-2">
        {sections.map((s) => {
          const on = s.key === active;
          return (
            <Link key={s.key} href={viewHref(basePath, s.key, defaultKey)} aria-current={on ? "page" : undefined}
              className={cn("inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-bold", on ? "border-acc bg-accsoft text-ink" : "border-line2 bg-card text-muted")}>
              <Icon name={s.icon} size={16} strokeWidth={on ? 2 : 1.75} />
              {s.label}
              {s.badge ? <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-warn px-1 text-[11px] font-extrabold text-onacc">{s.badge}</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Compact stat cards under the page title (same card style as widgets). */
export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <div className={cn("grid gap-3", items.length >= 4 ? "grid-cols-2 xl:grid-cols-4" : items.length === 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2")}>
      {items.map((k) => (
        <div key={k.label} className="relative min-w-0 rounded-xl border border-line bg-card px-4 py-3">
          {k.tone ? <Dot tone={k.tone} className="absolute right-3 top-3" /> : null}
          <div className="truncate text-xs font-bold uppercase tracking-[0.05em] text-muted">{k.label}</div>
          <div className="mt-1 text-[24px] font-extrabold leading-[1.1] tracking-[-0.02em] tabular-nums">{k.value}</div>
          {k.hint ? <div className="mt-0.5 truncate text-[13px] text-muted">{k.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ panes */
const XL: Record<number, string> = { 3: "xl:col-span-3", 4: "xl:col-span-4", 5: "xl:col-span-5", 6: "xl:col-span-6", 7: "xl:col-span-7", 8: "xl:col-span-8", 9: "xl:col-span-9", 12: "xl:col-span-12" };

/** The content grid of a view: 12 columns on desktop, 6 on tablets, 1 on phones (20px gaps, like the canvas). */
export function PaneGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 items-start gap-5 md:grid-cols-6 xl:grid-cols-12", className)}>{children}</div>;
}

/**
 * A widget-style card: 48px title bar with a hairline, then the body. `span` is the desktop column
 * span; on tablets and phones every pane takes the full width (a narrow pane beside a wide one would
 * leave a half-row gap, since full-view layouts pair 8+4 and 7+5). `flush` removes body
 * padding for lists and tables; `tint` is the soft navy variant used for the insight.
 */
export function Pane({ title, meta, span = 12, tint = false, flush = false, footer, id, children, className }: {
  title?: ReactNode;
  meta?: ReactNode;
  span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
  tint?: boolean;
  flush?: boolean;
  footer?: ReactNode;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("col-span-1 flex min-w-0 scroll-mt-6 flex-col overflow-hidden rounded-xl border", tint ? "border-accline bg-accsoft" : "border-line bg-card", "md:col-span-6", XL[span], className)}>
      {title ? (
        <header className={cn("flex min-h-12 items-center justify-between gap-3 border-b px-[18px] py-2", tint ? "border-accline" : "border-line")}>
          <h2 className="m-0 min-w-0 truncate text-[15px] font-extrabold">{title}</h2>
          {meta ? <div className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">{meta}</div> : null}
        </header>
      ) : null}
      <div className={flush ? "flex min-h-0 flex-1 flex-col" : "flex min-h-0 flex-1 flex-col gap-3 px-[18px] pb-[18px] pt-4"}>{children}</div>
      {footer ? <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-[18px] py-3 text-[13px] text-muted">{footer}</footer> : null}
    </section>
  );
}

/** One row inside a flush pane (title + sub on the left, anything on the right). */
export function PaneRow({ title, sub, right, href }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="min-w-0">
        <div className="truncate text-[15px] font-bold">{title}</div>
        {sub ? <div className="truncate text-[13px] text-muted">{sub}</div> : null}
      </div>
      {right ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{right}</div> : null}
    </>
  );
  const cls = "flex min-h-14 items-center justify-between gap-3 border-b border-line px-[18px] py-2.5 last:border-b-0";
  return href ? <Link href={href} className={cn(cls, "hover:bg-bg")}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Empty state inside a pane. */
export function PaneEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 px-[18px] py-6 text-sm text-muted">
      <div>{children}</div>
      {action}
    </div>
  );
}

/** Filter chips as links (`?view=…&filter=…`), so filtering is shareable and needs no client state. */
export function FilterChips({ label, options, active }: { label: string; options: Array<{ key: string; label: string; href: string; count?: number }>; active: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Link key={o.key} href={o.href} aria-current={o.key === active ? "true" : undefined}
          className={cn("inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-bold", o.key === active ? "border-acc bg-accsoft text-ink" : "border-line2 text-muted hover:text-ink")}>
          {o.label}{o.count !== undefined ? <span className="font-semibold text-muted">{o.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
