import { describe, expect, it } from "vitest";
import { buildUserMessage } from "@/lib/ai/generate";
import { mockNormalizedReport } from "@/lib/ai/mock";

describe("buildUserMessage", () => {
  const a = mockNormalizedReport("MBTI report A extravert").persona;
  const b = mockNormalizedReport("MBTI report B introvert").persona;

  it("includes both personas without the wall-only validity flag", () => {
    const msg = buildUserMessage({
      family: "briefing",
      systemPrompt: "x",
      routineLabel: "Flight",
      primaryPersona: a,
      partnerPersona: b,
      context: { scenario: "Night approach", aircraft: "787", phase: "", notes: "" },
    });
    expect(msg).toContain("Crew member A profile");
    expect(msg).toContain("Crew member B profile");
    expect(msg).not.toContain("is_valid_report");
    expect(msg).toContain("- scenario: Night approach");
    expect(msg).not.toContain("- phase:");
  });

  it("describes solo routines explicitly", () => {
    const msg = buildUserMessage({
      family: "debrief",
      systemPrompt: "x",
      routineLabel: "Event debrief",
      primaryPersona: a,
      partnerPersona: null,
      context: { scenario: "", aircraft: "", phase: "", notes: "" },
    });
    expect(msg).toContain("Solo routine");
    expect(msg).toContain("- none provided");
  });
});
