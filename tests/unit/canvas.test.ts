import { describe, expect, it } from "vitest";
import { CanvasLayoutSchema, defaultLayout, packGrid, packLayout, resolveItems, resolveLayout, sizeForAdd } from "@/lib/canvas/layout";
import { sizesOf, tabletSpan } from "@/lib/canvas/registry";
import { effectiveStreak } from "@/lib/gamification-shared";
import { relativeDay, sessionTitle, shortName } from "@/lib/utils";

const CREW = { role: "end_user" as const, hasOrg: true };

describe("canvas registry and layout", () => {
  it("default crew layout matches the concept board (three bands and a 4×3 free slot)", () => {
    const { desktop } = packLayout(defaultLayout(CREW).items);
    const at = Object.fromEntries(desktop.placements.map((p) => [p.id, [p.x, p.y, p.w, p.h]]));
    expect(at).toEqual({
      start: [0, 0, 7, 3], tier: [7, 0, 5, 3],
      recent: [0, 3, 4, 3], insight: [4, 3, 4, 3], partners: [8, 3, 4, 3],
      report: [0, 6, 3, 3], rewards: [3, 6, 5, 3],
    });
    expect(desktop.free).toEqual([{ x: 8, y: 6, w: 4, h: 3 }]);
    expect(desktop.rows).toBe(9);
  });

  it("hides the latest-briefing widget until it is added, and gates by role and organization", () => {
    expect(defaultLayout(CREW).items.find((i) => i.id === "latest")?.hidden).toBe(true);
    const admin = resolveItems([], { role: "org_admin", hasOrg: true }).map((i) => i.id);
    expect(admin).not.toContain("partners");
    const noOrg = resolveItems([], { role: "super_admin", hasOrg: false }).map((i) => i.id);
    expect(noOrg).not.toContain("rewards");
    expect(noOrg).not.toContain("partners");
  });

  it("repairs stored layouts: unknown, duplicate and unsupported entries", () => {
    const items = resolveItems(
      [{ id: "recent", size: "XL", hidden: false }, { id: "recent", size: "S", hidden: true }, { id: "start", size: "XL", hidden: false }, { id: "nope" as never, size: "M", hidden: false }],
      CREW,
    );
    expect(items[0]).toEqual({ id: "recent", size: "XL", hidden: false });
    expect(items[1]).toEqual({ id: "start", size: "M", hidden: false }); // start has no XL
    expect(items.filter((i) => i.id === "recent")).toHaveLength(1);
    expect(items).toHaveLength(8);
  });

  it("falls back to the default layout for malformed rows and rejects extra keys on write", () => {
    expect(resolveLayout({ items: "x" }, CREW)).toEqual(defaultLayout(CREW));
    expect(resolveLayout(null, CREW)).toEqual(defaultLayout(CREW));
    expect(CanvasLayoutSchema.safeParse({ items: [], evil: 1 }).success).toBe(false);
    expect(CanvasLayoutSchema.safeParse({ items: [{ id: "start", size: "M", hidden: false, x: 1 }] }).success).toBe(false);
    expect(CanvasLayoutSchema.safeParse({ items: [], snoozedWeek: "2026-W41" }).success).toBe(true);
    expect(CanvasLayoutSchema.safeParse({ items: [], snoozedWeek: "next week" }).success).toBe(false);
  });

  it("first-fit packing fills gaps and clamps wide spans", () => {
    const p = packGrid([{ id: "recent", w: 8, h: 4 }, { id: "tier", w: 5, h: 3 }, { id: "report", w: 3, h: 2 }], 12);
    expect(p.placements.map((x) => [x.id, x.x, x.y])).toEqual([["recent", 0, 0], ["tier", 0, 4], ["report", 8, 0]]);
    expect(packGrid([{ id: "start", w: 7, h: 3 }], 6).placements[0].w).toBe(6);
  });

  it("adds a widget at the largest size that fits a free slot", () => {
    const items = defaultLayout(CREW).items; // 4×3 slot free at the bottom right
    expect(sizeForAdd(items, "latest")).toBe("L"); // nothing fits the 4×3 slot, so it keeps its own size
    const noPartners = items.map((i) => (i.id === "partners" ? { ...i, hidden: true } : i)); // report moves up, 6×3 free
    expect(sizeForAdd(noPartners, "latest")).toBe("M"); // M is 5×3
    const placed = packLayout(noPartners.map((i) => (i.id === "latest" ? { ...i, hidden: false, size: "M" as const } : i))).desktop.placements.find((p) => p.id === "latest");
    expect(placed).toMatchObject({ x: 5, y: 6, w: 5, h: 3 });
    expect(packLayout(noPartners).desktop.free).toEqual([{ x: 11, y: 3, w: 1, h: 3 }, { x: 5, y: 6, w: 7, h: 3 }]);
  });

  it("maps spans to the 6-column tablet grid", () => {
    expect(tabletSpan({ w: 7, h: 3 })).toEqual({ w: 6, h: 3 });
    expect(tabletSpan({ w: 4, h: 3 })).toEqual({ w: 3, h: 3 });
    expect(sizesOf("recent")).toEqual(["S", "M", "L", "XL"]);
  });
});

describe("canvas helpers", () => {
  it("shortName", () => {
    expect(shortName("Yoav Peretz")).toBe("Yoav P.");
    expect(shortName("Noa Ben-David")).toBe("Noa B.");
    expect(shortName("Maya Levi (Org Admin)")).toBe("Maya L.");
    expect(shortName("Cher")).toBe("Cher");
    expect(shortName("  ")).toBe("Crew member");
  });
  it("relativeDay", () => {
    const now = new Date(2026, 9, 7, 9, 0);
    expect(relativeDay(new Date(2026, 9, 7, 0, 5), now)).toBe("Today");
    expect(relativeDay(new Date(2026, 9, 6, 23, 0), now)).toBe("Yesterday");
    expect(relativeDay(new Date(2026, 9, 3, 12, 0), now)).toBe("3 Oct");
    expect(relativeDay(new Date(2025, 11, 30, 12, 0), now)).toBe("30 Dec 2025");
  });
  it("sessionTitle", () => {
    expect(sessionTitle("flight")).toBe("Flight briefing");
    expect(sessionTitle("debrief")).toBe("Event debrief");
  });
  it("effectiveStreak drops a streak after a full quiet week", () => {
    const now = new Date(Date.UTC(2026, 9, 7, 12)); // Wednesday, ISO week 41
    expect(effectiveStreak(3, "2026-10-05T08:00:00Z", now)).toBe(3); // this week
    expect(effectiveStreak(3, "2026-09-28T08:00:00Z", now)).toBe(3); // last week
    expect(effectiveStreak(3, "2026-09-27T23:00:00Z", now)).toBe(0); // two weeks ago (Sunday)
    expect(effectiveStreak(0, "2026-10-05T08:00:00Z", now)).toBe(0);
    expect(effectiveStreak(2, null, now)).toBe(0);
  });
});
