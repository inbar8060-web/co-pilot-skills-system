import { errorResponse } from "@/lib/api";
import { assertRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fetchResearchRows, toCsv } from "@/lib/research";
import { parseResearchFilters } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await assertRole("super_admin");
    const url = new URL(req.url);
    const filters = parseResearchFilters(Object.fromEntries(url.searchParams));
    const rows = await fetchResearchRows(filters);
    // The export must not leave the server without a trail.
    await audit(user.id, "research.exported", null, { rows: rows.length, ...filters }, { critical: true });
    return new Response(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="research-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
