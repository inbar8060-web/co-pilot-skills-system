import { ActionForm } from "@/components/action-form";
import { Banner, Card, PageHero, Pill, STATUS_TONE, StatusText, TableCard, type StatusItem } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/utils";
import { setRedemptionStatus, toggleReward } from "../actions";
import { AddReward } from "./add-reward";

export default async function RewardsAdminPage() {
  const user = await requireRole("org_admin", "super_admin");
  if (!user.organizationId) {
    return (<><PageHero title="Rewards & redemptions" /><Banner tone="acc" title="No organization attached">Attach to an organization to manage rewards.</Banner></>);
  }
  const supabase = await createClient();
  const quarterStart = new Date(); quarterStart.setMonth(Math.floor(quarterStart.getMonth() / 3) * 3, 1); quarterStart.setHours(0, 0, 0, 0);
  const [rewardsRes, redemptionsRes, spentRes] = await Promise.all([
    supabase.from("organization_rewards").select("*").eq("organization_id", user.organizationId).order("created_at", { ascending: false }),
    supabase.from("reward_redemptions").select("*, users!reward_redemptions_user_id_fkey(full_name, email)").eq("organization_id", user.organizationId).order("created_at", { ascending: false }).limit(100),
    supabase.from("reward_redemptions").select("credits_spent").eq("organization_id", user.organizationId).neq("status", "cancelled").gte("created_at", quarterStart.toISOString()).limit(1000),
  ]);
  const rewards = rewardsRes.data ?? [];
  const redemptions = redemptionsRes.data ?? [];
  const open = redemptions.filter((r) => r.status === "requested" || r.status === "approved").length;
  const active = rewards.filter((r) => r.is_active).length;
  const spent = (spentRes.data ?? []).reduce((a, b) => a + b.credits_spent, 0);

  const status: StatusItem[] = [
    { tone: open ? "warn" : "neutral", label: open ? `${open} open request${open === 1 ? "" : "s"}` : "No open requests" },
    { tone: "ok", label: `${active} active reward${active === 1 ? "" : "s"}` },
    { tone: "acc", label: `${spent.toLocaleString("en-GB")} credits redeemed this quarter` },
  ];

  return (
    <>
      <PageHero title="Rewards & redemptions" description="Publish organizational rewards, set their credit cost, and confirm deliveries." status={status} />

      <Card title="Redemption requests" description="Approve, then mark as delivered. Cancelling refunds the credits." flush>
        {redemptions.length ? redemptions.map((r) => {
          const member = r.users as { full_name: string; email: string } | null;
          const isOpen = r.status === "requested" || r.status === "approved";
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line px-5 py-3.5 last:border-b-0">
              <div className="min-w-0 flex-[1_1_220px]">
                <div className="truncate font-bold">{member?.full_name ?? member?.email ?? "Member"}</div>
                <div className="truncate text-[13px] text-muted">{r.reward_title || "Reward"} · {r.credits_spent} cr · {formatDay(r.created_at)}</div>
              </div>
              <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill>
              {isOpen ? (
                <div className="flex flex-wrap gap-2">
                  {r.status === "requested" ? (
                    <ActionForm action={setRedemptionStatus} submitLabel="Approve" size="sm" inline>
                      <input type="hidden" name="redemption_id" value={r.id} /><input type="hidden" name="status" value="approved" />
                    </ActionForm>
                  ) : null}
                  <ActionForm action={setRedemptionStatus} submitLabel="Mark delivered" size="sm" variant="secondary" inline>
                    <input type="hidden" name="redemption_id" value={r.id} /><input type="hidden" name="status" value="delivered" />
                  </ActionForm>
                  <ActionForm action={setRedemptionStatus} submitLabel="Cancel & refund" size="sm" variant="danger" inline
                    confirm={{ title: "Cancel and refund?", body: `${r.credits_spent} credits return to ${member?.full_name ?? "the member"} and the stock is restored.`, confirmLabel: "Cancel & refund", danger: true }}>
                    <input type="hidden" name="redemption_id" value={r.id} /><input type="hidden" name="status" value="cancelled" />
                  </ActionForm>
                </div>
              ) : null}
            </div>
          );
        }) : <div className="p-8 text-center font-semibold text-muted">No redemption requests yet</div>}
      </Card>

      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="m-0 text-[17px] font-extrabold">Catalog</h2>
        <AddReward />
      </div>
      <TableCard>
        {rewards.length ? (
          <table className="dt">
            <thead><tr><th>Reward</th><th className="num">Cost</th><th className="max-md:hidden">Inventory</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rewards.map((r) => (
                <tr key={r.id}>
                  <td><div className="font-bold">{r.title}</div><div className="text-[13px] text-muted">{r.description}</div></td>
                  <td className="num font-bold">{r.cost_in_credits}</td>
                  <td className="max-md:hidden">{r.inventory_count < 0 ? "Unlimited" : `${r.inventory_count} left`}</td>
                  <td><StatusText tone={r.is_active ? "ok" : "neutral"}>{r.is_active ? "Active" : "Inactive"}</StatusText></td>
                  <td className="text-right">
                    <ActionForm action={toggleReward} submitLabel={r.is_active ? "Deactivate" : "Activate"} size="sm" variant="secondary" inline>
                      <input type="hidden" name="reward_id" value={r.id} /><input type="hidden" name="is_active" value={r.is_active ? "false" : "true"} />
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="p-8 text-center font-semibold text-muted">No rewards yet</div>}
      </TableCard>
    </>
  );
}
