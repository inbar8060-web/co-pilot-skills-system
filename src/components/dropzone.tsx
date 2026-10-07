"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

/** Dashed upload target from the redesign: click or drop, then hands the files to the caller. */
export function Dropzone({ label, hint, busy, multiple = false, onFiles }: { label: string; hint: string; busy: boolean; multiple?: boolean; onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <>
      <input ref={input} type="file" accept="application/pdf" multiple={multiple} hidden onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) take(e.dataTransfer.files); }}
        className={cn("flex w-full flex-col items-center gap-2 rounded-[14px] border-2 border-dashed bg-bg px-5 py-10 text-ink transition-colors hover:border-acc disabled:opacity-60", over ? "border-acc" : "border-line2")}
      >
        <Icon name="upload" size={32} className="text-acc" />
        <div className="font-bold">{label}</div>
        <div className="text-[13px] text-muted">{hint}</div>
      </button>
    </>
  );
}
