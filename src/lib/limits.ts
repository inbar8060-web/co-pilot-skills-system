/**
 * Upload limits shared by the browser (pre-flight check) and the server (enforcement).
 * NEXT_PUBLIC_MAX_PDF_MB is inlined at build time, so both sides always agree. Hosts with a
 * small request-body cap (Netlify Functions: ~4.5 MB after base64) should set it to 4.
 */
const configured = Number(process.env.NEXT_PUBLIC_MAX_PDF_MB);
export const MAX_PDF_MB = Number.isFinite(configured) && configured >= 1 ? Math.min(Math.floor(configured), 10) : 10;
export const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;

/** First problem with a picked file, or null when it can be uploaded. */
export function pdfUploadProblem(file: File): string | null {
  if (file.size === 0) return `${file.name} is empty`;
  if (file.size > MAX_PDF_BYTES) return `${file.name} is larger than ${MAX_PDF_MB} MB`;
  return null;
}

/** Reads an API response, turning a host error page (non-JSON 413/502/504) into a readable message. */
export async function readUploadResponse(res: Response): Promise<{ ok: boolean; json: Record<string, unknown> | null; message: string }> {
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (json && res.ok && json.success) return { ok: true, json, message: "" };
  if (json && typeof json.message === "string") return { ok: false, json, message: json.message };
  return {
    ok: false,
    json,
    message: res.status === 504 || res.status === 502
      ? "The server took too long or the file was too large. Try a smaller PDF."
      : `Upload failed (HTTP ${res.status}).`,
  };
}
