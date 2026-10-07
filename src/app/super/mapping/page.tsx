import { ActionForm } from "@/components/action-form";
import { Card, Dot, Mono, PageHero, Pill, Select, SideCard, TableCard, buttonClass, type StatusItem, type Tone } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, formatDay, humanize, singleParams, type SearchParams } from "@/lib/utils";
import { autoMatch, linkProfile, unlinkProfile } from "../actions";

const WALL_TONE: Record<string, Tone> = { unlink: "bad", ingest: "neutral", link: "ok", auto_match: "ok" };

export default async function MappingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole("super_admin");
  const { org } = singleParams(await searchParams);
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organizations").select("id, name").order("name");
  const orgId = org && orgs?.some((o) => o.id === org) ? org : orgs?.[0]?.id ?? null;

  const [mappings, unlinked, usersNoReport, auditRows] = await Promise.all([
    admin.rpc("admin_wall_list_mappings", orgId ? { p_org_id: orgId } : {}),
    admin.rpc("admin_wall_unlinked_profiles", orgId ? { p_org_id: orgId } : {}),
    orgId
      ? admin.from("users").select("id, full_name, email").eq("organization_id", orgId).eq("role", "end_user").eq("has_active_report", false).order("full_name").limit(500)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; email: string }> }),
    admin.rpc("admin_wall_identity_audit", { p_limit: 30 }),
  ]);
  const un = unlinked.data ?? [];
  const maps = mappings.data ?? [];
  const candidates = usersNoReport.data ?? [];

  const status: StatusItem[] = [
    { tone: un.length ? "warn" : "neutral", label: `${un.length} unlinked` },
    { tone: "ok", label: `${maps.length} active mapping${maps.length === 1 ? "" : "s"}` },
    { tone: "neutral", label: "Mappings never leave this console" },
  ];

  return (
    <>
      <PageHero title="Identity mapping wall" description="The only place where a person is connected to an anonymous profile token. Every link and unlink is written to the identity audit log." status={status} />

      <div className="flex flex-wrap items-center gap-2.5">
        <form method="get" className="contents">
          <Select name="org" defaultValue={orgId ?? ""} className="ctl-card flex-[0_1_260px]" aria-label="Organization">
            {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          <button type="submit" className={buttonClass("secondary", "md", "bg-card")}>Switch</button>
        </form>
        {orgId ? (
          <ActionForm action={autoMatch} submitLabel="Auto-match by candidate email" variant="secondary" inline className="ml-auto max-md:ml-0 max-md:w-full [&_button]:bg-card [&_button]:max-md:w-full"
            confirm={{ title: "Auto-match profiles?", body: "Links every unlinked profile whose candidate email matches a crew member in this organization. Each link is written to the identity audit log.", confirmLabel: "Run auto-match" }}>
            <input type="hidden" name="organization_id" value={orgId} />
          </ActionForm>
        ) : null}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <Card title="Unlinked profiles" description="Candidate identity hints were extracted from the report text and are visible only here." flush>
            {un.length ? un.map((p) => {
              const suggested = candidates.find((u) => p.candidate_email && u.email.toLowerCase() === p.candidate_email.toLowerCase());
              return (
                <div key={p.id} className="grid items-center gap-x-4 gap-y-3 border-b border-line px-5 py-3.5 last:border-b-0 md:grid-cols-[170px_minmax(0,1fr)_auto]">
                  <div><Mono className="font-bold">{p.code}</Mono><div className="text-[13px] text-muted">{humanize(p.framework)} · {formatDay(p.created_at)}</div></div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{p.candidate_name ?? "No name in report"}</div>
                    <div className="truncate text-[13px] text-muted">{p.candidate_email ?? "No email in report"}</div>
                  </div>
                  <ActionForm action={linkProfile} submitLabel="Link" size="sm" inline className="[&_button]:h-10">
                    <input type="hidden" name="profile_id" value={p.id} />
                    <Select name="user_id" required defaultValue={suggested?.id ?? ""} className="ctl-sm h-10 w-[220px] max-md:w-full" aria-label="User to link">
                      <option value="" disabled>Select user…</option>
                      {candidates.map((u) => <option key={u.id} value={u.id}>{u.full_name} · {u.email}</option>)}
                    </Select>
                  </ActionForm>
                </div>
              );
            }) : <div className="p-8 text-center font-semibold text-muted">All profiles in this organization are linked</div>}
          </Card>

          <TableCard title="Active mappings">
            {maps.length ? (
              <table className="dt">
                <thead><tr><th>User</th><th>Token</th><th className="max-md:hidden">Method</th><th className="max-md:hidden">Linked</th><th /></tr></thead>
                <tbody>
                  {maps.map((m) => (
                    <tr key={m.mapping_id}>
                      <td><div className="font-bold">{m.full_name}</div><div className="text-[13px] text-muted">{m.email}</div></td>
                      <td><Mono>{m.code}</Mono></td>
                      <td className="max-md:hidden"><Pill tone={m.method === "auto" ? "acc" : "neutral"} dot={false}>{m.method}</Pill></td>
                      <td className="whitespace-nowrap text-muted max-md:hidden">{formatDay(m.linked_at)}</td>
                      <td className="text-right">
                        <ActionForm action={unlinkProfile} submitLabel="Unlink" size="sm" variant="danger" inline
                          confirm={{ title: `Unlink ${m.full_name}?`, body: `${m.email} will lose access to routines until a report is linked again.`, confirmLabel: "Unlink", danger: true, detail: <div className="rounded-[10px] bg-bg px-3.5 py-3 text-center font-mono text-sm font-bold">{m.code}</div> }}>
                          <input type="hidden" name="user_id" value={m.user_id} />
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="p-8 text-center font-semibold text-muted">No mappings yet</div>}
          </TableCard>
        </div>

        <SideCard title="Identity audit log" description="Last wall events, all organizations" className="rounded-[14px]">
          {auditRows.data && auditRows.data.length ? auditRows.data.map((a) => (
            <div key={a.id} className="border-t border-line pt-2.5 text-[13px]">
              <div className="flex justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 font-extrabold ${a.action === "unlink" ? "text-bad" : a.action === "ingest" ? "text-muted" : "text-ok"}`}><Dot tone={WALL_TONE[a.action] ?? "neutral"} size={6} />{a.action}</span>
                <span className="text-faint">{formatDate(a.created_at)}</span>
              </div>
              <div className="mt-0.5 break-all font-mono text-xs">{a.code ?? "—"}{a.user_email ? ` → ${a.user_email}` : ""}</div>
              <div className="text-muted">by {a.actor_email ?? "system"}</div>
            </div>
          )) : <div className="text-sm text-muted">No events yet.</div>}
        </SideCard>
      </div>
    </>
  );
}
