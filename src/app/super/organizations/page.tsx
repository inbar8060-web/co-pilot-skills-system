import { ActionForm } from "@/components/action-form";
import { Field, Input, Mono, PageHero, SideCard, TableCard, type StatusItem } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDay } from "@/lib/utils";
import { createOrganization, setOrgCanvas } from "../actions";
import { NewOrgAdmin } from "./new-org-admin";

export default async function OrganizationsPage() {
  await requireRole("super_admin");
  const admin = createAdminClient();
  const [orgsRes, statsRes] = await Promise.all([admin.from("organizations").select("*").order("name"), admin.rpc("admin_org_stats")]);
  const orgs = orgsRes.data ?? [];
  const stats = new Map((statsRes.data ?? []).map((r) => [r.organization_id, r]));
  const totals = (statsRes.data ?? []).reduce((a, r) => ({ admins: a.admins + Number(r.admins), crew: a.crew + Number(r.crew), reports: a.reports + Number(r.reports) }), { admins: 0, crew: 0, reports: 0 });

  const status: StatusItem[] = [
    { tone: "acc", label: `${orgs.length} organization${orgs.length === 1 ? "" : "s"}` },
    { tone: "ok", label: `${totals.crew} crew · ${totals.reports} reports` },
    { tone: "neutral", label: `${totals.admins} admin${totals.admins === 1 ? "" : "s"}` },
  ];

  return (
    <>
      <PageHero title="Organizations" description="Provision customer organizations and their first administrator. Crew canvas turns the new canvas home on for that organization's crew (pilot)." status={status} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <TableCard>
          {orgs.length ? (
            <table className="dt">
              <thead><tr><th>Organization</th><th className="num">Admins</th><th className="num">Crew</th><th className="num max-md:hidden">Reports</th><th className="max-md:hidden">Created</th><th>Crew canvas</th></tr></thead>
              <tbody>
                {orgs.map((o) => {
                  const st = stats.get(o.id);
                  return (
                    <tr key={o.id}>
                      <td><div className="font-bold">{o.name}</div><Mono className="text-xs text-muted">{o.slug}</Mono></td>
                      <td className="num">{st?.admins ?? 0}</td>
                      <td className="num">{st?.crew ?? 0}</td>
                      <td className="num max-md:hidden">{st?.reports ?? 0}</td>
                      <td className="whitespace-nowrap text-muted max-md:hidden">{formatDay(o.created_at)}</td>
                      <td>
                        <ActionForm action={setOrgCanvas} inline size="sm" variant={o.canvas_enabled ? "secondary" : "soft"} submitLabel={o.canvas_enabled ? "On · turn off" : "Turn on"} pendingLabel="Saving…">
                          <input type="hidden" name="organization_id" value={o.id} />
                          <input type="hidden" name="enabled" value={o.canvas_enabled ? "false" : "true"} />
                        </ActionForm>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <div className="p-8 text-center font-semibold text-muted">No organizations yet</div>}
        </TableCard>
        <div className="flex flex-col gap-4">
          <SideCard title="New organization" className="rounded-[14px]">
            <ActionForm action={createOrganization} submitLabel="Create organization" footer="plain" fullWidthSubmit resetOnSuccess className="gap-3">
              <Field label="Name"><Input name="name" required minLength={2} maxLength={120} /></Field>
              <Field label="Slug" optional="· lowercase, digits, dashes"><Input name="slug" required pattern="[a-z0-9\-]{2,64}" placeholder="e.g. northwind" /></Field>
            </ActionForm>
          </SideCard>
          <SideCard title="New organization admin" className="rounded-[14px]">
            <NewOrgAdmin orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} />
          </SideCard>
        </div>
      </div>
    </>
  );
}
