"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@/components/dropzone";
import { useToast } from "@/components/overlays";
import { Dot } from "@/components/ui";
import { MAX_PDF_MB, pdfUploadProblem, readUploadResponse } from "@/lib/limits";

interface ResultRow { file: string; ok: boolean; code?: string; error?: string }

const MAX_FILES = 10;

/**
 * Sends one PDF per request, in order. Each request stays small and short, so the batch works
 * on hosts with tight body-size or execution-time caps, and results appear as they finish.
 */
export function BatchUploader() {
  const router = useRouter();
  const toast = useToast();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadOne(file: File): Promise<ResultRow> {
    const problem = pdfUploadProblem(file);
    if (problem) return { file: file.name, ok: false, error: problem };
    const fd = new FormData();
    fd.set("mode", "batch");
    fd.append("file", file);
    try {
      const res = await fetch("/api/reports/upload", { method: "POST", body: fd });
      const { ok, json, message } = await readUploadResponse(res);
      if (!ok) return { file: file.name, ok: false, error: message };
      const [result] = (json?.results as ResultRow[] | undefined) ?? [];
      return result ?? { file: file.name, ok: false, error: "No result returned" };
    } catch {
      return { file: file.name, ok: false, error: "Network error. Please retry." };
    }
  }

  async function upload(picked: File[]) {
    setError(null);
    if (picked.length > MAX_FILES) {
      setError(`Choose at most ${MAX_FILES} PDFs at a time.`);
      return;
    }
    const results: ResultRow[] = [];
    setRows([]);
    setProgress({ done: 0, total: picked.length });
    for (const file of picked) {
      results.push(await uploadOne(file));
      setRows([...results]);
      setProgress({ done: results.length, total: picked.length });
    }
    setProgress(null);
    const okCount = results.filter((r) => r.ok).length;
    toast(`${okCount} of ${results.length} reports ingested${results.length - okCount ? ` · ${results.length - okCount} rejected` : ""}`, { tone: okCount ? "ok" : "bad" });
    if (okCount) router.refresh();
  }

  const busy = progress !== null;
  return (
    <>
      <Dropzone
        multiple
        label={busy ? `Processing ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : "Choose report PDFs"}
        hint={`Drop up to ${MAX_FILES} PDFs (max ${MAX_PDF_MB} MB each) or tap to browse`}
        busy={busy}
        onFiles={upload}
      />
      {error ? <div role="alert" className="rounded-[10px] border border-bad bg-badsoft px-3.5 py-2.5 text-sm font-semibold text-bad">{error}</div> : null}
      {rows?.length ? (
        <div className="flex flex-col">
          {rows.map((r, i) => (
            <div key={`${i}-${r.file}`} className="flex items-center justify-between gap-3 border-t border-line py-2 text-[13px]">
              <span className="min-w-0 truncate">{r.file}</span>
              <span className={`flex shrink-0 items-center gap-1.5 font-bold ${r.ok ? "text-ok" : "text-bad"}`}><Dot tone={r.ok ? "ok" : "bad"} size={6} />{r.ok ? <span className="font-mono">{r.code}</span> : r.error}</span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
