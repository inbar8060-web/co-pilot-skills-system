"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@/components/dropzone";
import { useToast } from "@/components/overlays";
import { MAX_PDF_MB, pdfUploadProblem, readUploadResponse } from "@/lib/limits";

/**
 * Self-upload of the crew member's own report. `doneHref` is where to land once the report is
 * linked (the upload view disappears then, so the page sends you back to the overview).
 */
export function ReportUploader({ doneHref }: { doneHref?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: File[]) {
    const problem = pdfUploadProblem(files[0]);
    if (problem) {
      setError(problem);
      return;
    }
    const fd = new FormData();
    fd.set("mode", "self");
    fd.set("file", files[0]);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/upload", { method: "POST", body: fd });
      const { ok, json, message } = await readUploadResponse(res);
      if (!ok) {
        setError(message);
        return;
      }
      const result = json?.result as { credits?: { awarded?: boolean; credits?: number } } | undefined;
      const credits = result?.credits?.awarded ? ` · +${result.credits.credits} credits` : "";
      toast(`Report verified and linked${credits}`);
      if (doneHref) router.replace(doneHref, { scroll: true });
      router.refresh();
    } catch {
      setError("Network error. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dropzone label={busy ? "Validating report…" : "Choose your report PDF"} hint={`Drop a PDF (max ${MAX_PDF_MB} MB) here or tap to browse`} busy={busy} onFiles={upload} />
      {error ? <div role="alert" className="rounded-[10px] border border-bad bg-badsoft px-3.5 py-2.5 text-sm font-semibold text-bad">{error}</div> : null}
    </>
  );
}
