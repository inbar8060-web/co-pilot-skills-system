import { describe, expect, it } from "vitest";
import { generateTempPassword, isoWeekKey, weekIndex } from "@/lib/utils";

describe("isoWeekKey", () => {
  it("matches ISO week boundaries", () => {
    expect(isoWeekKey(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-W01");
    expect(isoWeekKey(new Date(Date.UTC(2024, 11, 30)))).toBe("2025-W01"); // Monday of ISO week 1, 2025
    expect(isoWeekKey(new Date(Date.UTC(2026, 8, 14)))).toBe("2026-W38");
  });
  it("weekIndex is stable within a week and bounded", () => {
    const a = weekIndex(new Date(Date.UTC(2026, 8, 14)), 6);
    const b = weekIndex(new Date(Date.UTC(2026, 8, 18)), 6);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(6);
  });
});

describe("generateTempPassword", () => {
  it("meets the auth policy (>= 10 chars, unique per call)", () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(a.length).toBeGreaterThanOrEqual(10);
    expect(a).not.toBe(b);
    expect(a).toMatch(/!/);
  });
});
