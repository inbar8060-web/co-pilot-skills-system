"use client";

import { useToast } from "@/components/overlays";
import { cn } from "@/lib/utils";

export function CopyButton({ text, label = "Copy", toastText = "Copied to clipboard", className }: { text: string; label?: string; toastText?: string; className?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className={cn("border-0 bg-transparent p-1 text-[13px] font-bold text-acc hover:underline", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast(toastText);
        } catch {
          toast("Clipboard is not available", { tone: "bad" });
        }
      }}
    >
      {label}
    </button>
  );
}
