"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal, useToast } from "@/components/overlays";
import { Button } from "@/components/ui";
import type { ActionResult } from "@/lib/utils";
import { cn } from "@/lib/utils";

type FormAction<T = undefined> = (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;

export interface ConfirmSpec { title: string; body?: string; detail?: ReactNode; confirmLabel?: string; danger?: boolean }

/**
 * Server-action form in the redesigned idiom: success goes to the snackbar, errors stay
 * next to the form (or in the snackbar for inline one-button forms), and `confirm` shows
 * the design's confirmation modal instead of a browser dialog.
 */
export function ActionForm<T = undefined>({
  action, children, submitLabel = "Save", pendingLabel = "Working…", variant = "primary", size = "md", inline = false, className,
  resetOnSuccess = false, confirm, disabled, footer = "end", onSuccess, fullWidthSubmit = false,
}: {
  action: FormAction<T>;
  children?: ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "soft";
  size?: "lg" | "md" | "sm";
  inline?: boolean;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: ConfirmSpec;
  disabled?: boolean;
  /** "end": ruled footer with the button right-aligned (main panels); "plain": button directly under the fields. */
  footer?: "end" | "plain";
  onSuccess?: (result: Extract<ActionResult<T>, { ok: true }>) => void;
  fullWidthSubmit?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const [asking, setAsking] = useState(false);
  const handled = useRef<unknown>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      if (state.message) toast(state.message, { tone: "ok" });
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      router.refresh();
    } else if (inline) {
      toast(state.error, { tone: "bad" });
    }
  }, [state, inline, resetOnSuccess, router, toast, onSuccess]);

  const submit = (
    <Button type="submit" variant={variant} size={size} disabled={pending || disabled} className={cn(fullWidthSubmit && "w-full", !inline && footer === "end" && "max-md:flex-1")}>
      {pending ? pendingLabel : submitLabel}
    </Button>
  );

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        className={cn(inline ? "inline-flex items-center gap-2" : "flex flex-col gap-[18px]", className)}
        onSubmit={(e) => {
          if (confirm && !confirmed.current) {
            e.preventDefault();
            setAsking(true);
          }
          confirmed.current = false;
        }}
      >
        {children}
        {!inline && state && !state.ok ? (
          <div role="alert" className="rounded-[10px] border border-bad bg-badsoft px-3.5 py-2.5 text-sm font-semibold text-bad">{state.error}</div>
        ) : null}
        {inline ? submit : footer === "end" ? <div className="flex justify-end border-t border-line pt-[18px]">{submit}</div> : submit}
      </form>
      {confirm ? (
        <Modal
          open={asking}
          onClose={() => setAsking(false)}
          title={confirm.title}
          description={confirm.body}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setAsking(false)}>Cancel</Button>
              <Button
                type="button"
                variant={confirm.danger ? "danger" : "primary"}
                onClick={() => {
                  setAsking(false);
                  confirmed.current = true;
                  formRef.current?.requestSubmit();
                }}
              >
                {confirm.confirmLabel ?? "Confirm"}
              </Button>
            </>
          }
        >
          {confirm.detail}
        </Modal>
      ) : null}
    </>
  );
}
