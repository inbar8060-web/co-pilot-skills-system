"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Dot, type Tone } from "@/components/ui";

/* ------------------------------------------------------------------ snackbar */
interface Toast { id: number; text: string; tone: Tone; action?: { label: string; href: string } }
type ToastFn = (text: string, options?: { tone?: Tone; action?: { label: string; href: string } }) => void;

const ToastContext = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ToastFn>((text, options) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), text, tone: options?.tone ?? "ok", action: options?.action });
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="fixed bottom-[var(--toast-bottom,96px)] left-1/2 z-[60] flex w-max max-w-[calc(100%-32px)] animate-snack-in items-center gap-3.5 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-bg shadow-[0_12px_32px_rgba(0,0,0,0.25)] md:bottom-[var(--toast-bottom-md,32px)]"
          style={{ transform: "translateX(-50%)" }}
        >
          <Dot tone={toast.tone} />
          <span>{toast.text}</span>
          {toast.action ? (
            <Link href={toast.action.href} onClick={() => setToast(null)} className="ml-1 font-extrabold text-accsoft underline">
              {toast.action.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ shared overlay behaviour */
function useOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

export function Scrim({ onClose, className }: { onClose: () => void; className?: string }) {
  return <div aria-hidden="true" onClick={onClose} className={cn("fixed inset-0 animate-fade-in bg-scrim", className)} />;
}

/* ------------------------------------------------------------------ modal */
export function Modal({ open, onClose, title, description, children, footer }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode;
}) {
  useOverlay(open, onClose);
  if (!open) return null;
  return (
    <>
      <Scrim onClose={onClose} className="z-40" />
      <div className="pointer-events-none fixed inset-0 z-[41] flex items-end justify-center p-4 md:items-center">
        <div
          role="dialog"
          aria-modal="true"
          className="pointer-events-auto flex max-h-[calc(100dvh-32px)] w-[min(420px,100%)] animate-sheet-in flex-col gap-4 overflow-auto rounded-2xl bg-card p-6 shadow-[0_24px_60px_rgba(0,0,0,0.25)]"
        >
          <div>
            <h2 className="m-0 text-[19px] font-extrabold tracking-[-0.01em]">{title}</h2>
            {description ? <p className="mt-1.5 text-[15px] text-muted">{description}</p> : null}
          </div>
          {children}
          {footer ? <div className="flex flex-wrap justify-end gap-2.5 [&>*]:max-md:flex-1">{footer}</div> : null}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ drawer (right) */
export function Drawer({ open, onClose, title, description, children, footer }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode;
}) {
  useOverlay(open, onClose);
  if (!open) return null;
  return (
    <>
      <Scrim onClose={onClose} className="z-40" />
      <aside role="dialog" aria-modal="true" className="fixed inset-y-0 right-0 z-[41] flex w-[min(420px,100%)] animate-drawer-in flex-col bg-card shadow-[-16px_0_40px_rgba(0,0,0,0.15)]">
        <header className="flex items-center justify-between gap-3 border-b border-line px-6 pb-4 pt-6">
          <div className="min-w-0">
            <h2 className="m-0 truncate text-[19px] font-extrabold tracking-[-0.01em]">{title}</h2>
            {description ? <div className="truncate text-[13px] text-muted">{description}</div> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line2 bg-transparent text-lg text-ink">×</button>
        </header>
        <div className="flex flex-1 flex-col gap-4 overflow-auto p-6">{children}</div>
        {footer ? <footer className="flex justify-end gap-2.5 border-t border-line px-6 py-4">{footer}</footer> : null}
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ theme */
export type Theme = "light" | "dark";

export function useTheme(initial: Theme): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initial);
  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);
  return [theme, toggle];
}
