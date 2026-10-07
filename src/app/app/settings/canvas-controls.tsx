"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetCanvasLayout, setCanvasView, showCanvasWidget } from "../canvas-actions";
import { Modal, useToast } from "@/components/overlays";
import { Button } from "@/components/ui";
import type { ActionResult } from "@/lib/utils";

/** Runs a canvas action, reports the result in the snackbar and refreshes the page on success. */
function useCanvasAction() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (action: () => Promise<ActionResult>, fallback: string, after?: () => void) => start(async () => {
    const res = await action();
    if (!res.ok) { toast(res.error, { tone: "bad" }); return; }
    after?.();
    toast(res.message ?? fallback, { tone: "ok" });
    router.refresh();
  });
  return { pending, run };
}

/** Switch the crew home between the canvas and the classic overview, staying on this page. */
export function CanvasViewSwitch({ view }: { view: "canvas" | "classic" }) {
  const { pending, run } = useCanvasAction();
  const next = view === "canvas" ? "classic" : "canvas";
  return (
    <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setCanvasView(next), "View switched.")}>
      {pending ? "Switching…" : next === "classic" ? "Switch to classic" : "Switch to canvas"}
    </Button>
  );
}

/** "Reset layout" with a confirmation modal. */
export function ResetLayoutButton() {
  const { pending, run } = useCanvasAction();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => setAsking(true)}>
        {pending ? "Resetting…" : "Reset layout"}
      </Button>
      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title="Reset your canvas layout?"
        description="Every widget goes back to its default order, size and visibility. Your choice of canvas or classic view is kept."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setAsking(false)}>Cancel</Button>
            <Button type="button" variant="danger" onClick={() => run(resetCanvasLayout, "Layout reset.", () => setAsking(false))} disabled={pending}>
              {pending ? "Resetting…" : "Reset layout"}
            </Button>
          </>
        }
      />
    </>
  );
}

/** Puts one hidden widget back on the canvas. */
export function ShowWidgetButton({ id, title }: { id: string; title: string }) {
  const { pending, run } = useCanvasAction();
  return (
    <Button type="button" variant="secondary" size="sm" disabled={pending} aria-label={`Show ${title} on the canvas`} onClick={() => run(() => showCanvasWidget(id), `${title} shown.`)}>
      {pending ? "Showing…" : "Show"}
    </Button>
  );
}
