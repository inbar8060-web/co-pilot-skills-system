import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import { AppError } from "@/lib/utils";

let client: Anthropic | null = null;

export function isMockMode(): boolean {
  return serverEnv().AI_MODE === "mock";
}

export function getAnthropic(): Anthropic {
  if (client) return client;
  const env = serverEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError(
      "AI_NOT_CONFIGURED",
      "ANTHROPIC_API_KEY is not set (or set AI_MODE=mock for local development)",
      503,
    );
  }
  client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    maxRetries: 2,
    timeout: 120_000, // milliseconds
  });
  return client;
}

/** Map SDK failures to stable application errors (never leak upstream details to clients). */
export function mapAnthropicError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new AppError("AI_AUTH", "AI provider rejected credentials", 503);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AppError("AI_RATE_LIMITED", "AI provider is busy, retry shortly", 503);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AppError("AI_BAD_REQUEST", "AI request was rejected", 502);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AppError("AI_UNREACHABLE", "AI provider unreachable", 503);
  }
  if (err instanceof Anthropic.APIError) {
    return new AppError("AI_UPSTREAM", `AI provider error (${err.status ?? "?"})`, 502);
  }
  console.error("[ai] unexpected error", err);
  return new AppError("AI_FAILED", "AI generation failed", 500);
}
