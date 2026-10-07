import { Banner, Input, PageHero, Select, buttonClass, type StatusItem } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { OPERATIONAL_CATEGORIES } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABELS, singleParams, type SearchParams } from "@/lib/utils";
import { UsersTable } from "./users-table";

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole("org_admin", "super_admin");
  const sp = singleParams(await searchParams);
  if (!user.organizationId) {
    return (<><PageHero title="Users & crews" /><Banner tone="acc" title="No organization attached">Super admins manage users per organization from the console.</Banner></>);
  }
  // Only letters, digits and a few safe characters reach the PostgREST `or` filter.
  const q = (sp.q ?? "").replace(/[^\p{L}\p{N} @._-]/gu, "").trim().slice(0, 80);
  const supabase = await createClient();
  let query = supabase.from("users").select("id, full_name, email, role, team, operational_category, gender, has_active_report").eq("organization_id", user.organizationId).order("full_name").limit(500);
  if (sp.team) query = query.eq("team", sp.team);
  if (sp.category && (OPERATIONAL_CATEGORIES as readonly string[]).includes(sp.category)) query = query.eq("operational_category", sp.category);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  const [{ data: users }, { data: all }] = await Promise.all([
    query,
    supabase.from("users").select("team, role, has_active_report").eq("organization_id", user.organizationId).limit(2000),
  ]);
  const everyone = all ?? [];
  const teams = Array.from(new Set(everyone.map((u) => u.team).filter((t): t is string => Boolean(t)))).sort();
  const crew = everyone.filter((u) => u.role === "end_user");
  const loaded = crew.filter((u) => u.has_active_report).length;

  const status: StatusItem[] = [
    { tone: "acc", label: `${everyone.length} members` },
    { tone: "ok", label: `${loaded} reports loaded` },
    { tone: crew.length - loaded > 0 ? "warn" : "neutral", label: `${crew.length - loaded} missing` },
  ];

  return (
    <>
      <PageHero title="Users & crews" description={'Assign crew to fleets and teams. Only the technical status "Report loaded: Yes/No" is visible here, never report content.'} status={status} />
      <UsersTable users={users ?? []}>
        <form method="get" className="contents">
          <Input name="q" defaultValue={q} placeholder="Search name or email" className="ctl-card min-w-0 flex-[1_1_220px]" />
          <Select name="team" defaultValue={sp.team ?? ""} className="ctl-card flex-[0_1_180px]">
            <option value="">All teams</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select name="category" defaultValue={sp.category ?? ""} className="ctl-card flex-[0_1_180px]">
            <option value="">All categories</option>
            {OPERATIONAL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </Select>
          <button type="submit" className={buttonClass("secondary", "md", "bg-card")}>Filter</button>
        </form>
      </UsersTable>
    </>
  );
}
