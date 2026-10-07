import { z } from "zod";

/**
 * Environment validation. Parsed lazily so `next build` does not fail when a
 * variable is only provided at runtime, but every first use fails loudly with a
 * precise message instead of an undefined-key error deep in a request.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
});

/** Treat empty strings as unset (Vercel/.env files often carry `KEY=` placeholders). */
const optionalSecret = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().min(10).optional());

const serverSchema = publicSchema.extend({
  SUPABASE_SECRET_KEY: z.string().min(10),
  ANTHROPIC_API_KEY: optionalSecret,
  ANTHROPIC_MODEL: z.string().min(3).default("claude-opus-5"),
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  AI_MODE: z.enum(["live", "mock"]).default("live"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

let cachedServer: ServerEnv | null = null;
let cachedPublic: PublicEnv | null = null;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

/** Public env (safe for the browser). Next.js inlines NEXT_PUBLIC_* at build time. */
export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Invalid public environment: ${formatIssues(parsed.error)}`);
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}

/** Server-only env. Never import this from a client component. */
export function serverEnv(): ServerEnv {
  if (cachedServer) return cachedServer;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment: ${formatIssues(parsed.error)}`);
  }
  if (parsed.data.AI_MODE === "live" && !parsed.data.ANTHROPIC_API_KEY && parsed.data.NODE_ENV === "production") {
    throw new Error("Invalid server environment: ANTHROPIC_API_KEY is required when AI_MODE=live in production");
  }
  cachedServer = parsed.data;
  return cachedServer;
}
