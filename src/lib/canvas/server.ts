import "server-only";
import { cache } from "react";
import type { CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveLayout, type CanvasLayout } from "./layout";
import type { WidgetContext } from "./registry";

export interface CanvasState {
  /** The organization pilots the canvas. */
  available: boolean;
  /** Canvas shell and home are shown (available and the user has not switched back to classic). */
  active: boolean;
  layout: CanvasLayout;
}

export function widgetContext(user: CurrentUser): WidgetContext {
  return { role: user.role, hasOrg: Boolean(user.organizationId) };
}

/** The user's crew-home layout, resolved against the registry. Memoised per request (layout + page). */
export const getCanvasState = cache(async (user: CurrentUser): Promise<CanvasState> => {
  const ctx = widgetContext(user);
  if (!user.canvasEnabled) return { available: false, active: false, layout: resolveLayout(null, ctx) };
  const supabase = await createClient();
  const { data } = await supabase.from("user_canvas_layouts").select("layout").eq("user_id", user.id).eq("surface", "crew").eq("page", "home").maybeSingle();
  const layout = resolveLayout(data?.layout ?? null, ctx);
  return { available: true, active: !layout.classic, layout };
});
