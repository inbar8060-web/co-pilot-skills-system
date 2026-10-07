import { PageHero, ProgressBar, Select, TableCard, buttonClass, type StatusItem } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { avg, fetchResearchRows, groupBy, type ResearchRow } from "@/lib/research";
import { GENDERS, OPERATIONAL_CATEGORIES, parseResearchFilters } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORY_LABELS, singleParams, type SearchParams } from "@/lib/utils";

const DIMS = [
  { key: "extraversion", label: "extraversion", lo: "Introvert", hi: "Extravert", short: "E" },
  { key: "sensing", label: "sensing", lo: "Intuition", hi: "Sensing", short: "S" },
  { key: "thinking", label: "thinking", lo: "Feeling", hi: "Thinking", short: "T" },
  { key: "judging", label: "judging", lo: "Perceiving", hi: "Judging", short: "J" },
] as const;

function SliceTable({ title, groups, labels }: { title: string; groups: Record<string, ResearchRow[]>; labels?: Record<string, string> }) {
  const entries = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  return (
    <TableCard title={title}>
      {entries.length ? (
        <table className="dt">
          <thead><tr><th>Slice</th><th className="num">n</th>{DIMS.map((d) => <th key={d.key} className="num">{d.short}</th>)}</tr></thead>
          <tbody>
            {entries.map(([k, g]) => (
              <tr key={k}>
                <td className="font-semibold">{labels?.[k] ?? k}</td>
                <td className="num font-bold">{g.length}</td>
                {DIMS.map((d) => <td key={d.key} className="num text-muted">{avg(g.map((r) => r[d.key])) ?? "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="p-8 text-center font-semibold text-muted">No data for this slice</div>}
    </TableCard>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole("super_admin");
  const sp = singleParams(await searchParams);
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organizations").select("id, name").order("name");
  const filters = parseResearchFilters(sp);
  if (filters.org && !orgs?.some((o) => o.id === filters.org)) filters.org = null;
  const rows = await fetchResearchRows(filters);
  const qs = new URLSearchParams();
  if (filters.org) qs.set("org", filters.org);
  if (filters.gender) qs.set("gender", filters.gender);
  if (filters.category) qs.set("category", filters.category);
  const linked = rows.filter((r) => r.linked).length;

  const status: StatusItem[] = [
    { tone: "acc", label: `${rows.length} profiles · ${linked} linked` },
    { tone: "ok", label: "No identifiers in this view" },
    { tone: "neutral", label: "Export CSV", href: `/api/super/research.csv?${qs.toString()}` },
  ];

  return (
    <>
      <PageHero title="Research analytics" description="Cross-sectional analysis on normalised, de-identified profiles. Dimension values are 0–100 preference scores averaged per slice." status={status} />
      <form method="get" className="flex flex-wrap items-center gap-2.5">
        <Select name="org" defaultValue={filters.org ?? ""} className="ctl-card flex-[1_1_200px]" aria-label="Organization">
          <option value="">All organizations</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select name="gender" defaultValue={filters.gender ?? ""} className="ctl-card flex-[1_1_160px]" aria-label="Gender">
          <option value="">All genders</option>
          {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>
        <Select name="category" defaultValue={filters.category ?? ""} className="ctl-card flex-[1_1_180px]" aria-label="Category">
          <option value="">All categories</option>
          {OPERATIONAL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </Select>
        <button type="submit" className={buttonClass("primary", "md", "max-md:flex-1")}>Apply</button>
      </form>

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {DIMS.map((d) => {
          const v = avg(rows.map((r) => r[d.key]));
          return (
            <div key={d.key} className="rounded-[14px] border border-line bg-card px-5 py-[18px]">
              <div className="text-xs font-bold uppercase tracking-[0.05em] text-muted">Avg {d.label}</div>
              <div className="mt-2 text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] tabular-nums">{v ?? "—"}</div>
              <div className="mt-2.5"><ProgressBar percent={v ?? 0} label={`Average ${d.label}`} /></div>
              <div className="mt-1.5 flex justify-between text-xs text-muted"><span>{d.lo}</span><span>{d.hi}</span></div>
            </div>
          );
        })}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <SliceTable title="By organization" groups={groupBy(rows, (r) => orgs?.find((o) => o.id === r.organization_id)?.name ?? "Unassigned")} />
        <SliceTable title="By operational category" groups={groupBy(rows.filter((r) => r.operational_category), (r) => r.operational_category!)} labels={CATEGORY_LABELS} />
        <SliceTable title="By gender" groups={groupBy(rows.filter((r) => r.gender), (r) => r.gender!)} />
        <SliceTable title="By type code" groups={groupBy(rows.filter((r) => r.type_code), (r) => r.type_code!)} />
      </div>
    </>
  );
}
