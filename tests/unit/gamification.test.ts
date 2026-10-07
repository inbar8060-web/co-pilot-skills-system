import { describe, expect, it } from "vitest";
import { tierProgress, type TierRow } from "@/lib/gamification-shared";

const TIERS: TierRow[] = [
  { tier: "bronze", label: "Bronze", min_credits: 0, sort_order: 1 },
  { tier: "silver", label: "Silver", min_credits: 100, sort_order: 2 },
  { tier: "gold", label: "Gold", min_credits: 300, sort_order: 3 },
  { tier: "platinum", label: "Platinum", min_credits: 600, sort_order: 4 },
];

describe("tierProgress", () => {
  it("starts at bronze with progress toward silver", () => {
    const p = tierProgress(25, TIERS);
    expect(p.current.tier).toBe("bronze");
    expect(p.next?.tier).toBe("silver");
    expect(p.percent).toBe(25);
    expect(p.creditsToNext).toBe(75);
  });
  it("reaches exact thresholds", () => {
    expect(tierProgress(100, TIERS).current.tier).toBe("silver");
    expect(tierProgress(299, TIERS).current.tier).toBe("silver");
    expect(tierProgress(300, TIERS).current.tier).toBe("gold");
  });
  it("tops out at platinum", () => {
    const p = tierProgress(10_000, TIERS);
    expect(p.current.tier).toBe("platinum");
    expect(p.next).toBeNull();
    expect(p.percent).toBe(100);
  });
  it("is robust to an empty tier list", () => {
    expect(tierProgress(50, []).current.tier).toBe("bronze");
  });
});
