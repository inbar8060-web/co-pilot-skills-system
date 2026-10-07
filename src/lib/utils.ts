/** Tiny class-name joiner (no dependency needed). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** ISO week key, e.g. 2026-W37 (matches Postgres IYYY-"W"IW). */
export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Stable index into a rotating catalog for the current ISO week. */
export function weekIndex(date = new Date(), modulo = 6): number {
  const [year, w] = isoWeekKey(date).split("-W");
  return (Number(year) * 53 + Number(w)) % modulo;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function formatDay(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

/** "MBTI_Step_II" -> "MBTI Step II", "civilian_pilot" -> "civilian pilot" (no case changes). */
export function humanize(value: string | null | undefined): string {
  return value ? value.replace(/_/g, " ") : "—";
}

export const ROLE_LABELS: Record<string, string> = {
  end_user: "Crew member",
  org_admin: "Organization admin",
  super_admin: "Super admin",
};

/**
 * Accepts only same-origin relative paths for post-login redirects. Rejects protocol-relative
 * forms, backslashes (browsers normalise "/\\evil.com" to "//evil.com"), schemes and control chars.
 */
export function safeRelativePath(next: string | null | undefined): string | null {
  if (!next || next.length > 400) return null;
  if (!next.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(next) || next.startsWith("//") || /^\/[^/?#]*:/.test(next)) return null;
  try {
    const url = new URL(next, "http://placeholder.local");
    if (url.origin !== "http://placeholder.local") return null;
    // Validate the normalised result too: dot segments ("/.//evil.com", "/app/%2e%2e//evil.com")
    // collapse into a protocol-relative "//evil.com" that browsers resolve off-site.
    const out = url.pathname + url.search + url.hash;
    if (out.startsWith("//") || out.startsWith("/\\")) return null;
    return out;
  } catch {
    return null;
  }
}

export const ROUTINE_LABELS: Record<string, string> = {
  simulator: "Simulator session",
  flight: "Flight",
  debrief: "Event debrief",
  coaching: "Manager coaching",
  training: "Training",
};

export const CATEGORY_LABELS: Record<string, string> = {
  military_pilot: "Military pilot",
  civilian_pilot: "Civilian pilot",
  management: "Management",
  first_officer: "First officer",
  captain: "Captain",
  other: "Other",
};

/** Result type for server actions (never throw raw errors to the client). */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string };

export class AppError extends Error {
  constructor(public readonly code: string, message?: string, public readonly status = 400) {
    super(message ?? code);
    this.name = "AppError";
  }
}

/** Generate a temporary password that satisfies the auth policy (>=10 chars, mixed classes). */
export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  const core = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${core.slice(0, 5)}-${core.slice(5, 10)}!${core.slice(10)}`;
}

export function nowMs(): number {
  return Date.now();
}

/** "Tier 2 - Silver" -> "Silver". */
export function tierShort(label: string): string {
  return label.includes(" - ") ? label.split(" - ").slice(1).join(" - ") : label;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
}

/** Whole days from now until an ISO timestamp (never negative). */
export function daysUntil(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function isoWeekNumber(date = new Date()): number {
  return Number(isoWeekKey(date).split("-W")[1]);
}

/** ISO timestamp N days ago (kept out of render bodies for the React purity lint). */
export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** Raw page `searchParams`: repeated keys (`?q=a&q=b`) arrive as arrays. */
export type SearchParams = Record<string, string | string[] | undefined>;

/** Collapses repeated query keys to their first value, so pages only ever see strings. */
export function singleParams(sp: SearchParams): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}

/** Short routine names for chips and pills ("Simulator", not "Simulator session"). */
export const ROUTINE_SHORT: Record<string, string> = {
  simulator: "Simulator",
  flight: "Flight",
  debrief: "Debrief",
  coaching: "Coaching",
  training: "Training",
};

const SESSION_TITLES: Record<string, string> = {
  simulator: "Simulator briefing",
  flight: "Flight briefing",
  training: "Training briefing",
  debrief: "Event debrief",
  coaching: "Coaching guidance",
};

/** The title a generated session is shown under ("Flight briefing", "Event debrief"). */
export function sessionTitle(routine: string): string {
  return SESSION_TITLES[routine] ?? `${ROUTINE_LABELS[routine] ?? humanize(routine)} briefing`;
}

/** "Yoav Peretz" -> "Yoav P."; parenthesised suffixes such as "(Org Admin)" are dropped. */
export function shortName(fullName: string): string {
  const parts = fullName.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Crew member";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** "Today", "Yesterday", or a short date ("3 Oct"; the year is added when it differs). */
export function relativeDay(value: string | Date, now: Date = new Date()): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("en-GB", opts).format(d);
}
