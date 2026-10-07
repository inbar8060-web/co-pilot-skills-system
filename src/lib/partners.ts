import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { daysUntil } from "@/lib/utils";

export interface ConsentedPartner {
  id: string;
  name: string;
  team: string | null;
  hasReport: boolean;
  /** routine -> days of validity left */
  routines: Record<string, number>;
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** Crew members who approved a still-valid sharing request from `userId`, grouped per partner. */
export async function loadConsentedPartners(supabase: Client, userId: string): Promise<ConsentedPartner[]> {
  const { data: approved } = await supabase
    .from("consent_requests")
    .select("target_user_id, routine_type, valid_until")
    .eq("requester_user_id", userId)
    .eq("status", "approved")
    .gt("valid_until", new Date().toISOString());
  const rows = approved ?? [];
  if (rows.length === 0) return [];
  const { data: directory } = await supabase.rpc("crew_directory");
  const byId = new Map((directory ?? []).map((d) => [d.id, d]));
  const partners = new Map<string, ConsentedPartner>();
  for (const r of rows) {
    const d = byId.get(r.target_user_id);
    if (!d) continue;
    const p = partners.get(d.id) ?? { id: d.id, name: d.full_name, team: d.team, hasReport: d.has_active_report, routines: {} };
    p.routines[r.routine_type] = Math.max(p.routines[r.routine_type] ?? 0, daysUntil(r.valid_until));
    partners.set(d.id, p);
  }
  return [...partners.values()].sort((a, b) => a.name.localeCompare(b.name));
}
