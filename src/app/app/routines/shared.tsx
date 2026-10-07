/** Small helpers shared by the routines pages (Start, History, Session). Server-safe. */
import { Pill } from "@/components/ui";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A uuid-shaped string (partner ids in old links); anything else is dropped. */
export function isUuidLike(value: string | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** "once per day", "up to 2 per day", "one time" from a gamification rule's cooldown. */
export function ruleCadence(rule: { cooldown_kind: string; cooldown_limit: number }): string {
  if (rule.cooldown_kind === "once") return "one time";
  const period = rule.cooldown_kind.replace("per_", "per ");
  return rule.cooldown_limit === 1 ? `once ${period}` : `up to ${rule.cooldown_limit} ${period}`;
}

export function ModeBadge({ synergy }: { synergy: boolean }) {
  return synergy ? <Pill tone="acc" dot={false}>Blind synergy</Pill> : <Pill dot={false}>Solo</Pill>;
}

/** Shortens long free text for list rows (the full text stays on the session page). */
export function clip(text: string, max = 220): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
