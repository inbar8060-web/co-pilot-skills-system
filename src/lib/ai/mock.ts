import type {
  BriefingOutput,
  CoachingOutput,
  DebriefOutput,
  NormalizedReport,
  PromptFamily,
  RoutineOutput,
} from "@/lib/schemas";

/** Deterministic fixtures for local development, tests and the prompt playground without an API key. */
export function mockRoutineOutput(family: PromptFamily, solo: boolean): RoutineOutput {
  if (family === "briefing") {
    const out: BriefingOutput = {
      synergy_area: {
        title: solo ? "Structured self-briefing" : "Structure meets early threat detection",
        points: solo
          ? [
              "Your sequencing discipline keeps the cockpit predictable.",
              "Pre-plan when you will verbalise intent, not only actions.",
            ]
          : [
              "One of you anchors the sequence, the other surfaces threats early.",
              "Together this covers both monitoring and anticipation.",
            ],
      },
      threat_points: [
        {
          threat: "Terse communication under workload can hide intent.",
          countermeasure: "Agree to state intent before action during high-workload phases.",
        },
        {
          threat: "Ideas floated aloud may be taken as commands.",
          countermeasure: "Prefix options with 'option:' and decisions with 'decision:'.",
        },
      ],
      briefing_dos_and_donts: {
        dos: ["Name the top threat for this leg in one sentence.", "Confirm the challenge phrase before pushback."],
        donts: ["Do not treat silence as agreement.", "Do not skip read-backs to keep momentum."],
      },
      challenge_response_trigger: {
        trigger_phrase: "Check that",
        expected_response: "Pause, restate the parameter, confirm or correct.",
        when_to_use: "Any deviation from the briefed plan or an unverified parameter.",
      },
    };
    return out;
  }
  if (family === "debrief") {
    const out: DebriefOutput = {
      mental_model_alignment: {
        summary: "The crew held different assumptions about who owned the deviation call.",
        gaps: [
          "Ownership of the go-around decision was implicit.",
          "The monitoring pilot's concern was softened into a question.",
        ],
      },
      stress_impact: {
        summary: "Workload compressed communication into short, ambiguous phrases.",
        communication_effects: ["Intent was not verbalised.", "Read-backs were skipped during configuration."],
      },
      actionable_behavioural_lesson: {
        lesson: "State intent before action when workload rises.",
        cue: "Any configuration change below 3,000 ft.",
        next_flight_action: "Brief who calls the deviation and the exact phrase.",
      },
    };
    return out;
  }
  const out: CoachingOutput = {
    feedback_reception_profile: {
      summary: "Receives feedback best with concrete examples and time to reflect.",
      sensitivity_points: ["Public correction reduces receptiveness.", "Vague praise is discounted."],
    },
    language_adaptation: {
      dos: [
        {
          guideline: "Anchor in a specific event.",
          example: "On Tuesday's approach, the call-out came late. Walk me through what you saw.",
        },
        { guideline: "Offer time to reflect.", example: "Take a day, then tell me what you'd change." },
      ],
      donts: [
        { guideline: "Avoid generalisations.", example: "Do not say: 'You always react late.'" },
        { guideline: "Avoid public settings.", example: "Do not raise it in the crew room." },
      ],
    },
    reflection_questions: [
      "What information did you have at that moment?",
      "What would have made speaking up easier?",
      "Which one behaviour will you change next flight?",
    ],
  };
  return out;
}

export function mockNormalizedReport(text: string): NormalizedReport {
  const hash = Array.from(text).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pick = (n: number) => hash % n;
  const types = ["ISTJ", "ENFP", "ESTJ", "INFJ", "ENTP", "ISFP"];
  const email = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? null;
  const looksLikeReport = /mbti|myers|briggs|adapt|symbiotics|extravert|introvert|personality/i.test(text);
  return {
    persona: {
      framework: /step ii/i.test(text) ? "MBTI_Step_II" : /adapt/i.test(text) ? "Symbiotics_ADAPT" : "MBTI_Step_I",
      type_code: types[pick(types.length)],
      summary: "Mock persona generated locally (AI_MODE=mock). Use a live model for real reports.",
      dimensions: {
        extraversion: 20 + pick(60),
        sensing: 20 + pick(60),
        thinking: 20 + pick(60),
        judging: 20 + pick(60),
      },
      communication_style: "Direct and concise.",
      decision_making_style: "Data first, then commit.",
      stress_response: "Narrows focus; shorter sentences.",
      conflict_style: "Raises concerns privately.",
      leadership_style: "Structured.",
      strengths: ["Monitoring", "Consistency"],
      watch_outs: ["Terse under stress"],
      feedback_preferences: ["Specific examples"],
      confidence: looksLikeReport ? "medium" : "low",
      is_valid_report: looksLikeReport,
    },
    candidate_identity: { name: null, email },
  };
}
