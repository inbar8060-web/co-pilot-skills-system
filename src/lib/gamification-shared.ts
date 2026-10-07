/** Pure helpers usable on both server and client. */
export interface TierRow {
  tier: string;
  label: string;
  min_credits: number;
  sort_order: number;
}

export interface TierProgress {
  current: TierRow;
  next: TierRow | null;
  /** 0..100 progress from current tier floor to the next tier floor */
  percent: number;
  creditsToNext: number;
}

export function tierProgress(totalCredits: number, tiers: TierRow[]): TierProgress {
  const sorted = [...tiers].sort((a, b) => a.sort_order - b.sort_order);
  if (sorted.length === 0) {
    const fallback = { tier: "bronze", label: "Bronze", min_credits: 0, sort_order: 1 };
    return { current: fallback, next: null, percent: 100, creditsToNext: 0 };
  }
  let current = sorted[0];
  for (const t of sorted) if (totalCredits >= t.min_credits) current = t;
  const idx = sorted.indexOf(current);
  const next = sorted[idx + 1] ?? null;
  if (!next) return { current, next: null, percent: 100, creditsToNext: 0 };
  const span = Math.max(next.min_credits - current.min_credits, 1);
  const done = Math.min(Math.max(totalCredits - current.min_credits, 0), span);
  return {
    current,
    next,
    percent: Math.round((done / span) * 100),
    creditsToNext: Math.max(next.min_credits - totalCredits, 0),
  };
}

export const ACTION_LABELS: Record<string, string> = {
  report_verified: "Report verified",
  synergy_brief: "Synergy brief",
  weekly_insight_read: "Weekly insight",
  reflection: "Reflection",
  consent_given: "Consent given",
  streak_bonus: "Streak bonus",
  redemption: "Reward redeemed",
  redemption_refund: "Redemption refunded",
};

/** Monday 00:00 UTC of the week containing `d` (Postgres `date_trunc('week', ...)` in UTC). */
function weekStartUtc(d: Date): number {
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

/**
 * The stored streak only changes when credits are awarded, so after a quiet week it still shows the
 * old value. A streak is alive only if the last award fell in this week or the previous one.
 */
export function effectiveStreak(storedWeeks: number | null | undefined, lastActionAt: string | null | undefined, now: Date = new Date()): number {
  if (!storedWeeks || !lastActionAt) return 0;
  const gap = (weekStartUtc(now) - weekStartUtc(new Date(lastActionAt))) / (7 * 86_400_000);
  return gap <= 1 ? storedWeeks : 0;
}
