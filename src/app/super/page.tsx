import { Banner, Dot, Mono, PageHero, StatTile, TableCard, type StatusItem, type Tone } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, isoDaysAgo, singleParams, type SearchParams } from "@/lib/utils";

function actionTone(action: string): Tone {
  if (/^(prompt|rule|tier)\./.test(action)) return "acc";
  if (/^research\./.test(action)) return "warn";
  if (/^(user|org_admin|organization|report)\./.test(action)) return "ok";
  return "neutral";
}

export default async function SuperOverview({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole("super_admin");
  const { error } = singleParams(await searchParams);
  const admin = createAdminClient();
  const env = serverEnv();
  const weekAgo = isoDaysAgo(7);
  const [orgs, orgStats, users, sessions, sessionsWeek, unlinked, auditRows] = await Promise.all([
    admin.from("organizations").select("id", { count: "exact", head: true }),
    admin.rpc("admin_org_stats"),
    admin.from("users").select("id", { count: "exact", head: true }),
    admin.from("routine_sessions").select("id", { count: "exact", head: true }),
    admin.from("routine_sessions").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    admin.rpc("admin_wall_unlinked_profiles", {}),
    admin.from("audit_log").select("id, action, actor_user_id, target_type, target_id, created_at").order("created_at", { ascending: false }).limit(12),
  ]);
  const totals = (orgStats.data ?? []).reduce((a, r) => ({ admins: a.admins + Number(r.admins), crew: a.crew + Number(r.crew), reports: a.reports + Number(r.reports) }), { admins: 0, crew: 0, reports: 0 });
  const unlinkedCount = unlinked.data?.length ?? 0;
  const actorIds = Array.from(new Set((auditRows.data ?? []).map((a) => a.actor_user_id).filter((x): x is string => Boolean(x))));
  const { data: actors } = actorIds.length ? await admin.from("users").select("id, email").in("id", actorIds) : { data: [] };
  const emailOf = new Map((actors ?? []).map((a) => [a.id, a.email]));

  const status: StatusItem[] = [
    { tone: "ok", label: "All systems healthy" },
    { tone: unlinkedCount ? "warn" : "neutral", label: `${unlinkedCount} profile${unlinkedCount === 1 ? "" : "s"} awaiting mapping`, ...(unlinkedCount ? { href: "/super/mapping" } : {}) },
    { tone: "acc", label: env.AI_MODE === "mock" ? "AI mock mode" : `${env.ANTHROPIC_MODEL} · effort ${env.ANTHROPIC_EFFORT}` },
  ];

  return (
    <>
      {error === "forbidden" ? <Banner tone="warn" title="You do not have access to that area" /> : null}
      <PageHero title="Console overview" description="Cross-organization status. Identity mapping and research data are reachable only from this console." status={status} />
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Organizations" value={orgs.count ?? 0} hint={`${totals.admins} admin${totals.admins === 1 ? "" : "s"}`} tone="acc" href="/super/organizations" />
        <StatTile label="Users" value={users.count ?? 0} hint={`${totals.crew} crew`} tone="acc" href="/super/organizations" />
        <StatTile label="Reports linked" value={totals.reports} hint={totals.crew ? `${Math.round((totals.reports / totals.crew) * 100)}% of crew` : "No crew yet"} tone="ok" href="/super/mapping" />
        <StatTile label="Unlinked profiles" value={unlinkedCount} hint="Awaiting mapping" tone={unlinkedCount ? "warn" : "neutral"} href="/super/mapping" />
        <StatTile label="Routine sessions" value={(sessions.count ?? 0).toLocaleString("en-GB")} hint={`${sessionsWeek.count ?? 0} this week`} tone="neutral" href="/super/analytics" />
      </div>

      <TableCard title="Recent audit events" description="Application audit log. Identity-wall events have their own log on the mapping page.">
        {auditRows.data && auditRows.data.length ? (
          <table className="dt">
            <thead><tr><th>When</th><th>Action</th><th className="max-md:hidden">Target</th><th className="max-md:hidden">Actor</th></tr></thead>
            <tbody>
              {auditRows.data.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-muted">{formatDate(a.created_at)}</td>
                  <td><span className="flex items-center gap-2 font-bold"><Dot tone={actionTone(a.action)} />{a.action}</span></td>
                  <td className="max-w-[260px] truncate max-md:hidden"><Mono className="text-muted">{a.target_type ? `${a.target_type}:${a.target_id}` : "—"}</Mono></td>
                  <td className="text-muted max-md:hidden">{a.actor_user_id ? emailOf.get(a.actor_user_id) ?? "deleted user" : "system"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="p-8 text-center font-semibold text-muted">No audit events yet</div>}
      </TableCard>
    </>
  );
}
