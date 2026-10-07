"use server";

import { revalidatePath } from "next/cache";
import { fail } from "@/lib/actions";
import { assertRole } from "@/lib/auth";
import { CanvasLayoutSchema, defaultLayout, LAYOUT_VERSION, resolveItems, resolveLayout, sizeForAdd } from "@/lib/canvas/layout";
import { WIDGET_IDS, WIDGETS, type WidgetId } from "@/lib/canvas/registry";
import { widgetContext } from "@/lib/canvas/server";
import { createClient } from "@/lib/supabase/server";
import { AppError, type ActionResult } from "@/lib/utils";

async function canvasUser() {
  const user = await assertRole("end_user", "org_admin", "super_admin");
  if (!user.canvasEnabled) throw new AppError("CANVAS_OFF", "The canvas is not enabled for your organization", 403);
  return user;
}

/** Saves the crew-home layout (order, sizes, hidden widgets, insight snooze). Validated against the registry. */
export async function saveCanvasLayout(input: unknown): Promise<ActionResult> {
  try {
    const user = await canvasUser();
    const parsed = CanvasLayoutSchema.safeParse(input);
    if (!parsed.success) throw new AppError("BAD_LAYOUT", "That layout could not be saved");
    const layout = { ...parsed.data, items: resolveItems(parsed.data.items, widgetContext(user)) };
    const supabase = await createClient();
    const { error } = await supabase
      .from("user_canvas_layouts")
      .upsert({ user_id: user.id, surface: "crew", page: "home", layout, layout_version: LAYOUT_VERSION });
    if (error) throw new AppError("SAVE_FAILED", "Could not save your layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Pilot escape hatch: switch between the canvas and the classic overview. Keeps the saved layout. */
export async function setCanvasView(view: "canvas" | "classic"): Promise<ActionResult> {
  try {
    const user = await canvasUser();
    if (view !== "canvas" && view !== "classic") throw new AppError("BAD_INPUT", "Unknown view");
    const supabase = await createClient();
    const { data } = await supabase.from("user_canvas_layouts").select("layout").eq("user_id", user.id).eq("surface", "crew").eq("page", "home").maybeSingle();
    const current = CanvasLayoutSchema.safeParse(data?.layout);
    const layout = { ...(current.success ? current.data : { items: resolveItems([], widgetContext(user)) }), classic: view === "classic" };
    const { error } = await supabase
      .from("user_canvas_layouts")
      .upsert({ user_id: user.id, surface: "crew", page: "home", layout, layout_version: LAYOUT_VERSION });
    if (error) throw new AppError("SAVE_FAILED", "Could not switch the view");
    revalidatePath("/app", "layout");
    return { ok: true, message: view === "classic" ? "Switched to the classic overview." : "Switched to the canvas." };
  } catch (err) {
    return fail(err);
  }
}

/** Settings: puts the crew-home layout back to the registry defaults. Keeps the canvas/classic choice. */
export async function resetCanvasLayout(): Promise<ActionResult> {
  try {
    const user = await canvasUser();
    const supabase = await createClient();
    const { data, error: readError } = await supabase.from("user_canvas_layouts").select("layout").eq("user_id", user.id).eq("surface", "crew").eq("page", "home").maybeSingle();
    if (readError) throw new AppError("LOAD_FAILED", "Could not load your layout");
    const current = CanvasLayoutSchema.safeParse(data?.layout);
    const classic = current.success ? current.data.classic : undefined;
    const layout = { ...defaultLayout(widgetContext(user)), ...(classic !== undefined ? { classic } : {}) };
    const { error } = await supabase
      .from("user_canvas_layouts")
      .upsert({ user_id: user.id, surface: "crew", page: "home", layout, layout_version: LAYOUT_VERSION });
    if (error) throw new AppError("SAVE_FAILED", "Could not reset your layout");
    revalidatePath("/app");
    revalidatePath("/app/settings");
    return { ok: true, message: "Canvas layout reset to the default." };
  } catch (err) {
    return fail(err);
  }
}

/** Settings: puts a hidden widget back on the canvas, sized to fill a free slot like the canvas library does. */
export async function showCanvasWidget(id: string): Promise<ActionResult> {
  try {
    const user = await canvasUser();
    if (typeof id !== "string" || !(WIDGET_IDS as readonly string[]).includes(id)) throw new AppError("BAD_INPUT", "Unknown widget");
    const widgetId = id as WidgetId;
    const ctx = widgetContext(user);
    const supabase = await createClient();
    const { data, error: readError } = await supabase.from("user_canvas_layouts").select("layout").eq("user_id", user.id).eq("surface", "crew").eq("page", "home").maybeSingle();
    // A failed read must not fall back to the default layout and overwrite the saved one.
    if (readError) throw new AppError("LOAD_FAILED", "Could not load your layout");
    const current = resolveLayout(data?.layout ?? null, ctx);
    const item = current.items.find((i) => i.id === widgetId);
    if (!item) throw new AppError("NOT_AVAILABLE", "That widget is not available to you", 403);
    if (!item.hidden) return { ok: true, message: `${WIDGETS[widgetId].title} is already on your canvas.` };
    const size = sizeForAdd(current.items, widgetId);
    const items = resolveItems(current.items.map((i) => (i.id === widgetId ? { ...i, hidden: false, size } : i)), ctx);
    const layout = { ...current, items };
    const { error } = await supabase
      .from("user_canvas_layouts")
      .upsert({ user_id: user.id, surface: "crew", page: "home", layout, layout_version: LAYOUT_VERSION });
    if (error) throw new AppError("SAVE_FAILED", "Could not show that widget");
    revalidatePath("/app");
    revalidatePath("/app/settings");
    return { ok: true, message: `${WIDGETS[widgetId].title} is back on your canvas.` };
  } catch (err) {
    return fail(err);
  }
}
