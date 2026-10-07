import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ tones */
export type Tone = "acc" | "ok" | "warn" | "bad" | "neutral";

const DOT_BG: Record<Tone, string> = { acc: "bg-acc", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", neutral: "bg-faint" };
const TONE_TEXT: Record<Tone, string> = { acc: "text-acc", ok: "text-ok", warn: "text-warn", bad: "text-bad", neutral: "text-muted" };
const TONE_SOFT: Record<Tone, string> = { acc: "bg-accsoft", ok: "bg-oksoft", warn: "bg-warnsoft", bad: "bg-badsoft", neutral: "bg-bg" };

export const STATUS_TONE: Record<string, Tone> = {
  pending: "warn", requested: "warn", approved: "ok", delivered: "ok", active: "ok", linked: "ok",
  declined: "bad", expired: "neutral", cancelled: "neutral", inactive: "neutral", archived: "neutral", unlinked: "warn",
};

export function Dot({ tone = "neutral", size = 8, className }: { tone?: Tone; size?: number; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block shrink-0 rounded-full", DOT_BG[tone], className)} style={{ width: size, height: size }} />;
}

/* ------------------------------------------------------------------ page hero */
export interface StatusItem { tone: Tone; label: ReactNode; href?: string }

export function StatusLine({ items }: { items: StatusItem[] }) {
  return (
    <div className="flex flex-col gap-1.5 pb-1.5 text-sm font-semibold text-muted md:flex-row md:flex-wrap md:gap-x-6 md:gap-y-1">
      {items.map((it, i) =>
        it.href ? (
          <Link key={i} href={it.href} className="flex items-center gap-2 font-bold text-ink hover:underline">
            <Dot tone={it.tone} /> <span>{it.label} →</span>
          </Link>
        ) : (
          <span key={i} className="flex items-center gap-2"><Dot tone={it.tone} /> <span>{it.label}</span></span>
        ),
      )}
    </div>
  );
}

export function PageHero({ title, description, status, back, actions }: {
  title: ReactNode; description?: ReactNode; status?: StatusItem[]; back?: { href: string; label: string }; actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {back ? <Link href={back.href} className="self-start text-sm font-bold text-acc hover:underline">← {back.label}</Link> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 md:min-h-24">
        <div className="max-w-[560px]">
          <h1 className="m-0 text-[28px] font-extrabold leading-[1.15] tracking-[-0.025em] md:text-[34px]">{title}</h1>
          {description ? <p className="mt-1.5 text-[15px] text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2.5">{actions}</div> : status ? <StatusLine items={status} /> : null}
      </div>
      {actions && status ? <StatusLine items={status} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ surfaces */
export function StatTile({ label, value, hint, tone = "acc", href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; href?: string }) {
  const body = (
    <>
      <Dot tone={tone} className="absolute right-3.5 top-3.5" />
      <div className="text-xs font-bold uppercase tracking-[0.05em] text-muted">{label}</div>
      <div className="mt-2 text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] tabular-nums">{value}</div>
      {hint ? <div className="mt-1.5 text-[13px] text-muted">{hint}</div> : null}
    </>
  );
  const cls = "relative block rounded-[14px] border border-line bg-card px-5 py-[18px] text-left";
  return href ? <Link href={href} className={cn(cls, "transition-colors hover:border-line2")}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Bordered card. With `title` it gets a ruled header; `flush` removes body padding (tables, row lists). */
export function Card({ title, description, actions, children, className, flush = false, id }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean; id?: string;
}) {
  return (
    <section id={id} className={cn("overflow-hidden rounded-[14px] border border-line bg-card", className)}>
      {title ? (
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="m-0 text-base font-extrabold">{title}</h2>
            {description ? <div className="text-[13px] text-muted">{description}</div> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className={flush ? undefined : "px-5 py-[18px]"}>{children}</div>
    </section>
  );
}

/** Primary form surface: radius 16, generous padding, vertical rhythm. */
export function Panel({ title, description, children, className, id }: { title?: ReactNode; description?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("flex scroll-mt-6 flex-col gap-[18px] rounded-2xl border border-line bg-card p-[18px] md:px-7 md:py-6", className)}>
      {title ? (
        <div>
          <h2 className="m-0 text-[17px] font-extrabold">{title}</h2>
          {description ? <div className="text-[13px] text-muted">{description}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Secondary column card: radius 12, 18/20 padding. `tone="acc"` is the soft accent variant. */
export function SideCard({ title, description, children, className, tone, id }: { title?: ReactNode; description?: ReactNode; children: ReactNode; className?: string; tone?: "acc"; id?: string }) {
  return (
    <section id={id} className={cn("flex scroll-mt-6 flex-col gap-3 rounded-xl border border-line px-5 py-[18px]", tone === "acc" ? "bg-accsoft" : "bg-card", className)}>
      {title ? (
        <div>
          <h2 className="m-0 text-base font-extrabold">{title}</h2>
          {description ? <div className="text-[13px] text-muted">{description}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function SectionTitle({ children, description, action }: { children: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1">
      <div>
        <h2 className="m-0 text-[17px] font-extrabold">{children}</h2>
        {description ? <div className="text-[13px] text-muted">{description}</div> : null}
      </div>
      {action}
    </div>
  );
}

/** List-row card (history, requests, redemptions). Becomes a link when `href` is set. */
export function Row({ href, children, className }: { href?: string; children: ReactNode; className?: string }) {
  const cls = cn("flex min-h-16 w-full items-center justify-between gap-4 rounded-xl border border-line bg-card px-5 py-4 text-left", className);
  return href ? <Link href={href} className={cn(cls, "transition-colors hover:border-line2")}>{children}</Link> : <div className={cls}>{children}</div>;
}

export function RowText({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[15px] font-bold">{title}</div>
      {sub ? <div className="truncate text-[13px] text-muted">{sub}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line2 p-7 text-center">
      <div className="font-semibold text-muted">{title}</div>
      {description ? <div className="mt-1 text-[13px] text-muted">{description}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ status */
export function Pill({ tone = "neutral", children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold", TONE_SOFT[tone], TONE_TEXT[tone], className)}>
      {dot ? <Dot tone={tone} size={6} /> : null}
      {children}
    </span>
  );
}

export function StatusText({ tone, children, hideLabelOnMobile = false }: { tone: Tone; children: ReactNode; hideLabelOnMobile?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold", TONE_TEXT[tone])}>
      <Dot tone={tone} /> <span className={hideLabelOnMobile ? "hidden md:inline" : undefined}>{children}</span>
    </span>
  );
}

export function Banner({ tone = "warn", title, children, action }: { tone?: "warn" | "bad" | "ok" | "acc"; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const border = { warn: "border-warn", bad: "border-bad", ok: "border-ok", acc: "border-acc" }[tone];
  return (
    <div role="status" className={cn("flex flex-wrap items-center justify-between gap-4 rounded-xl border px-[18px] py-3.5", TONE_SOFT[tone], border)}>
      <div>
        {title ? <div className="font-bold">{title}</div> : null}
        {children ? <div className="text-sm text-muted">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function ProgressBar({ percent, tone = "acc", height = 6, label }: { percent: number; tone?: Tone; height?: number; label?: string }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="w-full overflow-hidden bg-line" style={{ height, borderRadius: height / 2 }} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("h-full", DOT_BG[tone])} style={{ width: `${p}%` }} />
    </div>
  );
}

export function Avatar({ name, size = 40, tone = "soft" }: { name: string; size?: number; tone?: "soft" | "ink" }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-full font-extrabold", tone === "ink" ? "bg-ink text-bg" : "bg-accsoft text-acc")}
      style={{ width: size, height: size, fontSize: size <= 32 ? 12 : 13 }}
    >
      {initials(name)}
    </span>
  );
}

export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/* ------------------------------------------------------------------ buttons */
type Variant = "primary" | "secondary" | "danger" | "ghost" | "soft";
type Size = "lg" | "md" | "sm";

const VARIANT: Record<Variant, string> = {
  primary: "border-0 bg-brand text-onbrand hover:opacity-90",
  secondary: "border border-line2 bg-transparent text-ink hover:bg-bg",
  danger: "border border-line2 bg-transparent text-bad hover:bg-badsoft",
  ghost: "border-0 bg-transparent text-acc hover:underline",
  soft: "border-0 bg-accsoft text-acc hover:opacity-90",
};
const SIZE: Record<Size, string> = {
  lg: "h-[46px] px-[22px] text-[15px] rounded-[10px]",
  md: "h-11 px-[18px] text-sm rounded-[10px]",
  sm: "h-9 px-3.5 text-[13px] rounded-lg",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold transition-[opacity,background-color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc disabled:opacity-55",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ href, variant = "secondary", size = "md", className, children }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return <Link href={href} className={buttonClass(variant, size, className)}>{children}</Link>;
}

/* ------------------------------------------------------------------ form controls */
export function Field({ label, optional, hint, error, children, className }: { label: ReactNode; optional?: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[13px] font-bold text-muted">{label}{optional ? <span className="font-medium"> {optional}</span> : null}</span>
      {children}
      {error ? <span className="text-[13px] font-semibold text-bad">{error}</span> : hint ? <span className="text-[13px] text-muted">{hint}</span> : null}
    </label>
  );
}

/** Non-label group heading (for chip groups, which contain their own labels). */
export function Group({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} role="group">
      <span className="text-[13px] font-bold text-muted">{label}</span>
      {children}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("ctl", className)} />;
}
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("ctl", className)} />;
}
export function Textarea({ className, rows = 4, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} {...props} className={cn("ctl", className)} />;
}

/*
 * Chips, segmented controls, radio cards and switches are native inputs styled through
 * `has-[:checked]`, so they post with plain forms (no JS) and also work controlled.
 */
export interface ChipOption { value: string; label: ReactNode; sub?: ReactNode; disabled?: boolean }

const CHIP =
  "inline-flex cursor-pointer select-none items-center gap-2 rounded-[10px] border border-line2 font-bold text-ink transition-colors " +
  "has-[:checked]:border-acc has-[:checked]:bg-accsoft has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-acc " +
  "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50";

export function ChipRadio({ name, options, value, defaultValue, onChange, size = "md", required }: {
  name: string; options: ChipOption[]; value?: string; defaultValue?: string; onChange?: (v: string) => void; size?: "md" | "sm"; required?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap", size === "md" ? "gap-2.5" : "gap-2")}>
      {options.map((o) => (
        <label key={o.value} className={cn(CHIP, "group", size === "md" ? "h-11 px-[18px] text-[15px]" : "h-10 px-3.5 text-sm")}>
          <input
            type="radio" name={name} value={o.value} disabled={o.disabled} required={required} className="sr-only"
            {...(value !== undefined ? { checked: value === o.value, onChange: () => onChange?.(o.value) } : { defaultChecked: defaultValue === o.value })}
          />
          {o.label}
          {o.sub ? <span className="text-xs font-semibold text-muted">{o.sub}</span> : null}
        </label>
      ))}
    </div>
  );
}

export function ChipChecks({ name, options, defaultValues }: { name: string; options: ChipOption[]; defaultValues: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value} className={cn(CHIP, "group h-10 px-3.5 text-sm")}>
          <input type="checkbox" name={name} value={o.value} defaultChecked={defaultValues.includes(o.value)} className="sr-only" />
          <span className="text-xs group-has-[:checked]:hidden" aria-hidden="true">+</span>
          <span className="hidden text-xs group-has-[:checked]:inline" aria-hidden="true">✓</span>
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function Segmented({ name, options, defaultValue }: { name: string; options: Array<{ value: string; label: string }>; defaultValue: string }) {
  return (
    <div className="grid gap-1 rounded-[10px] border border-line bg-bg p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <label key={o.value} className="flex h-[38px] cursor-pointer items-center justify-center rounded-[7px] text-sm font-bold text-muted has-[:checked]:bg-card has-[:checked]:text-ink has-[:checked]:shadow-[0_1px_3px_rgba(0,0,0,0.12)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-acc">
          <input type="radio" name={name} value={o.value} defaultChecked={defaultValue === o.value} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function RadioCards({ name, options, defaultValue }: { name: string; options: Array<{ value: string; title: string; desc: string }>; defaultValue: string }) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((o) => (
        <label key={o.value} className="group flex cursor-pointer items-center gap-3.5 rounded-xl border border-line px-4 py-3.5 has-[:checked]:border-acc has-[:checked]:bg-accsoft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-acc">
          <input type="radio" name={name} value={o.value} defaultChecked={defaultValue === o.value} className="sr-only" />
          <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 border-line2 group-has-[:checked]:border-acc">
            <span className="size-2 rounded-full group-has-[:checked]:bg-acc" />
          </span>
          <span>
            <span className="block font-bold">{o.title}</span>
            <span className="text-[13px] text-muted">{o.desc}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export function Switch({ name, defaultChecked, label }: { name: string; defaultChecked?: boolean; label: string }) {
  return (
    <label className="group relative inline-flex h-[26px] w-11 shrink-0 cursor-pointer rounded-full bg-line2 transition-colors has-[:checked]:bg-ok has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-acc" title={label}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="sr-only" aria-label={label} />
      <span className="absolute left-[3px] top-[3px] size-5 rounded-full bg-onacc shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-[left] group-has-[:checked]:left-[21px]" />
    </label>
  );
}

/* ------------------------------------------------------------------ data */
export function TableCard({ title, description, actions, children, footer }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card title={title} description={description} actions={actions} flush>
      <div className="overflow-x-auto">{children}</div>
      {footer ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">{footer}</div> : null}
    </Card>
  );
}

export function KeyValue({ items }: { items: Array<{ k: string; v: ReactNode }> }) {
  return (
    <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map(({ k, v }) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="m-0 min-w-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "Label ..... value" rule list used in side cards. */
export function RuleList({ items }: { items: Array<{ key: string; label: ReactNode; sub?: ReactNode; value: ReactNode; tone?: Tone; dot?: Tone }> }) {
  return (
    <div className="flex flex-col">
      {items.map((it) => (
        <div key={it.key} className="flex items-center justify-between gap-3 border-t border-line py-2 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            {it.dot ? <Dot tone={it.dot} /> : null}
            <div className="min-w-0">
              <div className="font-semibold">{it.label}</div>
              {it.sub ? <div className="text-xs text-muted">{it.sub}</div> : null}
            </div>
          </div>
          <span className={cn("whitespace-nowrap font-extrabold tabular-nums", it.tone ? TONE_TEXT[it.tone] : undefined)}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[13px]", className)}>{children}</span>;
}
