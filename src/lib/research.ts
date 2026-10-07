import "server-only";
import type { ResearchFilters } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ResearchRow {
  organization_id: string | null;
  framework: string;
  type_code: string | null;
  gender: string | null;
  operational_category: string | null;
  extraversion: number | null;
  sensing: number | null;
  thinking: number | null;
  judging: number | null;
  linked: boolean;
}

export async function fetchResearchRows(f: ResearchFilters): Promise<ResearchRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_wall_research_rows", {
    p_org_id: f.org ?? undefined,
    p_gender: f.gender ?? undefined,
    p_category: f.category ?? undefined,
  });
  if (error) throw new Error(`research rows failed: ${error.message}`);
  return (data ?? []) as ResearchRow[];
}

export function groupBy<T>(rows: T[], key: (r: T) => string): Record<string, T[]> {
  return rows.reduce<Record<string, T[]>>((acc, r) => {
    const k = key(r);
    (acc[k] ??= []).push(r);
    return acc;
  }, {});
}

export function avg(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => typeof x === "number");
  if (!v.length) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}

const CSV_COLUMNS: Array<keyof ResearchRow> = [
  "framework", "type_code", "gender", "operational_category", "extraversion", "sensing", "thinking", "judging", "linked",
];

export function toCsv(rows: ResearchRow[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => CSV_COLUMNS.map((c) => esc(r[c])).join(","));
  return [CSV_COLUMNS.join(","), ...lines].join("\n");
}
