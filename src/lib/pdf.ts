import "server-only";
import { extractText } from "unpdf";
import { MAX_PDF_BYTES, MAX_PDF_MB } from "@/lib/limits";
import { AppError } from "@/lib/utils";
export const MAX_PDF_PAGES = 120;
export const MAX_REPORT_CHARS = 80_000;
export const MIN_REPORT_CHARS = 200;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/**
 * Cheap pre-screen before any paid model call: a psychometric report mentions its
 * instrument or preference vocabulary somewhere in its text layer.
 */
const REPORT_HINT = /mbti|myers|briggs|step\s*(i|ii|1|2)\b|adapt|symbiotics|extravert|extrovert|introvert|personality|preference|psychometric/i;

export function looksLikePsychometricReport(text: string): boolean {
  return REPORT_HINT.test(text);
}

/** Validates the upload and extracts its text layer. Rejects (never truncates) oversized reports. */
export async function extractPdfText(file: File): Promise<{ text: string; pages: number }> {
  if (file.size === 0) throw new AppError("EMPTY_FILE", "The file is empty");
  if (file.size > MAX_PDF_BYTES) throw new AppError("FILE_TOO_LARGE", `PDF must be ${MAX_PDF_MB} MB or smaller`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = PDF_MAGIC.every((b, i) => bytes[i] === b);
  if (!isPdf) throw new AppError("NOT_A_PDF", "Only PDF files are accepted");

  let result: { totalPages: number; text: string };
  try {
    result = await extractText(bytes, { mergePages: true });
  } catch {
    throw new AppError("PDF_UNREADABLE", "The PDF could not be parsed");
  }
  if (result.totalPages > MAX_PDF_PAGES) {
    throw new AppError("TOO_MANY_PAGES", `PDF exceeds ${MAX_PDF_PAGES} pages`);
  }
  // Bound the work before any transformation.
  if (result.text.length > MAX_REPORT_CHARS * 2) {
    throw new AppError("REPORT_TOO_LONG", "The report text is too long to process");
  }
  const text = result.text.replace(/\0/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (text.length < MIN_REPORT_CHARS) {
    throw new AppError(
      "NO_TEXT_LAYER",
      "The PDF has no readable text layer (scanned image?). Export a text PDF and retry.",
    );
  }
  if (text.length > MAX_REPORT_CHARS) {
    throw new AppError("REPORT_TOO_LONG", "The report text is too long to process");
  }
  return { text, pages: result.totalPages };
}
