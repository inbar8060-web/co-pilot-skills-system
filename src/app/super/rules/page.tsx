import { ActionForm } from "@/components/action-form";
import { Card, Dot, Input, Mono, PageHero, Select, SideCard, Switch, type StatusItem, type Tone } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { tierShort } from "@/lib/utils";
import { updateRules, updateTiers } from "../actions";

const TIER_TONE: Record<string, Tone> = { bronze: "neutral", silver: "acc", gold: "warn", platinum: "ok" };

export default async function RulesPage() {
  await requireRole("super_admin");
  const admin = createAdminClient();
  const [rulesRes, tiersRes] = await Promise.all([
    admin.from("gamification_rules").select("*").order("credits", { ascending: false }),
    admin.from("readiness_tiers").select("*").order("sort_order"),
  ]);
  const rules = rulesRes.data ?? [];
  const tiers = tiersRes.data ?? [];
  const activeRules = rules.filter((r) => r.is_active).length;

  const status: StatusItem[] = [
    { tone: "ok", label: `${activeRules} of ${rules.length} rules active` },
    { tone: "acc", label: `${tiers.length} readiness tiers` },
    { tone: "neutral", label: "Applies to all organizations" },
  ];

  return (
    <>
      <PageHero title="Gamification rules" description="Credit values, cooldowns and tier thresholds. Changes apply immediately to every organization; the credit engine enforces them atomically." status={status} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card title="Actions & credits" flush>
          <ActionForm action={updateRules} submitLabel="Save rules" className="gap-0 [&>div:last-child]:m-0 [&>div:last-child]:px-5 [&>div:last-child]:py-3.5 [&>div[role=alert]]:mx-5 [&>div[role=alert]]:my-3">
            <div className="hidden grid-cols-[minmax(0,1fr)_90px_130px_80px_60px] gap-3 border-b border-line px-5 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-muted md:grid">
              <span>Action</span><span>Credits</span><span>Cooldown</span><span>Limit</span><span>Active</span>
            </div>
            {rules.map((r) => (
              <div key={r.action_type} className="grid grid-cols-2 items-center gap-3 border-b border-line px-5 py-3 md:grid-cols-[minmax(0,1fr)_90px_130px_80px_60px]">
                <input type="hidden" name="action_type" value={r.action_type} />
                <div className="col-span-2 min-w-0 md:col-span-1"><div className="truncate font-bold">{r.label}</div><Mono className="text-xs text-muted">{r.action_type}</Mono></div>
                <Input type="number" name={`credits__${r.action_type}`} defaultValue={r.credits} min={0} max={10000} aria-label={`${r.label} credits`} className="ctl-sm h-10" />
                <Select name={`kind__${r.action_type}`} defaultValue={r.cooldown_kind} aria-label={`${r.label} cooldown`} className="ctl-sm h-10">
                  <option value="once">once</option><option value="per_day">per day</option><option value="per_week">per week</option>
                </Select>
                <Input type="number" name={`limit__${r.action_type}`} defaultValue={r.cooldown_limit} min={1} max={100} aria-label={`${r.label} limit`} className="ctl-sm h-10" />
                <Switch name={`active__${r.action_type}`} defaultChecked={r.is_active} label={`${r.label} active`} />
              </div>
            ))}
          </ActionForm>
        </Card>

        <SideCard title="Readiness tiers" description="Minimum total credits earned" className="rounded-[14px]">
          <ActionForm action={updateTiers} submitLabel="Save thresholds" variant="secondary" footer="plain" fullWidthSubmit className="gap-2.5">
            {tiers.map((t) => (
              <div key={t.tier} className="flex items-center justify-between gap-3">
                <input type="hidden" name="tier" value={t.tier} />
                <span className="flex items-center gap-2 font-semibold"><Dot tone={TIER_TONE[t.tier] ?? "neutral"} />{tierShort(t.label)}</span>
                <Input type="number" name={`min__${t.tier}`} defaultValue={t.min_credits} min={0} aria-label={`${t.label} minimum credits`} className="ctl-sm h-10 w-[110px]" />
              </div>
            ))}
          </ActionForm>
          <div className="text-[13px] text-muted">Changing a threshold recomputes every stored tier.</div>
        </SideCard>
      </div>
    </>
  );
}
