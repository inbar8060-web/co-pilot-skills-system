"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useShellBridge } from "@/components/canvas-shell";
import { Icon } from "@/components/icons";
import { Drawer, Modal, useToast } from "@/components/overlays";
import { Button } from "@/components/ui";
import { packLayout, sizeForAdd, sizeLabel, type CanvasLayout, type LayoutItem } from "@/lib/canvas/layout";
import { sizesOf, WIDGETS, type WidgetId, type WidgetSize } from "@/lib/canvas/registry";
import { cn } from "@/lib/utils";
import { acknowledgeInsight } from "../actions";
import { saveCanvasLayout } from "../canvas-actions";
import { FreeSlot, moveToolFocus, ToolTile, WidgetFrame, type Tool } from "./frame";
import type { CanvasData } from "./types";
import { widgetTools, widgetView, type RecentFilter, type WidgetApi } from "./widgets";

/**
 * Crew canvas (Oct 2026 concept): summary widgets on a 12-column grid with a contextual left bar.
 * v1 keeps a curated layout; users can hide, add back, resize and reset. Drag, pin, arrange and lock
 * come later (keyboard Move first). Every widget's tools lead to the full page for its data.
 */
export function CrewCanvas({ data, initialLayout, defaultItems }: { data: CanvasData; initialLayout: CanvasLayout; defaultItems: LayoutItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const bridge = useShellBridge();
  const [layout, setLayout] = useState(initialLayout);
  const [selected, setSelected] = useState<WidgetId | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [sheetMore, setSheetMore] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [, startSave] = useTransition();
  const [confirming, startConfirm] = useTransition();

  // Start-a-routine state is shared by the widget and its tools.
  const [routine, setRoutine] = useState(data.start.last?.routine ?? "flight");
  const [partnerChoice, setPartnerChoice] = useState("auto");
  const [recentFilter, setRecentFilter] = useState<RecentFilter>("all");

  const eligible = useCallback((id: string, r: string) => data.start.partners.find((p) => p.id === id && p.hasReport && p.routines[r] !== undefined) ?? null, [data.start.partners]);
  const partner = partnerChoice === "solo" ? null : partnerChoice === "auto"
    ? data.start.partners.find((p) => p.hasReport && p.routines[routine] !== undefined) ?? null
    : eligible(partnerChoice, routine);
  const briefingHref = `/app/routines/new?${new URLSearchParams({ routine, ...(partner ? { partner: partner.id } : {}) })}`;

  /* ---------------------------------------------------------------- persistence */
  const commit = useCallback((next: CanvasLayout, message?: string) => {
    setLayout(next);
    if (message) setAnnounce(message);
    startSave(async () => {
      const res = await saveCanvasLayout(next);
      if (!res.ok) toast(res.error, { tone: "bad" });
    });
  }, [toast]);

  const items = layout.items;
  const update = (id: WidgetId, patch: Partial<LayoutItem>, message: string) =>
    commit({ ...layout, items: items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }, message);

  const hide = (id: WidgetId) => {
    update(id, { hidden: true }, `${WIDGETS[id].title} hidden. Add it back with Add.`);
    setSelected(null);
    toast(`${WIDGETS[id].title} hidden · add it back with Add`, { tone: "neutral" });
  };
  const show = (id: WidgetId) => {
    update(id, { hidden: false, size: sizeForAdd(items, id) }, `${WIDGETS[id].title} added to the canvas.`);
    setLibraryOpen(false);
    setSelected(id);
  };
  const resize = (id: WidgetId, size: WidgetSize) => {
    update(id, { size }, `${WIDGETS[id].title} resized to ${sizeLabel(id, size)}.`);
    setResizeOpen(false);
  };
  const reset = () => {
    commit({ items: defaultItems, snoozedWeek: null }, "Canvas reset to the default layout.");
    setResetOpen(false);
    setLibraryOpen(false);
    setSelected(null);
  };

  const snoozed = layout.snoozedWeek === data.isoWeek;
  const setSnoozed = (on: boolean) => commit({ ...layout, snoozedWeek: on ? data.isoWeek : null }, on ? "Insight snoozed until next week." : "Insight shown again.");

  const confirmInsight = () => {
    if (!data.insight || data.insight.confirmed) return;
    const fd = new FormData();
    fd.set("insight_id", data.insight.id);
    startConfirm(async () => {
      const res = await acknowledgeInsight(null, fd);
      toast(res.ok ? res.message ?? "Confirmed." : res.error, { tone: res.ok ? "ok" : "bad" });
      router.refresh();
    });
  };

  const copy = useCallback(async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(done);
    } catch {
      toast("Clipboard is not available", { tone: "bad" });
    }
  }, [toast]);

  const api: WidgetApi = {
    routine, setRoutine, partner, partnerChoice, briefingHref, openPartnerPicker: () => setPickerOpen(true),
    recentFilter, setRecentFilter, snoozed, setSnoozed, confirmInsight, confirming, copy, openPrivacy: () => setPrivacyOpen(true),
  };

  /* ---------------------------------------------------------------- selection */
  const select = (id: WidgetId | null) => {
    const next = selected === id ? null : id;
    setSelected(next);
    setAnnounce(next ? `${WIDGETS[next].title} selected. Its tools are in the toolbar.` : "Nothing selected.");
    setResizeOpen(false);
    setSheetMore(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[role=dialog]")) return;
      if (resizeOpen) { setResizeOpen(false); return; }
      setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [resizeOpen]);

  // The main bar's "Add" opens this canvas's library.
  const openLibrary = useCallback(() => setLibraryOpen(true), []);
  useEffect(() => bridge?.registerAdd(openLibrary), [bridge, openLibrary]);

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (!t.closest("[data-widget],[data-canvas-tools],[data-canvas-sheet],[role=dialog]")) setSelected(null);
  };

  /* ---------------------------------------------------------------- packing */
  const visible = items.filter((i) => !i.hidden);
  const hidden = items.filter((i) => i.hidden);
  const packing = useMemo(() => packLayout(items), [items]);
  const desk = new Map(packing.desktop.placements.map((p) => [p.id, p]));
  const tab = new Map(packing.tablet.placements.map((p) => [p.id, p]));
  const freeAdd = hidden.length ? openLibrary : undefined;

  const sel = selected ? items.find((i) => i.id === selected && !i.hidden) ?? null : null;
  const selTools: Tool[] = sel ? widgetTools(sel.id, data, api) : [];
  const sizes = sel ? sizesOf(sel.id) : [];
  const commonTools: Tool[] = sel
    ? [
        ...(sizes.length > 1 ? [{ key: "resize", label: "Resize", icon: "resize" as const, pressed: resizeOpen, onSelect: () => setResizeOpen((v) => !v), hint: `Size ${sel.size}. Choose ${sizes.join(", ")}` }] : []),
        { key: "hide", label: "Hide", icon: "eyeOff", onSelect: () => hide(sel.id), hint: "Remove it from the canvas (not from the app)" },
      ]
    : [];
  const boardTools: Tool[] = [
    { key: "add", label: "Add", icon: "plus", onSelect: openLibrary, badge: hidden.length || undefined, hint: "Add a widget from the library" },
    { key: "reset", label: "Reset", icon: "reset", onSelect: () => setResetOpen(true), hint: "Return to the default layout" },
  ];

  return (
    <div data-canvas-root onPointerDown={onPointerDown} className="grid gap-5 md:grid-cols-[var(--bar)_minmax(0,1fr)] xl:grid-cols-[var(--bar)_minmax(0,1fr)_var(--bar)]" style={{ "--bar": "clamp(57px, 5.13vw, 74px)" } as React.CSSProperties}>
      <h1 className="sr-only">Overview canvas</h1>
      <div aria-live="polite" className="sr-only">{announce}</div>

      {/* ---------------- left contextual bar (tablet and desktop) */}
      <aside data-canvas-tools aria-label={sel ? `${WIDGETS[sel.id].title} tools` : "Canvas tools"} className="tb relative z-20 hidden self-start md:sticky md:top-5 md:block">
        <div className="flex flex-col gap-[0.31em] rounded-[0.92em] border border-line bg-card px-[0.62em] py-[0.77em]">
          <div className="border-b border-line px-0.5 pb-[0.62em] pt-[0.31em]">
            <div className="text-[0.77em] font-extrabold uppercase leading-[1.2] tracking-[0.04em] text-acc">{sel ? "Widget" : "Canvas"}</div>
            <div className="mt-0.5 text-[0.85em] font-extrabold leading-[1.2] [hyphens:auto] [overflow-wrap:break-word]" lang="en">{sel ? WIDGETS[sel.id].title : "Nothing selected"}</div>
          </div>
          <div role="toolbar" aria-orientation="vertical" aria-label={sel ? `${WIDGETS[sel.id].title} tools` : "Canvas tools"} className="flex flex-col gap-[0.31em]">
            {(sel ? selTools : boardTools).map((t, i) => <ToolTile key={`${sel?.id ?? "board"}-${t.key}`} tool={t} size="bar" tabIndex={i === 0 ? 0 : -1} onKeyDown={(e) => moveToolFocus(e, "vertical")} />)}
            {sel ? (
              <>
                <div className="my-[0.31em] h-px bg-line" />
                {commonTools.map((t) => <ToolTile key={`${sel.id}-${t.key}`} tool={t} size="bar" tabIndex={-1} onKeyDown={(e) => moveToolFocus(e, "vertical")} />)}
                <button type="button" data-tool="" tabIndex={-1} onKeyDown={(e) => moveToolFocus(e, "vertical")} onClick={() => select(null)} aria-label="Deselect (Esc)" title="Deselect (Esc)"
                  className="flex min-h-[4em] flex-col items-center justify-center gap-[3px] rounded-xl border border-line bg-transparent text-muted hover:bg-bg hover:text-ink focus-visible:outline-2 focus-visible:outline-acc">
                  <Icon name="x" size="1.7em" strokeWidth={2} />
                  <span className="text-[0.77em] font-bold leading-[1.1]">Esc</span>
                </button>
              </>
            ) : null}
          </div>
        </div>
        {sel && resizeOpen ? (
          <div role="radiogroup" aria-label={`${WIDGETS[sel.id].title} size`} className="absolute left-[calc(100%+10px)] top-1/3 z-20 flex w-[180px] animate-fade-in flex-col gap-1 rounded-xl border border-line bg-card p-2 text-sm shadow-float">
            <div className="px-2 pb-1 pt-0.5 text-xs font-extrabold uppercase tracking-[0.05em] text-muted">Size</div>
            {sizes.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={sel.size === s} aria-label={sizeLabel(sel.id, s)} onClick={() => resize(sel.id, s)}
                className={cn("flex h-10 items-center justify-between rounded-lg border-0 px-2.5 text-left font-bold", sel.size === s ? "bg-accsoft text-ink" : "bg-transparent text-ink hover:bg-bg")}>
                <span>{s}</span><span className="text-[13px] font-semibold text-muted">{sizeLabel(sel.id, s).split(" · ")[1]}</span>
              </button>
            ))}
          </div>
        ) : null}
      </aside>

      {/* ---------------- the canvas */}
      <div className="grid min-w-0 grid-cols-1 gap-5 md:auto-rows-[minmax(72px,auto)] md:grid-cols-6 xl:grid-cols-12">
        {visible.map((item) => {
          const v = widgetView(item.id, item.size, data, api, () => setSelected(item.id));
          return (
            <WidgetFrame key={item.id} id={item.id} title={v.title} kicker={v.kicker} tint={v.tint} meta={v.meta}
              selected={selected === item.id} onSelect={() => select(item.id)} desktop={desk.get(item.id)} tablet={tab.get(item.id)}>
              {v.body}
            </WidgetFrame>
          );
        })}
        {packing.desktop.free.filter((f) => f.w >= 2 && f.h >= 2).map((f) => <FreeSlot key={`d-${f.x}-${f.y}`} place={f} view="desktop" onAdd={freeAdd} />)}
        {packing.tablet.free.filter((f) => f.w >= 2 && f.h >= 2).map((f) => <FreeSlot key={`t-${f.x}-${f.y}`} place={f} view="tablet" onAdd={freeAdd} />)}
        {visible.length === 0 ? (
          <div className="col-span-full flex flex-col items-center gap-3 rounded-xl border border-dashed border-line2 p-10 text-center text-muted">
            <div className="font-bold">Every widget is hidden.</div>
            <Button type="button" variant="secondary" onClick={openLibrary}>Add widgets</Button>
          </div>
        ) : null}
      </div>

      {/* ---------------- phone: tools sheet above the main bar */}
      {sel ? (
        <div data-canvas-sheet className="fixed inset-x-5 bottom-[calc(max(20px,env(safe-area-inset-bottom))+84px)] z-20 flex animate-sheet-in flex-col gap-2 rounded-xl border border-line bg-card px-3 pb-2.5 pt-2 shadow-float md:hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs font-extrabold"><span className="uppercase tracking-[0.06em] text-acc">Widget</span> · {WIDGETS[sel.id].title}</span>
            <button type="button" onClick={() => select(null)} aria-label="Deselect" className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-muted">
              <span className="flex size-8 items-center justify-center rounded-full border border-line"><Icon name="x" size={16} strokeWidth={2} /></span>
            </button>
          </div>
          <PhoneTools tools={[...selTools, commonTools.find((t) => t.key === "hide")!]} more={sheetMore} setMore={setSheetMore} />
        </div>
      ) : null}

      {/* ---------------- overlays */}
      <Drawer open={libraryOpen} onClose={() => setLibraryOpen(false)} title="Add a widget" description="Hidden widgets return to where they were."
        footer={<Button type="button" variant="secondary" onClick={() => setResetOpen(true)}><Icon name="reset" size={18} />Reset layout</Button>}>
        {hidden.length ? hidden.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-4 rounded-xl border border-line p-4">
            <div className="min-w-0">
              <div className="font-extrabold">{WIDGETS[i.id].title}</div>
              <div className="text-[13px] text-muted">{WIDGETS[i.id].description}</div>
              <div className="mt-1 text-xs font-bold text-muted">{sizeLabel(i.id, i.size)}</div>
            </div>
            <Button type="button" size="sm" variant="soft" onClick={() => show(i.id)}>Add</Button>
          </div>
        )) : <div className="rounded-xl border border-dashed border-line2 p-6 text-center text-sm font-semibold text-muted">Every widget is already on your canvas. Hide one from its toolbar to make room.</div>}
      </Drawer>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset the canvas?" description="Widgets, sizes and hidden widgets go back to the default layout. Your data is not affected."
        footer={<><Button type="button" variant="secondary" onClick={() => setResetOpen(false)}>Cancel</Button><Button type="button" onClick={reset}>Reset layout</Button></>} />

      <Drawer open={pickerOpen} onClose={() => setPickerOpen(false)} title="Choose a partner" description={`For ${data.start.routines.find((r) => r.value === routine)?.label ?? routine}. Only crew who consented appear here.`}
        footer={<Link href="/app/consents?view=request" className="text-sm font-bold text-acc hover:underline">Request another partner →</Link>}>
        <PartnerChoices data={data} routine={routine} value={partner?.id ?? "solo"} onChange={(v) => { setPartnerChoice(v); setPickerOpen(false); setSelected("start"); }} />
      </Drawer>

      <Drawer open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Your report and privacy" description="What is stored, and who can see what.">
        <ul className="m-0 flex list-disc flex-col gap-3 pl-5 text-[15px]">
          <li>Your PDF is turned into a behavioural profile and stored behind the anonymity wall under an anonymous token. The file itself is not kept.</li>
          <li>Partners never see your type or profile. Blind Synergy uses both profiles only to write the action cards for the person who asked.</li>
          <li>Your organization sees only whether a report is loaded (Yes or No).</li>
          <li>Every link between a report and an account is recorded in an audit log.</li>
        </ul>
        <Link href="/app/report?view=privacy" className="text-sm font-bold text-acc hover:underline">Open my report →</Link>
      </Drawer>
    </div>
  );
}

function PhoneTools({ tools, more, setMore }: { tools: Tool[]; more: boolean; setMore: (v: boolean) => void }) {
  // Five cells: the primary and the first tools, then "More" holding the rest (Hide included).
  const overflow = tools.length > 5;
  const first = overflow ? tools.slice(0, 4) : tools;
  const rest = overflow ? tools.slice(4) : [];
  return (
    <>
      <div role="toolbar" aria-label="Widget tools" className="grid grid-cols-5 gap-1.5">
        {first.map((t, i) => <ToolTile key={t.key} tool={t} size="sheet" tabIndex={i === 0 ? 0 : -1} onKeyDown={(e) => moveToolFocus(e, "horizontal")} />)}
        {overflow ? <ToolTile tool={{ key: "more", label: "More", icon: "more", pressed: more, onSelect: () => setMore(!more), hint: "More tools" }} size="sheet" tabIndex={-1} onKeyDown={(e) => moveToolFocus(e, "horizontal")} /> : null}
      </div>
      {more && rest.length ? <div className="grid grid-cols-5 gap-1.5 border-t border-line pt-1.5">{rest.map((t) => <ToolTile key={t.key} tool={t} size="sheet" />)}</div> : null}
    </>
  );
}

function PartnerChoices({ data, routine, value, onChange }: { data: CanvasData; routine: string; value: string; onChange: (v: string) => void }) {
  const options = [
    { id: "solo", name: "Solo", sub: "Self-briefing, no partner", ok: true },
    ...data.start.partners.map((p) => {
      const days = p.routines[routine];
      const ok = days !== undefined && p.hasReport;
      return { id: p.id, name: p.name, sub: !p.hasReport ? "No report yet" : ok ? `Approved · ${days} days left` : "No consent for this routine", ok };
    }),
  ];
  return (
    <div role="radiogroup" aria-label="Partner" className="flex flex-col gap-2">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} disabled={!o.ok} onClick={() => onChange(o.id)}
          className={cn("flex items-center gap-3.5 rounded-xl border px-4 py-3.5 text-left disabled:opacity-50", value === o.id ? "border-acc bg-accsoft" : "border-line bg-transparent hover:bg-bg")}>
          <span className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-full border-2", value === o.id ? "border-acc" : "border-line2")}>
            {value === o.id ? <span className="size-2 rounded-full bg-acc" /> : null}
          </span>
          <span><span className="block font-bold text-ink">{o.name}</span><span className="text-[13px] text-muted">{o.sub}</span></span>
        </button>
      ))}
      {data.start.partners.length === 0 ? <div className="text-sm text-muted">No consented partners yet.</div> : null}
    </div>
  );
}
