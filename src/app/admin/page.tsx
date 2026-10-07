import { Banner, Card, PageHero, ProgressBar, RuleList, SideCard, StatTile, TableCard, type StatusItem, type Tone } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isoWeekNumber, ROUTINE_LABELS, singleParams, type SearchParams } from "@/lib/utils";

interface Stats {
  members: number; reports_loaded: number; avg_credits: number; tiers: Record<string, number>;
  weekly_sessions: Array<{ week: string; routine: string; n: number }>; reflections_30d: number;
  consents: Record<string, number>; sessions_by_routine: Record<string, number>;
}
const ROUTINE_COLS = ["simulator", "flight", "debrief", "training"] as const;
const SHORT: Record<string, string> = { simulator: "Sim", flight: "Flight", debrief: "Debrief", training: "Training" };
const TIERS: Array<{ key: string; label: string; tone: Tone }> = [
  { key: "bronze", label: "Bronze", tone: "neutral" }, { key: "silver", label: "Silver", tone: "acc" }, { key: "gold", label: "Gold", tone: "warn" }, { key: "platinum", label: "Platinum", tone: "ok" },
];
const CONSENTS: Array<{ key: string; label: string; tone: Tone }> = [
  { key: "pending", label: "Pending", tone: "warn" }, { key: "approved", label: "Approved", tone: "ok" }, { key: "declined", label: "Declined", tone: "bad" }, { key: "expired", label: "Expired", tone: "neutral" },
];

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole("org_admin", "super_admin");
  const { error } = singleParams(await searchParams);
  if (!user.organizationId) {
    return (
      <>
        <PageHero title="Engagement dashboard" description="Anonymous aggregates only. No names, no profiles, no individual outputs." />
        <Banner tone="acc" title="No organization attached">Super admins are not attached to an organization. Use the console for cross-organization analytics.</Banner>
      </>
    );
  }
  const supabase = await createClient();
  const [{ data, error: rpcError }, orgRes] = await Promise.all([
    supabase.rpc("org_engagement_stats"),
    supabase.from("organizations").select("name").eq("id", user.organizationId).maybeSingle(),
  ]);
  const stats = (data ?? null) as Stats | null;
  const status: StatusItem[] = [
    { tone: "ok", label: `${orgRes.data?.name ?? "Organization"} · ${stats?.members ?? 0} crew` },
    { tone: "acc", label: `Week ${isoWeekNumber()}` },
    { tone: "neutral", label: "Last 8 weeks" },
  ];

  if (rpcError || !stats) {
    return (<><PageHero title="Engagement dashboard" status={status} /><Banner tone="bad" title="Could not load statistics" /></>);
  }

  const weeks = Array.from(new Set(stats.weekly_sessions.filter((w) => (ROUTINE_COLS as readonly string[]).includes(w.routine)).map((w) => w.week))).sort().reverse();
  const weekRows = weeks.map((week) => {
    const rows = stats.weekly_sessions.filter((s) => s.week === week);
    const by = Object.fromEntries(rows.map((r) => [r.routine, r.n])) as Record<string, number>;
    // Total the displayed crew-routine columns only; manager coaching sessions have no column here.
    return { week, by, total: ROUTINE_COLS.reduce((a, r) => a + (by[r] ?? 0), 0) };
  });
  const maxWeek = Math.max(1, ...weekRows.map((w) => w.total));
  const grand = weekRows.reduce((a, b) => a + b.total, 0);
  const maxTier = Math.max(1, ...TIERS.map((t) => stats.tiers[t.key] ?? 0));
  const coverage = stats.members ? Math.round((stats.reports_loaded / stats.members) * 100) : 0;

  return (
    <>
      {error === "forbidden" ? <Banner tone="warn" title="You do not have access to that area" /> : null}
      <PageHero title="Engagement dashboard" description="Anonymous aggregates only. No names, no profiles, no individual outputs." status={status} />

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <StatTile label="Crew members" value={stats.members} hint="Active accounts" tone="acc" href="/admin/users" />
        <StatTile label="Reports loaded" value={`${stats.reports_loaded} / ${stats.members}`} hint={`${coverage}% coverage`} tone={coverage >= 80 ? "ok" : "warn"} href="/admin/ingest" />
        <StatTile label="Avg. credits" value={stats.avg_credits} hint="Team readiness proxy" tone="acc" />
        <StatTile label="Reflections" value={stats.reflections_30d} hint="Last 30 days" tone="neutral" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <TableCard title="Weekly activity" description="Generated routines per ISO week" actions={<span className="text-[13px] font-bold text-muted">Total {grand}</span>}>
          {weekRows.length ? (
            <table className="dt">
              <thead><tr><th>Week</th>{ROUTINE_COLS.map((r) => <th key={r} className="num max-md:hidden">{SHORT[r]}</th>)}<th>Total</th></tr></thead>
              <tbody>
                {weekRows.map((w) => (
                  <tr key={w.week}>
                    <td className="font-bold tabular-nums">{w.week.split("-")[1]}</td>
                    {ROUTINE_COLS.map((r) => <td key={r} className="num text-muted max-md:hidden">{w.by[r] ?? 0}</td>)}
                    <td>
                      <span className="flex items-center gap-2.5">
                        <span className="min-w-[60px] flex-1"><ProgressBar percent={(w.total / maxWeek) * 100} height={8} /></span>
                        <span className="min-w-6 text-right font-extrabold tabular-nums">{w.total}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="p-8 text-center font-semibold text-muted">No routine activity in the last 8 weeks</div>}
        </TableCard>

        <div className="flex flex-col gap-4">
          <Card className="rounded-[14px]"><div className="flex flex-col gap-2.5">
            <h2 className="m-0 text-base font-extrabold">Readiness tiers</h2>
            {TIERS.map((t) => (
              <div key={t.key} className="grid grid-cols-[80px_1fr_28px] items-center gap-3 text-sm">
                <span className="font-semibold">{t.label}</span>
                <ProgressBar percent={((stats.tiers[t.key] ?? 0) / maxTier) * 100} tone={t.tone} height={8} />
                <span className="text-right font-extrabold tabular-nums">{stats.tiers[t.key] ?? 0}</span>
              </div>
            ))}
          </div></Card>
          <SideCard title="Sharing requests" className="gap-1.5 rounded-[14px]">
            <RuleList items={CONSENTS.map((c) => ({ key: c.key, label: c.label, dot: c.tone, value: stats.consents[c.key] ?? 0 }))} />
          </SideCard>
          <SideCard title="Training-needs signal" description="Where crews invest preparation" className="gap-1.5 rounded-[14px]">
            {Object.keys(stats.sessions_by_routine).length ? (
              <RuleList items={Object.entries(stats.sessions_by_routine).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, label: ROUTINE_LABELS[k] ?? k, value: n }))} />
            ) : <div className="text-sm text-muted">No sessions yet.</div>}
          </SideCard>
        </div>
      </div>
    </>
  );
}
