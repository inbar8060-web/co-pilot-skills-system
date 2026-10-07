import { Banner, PageHero, SideCard, type StatusItem } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CoachingForm } from "./coaching-form";

export default async function CoachingPage() {
  const user = await requireRole("org_admin", "super_admin");
  if (!user.organizationId) {
    return (<><PageHero title="Feedback coaching" /><Banner tone="acc" title="No organization attached">Attach to an organization to use the coaching tool.</Banner></>);
  }
  const supabase = await createClient();
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const [{ data: employees }, sessions] = await Promise.all([
    supabase.from("users").select("id, full_name, team, has_active_report").eq("organization_id", user.organizationId).eq("role", "end_user").order("full_name").limit(500),
    supabase.from("routine_sessions").select("id", { count: "exact", head: true }).eq("primary_user_id", user.id).eq("routine_code", "coaching").gte("created_at", monthStart.toISOString()),
  ]);
  const list = employees ?? [];
  const eligible = list.filter((e) => e.has_active_report).length;

  const status: StatusItem[] = [
    { tone: "ok", label: `${eligible} employee${eligible === 1 ? "" : "s"} eligible` },
    { tone: "acc", label: `${sessions.count ?? 0} sessions this month` },
    { tone: "neutral", label: "Every generation is logged" },
  ];

  return (
    <>
      <PageHero title="Feedback coaching" description="Choose an employee and describe the conversation. You get coaching guidance and phrasing examples; the employee's profile is never shown." status={status} />
      <CoachingForm employees={list.map((e) => ({ id: e.id, name: e.full_name, team: e.team, hasReport: e.has_active_report }))}>
        <SideCard title="How it works" className="rounded-[14px]">
          <ol className="m-0 list-decimal flex flex-col gap-2 pl-[18px] text-sm">
            <li>Pick the employee (verified report and sharing enabled).</li>
            <li>Describe the situation and what you want to achieve.</li>
            <li>Get a reception profile, do/don&apos;t phrasing, and reflection questions.</li>
          </ol>
          <p className="m-0 text-[13px] text-muted">Employees can opt out via their privacy settings.</p>
        </SideCard>
      </CoachingForm>
    </>
  );
}
