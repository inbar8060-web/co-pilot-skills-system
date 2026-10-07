"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { signIn } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="flex flex-col gap-[18px] rounded-2xl border border-line bg-card p-[18px] md:px-7 md:py-6">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Email"><Input name="email" type="email" autoComplete="email" required autoFocus /></Field>
      <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
      {state && !state.ok ? <div role="alert" className="rounded-[10px] border border-bad bg-badsoft px-3.5 py-2.5 text-sm font-semibold text-bad">{state.error}</div> : null}
      <Button type="submit" size="lg" disabled={pending} className="w-full">{pending ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
