/**
 * Saved canvas layouts: validation, resolution against the registry, and grid packing.
 * Pure functions (no server or browser APIs) so the client can re-pack instantly and Vitest can cover them.
 */
import { z } from "zod";
import { spanOf, tabletSpan, WIDGET_IDS, WIDGET_SIZES, WIDGETS, widgetAllowed, type Span, type WidgetContext, type WidgetId, type WidgetSize } from "./registry";

export const LAYOUT_VERSION = 1;

const ItemSchema = z.object({ id: z.enum(WIDGET_IDS), size: z.enum(WIDGET_SIZES), hidden: z.boolean() }).strict();

/** What the client may store. Order of `items` is the reading order on every breakpoint. */
export const CanvasLayoutSchema = z.object({
  items: z.array(ItemSchema).max(WIDGET_IDS.length),
  /** ISO week (e.g. 2026-W41) in which the weekly insight was snoozed. */
  snoozedWeek: z.string().regex(/^\d{4}-W\d{2}$/).nullable().optional(),
  /** "Back to classic overview" escape hatch during the pilot. */
  classic: z.boolean().optional(),
}).strict();
export type CanvasLayout = z.infer<typeof CanvasLayoutSchema>;
export type LayoutItem = z.infer<typeof ItemSchema>;

export function defaultLayout(ctx: WidgetContext): CanvasLayout {
  return { items: resolveItems([], ctx), snoozedWeek: null };
}

/**
 * Turns whatever is stored (possibly from an older registry) into a complete, valid item list:
 * unknown, duplicate and not-allowed widgets are dropped, sizes the widget does not offer fall back
 * to its default, and widgets missing from the saved list are appended with their defaults.
 */
export function resolveItems(saved: readonly Partial<LayoutItem>[], ctx: WidgetContext): LayoutItem[] {
  const seen = new Set<WidgetId>();
  const out: LayoutItem[] = [];
  for (const raw of saved) {
    const id = raw.id as WidgetId;
    if (!id || !(id in WIDGETS) || seen.has(id)) continue;
    const def = WIDGETS[id];
    if (!widgetAllowed(def, ctx)) continue;
    seen.add(id);
    const size = raw.size && def.sizes[raw.size] ? raw.size : def.defaultSize;
    out.push({ id, size, hidden: Boolean(raw.hidden) });
  }
  for (const id of WIDGET_IDS) {
    const def = WIDGETS[id];
    if (seen.has(id) || !widgetAllowed(def, ctx)) continue;
    out.push({ id, size: def.defaultSize, hidden: Boolean(def.defaultHidden) });
  }
  return out;
}

/** Parses a stored row; anything invalid yields the default layout rather than an error. */
export function resolveLayout(stored: unknown, ctx: WidgetContext): CanvasLayout {
  const parsed = CanvasLayoutSchema.safeParse(stored);
  if (!parsed.success) return defaultLayout(ctx);
  return { ...parsed.data, items: resolveItems(parsed.data.items, ctx), snoozedWeek: parsed.data.snoozedWeek ?? null };
}

/* ------------------------------------------------------------------ packing */
export interface Placement { id: WidgetId; x: number; y: number; w: number; h: number }
export interface FreeRect { x: number; y: number; w: number; h: number }
export interface Packing { placements: Placement[]; free: FreeRect[]; rows: number }

/**
 * First-fit packing in reading order: each widget goes to the top-most, then left-most cell where
 * its span fits, so a smaller widget can fill a gap left of a wide one. Widgets wider than the grid
 * are clamped. Returns the empty rectangles inside the used rows so the canvas can show free slots.
 */
export function packGrid(spans: ReadonlyArray<{ id: WidgetId } & Span>, cols: number): Packing {
  const grid: boolean[][] = [];
  const rowAt = (y: number) => (grid[y] ??= Array<boolean>(cols).fill(false));
  const fits = (x: number, y: number, w: number, h: number) => {
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) if (rowAt(r)[c]) return false;
    return true;
  };
  const placements: Placement[] = [];
  for (const s of spans) {
    const w = Math.max(1, Math.min(cols, s.w));
    const h = Math.max(1, s.h);
    let placed = false;
    for (let y = 0; !placed; y++) {
      for (let x = 0; x + w <= cols; x++) {
        if (!fits(x, y, w, h)) continue;
        for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) rowAt(r)[c] = true;
        placements.push({ id: s.id, x, y, w, h });
        placed = true;
        break;
      }
    }
  }
  const rows = placements.reduce((m, p) => Math.max(m, p.y + p.h), 0);
  return { placements, free: freeRects(grid, cols, rows), rows };
}

/**
 * Greedy rectangles over the empty cells, scanning row by row. A run only grows downward while the
 * row below has exactly the same free run, so a narrow strip never swallows the top of a wider gap.
 */
function freeRects(grid: boolean[][], cols: number, rows: number): FreeRect[] {
  const taken = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => Boolean(grid[y]?.[x])));
  const out: FreeRect[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (taken[y][x]) continue;
      let w = 0;
      while (x + w < cols && !taken[y][x + w]) w++;
      let h = 1;
      while (y + h < rows) {
        const below = taken[y + h];
        if (!below.slice(x, x + w).every((t) => !t)) break;
        if ((x > 0 && !below[x - 1]) || (x + w < cols && !below[x + w])) break;
        h++;
      }
      for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) taken[r][c] = true;
      out.push({ x, y, w, h });
    }
  }
  return out;
}

/** Visible widgets packed for the 12-column desktop grid and the 6-column tablet grid. */
export function packLayout(items: readonly LayoutItem[]): { desktop: Packing; tablet: Packing } {
  const visible = items.filter((i) => !i.hidden).map((i) => ({ id: i.id, ...spanOf(i.id, i.size) }));
  return {
    desktop: packGrid(visible, 12),
    tablet: packGrid(visible.map((v) => ({ id: v.id, ...tabletSpan(v) })), 6),
  };
}

/**
 * Size for a widget coming back from the library: the largest size that fits one of the desktop
 * free slots, so it fills the gap instead of starting a new row; its own size when nothing fits.
 */
export function sizeForAdd(items: readonly LayoutItem[], id: WidgetId): WidgetSize {
  const current = items.find((i) => i.id === id)?.size ?? WIDGETS[id].defaultSize;
  const { free } = packLayout(items).desktop;
  const fitting = [...WIDGET_SIZES].reverse().find((s) => {
    const span = WIDGETS[id].sizes[s];
    return span && free.some((f) => span.w <= f.w && span.h <= f.h);
  });
  return fitting ?? current;
}

export function sizeLabel(id: WidgetId, size: WidgetSize): string {
  const s = spanOf(id, size);
  return `${size} · ${s.w}×${s.h}`;
}
