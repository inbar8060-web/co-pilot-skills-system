import type { Persona } from "@/lib/schemas";

/**
 * Two clearly differentiated demo personas for the prompt playground (mirrors the
 * ISTJ / ENFP profiles in supabase/seed.sql). Never derived from real reports.
 */
export const DEMO_PERSONA_A: Persona = {
  framework: "MBTI_Step_II",
  type_code: "ISTJ",
  summary: "Methodical, procedure-anchored operator who prefers verified facts, clear sequencing and low-noise communication.",
  dimensions: { extraversion: 28, sensing: 74, thinking: 71, judging: 82 },
  communication_style: "Brief, factual and sequential. Prefers explicit call-outs over inference.",
  decision_making_style: "Weighs verified data and SOP first; slows down when information is incomplete.",
  stress_response: "Narrows attention and becomes terse. May under-communicate intent under workload.",
  conflict_style: "Avoids open confrontation; will comply then raise concerns later unless invited.",
  leadership_style: "Structured and consistent. Delegates by checklist.",
  strengths: ["Disciplined SOP adherence", "Reliable monitoring", "Calm, low-drama cockpit"],
  watch_outs: ["Terse under stress", "May dismiss intuitive cues", "Slow to voice ambiguity"],
  feedback_preferences: ["Specific examples", "Private setting", "Time to reflect before responding"],
  confidence: "high",
  is_valid_report: true,
};

export const DEMO_PERSONA_B: Persona = {
  framework: "MBTI_Step_I",
  type_code: "ENFP",
  summary: "Energetic, big-picture communicator who reads the room quickly and generates options under pressure.",
  dimensions: { extraversion: 78, sensing: 31, thinking: 38, judging: 27 },
  communication_style: "Expressive and exploratory. Thinks out loud; may float ideas before they are decisions.",
  decision_making_style: "Pattern-based and fast; comfortable acting on partial information.",
  stress_response: "Talks more and faster; may skip verification steps to keep momentum.",
  conflict_style: "Raises concerns openly and early; can read silence as agreement.",
  leadership_style: "Motivational and inclusive. Less attentive to sequencing details.",
  strengths: ["Early threat verbalisation", "Adaptive problem solving", "Keeps crew engaged"],
  watch_outs: ["Verbal overload for partner", "Ideas mistaken for commands", "Checklist discipline under time pressure"],
  feedback_preferences: ["Conversational", "Connect to the bigger picture", "Acknowledge effort first"],
  confidence: "high",
  is_valid_report: true,
};
