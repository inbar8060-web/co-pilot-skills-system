import "server-only";
import { ZodError } from "zod";
import { AppError, type ActionResult } from "@/lib/utils";

/** Shared server-action error mapping: stable messages, no leaked internals. */
export function fail<T = undefined>(err: unknown, scope = "action"): ActionResult<T> {
  if (err instanceof AppError) return { ok: false, error: err.message };
  if (err instanceof ZodError) {
    return { ok: false, error: err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ") };
  }
  console.error(`[${scope}] unhandled`, err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

/** FormData string field ("" when missing). */
export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

/** FormData multi-value field. */
export function list(fd: FormData, key: string): string[] {
  return fd.getAll(key).map(String);
}

/** "" -> null for optional selects. */
export function orNull(v: string): string | null {
  return v === "" ? null : v;
}

/** Postgres raise exception messages come back verbatim with SQLSTATE P0001. */
export function raisedMessage(error: { code?: string; message: string } | null | undefined): string | null {
  if (!error) return null;
  return error.code === "P0001" ? error.message : null;
}
