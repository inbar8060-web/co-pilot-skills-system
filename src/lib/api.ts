import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/utils";

/** Uniform JSON error envelope. Unknown errors are logged server-side and hidden from clients. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json({ success: false, error: err.code, message: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { success: false, error: "VALIDATION", message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  console.error("[api] unhandled", err);
  return NextResponse.json({ success: false, error: "INTERNAL", message: "Unexpected error" }, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  // Exact media type: "text/plain;x=application/json" is CORS-safelisted and must not pass.
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Expected application/json", 415);
  try {
    return await req.json();
  } catch {
    throw new AppError("INVALID_JSON", "Body is not valid JSON", 400);
  }
}
