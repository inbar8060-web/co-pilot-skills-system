/**
 * Crew canvas widget registry (pure, shared by server and client).
 * Spans are columns × rows on the 12-column desktop grid (row unit 72px, 20px gaps); see
 * docs/design/canvas-concept/README.md §3–4. Text never scales with size; the amount shown does.
 */
import type { AppRole } from "@/lib/schemas";

export const WIDGET_SIZES = ["S", "M", "L", "XL"] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export const WIDGET_IDS = ["start", "tier", "recent", "insight", "partners", "report", "rewards", "latest"] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export interface Span { w: number; h: number }

export interface WidgetDef {
  id: WidgetId;
  title: string;
  /** One line for the widget library. */
  description: string;
  sizes: Partial<Record<WidgetSize, Span>>;
  defaultSize: WidgetSize;
  /** Not on the canvas until added from the library. */
  defaultHidden?: boolean;
  /** Roles that may see it (all roles when omitted). */
  roles?: readonly AppRole[];
  /** Needs the user to belong to an organization (rewards catalog). */
  needsOrg?: boolean;
}

export const WIDGETS: Record<WidgetId, WidgetDef> = {
  start: {
    id: "start", title: "Start a routine", description: "Pick a routine and a consenting partner, then continue to the briefing.",
    sizes: { S: { w: 4, h: 2 }, M: { w: 7, h: 3 } }, defaultSize: "M",
  },
  tier: {
    id: "tier", title: "Credits & tier", description: "Your balance, progress to the next tier and your weekly streak.",
    sizes: { S: { w: 3, h: 2 }, M: { w: 5, h: 3 } }, defaultSize: "M",
  },
  recent: {
    id: "recent", title: "Recent routines", description: "Your latest sessions. Larger sizes add scenarios, partners and filters.",
    sizes: { S: { w: 3, h: 2 }, M: { w: 4, h: 3 }, L: { w: 5, h: 3 }, XL: { w: 8, h: 4 } }, defaultSize: "M",
  },
  insight: {
    id: "insight", title: "Weekly insight", description: "This week's tip. Confirm you read it for credits.",
    sizes: { S: { w: 4, h: 2 }, M: { w: 4, h: 3 } }, defaultSize: "M",
  },
  partners: {
    id: "partners", title: "Consented partners", description: "Who shares with you for Blind Synergy, and requests waiting for your answer.",
    sizes: { S: { w: 3, h: 2 }, M: { w: 4, h: 3 }, L: { w: 5, h: 4 } }, defaultSize: "M", roles: ["end_user"],
  },
  report: {
    id: "report", title: "My report", description: "Whether your report is verified, and how it was linked.",
    sizes: { S: { w: 3, h: 2 }, M: { w: 3, h: 3 } }, defaultSize: "M",
  },
  rewards: {
    id: "rewards", title: "Rewards catalog", description: "Rewards you can redeem with your credits.",
    sizes: { M: { w: 5, h: 3 }, L: { w: 8, h: 3 } }, defaultSize: "M", needsOrg: true,
  },
  latest: {
    id: "latest", title: "Latest briefing", description: "The action cards of your newest session, ready to copy.",
    sizes: { M: { w: 5, h: 3 }, L: { w: 8, h: 4 } }, defaultSize: "L", defaultHidden: true,
  },
};

export interface WidgetContext { role: AppRole; hasOrg: boolean }

export function widgetAllowed(def: WidgetDef, ctx: WidgetContext): boolean {
  if (def.roles && !def.roles.includes(ctx.role)) return false;
  if (def.needsOrg && !ctx.hasOrg) return false;
  return true;
}

export function sizesOf(id: WidgetId): WidgetSize[] {
  return WIDGET_SIZES.filter((s) => WIDGETS[id].sizes[s]);
}

export function spanOf(id: WidgetId, size: WidgetSize): Span {
  return WIDGETS[id].sizes[size] ?? WIDGETS[id].sizes[WIDGETS[id].defaultSize]!;
}

/** Tablet (6-column) span: wide widgets take the full row, the rest half of it. */
export function tabletSpan(span: Span): Span {
  return { w: span.w >= 5 ? 6 : 3, h: span.h };
}
