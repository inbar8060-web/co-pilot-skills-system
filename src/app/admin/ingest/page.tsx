import { Banner, Mono, PageHero, SideCard, StatusText, TableCard, type StatusItem } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDay, humanize } from "@/lib/utils";
import { BatchUploader } from "./batch-uploader";

export default async function IngestPage() {
  const user = await requireRole("org_admin", "super_admin");
  const orgId = user.organizationId;
  const { data: profiles } = orgId ? await createAdminClient().rpc("admin_wall_list_profiles", { p_org_id: orgId }) : { data: [] };
  const rows = profiles ?? [];
  const linked = rows.filter((r) => r.is_linked).length;

  const status: StatusItem[] = [
    { tone: "acc", label: `${rows.length} profiles in wall` },
    { tone: "ok", label: `${linked} linked` },
    { tone: rows.length - linked ? "warn" : "neutral", label: `${rows.length - linked} awaiting mapping` },
  ];

  return (
    <>
      <PageHero title="Report ingestion" description="Upload psychometric reports in bulk. Each is stored under an anonymous token; the token-to-identity mapping is handled only by the super admin." status={status} />
      {!orgId ? <Banner tone="acc" title="No organization attached">Super admins ingest reports with an explicit organization from the console.</Banner> : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <TableCard title="Profiles" description="Anonymous codes only">
            {rows.length ? (
              <table className="dt">
                <thead><tr><th>Token</th><th className="max-md:hidden">Framework</th><th className="max-md:hidden">Ingested</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td><Mono className="font-bold">{r.code}</Mono></td>
                      <td className="max-md:hidden">{humanize(r.framework)}</td>
                      <td className="text-muted max-md:hidden">{formatDay(r.created_at)}</td>
                      <td><StatusText tone={r.is_linked ? "ok" : "warn"}>{r.is_linked ? "Linked" : "Awaiting mapping"}</StatusText></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="p-8 text-center font-semibold text-muted">No profiles ingested yet</div>}
          </TableCard>
          <SideCard title="Batch upload" description="PDF only · up to 10 files · 10 MB each" className="gap-3.5 rounded-[14px]">
            <BatchUploader />
          </SideCard>
        </div>
      )}
    </>
  );
}
